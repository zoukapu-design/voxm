/* ===== shell: header, tabs, sheets, toast ===== */
const TABS = [
  { id: 'home', label: '変換', icon: 'wave' },
  { id: 'memory', label: 'メモリ', icon: 'chips' },
  { id: 'create', label: '作成', icon: 'plus' },
  { id: 'map', label: 'マップ', icon: 'graph' },
  { id: 'output', label: '出力', icon: 'link' },
];
const RENDER = {}; // tab id -> render fn

function buildShell() {
  $('#app').innerHTML = `
    <header class="top">
      <div class="brand"><div class="wordmark">VOXM</div><div class="wordmark-sub">VOICE MEMORY TRANSFORMER</div></div>
      <div class="top-spacer"></div>
      <button class="live-pill" id="livePill" aria-label="変換の状態"><span class="bars">${'<i></i>'.repeat(5)}</span><span id="liveTxt">STANDBY</span></button>
      <button class="icon-btn" id="btnSettings" aria-label="設定">${ICON.gear}</button>
    </header>
    <main>${TABS.map((t) => `<section class="page" id="page-${t.id}"></section>`).join('')}</main>
    <nav class="tabs">${TABS.map((t) => `<button class="tab" data-tab="${t.id}">${ICON[t.icon]}<span>${t.label}</span></button>`).join('')}</nav>
    <div class="toast" id="toast"></div>`;
  $$('.tab').forEach((b) => b.addEventListener('click', () => go(b.dataset.tab)));
  $('#btnSettings').addEventListener('click', openSettings);
  $('#livePill').addEventListener('click', () => go('home'));
}

function go(tab, opts) {
  if (!RENDER[tab]) tab = 'home';
  S.tab = tab;
  $$('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  $$('.page').forEach((p) => p.classList.toggle('show', p.id === 'page-' + tab));
  RENDER[tab](opts || {});
  if (tab === 'home') requestAnimationFrame(fitStage);
  if (location.hash.slice(1) !== tab) { try { history.replaceState(null, '', '#' + tab); } catch (e) {} }
}

let toastTimer = 0;
function toast(msg, ms = 2200) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

let sheetClose = null;
function openSheet(title, html, onMount, opts = {}) {
  closeSheet(true);
  const bg = document.createElement('div'); bg.className = 'sheet-bg';
  const sh = document.createElement('div'); sh.className = 'sheet'; sh.setAttribute('role', 'dialog');
  sh.innerHTML = `<div class="grab"></div><div class="sh-head"><b>${title}</b><button class="icon-btn" data-close aria-label="閉じる">${ICON.close}</button></div><div class="sh-body">${html}</div>`;
  document.body.append(bg, sh);
  const close = () => { bg.remove(); sh.remove(); if (sheetClose === close) sheetClose = null; opts.onClose && opts.onClose(); };
  sheetClose = close;
  bg.addEventListener('click', close);
  sh.querySelector('[data-close]').addEventListener('click', close);
  onMount && onMount(sh.querySelector('.sh-body'), close);
  return close;
}
function closeSheet() { if (sheetClose) sheetClose(); }

function confirmSheet(title, text, okLabel, danger) {
  return new Promise((resolve) => {
    let done = false;
    openSheet(title, `<p class="lead">${text}</p><div class="footer-actions"><button class="btn ghost" data-no>キャンセル</button><button class="btn ${danger ? 'danger' : ''}" data-ok>${okLabel}</button></div>`, (b, close) => {
      b.querySelector('[data-no]').onclick = () => { done = true; close(); resolve(false); };
      b.querySelector('[data-ok]').onclick = () => { done = true; close(); resolve(true); };
    }, { onClose: () => { if (!done) resolve(false); } });
  });
}

function sliderHTML(id, label, min, max, step, value, fmt) {
  const p = ((value - min) / (max - min)) * 100;
  return `<div class="slider"><div class="lbl"><span>${label}</span><b data-out="${id}">${fmt ? fmt(value) : value}</b></div>
    <input type="range" data-sl="${id}" min="${min}" max="${max}" step="${step}" value="${value}" style="--p:${p}%"></div>`;
}
function bindSlider(root, id, fmt, onInput) {
  const el = root.querySelector(`[data-sl="${id}"]`), out = root.querySelector(`[data-out="${id}"]`);
  if (!el) return;
  const upd = () => {
    const v = parseFloat(el.value);
    el.style.setProperty('--p', ((v - el.min) / (el.max - el.min)) * 100 + '%');
    if (out) out.textContent = fmt ? fmt(v) : v;
    onInput(v);
  };
  el.addEventListener('input', upd);
}

/* live pill + meters */
function updateLivePill() {
  const st = VoxEngine.status;
  const pill = $('#livePill');
  pill.classList.toggle('on', st.state === 'live');
  pill.classList.toggle('err', st.state === 'error');
  $('#liveTxt').textContent = st.state === 'live' ? (VoxEngine.recording() ? 'REC' : 'LIVE') : st.state === 'starting' ? 'STARTING' : st.state === 'error' ? 'MIC ERROR' : 'STANDBY';
}
const meterBuf = new Uint8Array(1024);
function readLevel(an) {
  if (!an) return 0;
  an.getByteTimeDomainData(meterBuf);
  let peak = 0;
  for (let i = 0; i < meterBuf.length; i += 4) peak = Math.max(peak, Math.abs(meterBuf[i] - 128));
  return peak / 128;
}
function meterLoop() {
  const st = VoxEngine.status;
  const lv = st.state === 'live' ? readLevel(st.inAnalyser) : 0;
  const bars = $$('#livePill .bars i');
  bars.forEach((b, i) => { const on = lv * 9 > i + 0.3; b.style.height = (on ? 4 + i * 2 : 3) + 'px'; });
  requestAnimationFrame(meterLoop);
}

/* settings */
function openSettings() {
  const row = (key, title, sub) => `<div class="list-item"><div class="grow"><b style="font-size:14px">${title}</b><div class="small muted" style="margin-top:3px;line-height:1.5">${sub}</div></div><button class="switch ${S[key] ? 'on' : ''}" data-sw="${key}" aria-label="${title}"></button></div>`;
  openSheet('設定', `
    ${VoxNative.isNative() ? `<div class="list-item"><div class="grow"><b style="font-size:14px">ハウリング防止（自動）</b><div class="small muted" style="margin-top:3px;line-height:1.5">イヤホンをつなぐと自動でOFF（声が小さくならず、遅延も減ります）、スピーカーではON になります。<br>状態: <b id="nativeStat">確認中…</b></div></div></div>`
      : row('safeMode', 'ハウリング防止モード', 'スピーカーで聴くときはON。ただし話し続けると声が少しずつ小さく聞こえることがあります。イヤホンのときはOFFにすると、声が小さくならず遅延も減ります（次回の変換開始時に反映）。')}
    ${row('noiseSup', 'ノイズ抑制', '周りの雑音を減らします。声の特徴も少し丸くなります。')}
    ${row('ticks', '操作音', 'メモリの回転・装着時の小さな効果音。')}
    ${row('reduceMotion', '動きを減らす', 'アニメーションを控えめにします。')}
    ${debugSectionHTML()}
    <div class="h2">データ</div>
    <div class="note">保存先: <b>${S.persistent ? 'この端末のブラウザ内 (IndexedDB)' : '一時メモリ（このページを閉じると消えます）'}</b><br>写真・録音はクラウドに送信されません。</div>
    <div class="footer-actions"><button class="btn danger" id="btnReset">${ICON.trash} すべてのデータを消去</button></div>
    <div class="h2">このバージョンについて</div>
    <div class="note">VOXM v2.0 Web版。声の変換は端末内で動く信号処理（ピッチ・声色・エフェクト）です。<b>AIによる本人そっくりの声質変換は未搭載</b>で、友達の声メモリは「声の高さと声色の傾向」を近づける簡易プロファイルです。</div>
  `, (b, close) => {
    if ($('#nativeStat', b)) VoxNative.call('route').then((r) => { const e = $('#nativeStat', b); if (e) e.textContent = r && typeof r.headphones === 'boolean' ? (r.headphones ? 'イヤホン接続中（ハウリング防止OFF）' : 'スピーカー（ハウリング防止ON）') : '自動判定できません（手動の設定を使います）'; });
    bindDebugSection(b);
    $$('[data-sw]', b).forEach((sw) => sw.addEventListener('click', () => {
      const k = sw.dataset.sw; S[k] = !S[k]; sw.classList.toggle('on', S[k]); saveSettings();
      if (k === 'reduceMotion') document.documentElement.classList.toggle('reduce-motion', S.reduceMotion);
    }));
    $('#btnReset', b).addEventListener('click', async () => {
      close();
      if (await confirmSheet('データを消去', '作成したメモリ・ケース・録音・設定をすべて削除します。元に戻せません。', '消去する', true)) {
        VoxEngine.stop(); await VoxStore.clear(); location.reload();
      }
    });
  });
}
