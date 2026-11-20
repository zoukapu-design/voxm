/* ===== FX LAB ===== */
RENDER.fx = () => {
  const page = $('#page-fx');
  const seatedNm = seatedName('・');
  const slots = [0, 1, 2].map((i) => S.fx[i]);
  page.innerHTML = `
    <div class="eyebrow">FX LAB · 3 SLOT RACK</div>
    <h1 class="h1">FX工房</h1>
    <p class="lead">装着中のメモリ${seatedNm ? `「<b style="color:#fff">${esc(seatedNm)}</b>」` : '（未装着）'}に、最大3つのエフェクトを重ねがけできます。変換中はすぐに反映されます。</p>
    <div class="rack">${slots.map((l, i) => {
      if (!l) return `<div class="rack-slot empty">SLOT ${i + 1} — 下のエフェクトをタップ</div>`;
      const fx = FX_LIB.find((f) => f.id === l.id);
      return `<div class="rack-slot" style="--fxc:${fx.color}"><span class="fxic">${ICON[fx.icon]}</span>
        <div class="grow"><div class="row" style="justify-content:space-between"><span class="nm">${fx.name}</span><span class="sub" data-out="fx${i}">${Math.round(l.amt * 100)}%</span></div>
        <input type="range" data-sl="fx${i}" min="0" max="1" step="0.01" value="${l.amt}" style="--p:${l.amt * 100}%"></div>
        <button class="x" data-rm="${i}" aria-label="外す">${ICON.close}</button></div>`;
    }).join('')}</div>
    <div class="h2">エフェクト <small>${S.fx.length}/3</small></div>
    <div class="fx-grid">${FX_LIB.map((f) => `<button class="fx-tile ${S.fx.some((l) => l.id === f.id) ? 'on' : ''}" data-fx="${f.id}" style="--fxc:${f.color}"><span class="fxic">${ICON[f.icon]}</span><b>${f.name}</b><span>${f.sub}</span></button>`).join('')}</div>
    <div class="h2">マスター</div>
    <div class="panel">
      ${sliderHTML('fine', '全体のピッチ微調整', -6, 6, 0.1, S.fineTune, (v) => signed(v, 1) + ' 半音')}
      ${sliderHTML('vol', '出力音量', 0, 1.5, 0.01, S.volume, (v) => Math.round((v / 1.5) * 100) + '%')}
      <div class="list-item" style="border:0;padding:2px 0 0"><div class="grow"><b style="font-size:13px">モニター（自分で聴く）</b><div class="small muted">スピーカーだとハウリングすることがあります</div></div><button class="switch ${S.monitor ? 'on' : ''}" id="fxMon"></button></div>
    </div>
    <div class="footer-actions"><button class="btn ghost" id="fxClear">リセット</button><button class="btn" id="fxSave">${ICON.chips} この声をチップに保存</button></div>`;
  S.fx.forEach((l, i) => bindSlider(page, 'fx' + i, (v) => Math.round(v * 100) + '%', (v) => { l.amt = v; applyParams(); saveSettings(); }));
  bindSlider(page, 'fine', (v) => signed(v, 1) + ' 半音', (v) => { S.fineTune = v; applyParams(); saveSettings(); });
  bindSlider(page, 'vol', (v) => Math.round((v / 1.5) * 100) + '%', (v) => { S.volume = v; VoxEngine.setVolume(v); saveSettings(); });
  $$('[data-rm]', page).forEach((b) => b.addEventListener('click', () => { S.fx.splice(+b.dataset.rm, 1); fxChanged(); }));
  $$('[data-fx]', page).forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.fx, i = S.fx.findIndex((l) => l.id === id);
    if (i >= 0) S.fx.splice(i, 1);
    else if (S.fx.length >= 3) { toast('スロットは3つまで。どれかを外してください'); return; }
    else S.fx.push({ id, amt: 0.7 });
    fxChanged();
  }));
  $('#fxMon').onclick = (e) => { S.monitor = !S.monitor; VoxEngine.setMonitor(S.monitor); e.currentTarget.classList.toggle('on', S.monitor); saveSettings(); };
  $('#fxClear').onclick = () => { S.fx = []; S.fineTune = 0; fxChanged(); };
  $('#fxSave').onclick = () => {
    const p = combinedParams();
    const prof = {};
    for (const [k, v] of Object.entries(p)) if (v !== VoxEngine.DEFAULT[k]) prof[k] = Math.round(v * 100) / 100;
    go('create', { fromFx: prof });
  };
};
function fxChanged() { applyParams(); saveSettings(); RENDER.fx(); }
