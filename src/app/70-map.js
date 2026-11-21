/* ===== VOICE MAP — similar voices sit close together and are linked =====
   人の声: placed on a "voice plane" (pitch × tone) so you can see at a glance whose voices are close.
   キャラも: characters join as landmarks ("your voice is giant-ish").
   すべて: every chip, laid out by overall sound similarity (incl. instruments / effects). */
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
function groupColor(c) { const g = VOICE_GROUPS.find((x) => x.test(profOf(c))); return g ? g.color : '#a487ff'; }

function mapLayout(chips, W, H, plane) {
  const pad = 34;
  const nodes = chips.map((c, i) => ({ c, r: isPerson(c) ? (plane ? 25 : 18) : plane ? 17 : 14, x: 0, y: 0, tx: 0, ty: 0 }));
  if (plane) {
    // zoom the plane to the voices shown (centred on 0, at least ±4 semitones / ±2 tone)
    const ps = nodes.map((n) => profOf(n.c));
    const sx = Math.max(4, ...ps.map((p) => Math.abs(p.pitch))) * 1.15, sy = Math.max(2, ...ps.map((p) => Math.abs(p.formant))) * 1.2;
    nodes.forEach((n, i) => {
      const p = ps[i];
      n.tx = n.x = W / 2 + (p.pitch / sx) * (W / 2 - pad);
      n.ty = n.y = H / 2 - (p.formant / sy) * (H / 2 - pad);
    });
  } else {
    // force layout: springs whose rest length grows as voices get less alike
    const n = nodes.length;
    nodes.forEach((d, i) => { const a = (i / n) * Math.PI * 2; d.x = W / 2 + Math.cos(a) * W * 0.3; d.y = H / 2 + Math.sin(a) * H * 0.3; });
    const sim = nodes.map((a) => nodes.map((b) => voiceSim(a.c, b.c, false)));
    for (let it = 0; it < 260; it++) {
      const k = 0.06 * (1 - it / 300);
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const A = nodes[i], B = nodes[j];
        let dx = B.x - A.x, dy = B.y - A.y; const d = Math.hypot(dx, dy) || 0.01; dx /= d; dy /= d;
        const L = 26 + (100 - sim[i][j]) * 2.1;
        const f = sim[i][j] > 35 ? (d - L) * k : Math.min(0, d - L) * k;
        A.x += dx * f; A.y += dy * f; B.x -= dx * f; B.y -= dy * f;
      }
      for (const d of nodes) { d.x += (W / 2 - d.x) * 0.01; d.y += (H / 2 - d.y) * 0.01; }
    }
    // fit into the box
    const xs = nodes.map((d) => d.x), ys = nodes.map((d) => d.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    for (const d of nodes) {
      d.tx = d.x = pad + ((d.x - x0) / Math.max(1, x1 - x0)) * (W - 2 * pad);
      d.ty = d.y = pad + ((d.y - y0) / Math.max(1, y1 - y0)) * (H - 2 * pad);
    }
  }
  // keep icons from overlapping, while staying near their true spot
  for (let it = 0; it < 90; it++) {
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const A = nodes[i], B = nodes[j];
      let dx = B.x - A.x, dy = B.y - A.y; let d = Math.hypot(dx, dy);
      const min = A.r + B.r + 6;
      if (d < min) { if (d < 0.01) { dx = Math.cos(i + j); dy = Math.sin(i + j); d = 1; } const push = (min - d) / 2; A.x -= (dx / d) * push; A.y -= (dy / d) * push; B.x += (dx / d) * push; B.y += (dy / d) * push; }
    }
    for (const d of nodes) { d.x += (d.tx - d.x) * 0.06; d.y += (d.ty - d.y) * 0.06; d.x = clamp(d.x, d.r + 2, W - d.r - 2); d.y = clamp(d.y, d.r + 2, H - d.r - 14); }
  }
  return nodes;
}

RENDER.map = () => {
  const page = $('#page-map');
  const plane = MAP.mode !== 'all';
  const chips = S.chips.filter((c) => MAP.mode === 'people' ? isPerson(c) : MAP.mode === 'chars' ? isPerson(c) || c.kind === 'character' : true);
  const people = chips.filter(isPerson);
  page.innerHTML = `
    <div class="eyebrow">VOICE MAP · 声の相関図</div>
    <h1 class="h1">ボイスマップ</h1>
    <p class="lead">似ている声ほど近くに並び、線でつながります。チップをタップすると、そっくり度がわかります。</p>
    <div class="seg" style="margin:12px 0 10px"><button data-mm="people" class="${MAP.mode === 'people' ? 'on' : ''}">人の声</button><button data-mm="chars" class="${MAP.mode === 'chars' ? 'on' : ''}">キャラも</button><button data-mm="all" class="${MAP.mode === 'all' ? 'on' : ''}">すべて</button></div>
    <div class="vmap" id="vmap"></div>
    <div id="vmapCard"></div>
    <div class="h2">${MAP.mode === 'all' ? 'そっくりな組み合わせ' : 'そっくりペア'} <small>TOP 5</small></div>
    <div id="vmapRank"></div>
    ${people.length < 2 && MAP.mode !== 'all' ? `<div class="note" style="margin-top:12px">友達や自分の声を登録すると、誰と誰の声が近いかがここでわかります。</div><div class="footer-actions"><button class="btn" id="vmapNew">${ICON.plus} 声を登録する</button></div>` : ''}`;
  $$('[data-mm]', page).forEach((b) => b.addEventListener('click', () => { MAP.mode = b.dataset.mm; MAP.sel = null; RENDER.map(); }));
  if ($('#vmapNew')) $('#vmapNew').onclick = () => go('create');
  const box = $('#vmap');
  const W = Math.round(box.clientWidth || 340), H = Math.round(W * (plane ? 1.08 : 1.3));
  box.style.height = H + 'px';
  const nodes = mapLayout(chips, W, H, plane);
  const byId = new Map(nodes.map((n) => [n.c.id, n]));
  // links: each voice to its nearest voices
  const edges = new Map();
  const addEdge = (a, b, s, kind) => { const k = a.c.id < b.c.id ? a.c.id + '|' + b.c.id : b.c.id + '|' + a.c.id; if (!edges.has(k) || edges.get(k).s < s) edges.set(k, { a, b, s, kind }); };
  for (const n of nodes) {
    const pool = plane && isPerson(n.c) ? nodes.filter((m) => m !== n && isPerson(m.c)) : nodes.filter((m) => m !== n);
    pool.map((m) => ({ m, s: voiceSim(n.c, m.c, plane) })).sort((x, y) => y.s - x.s).slice(0, 2)
      .forEach(({ m, s }) => { if (s >= (plane ? 30 : 45)) addEdge(n, m, s, 'near'); });
    if (MAP.mode === 'chars' && isPerson(n.c)) {
      const ch = nodes.filter((m) => m.c.kind === 'character').map((m) => ({ m, s: voiceSim(n.c, m.c, true) })).sort((x, y) => y.s - x.s)[0];
      if (ch) addEdge(n, ch.m, ch.s, 'char');
    }
  }
  const sel = MAP.sel && byId.get(MAP.sel);
  const axes = plane ? `<line x1="${W / 2}" y1="8" x2="${W / 2}" y2="${H - 8}" class="ax"/><line x1="8" y1="${H / 2}" x2="${W - 8}" y2="${H / 2}" class="ax"/>
    <text x="10" y="${H / 2 - 7}" class="axl">◀ 低い声</text><text x="${W - 10}" y="${H / 2 - 7}" class="axl" text-anchor="end">高い声 ▶</text>
    <text x="${W / 2 + 7}" y="18" class="axl">▲ 明るい・細い</text><text x="${W / 2 + 7}" y="${H - 12}" class="axl">▼ 太い・深い</text>` : '';
  const pcts = [];
  const lines = [...edges.values()].map((e, i) => {
    const hot = sel && (e.a === sel || e.b === sel);
    const col = e.kind === 'char' ? e.b.c.color : isPerson(e.a.c) ? mixHex(e.a.c.color, e.b.c.color, 0.5) : groupColor(e.a.c);
    const w = 1 + (e.s / 100) * 3.2;
    const mx = (e.a.x + e.b.x) / 2, my = (e.a.y + e.b.y) / 2;
    const showPct = hot || (!sel && isPerson(e.a.c) && isPerson(e.b.c));
    if (showPct) pcts.push(`<g class="pct ${hot ? 'hot' : ''}" style="animation-delay:${0.5 + i * 0.03}s"><rect x="${(mx - 17).toFixed(1)}" y="${(my - 8).toFixed(1)}" width="34" height="16" rx="8"/><text x="${mx.toFixed(1)}" y="${(my + 3.5).toFixed(1)}" text-anchor="middle">${e.s}%</text></g>`);
    return `<line x1="${e.a.x.toFixed(1)}" y1="${e.a.y.toFixed(1)}" x2="${e.b.x.toFixed(1)}" y2="${e.b.y.toFixed(1)}" class="lk ${e.kind} ${sel ? (hot ? 'hot' : 'dim') : ''}" style="--c:${col};stroke-width:${w.toFixed(1)};animation-delay:${0.15 + i * 0.03}s"/>`;
  }).join('');
  box.innerHTML = `<svg class="vmap-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${axes}${lines}</svg>` + nodes.map((n, i) => {
    const on = sel === n, dim = sel && !on && ![...edges.values()].some((e) => (e.a === sel && e.b === n) || (e.b === sel && e.a === n));
    return `<button class="vnode ${isPerson(n.c) ? 'person' : ''} ${on ? 'on' : ''} ${dim ? 'dim' : ''}" data-id="${n.c.id}" style="left:${(n.x - n.r).toFixed(1)}px;top:${(n.y - n.r).toFixed(1)}px;width:${n.r * 2}px;height:${n.r * 2}px;--c:${n.c.color};animation-delay:${i * 0.025}s" aria-label="${esc(n.c.name)}">
      <span class="vic">${chipPhotoHTML(n.c)}</span>${plane || isPerson(n.c) || on || (sel && !dim) ? `<span class="vnm">${esc(n.c.name)}</span>` : ''}</button>`;
  }).join('') + `<svg class="vmap-svg top" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${pcts.join('')}</svg>`;
  $$('.vnode', box).forEach((b) => b.addEventListener('click', () => { MAP.sel = MAP.sel === b.dataset.id ? null : b.dataset.id; VoxEngine.sfx('tick'); RENDER.map(); }));
  // detail card for the tapped chip
  const card = $('#vmapCard');
  if (sel) {
    const c = sel.c, p = profOf(c);
    const near = chips.filter((m) => m !== c).map((m) => ({ m, s: voiceSim(c, m, plane && isPerson(c) === isPerson(m) ? plane : plane) })).sort((x, y) => y.s - x.s).slice(0, 4);
    const ch = MAP.mode !== 'all' ? S.chips.filter((m) => m.kind === 'character').map((m) => ({ m, s: voiceSim(c, m, true) })).sort((x, y) => y.s - x.s)[0] : null;
    const seated = isSeated(c.id);
    card.innerHTML = `<div class="vcard" style="--c:${c.color}">
      <div class="row" style="gap:12px"><span class="vcic">${chipPhotoHTML(c)}</span><div class="grow"><b class="vcnm">${esc(c.name)}</b>
        <div class="small muted">${KIND_LABEL[c.kind] || ''}${plane ? ` · 声の高さ ${signed(p.pitch, 1)} / 声色 ${signed(p.formant, 1)}` : ''}</div></div></div>
      <div class="vnear">${near.map(({ m, s }) => `<div class="vrow"><span class="vmini" style="--c:${m.color}">${chipPhotoHTML(m)}</span><span class="grow">${esc(m.name)}</span><span class="vbar"><i style="width:${s}%;background:${m.color}"></i></span><b>${s}%</b></div>`).join('')}</div>
      ${ch && isPerson(c) ? `<div class="vchar">いちばん近いキャラは <b style="color:${ch.m.color}">${esc(ch.m.name)}</b>（${ch.s}%）</div>` : ''}
      <div class="footer-actions" style="margin-top:12px">${c.sampleKey ? `<button class="btn ghost" id="vcPlay">${ICON.play || '▶'} 録音を聞く</button>` : ''}<button class="btn" id="vcSeat" ${seated ? 'disabled' : ''}>${seated ? '差し込み済み' : '変換に差し込む'}</button></div></div>`;
    if ($('#vcPlay')) $('#vcPlay').onclick = async () => { const blob = await VoxStore.get('blobs', c.sampleKey); if (blob) playBlob(blob); };
    $('#vcSeat').onclick = () => {
      const free = S.slots.indexOf(null);
      if (free < 0) { toast('メモリは4つまで。変換画面でアイコンをタップして1つ取り出してね'); return; }
      S.slots[free] = c.id; saveSettings(); applyParams(); go('home'); toast(`「${c.name}」を差し込みました`);
    };
  } else card.innerHTML = '';
  // ranking of the closest pairs
  const pool = MAP.mode === 'all' ? chips : people;
  const pairs = [];
  for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) pairs.push({ a: pool[i], b: pool[j], s: voiceSim(pool[i], pool[j], plane) });
  pairs.sort((x, y) => y.s - x.s);
  $('#vmapRank').innerHTML = pairs.slice(0, 5).map((r, i) => `<div class="vpair" style="animation-delay:${i * 0.05}s"><span class="vrank">${i + 1}</span><span class="vmini" style="--c:${r.a.color}">${chipPhotoHTML(r.a)}</span><span class="vmini" style="--c:${r.b.color};margin-left:-8px">${chipPhotoHTML(r.b)}</span>
    <span class="grow vpnm">${esc(r.a.name)} <i>×</i> ${esc(r.b.name)}</span><b class="vps" style="color:${mixHex(r.a.color, r.b.color, 0.5)}">${r.s}%</b></div>`).join('') || '<div class="small muted">2つ以上の声があると表示されます</div>';
};
