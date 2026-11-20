/* ===== MEMORY: chips + cases ===== */
RENDER.memory = () => {
  const page = $('#page-memory');
  page.innerHTML = `
    <div class="eyebrow">VOICE MEMORY ARCHIVE</div>
    <div class="row"><h1 class="h1 grow">メモリ</h1><span class="status ${S.persistent ? 'ok' : 'plan'}">${S.chips.length}枚</span></div>
    <div class="seg" style="margin:10px 0 4px"><button data-mt="chips" class="${S.memTab === 'chips' ? 'on' : ''}">チップ</button><button data-mt="cases" class="${S.memTab === 'cases' ? 'on' : ''}">ケース</button></div>
    <div id="memBody"></div>`;
  $$('[data-mt]', page).forEach((b) => b.addEventListener('click', () => { S.memTab = b.dataset.mt; RENDER.memory(); }));
  if (S.memTab === 'chips') renderChipGrid(); else renderCases();
};

function renderChipGrid() {
  const body = $('#memBody');
  const q = S.memQuery.trim().toLowerCase();
  const kinds = [['all', 'すべて'], ['fav', 'お気に入り'], ['friend', '友達'], ['self', '自分'], ['character', 'キャラ'], ['fx', 'エフェクト']];
  const list = S.chips.filter((c) => (S.memKind === 'all' || (S.memKind === 'fav' ? c.favorite : c.kind === S.memKind)) && (!q || c.name.toLowerCase().includes(q)));
  body.innerHTML = `
    <div class="search">${ICON.search}<input class="input" id="memQ" placeholder="名前で検索" value="${esc(S.memQuery)}" enterkeyhint="search"></div>
    <div class="chips-row scroll" style="margin-bottom:16px">${kinds.map(([k, l]) => `<button class="pill ${S.memKind === k ? 'on' : ''}" data-k="${k}">${l}</button>`).join('')}</div>
    <div class="chip-grid">
      ${list.map((c) => `<button class="gcard" data-chip="${c.id}">${isSeated(c.id) ? `<span class="in-drv">SLOT ${String(S.slots.indexOf(c.id) + 1).padStart(2, '0')}</span>` : ''}${c.favorite ? `<span class="fav">${ICON.star}</span>` : ''}${chipHTML(c)}<span class="cap">${esc(casesOf(c.id).map((k) => k.name).join('・') || 'ケースなし')}</span></button>`).join('')}
      <button class="gcard add" id="addChip"><span class="addbox">${ICON.plus}</span><span class="cap">新しいメモリ</span></button>
    </div>
    ${list.length ? '' : '<div class="empty">該当するメモリはありません</div>'}`;
  const qi = $('#memQ', body);
  qi.addEventListener('input', () => { S.memQuery = qi.value; const pos = qi.selectionStart; renderChipGrid(); const n = $('#memQ'); n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} });
  $$('[data-k]', body).forEach((b) => b.addEventListener('click', () => { S.memKind = b.dataset.k; renderChipGrid(); }));
  $$('[data-chip]', body).forEach((b) => b.addEventListener('click', () => openChipSheet(b.dataset.chip)));
  $('#addChip', body).addEventListener('click', () => go('create', { reset: true }));
}

function openChipSheet(id) {
  const c = chipById(id); if (!c) return;
  const p = Object.assign({}, VoxEngine.DEFAULT, c.profile);
  const rows = [
    ['ピッチ', p.robotHz ? `ロボ固定 ${Math.round(p.robotHz)}Hz` : signed(p.pitch, 1) + ' 半音'],
    ['声色（フォルマント）', signed(p.formant, 1) + ' 半音'],
  ];
  if (c.analysis) rows.push(['録音から測定', `${Math.round(c.analysis.f0)}Hz / 一致度 ${Math.round(c.analysis.confidence * 100)}%`]);
  const extras = [p.echo && 'エコー', p.reverb && 'リバーブ', p.chorus && 'ダブラー', p.drive && 'ドライブ', p.ring && 'リング変調', p.lowcut > 200 && 'ローファイ'].filter(Boolean);
  if (extras.length) rows.push(['内蔵FX', extras.join('・')]);
  openSheet(esc(c.name), `
    <div class="row" style="align-items:flex-start;gap:16px">
      <div style="flex:none;font-size:12px">${chipHTML(c)}</div>
      <div class="grow">
        <div class="kv">${rows.map(([k, v]) => `<span>${k}</span><b>${esc(v)}</b>`).join('')}</div>
        <div class="small muted" style="margin-top:10px;line-height:1.6">${c.demo ? 'サンプルのメモリです。実在の人物の声ではありません。' : c.kind === 'friend' ? (c.consent ? '本人の同意を確認済み（' + new Date(c.consent.at).toLocaleDateString('ja-JP') + '）' : '') : ''}</div>
      </div>
    </div>
    <div class="footer-actions"><button class="btn" id="csInsert">${ICON.bolt} ドライバーに装着</button></div>
    <div class="footer-actions" style="margin-top:10px">
      <button class="btn ghost sm" id="csFav">${c.favorite ? ICON.star : ICON.starLine} ${c.favorite ? 'お気に入り' : 'お気に入り登録'}</button>
      <button class="btn ghost sm" id="csCase">${ICON.box} ケース</button>
      ${c.sampleKey ? `<button class="btn ghost sm" id="csPlay">${ICON.play} 元の声</button>` : ''}
    </div>
    <div class="footer-actions" style="margin-top:10px">
      <button class="btn ghost sm" id="csEdit">${ICON.edit} 調整</button>
      <button class="btn ghost sm" id="csDup">複製</button>
      <button class="btn danger sm" id="csDel">${ICON.trash} 削除</button>
    </div>`, (b, close) => {
    $('#csInsert', b).onclick = async () => {
      close();
      if (S.homeCase !== 'all' && !wheelList().includes(c)) S.homeCase = 'all';
      S.selectedId = c.id; go('home');
      await sleep(80); await insertCurrent(0);
    };
    $('#csFav', b).onclick = () => { c.favorite = !c.favorite; saveChip(c); close(); RENDER.memory(); openChipSheet(id); };
    $('#csCase', b).onclick = () => { close(); openCaseAssign(c); };
    if ($('#csPlay', b)) $('#csPlay', b).onclick = async () => { const blob = await VoxStore.get('blobs', c.sampleKey); if (blob) playBlob(blob); };
    $('#csEdit', b).onclick = () => { close(); go('create', { edit: c.id }); };
    $('#csDup', b).onclick = () => {
      const copy = Object.assign({}, JSON.parse(JSON.stringify(c)), { id: uid('c'), name: c.name + ' 2', builtin: false, demo: false, createdAt: Date.now(), favorite: false });
      S.chips.push(copy); saveChip(copy); close(); toast('複製しました'); RENDER.memory();
    };
    $('#csDel', b).onclick = async () => {
      close();
      if (!(await confirmSheet('メモリを削除', `「${esc(c.name)}」を削除します。ケースからも外れます。`, '削除', true))) return;
      deleteChip(c);
    };
  });
}
function deleteChip(c) {
  if (isSeated(c.id)) { S.slots[S.slots.indexOf(c.id)] = null; removeSlotChip(c.id); applyParams(); saveSettings(); }
  S.chips = S.chips.filter((x) => x !== c);
  for (const k of S.cases) if (k.chipIds.includes(c.id)) { k.chipIds = k.chipIds.filter((x) => x !== c.id); saveCase(k); }
  if (c.builtin) { S.removedBuiltins = [...(S.removedBuiltins || []), c.id]; }
  VoxStore.del('chips', c.id);
  if (c.sampleKey) VoxStore.del('blobs', c.sampleKey);
  if (S.selectedId === c.id) S.selectedId = S.chips[0]?.id || null;
  saveSettings(); toast('削除しました');
  $('#page-home').dataset.built && RENDER.home();
  RENDER.memory();
}

function openCaseAssign(c) {
  openSheet(`「${esc(c.name)}」を入れるケース`, `
    ${S.cases.map((k) => `<button class="check ${k.chipIds.includes(c.id) ? 'on' : ''}" data-kid="${k.id}" style="margin-bottom:8px"><span class="box">${ICON.check}</span><span class="grow"><b>${esc(k.name)}</b> <span class="muted small">${k.chipIds.length}枚</span></span><span class="swatch" style="--c:${k.color};width:20px;height:20px"></span></button>`).join('')}
    <button class="btn ghost block" id="newCaseHere" style="margin-top:8px">${ICON.plus} 新しいケースを作る</button>`, (b, close) => {
    $$('[data-kid]', b).forEach((el) => el.addEventListener('click', () => {
      const k = caseById(el.dataset.kid);
      if (k.chipIds.includes(c.id)) k.chipIds = k.chipIds.filter((x) => x !== c.id); else k.chipIds.push(c.id);
      saveCase(k); el.classList.toggle('on');
    }));
    $('#newCaseHere', b).onclick = () => { close(); editCase(null, [c.id]); };
  }, { onClose: () => { if (S.tab === 'memory') RENDER.memory(); if (S.homeCase !== 'all') rebuildWheel(); } });
}

/* ---- cases ---- */
function caseCardHTML(k) {
  const chips = k.chipIds.map(chipById).filter(Boolean);
  return `<button class="case" data-case="${k.id}" style="--cc:${k.color}">
    <div class="case-meta"><div><div class="nm">${esc(k.name)}</div><div class="ct">${chips.length} CHIPS</div></div>${S.homeCase === k.id ? '<span class="home-tag">ドライバーに並べ中</span>' : ''}</div>
    ${chips.length ? `<div class="case-tray">${chips.slice(0, 7).map((c) => chipHTML(c, { noBadge: true })).join('')}</div>` : '<div class="case-empty-tray">空のケース — チップを入れましょう</div>'}
    <i class="case-latch"></i></button>`;
}
function renderCases() {
  const body = $('#memBody');
  body.innerHTML = `
    <p class="lead" style="margin-top:12px">似た声のチップを1つのケースにまとめて、ドライバーに並べるセットを切り替えられます。</p>
    <div class="row" style="margin-bottom:14px;gap:8px"><button class="btn sm grow" id="autoGroup">${ICON.magic} 似た声で自動まとめ</button><button class="btn ghost sm grow" id="newCase">${ICON.plus} 新しいケース</button></div>
    <div class="case-list">${S.cases.map(caseCardHTML).join('') || '<div class="empty">ケースがありません</div>'}</div>`;
  $$('[data-case]', body).forEach((el) => el.addEventListener('click', () => openCaseSheet(el.dataset.case)));
  $('#newCase', body).onclick = () => editCase(null, []);
  $('#autoGroup', body).onclick = openAutoGroup;
}
function openCaseSheet(id) {
  const k = caseById(id); if (!k) return;
  const chips = k.chipIds.map(chipById).filter(Boolean);
  openSheet(esc(k.name), `
    <div class="chip-grid" style="margin-bottom:6px">${chips.map((c) => `<div class="gcard">${chipHTML(c, { noBadge: true })}<button class="pill" data-rm="${c.id}" style="height:26px;font-size:11px">外す</button></div>`).join('') || '<div class="empty">まだチップが入っていません</div>'}</div>
    <div class="footer-actions"><button class="btn" id="kHome">${ICON.bolt} このケースをドライバーに並べる</button></div>
    <div class="footer-actions" style="margin-top:10px"><button class="btn ghost sm" id="kAdd">${ICON.plus} チップを入れる</button><button class="btn ghost sm" id="kEdit">${ICON.edit} 名前・色</button><button class="btn danger sm" id="kDel">${ICON.trash}</button></div>`, (b, close) => {
    $$('[data-rm]', b).forEach((el) => el.addEventListener('click', () => { k.chipIds = k.chipIds.filter((x) => x !== el.dataset.rm); saveCase(k); close(); openCaseSheet(id); RENDER.memory(); }));
    $('#kHome', b).onclick = () => { S.homeCase = k.id; saveSettings(); close(); go('home'); rebuildWheel(); toast(`「${k.name}」をドライバーにセットしました`); };
    $('#kAdd', b).onclick = () => { close(); pickChipsFor(k); };
    $('#kEdit', b).onclick = () => { close(); editCase(k); };
    $('#kDel', b).onclick = async () => {
      close();
      if (!(await confirmSheet('ケースを削除', `「${esc(k.name)}」を削除します。中のチップは消えません。`, '削除', true))) return;
      S.cases = S.cases.filter((x) => x !== k); VoxStore.del('cases', k.id);
      if (S.homeCase === k.id) { S.homeCase = 'all'; saveSettings(); }
      RENDER.memory();
    };
  });
}
function pickChipsFor(k) {
  openSheet(`「${esc(k.name)}」に入れる`, `
    ${S.chips.map((c) => `<button class="check ${k.chipIds.includes(c.id) ? 'on' : ''}" data-cid="${c.id}" style="margin-bottom:8px;align-items:center"><span class="box">${ICON.check}</span><span style="font-size:4.2px;flex:none">${chipHTML(c, { noBadge: true })}</span><span class="grow"><b>${esc(c.name)}</b><span class="small muted" style="display:block">${KIND_LABEL[c.kind] || ''}</span></span></button>`).join('')}`, (b) => {
    $$('[data-cid]', b).forEach((el) => el.addEventListener('click', () => {
      const id = el.dataset.cid;
      if (k.chipIds.includes(id)) k.chipIds = k.chipIds.filter((x) => x !== id); else k.chipIds.push(id);
      el.classList.toggle('on'); saveCase(k);
    }));
  }, { onClose: () => { RENDER.memory(); if (S.homeCase === k.id) rebuildWheel(); } });
}
function editCase(k, initialIds) {
  const isNew = !k;
  let color = k ? k.color : COLORS[S.cases.length % COLORS.length];
  openSheet(isNew ? '新しいケース' : 'ケースを編集', `
    <label class="field"><span>ケースの名前</span><input class="input" id="kName" maxlength="20" value="${esc(k ? k.name : '')}" placeholder="例：クラスの友達、ゲーム実況用"></label>
    <div class="field"><span>ケースの色</span><div class="swatches">${COLORS.map((c) => `<button class="swatch ${c === color ? 'on' : ''}" data-col="${c}" style="--c:${c}"></button>`).join('')}</div></div>
    <button class="btn block" id="kSave">${isNew ? '作成' : '保存'}</button>`, (b, close) => {
    $$('[data-col]', b).forEach((el) => el.addEventListener('click', () => { color = el.dataset.col; $$('[data-col]', b).forEach((x) => x.classList.toggle('on', x === el)); }));
    $('#kSave', b).onclick = () => {
      const name = $('#kName', b).value.trim() || '新しいケース';
      if (isNew) { const nk = { id: uid('k'), name, color, chipIds: initialIds || [], createdAt: Date.now(), order: S.cases.length }; S.cases.push(nk); saveCase(nk); }
      else { k.name = name; k.color = color; saveCase(k); }
      close(); S.memTab = 'cases'; if (S.tab === 'memory') RENDER.memory(); toast(isNew ? 'ケースを作成しました' : '保存しました');
      if (S.tab === 'home') rebuildWheel();
    };
  });
}

/* ---- "similar voices" grouping: explainable rule-based clusters on the voice profile ---- */
const VOICE_GROUPS = [
  { key: 'machine', name: 'メカ・電子ボイス', color: '#7fdcff', test: (p) => p.robotHz > 0 || p.ring >= 0.3 },
  { key: 'space', name: '響く・幻想ボイス', color: '#8fa2ff', test: (p) => p.reverb + p.echo + p.chorus >= 0.55 },
  { key: 'lofi', name: 'ローファイ・無線', color: '#c3ff6b', test: (p) => p.lowcut >= 300 || p.highcut <= 5000 || p.drive >= 0.4 },
  { key: 'high', name: '高い声', color: '#ff7ab6', test: (p) => p.pitch >= 2 },
  { key: 'low', name: '低い声', color: '#ffb86b', test: (p) => p.pitch <= -2 },
  { key: 'natural', name: '自然な声', color: '#5fe0a8', test: () => true },
];
function groupKey(c) {
  const p = Object.assign({}, VoxEngine.DEFAULT, c.profile);
  return VOICE_GROUPS.find((g) => g.test(p)).key;
}
function openAutoGroup() {
  const groups = VOICE_GROUPS.map((g) => ({ ...g, chips: S.chips.filter((c) => groupKey(c) === g.key) })).filter((g) => g.chips.length);
  const chosen = new Set(groups.filter((g) => g.chips.length >= 2).map((g) => g.key));
  openSheet('似た声で自動まとめ', `
    <p class="lead">各チップの声の高さ・声色・エフェクトの特徴から、近いものを分類しました。作るケースを選んでください（既存のケースはそのまま残ります）。</p>
    ${groups.map((g) => `<button class="check ${chosen.has(g.key) ? 'on' : ''}" data-g="${g.key}" style="margin-bottom:10px"><span class="box">${ICON.check}</span><span class="grow"><b>${g.name}</b> <span class="small muted">${g.chips.length}枚</span>
      <span style="display:flex;gap:4px;margin-top:8px;font-size:4.6px">${g.chips.slice(0, 8).map((c) => chipHTML(c, { noBadge: true })).join('')}</span></span><span class="swatch" style="--c:${g.color};width:18px;height:18px"></span></button>`).join('')}
    <button class="btn block" id="agGo">${ICON.box} 選んだケースを作成</button>`, (b, close) => {
    $$('[data-g]', b).forEach((el) => el.addEventListener('click', () => { const k = el.dataset.g; chosen.has(k) ? chosen.delete(k) : chosen.add(k); el.classList.toggle('on'); }));
    $('#agGo', b).onclick = () => {
      let made = 0;
      for (const g of groups) {
        if (!chosen.has(g.key)) continue;
        const nk = { id: uid('k'), name: g.name, color: g.color, chipIds: g.chips.map((c) => c.id), createdAt: Date.now(), order: S.cases.length, auto: true };
        S.cases.push(nk); saveCase(nk); made++;
      }
      close(); S.memTab = 'cases'; RENDER.memory(); toast(made ? `${made}個のケースを作成しました` : 'ケースは作成されませんでした');
    };
  });
}

/* shared audio player */
let curAudio = null;
function playBlob(blob, onEnd) {
  try { if (curAudio) { curAudio.pause(); URL.revokeObjectURL(curAudio.src); } } catch (e) {}
  const a = new Audio(URL.createObjectURL(blob));
  a.playsInline = true;
  curAudio = a;
  a.onended = () => onEnd && onEnd();
  a.play().catch(() => toast('再生できませんでした'));
  return a;
}
