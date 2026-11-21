/* ===== VOICE MAP =====
   人の声 / キャラも: a "voice plane" (pitch × brightness) split into four voice types; close voices sit close.
     Tap someone → a radar centred on them: the closer to the middle, the more alike (rings at 90/70/50/30 %).
   グループ: every chip sorted into voice families; tap one to see its look-alikes light up. */
const MAP = { mode: 'people', sel: null };
const isPerson = (c) => c.kind === 'friend' || c.kind === 'self';
const profOf = (c) => Object.assign({}, VoxEngine.DEFAULT, c.profile || {});
function voiceVec(c) {
  const p = profOf(c);
  return [p.pitch / 3, p.formant / 2, p.robotHz ? 2 : 0, p.ring * 3, Math.min(1.5, p.reverb + p.echo + p.chorus) * 1.6,
    p.lowcut > 300 || p.highcut < 6000 ? 2 : 0, p.drive * 2, p.inst ? 3 : 0, p.inst * 0.6, p.perc * 3, p.blip * 3, p.harm * 2.5,
    p.voc * 3, p.water * 3, p.comb * 2.5, p.wah * 2.5, p.glitch * 2.5, p.crush * 2.5, p.tune * 2, p.vib / 1.2, p.trem * 2];
}
function voiceSim(a, b, plane) {
  if (plane) {
    const pa = profOf(a), pb = profOf(b);
    return Math.round(100 * Math.exp(-Math.hypot(pa.pitch - pb.pitch, (pa.formant - pb.formant) * 1.5) / 6));
  }
  const va = voiceVec(a), vb = voiceVec(b);
  let d = 0; for (let i = 0; i < va.length; i++) d += (va[i] - vb[i]) ** 2;
  return Math.round(100 * Math.exp(-Math.sqrt(d) / 3.2));
}
const simWord = (s) => (s >= 90 ? 'そっくり！' : s >= 75 ? 'かなり似てる' : s >= 60 ? '似てる' : s >= 40 ? 'ちょっと似てる' : '似てない');
const QUAD = [ // corner captions of the voice plane
  { x: 1, y: -1, name: 'アニメ声', sub: '高い × 明るい' }, { x: -1, y: -1, name: 'さわやか声', sub: '低い × 明るい' },
  { x: -1, y: 1, name: 'ずっしり声', sub: '低い × 太い' }, { x: 1, y: 1, name: 'よく通る声', sub: '高い × 太い' },
];
function relax(nodes, W, H, pull, iters = 90) {
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const A = nodes[i], B = nodes[j];
      let dx = B.x - A.x, dy = (B.y - A.y) * 0.75, d = Math.hypot(dx, dy); // labels sit under the icons, so rows need more room
      const min = A.r + B.r + (A.r + B.r > 40 ? 30 : 18);
      if (d < min) { if (d < 0.01) { dx = Math.cos(i * 7 + j); dy = Math.sin(i * 7 + j); d = 1; } const k = (min - d) / 2 / d; if (!A.fixed) { A.x -= dx * k; A.y -= dy * k; } if (!B.fixed) { B.x += dx * k; B.y += dy * k; } }
    }
    for (const n of nodes) if (!n.fixed) { n.x += (n.tx - n.x) * pull; n.y += (n.ty - n.y) * pull; n.x = clamp(n.x, n.r + 4, W - n.r - 4); n.y = clamp(n.y, n.r + 4, H - n.r - 22); }
  }
}
const iconHTML = (c) => `<span class="vic">${chipPhotoHTML(c)}</span>`;

RENDER.map = () => {
  const page = $('#page-map');
  if (MAP.mode === 'all') MAP.mode = 'groups';
  const chips = S.chips.filter((c) => MAP.mode === 'people' ? isPerson(c) : MAP.mode === 'chars' ? isPerson(c) || c.kind === 'character' : true);
  const people = chips.filter(isPerson);
  const selC = MAP.sel && chips.find((c) => c.id === MAP.sel);
  if (!selC) MAP.sel = null;
  const radar = !!selC && MAP.mode !== 'groups';
  page.innerHTML = `
    <div class="eyebrow">VOICE MAP · 声の相関図</div>
    <h1 class="h1">ボイスマップ</h1>
    <div class="seg" style="margin:12px 0 8px"><button data-mm="people" class="${MAP.mode === 'people' ? 'on' : ''}">人の声</button><button data-mm="chars" class="${MAP.mode === 'chars' ? 'on' : ''}">キャラも</button><button data-mm="groups" class="${MAP.mode === 'groups' ? 'on' : ''}">グループ</button></div>
    <div class="vhint">${radar ? `<button class="vback" id="vBack">${ICON.back || '‹'} 全体に戻る</button><span><b style="color:${selC.color}">${esc(selC.name)}</b> とのそっくり度。真ん中に近いほど似ています</span>`
      : MAP.mode === 'groups' ? '似た声どうしをグループに分けました。タップすると、似ているチップが光ります'
      : '似ている声ほど近くに並びます。人をタップすると、その人とのそっくり度がわかります'}</div>
    <div id="vmapArea"></div>
    <div id="vmapCard"></div>
    <div class="h2">${MAP.mode === 'groups' ? 'そっくりな組み合わせ' : 'そっくりペア'} <small>TOP 5</small></div>
    <div id="vmapRank"></div>
    ${people.length < 2 && MAP.mode !== 'groups' ? `<div class="note" style="margin-top:12px">友達や自分の声を登録すると、誰と誰の声が近いかがここでわかります。</div><div class="footer-actions"><button class="btn" id="vmapNew">${ICON.plus} 声を登録する</button></div>` : ''}`;
  $$('[data-mm]', page).forEach((b) => b.addEventListener('click', () => { MAP.mode = b.dataset.mm; MAP.sel = null; RENDER.map(); }));
  if ($('#vBack')) $('#vBack').onclick = () => { MAP.sel = null; RENDER.map(); };
  if ($('#vmapNew')) $('#vmapNew').onclick = () => go('create');
  const pick = (id) => { MAP.sel = MAP.sel === id ? null : id; VoxEngine.sfx('tick'); RENDER.map(); window.scrollTo && $('#page-map').scrollTo && 0; };
  if (MAP.mode === 'groups') renderGroups(chips, selC, pick);
  else renderPlane(chips, selC, pick);
  renderCard(chips, selC);
  // ranking of the closest pairs
  const pool = MAP.mode === 'groups' ? chips : people;
  const plane = MAP.mode !== 'groups';
  const pairs = [];
  for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) pairs.push({ a: pool[i], b: pool[j], s: voiceSim(pool[i], pool[j], plane) });
  pairs.sort((x, y) => y.s - x.s);
  $('#vmapRank').innerHTML = pairs.slice(0, 5).map((r, i) => `<button class="vpair" data-a="${r.a.id}" style="animation-delay:${i * 0.05}s"><span class="vrank">${i + 1}</span><span class="vmini" style="--c:${r.a.color}">${chipPhotoHTML(r.a)}</span><span class="vmini" style="--c:${r.b.color};margin-left:-8px">${chipPhotoHTML(r.b)}</span>
    <span class="grow vpnm">${esc(r.a.name)} <i>×</i> ${esc(r.b.name)}<small>${simWord(r.s)}</small></span><b class="vps" style="color:${mixHex(r.a.color, r.b.color, 0.5)}">${r.s}%</b></button>`).join('') || '<div class="small muted">2つ以上の声があると表示されます</div>';
  $$('.vpair', page).forEach((b) => b.addEventListener('click', () => { MAP.sel = b.dataset.a; RENDER.map(); $('#vmapArea').scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
};

function renderPlane(chips, selC, pick) {
  const area = $('#vmapArea');
  area.innerHTML = `<div class="vmap" id="vmap"></div>${selC ? '' : `<div class="vlegend"><span><i class="lg solid"></i>そっくり・似てる</span><span><i class="lg dash"></i>いちばん近い人</span>${MAP.mode === 'chars' ? '<span><i class="lg dot"></i>近いキャラ</span>' : ''}</div>`}`;
  const box = $('#vmap');
  const W = Math.round(box.clientWidth || 340), H = Math.round(W * 1.05);
  box.style.height = H + 'px';
  const pad = 40;
  const nodes = chips.map((c) => ({ c, r: isPerson(c) ? 25 : 15, x: 0, y: 0, tx: 0, ty: 0, s: 100 }));
  let svg = '', over = '';
  if (selC) {
    // radar: chosen voice in the middle, others at a distance that grows as they get less alike
    const cx = W / 2, cy = H / 2 - 6, R = Math.min(W, H) / 2 - pad + 6;
    const rOf = (s) => 34 + (R - 34) * Math.pow(clamp((100 - s) / 80, 0, 1), 0.75); // spread the close ones a little
    for (const ring of [90, 70, 50, 30]) svg += `<circle cx="${cx}" cy="${cy}" r="${rOf(ring).toFixed(1)}" class="vring"/><text x="${cx + 4}" y="${(cy - rOf(ring) + 12).toFixed(1)}" class="vringl">${ring}%</text>`;
    const ps = profOf(selC);
    nodes.forEach((n, i) => {
      if (n.c === selC) { n.x = n.tx = cx; n.y = n.ty = cy; n.fixed = true; n.r = 30; return; }
      n.s = voiceSim(selC, n.c, true);
      const p = profOf(n.c);
      let ang = Math.atan2(-(p.formant - ps.formant) * 1.5, p.pitch - ps.pitch);
      if (Math.abs(p.formant - ps.formant) + Math.abs(p.pitch - ps.pitch) < 0.01) ang = i * 2.4;
      const rr = Math.max(n.r + 40, rOf(n.s));
      n.x = n.tx = cx + Math.cos(ang) * rr; n.y = n.ty = cy + Math.sin(ang) * rr;
    });
    relax(nodes, W, H, 0.05, 160);
    const center = nodes.find((n) => n.c === selC);
    nodes.forEach((n, i) => {
      if (n === center) return;
      const w = 0.8 + (n.s / 100) * 3.5;
      svg += `<line x1="${cx}" y1="${cy}" x2="${n.x.toFixed(1)}" y2="${n.y.toFixed(1)}" class="lk ${isPerson(n.c) ? '' : 'char'}" style="--c:${n.c.color};stroke-width:${w.toFixed(1)};animation-delay:${0.1 + i * 0.03}s"/>`;
    });
    svg += `<text x="${W - 12}" y="${H - 12}" class="axl" text-anchor="end">右＝高い声　上＝明るい声</text>`;
  } else {
    // overview: the voice plane, zoomed to the voices shown
    const ps = nodes.map((n) => profOf(n.c));
    const sx = Math.max(4, ...ps.map((p) => Math.abs(p.pitch))) * 1.15, sy = Math.max(2, ...ps.map((p) => Math.abs(p.formant))) * 1.2;
    nodes.forEach((n, i) => { n.x = n.tx = W / 2 + (ps[i].pitch / sx) * (W / 2 - pad); n.y = n.ty = H / 2 - (ps[i].formant / sy) * (H / 2 - pad); });
    relax(nodes, W, H, 0.06);
    svg += `<line x1="${W / 2}" y1="6" x2="${W / 2}" y2="${H - 6}" class="ax"/><line x1="6" y1="${H / 2}" x2="${W - 6}" y2="${H / 2}" class="ax"/>`;
    for (const q of QUAD) {
      const x = q.x > 0 ? W - 12 : 12, y = q.y < 0 ? 22 : H - 22, an = q.x > 0 ? 'end' : 'start';
      svg += `<text x="${x}" y="${y}" class="qn" text-anchor="${an}">${q.name}</text><text x="${x}" y="${y + 13}" class="qs" text-anchor="${an}">${q.sub}</text>`;
    }
    svg += `<text x="${W - 8}" y="${H / 2 - 6}" class="axl" text-anchor="end">高い ▶</text><text x="8" y="${H / 2 - 6}" class="axl">◀ 低い</text>`;
    // links: strong pairs, plus each person's nearest
    const P = nodes.filter((n) => isPerson(n.c));
    const edges = new Map();
    const add = (a, b, s, kind) => { const k = [a.c.id, b.c.id].sort().join('|'); if (!edges.has(k)) edges.set(k, { a, b, s, kind }); };
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) { const s = voiceSim(P[i].c, P[j].c, true); if (s >= 60) add(P[i], P[j], s, 'solid'); }
    for (const a of P) {
      const best = P.filter((b) => b !== a).map((b) => ({ b, s: voiceSim(a.c, b.c, true) })).sort((x, y) => y.s - x.s)[0];
      if (best) add(a, best.b, best.s, best.s >= 60 ? 'solid' : 'dash');
      if (MAP.mode === 'chars') {
        const ch = nodes.filter((m) => m.c.kind === 'character').map((m) => ({ m, s: voiceSim(a.c, m.c, true) })).sort((x, y) => y.s - x.s)[0];
        if (ch) add(a, ch.m, ch.s, 'char');
      }
    }
    let i = 0;
    for (const e of edges.values()) {
      const col = e.kind === 'char' ? e.b.c.color : mixHex(e.a.c.color, e.b.c.color, 0.5);
      const w = e.kind === 'char' ? 1.2 : 1 + (e.s / 100) * 3.4;
      svg += `<line x1="${e.a.x.toFixed(1)}" y1="${e.a.y.toFixed(1)}" x2="${e.b.x.toFixed(1)}" y2="${e.b.y.toFixed(1)}" class="lk ${e.kind}" style="--c:${col};stroke-width:${w.toFixed(1)};animation-delay:${0.15 + i++ * 0.04}s"/>`;
      if (e.kind !== 'char' && e.s >= 75) {
        const mx = (e.a.x + e.b.x) / 2, my = (e.a.y + e.b.y) / 2;
        over += `<g class="pct" style="animation-delay:${0.6 + i * 0.04}s"><rect x="${(mx - 19).toFixed(1)}" y="${(my - 9).toFixed(1)}" width="38" height="18" rx="9"/><text x="${mx.toFixed(1)}" y="${(my + 4).toFixed(1)}" text-anchor="middle">${e.s}%</text></g>`;
      }
    }
  }
  box.innerHTML = `<svg class="vmap-svg" viewBox="0 0 ${W} ${H}">${svg}</svg>` + nodes.map((n, i) => {
    const on = n.c === selC;
    const lbl = selC && !on ? `${esc(n.c.name)} <b>${n.s}%</b>` : esc(n.c.name);
    return `<button class="vnode ${isPerson(n.c) ? 'person' : 'char'} ${on ? 'on' : ''}" data-id="${n.c.id}" style="left:${(n.x - n.r).toFixed(1)}px;top:${(n.y - n.r).toFixed(1)}px;width:${n.r * 2}px;height:${n.r * 2}px;--c:${n.c.color};animation-delay:${i * 0.03}s" aria-label="${esc(n.c.name)}">
      ${iconHTML(n.c)}<span class="vnm ${selC && n.s >= 75 && !on ? 'hi' : ''}">${lbl}</span></button>`;
  }).join('') + `<svg class="vmap-svg top" viewBox="0 0 ${W} ${H}">${over}</svg>`;
  $$('.vnode', box).forEach((b) => b.addEventListener('click', () => pick(b.dataset.id)));
}

function renderGroups(chips, selC, pick) {
  const groups = [{ key: 'people', name: '人の声', color: '#ffd166', list: [] }, ...VOICE_GROUPS.map((g) => ({ ...g, list: [] }))];
  for (const c of chips) (isPerson(c) ? groups[0] : groups.find((g) => g.key === groupKey(c))).list.push(c);
  const sims = selC ? new Map(chips.filter((c) => c !== selC).map((c) => [c.id, voiceSim(selC, c, false)])) : null;
  const top = sims ? new Set([...sims.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map((e) => e[0])) : null;
  $('#vmapArea').innerHTML = `<div class="vgroups">${groups.filter((g) => g.list.length).map((g, gi) => `
    <div class="vgroup" style="--g:${g.color};animation-delay:${gi * 0.05}s"><div class="vgh"><i></i><b>${g.name}</b><span>${g.list.length}</span></div>
      <div class="vgl">${g.list.map((c) => {
        const on = c === selC, hit = top && top.has(c.id), dim = selC && !on && !hit;
        return `<button class="vgc ${on ? 'on' : ''} ${hit ? 'hit' : ''} ${dim ? 'dim' : ''}" data-id="${c.id}" style="--c:${c.color}"><span class="vic">${chipPhotoHTML(c)}</span><span class="vgn">${esc(c.name)}</span>${hit ? `<em>${sims.get(c.id)}%</em>` : ''}</button>`;
      }).join('')}</div></div>`).join('')}</div>`;
  $$('.vgc').forEach((b) => b.addEventListener('click', () => pick(b.dataset.id)));
}

function renderCard(chips, selC) {
  const card = $('#vmapCard');
  if (!selC) { card.innerHTML = ''; return; }
  const plane = MAP.mode !== 'groups';
  const c = selC, p = profOf(c);
  const near = chips.filter((m) => m !== c).map((m) => ({ m, s: voiceSim(c, m, plane) })).sort((x, y) => y.s - x.s).slice(0, 4);
  const ch = plane && isPerson(c) ? S.chips.filter((m) => m.kind === 'character').map((m) => ({ m, s: voiceSim(c, m, true) })).sort((x, y) => y.s - x.s)[0] : null;
  const quad = QUAD.find((q) => (p.pitch >= 0 ? 1 : -1) === q.x && (p.formant >= 0 ? -1 : 1) === q.y);
  const seated = isSeated(c.id);
  card.innerHTML = `<div class="vcard" style="--c:${c.color}">
    <div class="row" style="gap:12px"><span class="vcic">${chipPhotoHTML(c)}</span><div class="grow"><b class="vcnm">${esc(c.name)}</b>
      <div class="small muted">${KIND_LABEL[c.kind] || ''}${plane && quad ? ` · タイプ：<b style="color:#fff">${quad.name}</b>` : ''}</div></div></div>
    <div class="vnear">${near.map(({ m, s }) => `<div class="vrow"><span class="vmini" style="--c:${m.color}">${chipPhotoHTML(m)}</span><span class="grow">${esc(m.name)}<small>${simWord(s)}</small></span><span class="vbar"><i style="width:${s}%;background:${m.color}"></i></span><b>${s}%</b></div>`).join('')}</div>
    ${ch ? `<div class="vchar">いちばん近いキャラは <b style="color:${ch.m.color}">${esc(ch.m.name)}</b>（${ch.s}%）</div>` : ''}
    <div class="footer-actions" style="margin-top:12px">${c.sampleKey ? `<button class="btn ghost" id="vcPlay">${ICON.play} 録音を聞く</button>` : ''}<button class="btn" id="vcSeat" ${seated ? 'disabled' : ''}>${seated ? '差し込み済み' : '変換に差し込む'}</button></div></div>`;
  if ($('#vcPlay')) $('#vcPlay').onclick = async () => { const blob = await VoxStore.get('blobs', c.sampleKey); if (blob) playBlob(blob); };
  $('#vcSeat').onclick = () => {
    const free = S.slots.indexOf(null);
    if (free < 0) { toast('メモリは4つまで。変換画面でアイコンをタップして1つ取り出してね'); return; }
    S.slots[free] = c.id; saveSettings(); applyParams(); go('home'); toast(`「${c.name}」を差し込みました`);
  };
}
