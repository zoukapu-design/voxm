/* ===== HOME: memory wheel → driver ===== */
const W = { pos: 0, list: [], cards: [], drag: null, dragCard: null, dragY: 0, scale: 1, anim: 0, inserting: false, lastCenter: -1 };
const STEP = 118;
let SLOT_FINAL = 216, SLOT_LINE = 327;

function stageHTML() {
  return `<div class="stage-host" id="stageHost"><div class="stage" id="stage">
    <div class="case-bar">
      <button class="case-pill" id="casePill"><i class="sw"></i><span id="caseName"></span><span class="cnt" id="caseCnt"></span>${ICON.down}</button>
      <div class="wheel-index" id="wIdx"></div>
    </div>
    <div class="wheel" id="wheel" aria-label="ボイスメモリ。左右にスワイプで選択、下にドラッグかタップでドライバーへ挿入"></div>
    <div class="slot-beam"></div>
    <div class="insert-guide" aria-hidden="true"><i></i><i></i><i></i></div>
    <div class="slot-clip" id="slotClip"></div>
    <div class="driver" id="driver">
      <div class="drv-floor"></div>
      <div class="drv-slab"></div>
      <div class="knob"></div>
      <div class="drv-top"><div class="drv-slot"></div></div>
      <div class="drv-body">
        <div class="deck">
          <svg class="traces" viewBox="0 0 308 140" preserveAspectRatio="none" aria-hidden="true">
            <path d="M154 0V5H191V134"/><path d="M158 0V3H248V8"/>
            <path class="flow" d="M154 0V5H191V134"/><path class="flow" d="M158 0V3H248V8"/>
          </svg>
          <div class="drv-screen"><div class="scr">
            <div class="scr-top"><span>VOXM</span><span class="st" id="scrSt">NO MEMORY</span></div>
            <canvas id="scrWave"></canvas>
            <div class="scr-name" id="scrName">メモリを挿入</div>
            <div class="scr-sub"><span id="scrL"></span><span class="scr-note" id="scrR"></span></div>
            <div class="scr-vu" id="scrVu">${'<i></i>'.repeat(24)}</div>
          </div></div>
          <div class="ring-wrap">
            <svg class="led-ring" id="ledRing" viewBox="0 0 104 104" aria-hidden="true">${Array.from({ length: 30 }, (_, i) => { const a = (-225 + i * (270 / 29)) * Math.PI / 180; const c = Math.cos(a), s2 = Math.sin(a); return `<line x1="${(52 + c * 44).toFixed(1)}" y1="${(52 + s2 * 44).toFixed(1)}" x2="${(52 + c * 50).toFixed(1)}" y2="${(52 + s2 * 50).toFixed(1)}"/>`; }).join('')}</svg>
            <button class="ring-btn" id="ringBtn" aria-label="変換のON/OFF"><span class="pw">${ICON.power}</span></button>
            <div class="ring-lbl" id="ringLbl">CONVERT</div>
          </div>
        </div>
        <div class="drv-keys">
          <button class="key" id="kMon" aria-label="モニター（自分の耳で聴く）"><i class="lamp"></i>MON</button>
          <button class="key rec" id="kRec" aria-label="録音"><i class="lamp"></i>REC</button>
          <button class="key" id="kFx" aria-label="FX工房"><i class="lamp"></i>FX</button>
        </div>
        <div class="grille"></div>
        <div class="vol-led"><i id="volLed"></i></div>
        <i class="screw" style="left:16px;bottom:28px"></i><i class="screw" style="right:16px;bottom:28px"></i>
        <span class="drv-serial">VX-06</span><div class="drv-logo">VOXM</div><i class="drv-pwrled"></i>
      </div>
      <div class="knob-hit" id="knobHit" aria-label="音量ノブ（上下にドラッグ）"></div>
    </div>
    <div class="status-strip" id="statusStrip"></div>
  </div></div>`;
}

RENDER.home = () => {
  const page = $('#page-home');
  if (!page.dataset.built) {
    page.innerHTML = stageHTML();
    page.dataset.built = '1';
    bindHome();
  }
  rebuildWheel();
  syncSlotChip();
  updateDriver();
};

function fitStage() {
  const host = $('#stageHost'), stage = $('#stage');
  if (!host || !stage || !host.clientWidth) return;
  const w = host.clientWidth, h = host.clientHeight;
  const s = Math.min(w / 390, h / 612, 1.3);
  W.scale = s;
  stage.style.setProperty('--s', s.toFixed(4));
  stage.style.top = Math.max(0, (h - 612 * s) / 2) + 'px';
  measureSlot();
  sizeCanvas();
}

function measureSlot() {
  const slot = $('.drv-slot'), stage = $('#stage');
  if (!slot || !stage || !W.scale) return;
  const sr = slot.getBoundingClientRect(), st = stage.getBoundingClientRect();
  if (!sr.height) return;
  SLOT_LINE = Math.round((sr.top + sr.height * 0.5 - st.top) / W.scale);
  SLOT_FINAL = SLOT_LINE - 62 - 44; // 62px of the cartridge stays visible above the slot
  $('#slotClip').style.height = SLOT_LINE + 'px';
  const cur = $('#slotClip .slot-chip');
  if (cur && !W.inserting) cur.style.transform = `translateY(${SLOT_FINAL}px)`;
}

/* ---- wheel ---- */
function rebuildWheel() {
  const list = wheelList();
  W.list = list;
  const wheel = $('#wheel');
  wheel.innerHTML = '';
  W.cards = list.map((c, i) => {
    const el = document.createElement('div');
    el.className = 'wcard';
    el.dataset.i = i;
    el.innerHTML = chipHTML(c, { dim: true }) + `<div class="ghost-frame">${ICON.eject}<span>IN DRIVER</span></div>`;
    wheel.append(el);
    return el;
  });
  let idx = list.findIndex((c) => c.id === S.selectedId);
  if (idx < 0) idx = 0;
  W.pos = idx; W.lastCenter = -1;
  const k = caseById(S.homeCase);
  $('#caseName').textContent = k ? k.name : 'すべてのメモリ';
  $('#casePill').style.setProperty('--cc', k ? k.color : '#a487ff');
  $('#caseCnt').textContent = list.length + ' CHIPS';
  layoutWheel();
}
const wrapD = (d, n) => { d = ((d % n) + n) % n; return d > n / 2 ? d - n : d; };
function centerIndex() { const n = W.cards.length; if (!n) return -1; return ((Math.round(W.pos) % n) + n) % n; }
function layoutWheel() {
  const n = W.cards.length;
  W.cards.forEach((el, i) => {
    const d = n >= 4 ? wrapD(i - W.pos, n) : i - W.pos;
    const a = Math.abs(d), sg = Math.sign(d);
    const x = sg * (a <= 1 ? a * STEP : STEP + (a - 1) * 56);
    const z = -Math.min(a, 3) * 80;
    const ry = -clamp(d, -2, 2) * 28;
    const sc = 1 - Math.min(a, 2) * 0.08;
    const op = a > 2.7 ? 0 : a > 2 ? 1 - (a - 2) / 0.7 : 1;
    const dy = el === W.dragCard ? W.dragY : 0;
    const rx = el === W.dragCard ? -clamp(W.dragY, 0, 140) * 0.09 : 0;
    el.style.transform = `translate3d(${x.toFixed(1)}px,${dy.toFixed(1)}px,${z.toFixed(1)}px) rotateY(${ry.toFixed(2)}deg) rotateX(${rx.toFixed(2)}deg) scale(${sc.toFixed(3)})`;
    el.style.opacity = op.toFixed(3);
    el.style.zIndex = String(100 - Math.round(a * 10));
    el.style.visibility = op <= 0.01 ? 'hidden' : 'visible';
    const dim = el.querySelector('.dim');
    if (dim) dim.style.opacity = Math.min(0.6, a * 0.34).toFixed(3);
    el.style.setProperty('--sheen', (50 + d * 70).toFixed(1) + '%');
    el.classList.toggle('center', a < 0.5);
    el.classList.toggle('ghost', W.list[i] && W.list[i].id === S.insertedId);
  });
  const ci = centerIndex();
  if (ci !== W.lastCenter && ci >= 0) {
    if (W.lastCenter >= 0 && S.ticks) VoxEngine.sfx('tick');
    W.lastCenter = ci;
    S.selectedId = W.list[ci].id;
    saveSettings();
    const c = W.list[ci];
    $('#wheel').style.setProperty('--cglow', c.color);
    W.cards[ci].style.setProperty('--cglow', c.color + 'aa');
  }
  $('#wIdx').innerHTML = n ? `<b>${String(ci + 1).padStart(2, '0')}</b> / ${String(n).padStart(2, '0')}` : '';
}
function animateTo(target, done) {
  cancelAnimationFrame(W.anim);
  const n = W.cards.length;
  if (n < 4) target = clamp(target, 0, n - 1);
  const step = () => {
    const diff = target - W.pos;
    if (Math.abs(diff) < 0.002) {
      W.pos = n >= 4 ? ((target % n) + n) % n : target;
      layoutWheel(); done && done(); return;
    }
    W.pos += diff * (S.reduceMotion ? 1 : 0.2);
    layoutWheel();
    W.anim = requestAnimationFrame(step);
  };
  step();
}
function springBackCard() {
  const card = W.dragCard;
  const step = () => {
    W.dragY *= 0.72;
    if (Math.abs(W.dragY) < 0.5) { W.dragY = 0; layoutWheel(); if (card) card.classList.remove('dragging'); W.dragCard = null; return; }
    layoutWheel(); requestAnimationFrame(step);
  };
  step();
}

function bindHome() {
  const wheel = $('#wheel');
  wheel.addEventListener('pointerdown', (e) => {
    if (W.inserting || !W.cards.length) return;
    cancelAnimationFrame(W.anim);
    const now = performance.now();
    W.drag = { x0: e.clientX, y0: e.clientY, pos0: W.pos, axis: null, lx: e.clientX, ly: e.clientY, lt: now, vx: 0, vy: 0, card: e.target.closest('.wcard'), id: e.pointerId };
    try { wheel.setPointerCapture(e.pointerId); } catch (err) {}
  });
  wheel.addEventListener('pointermove', (e) => {
    const D = W.drag;
    if (!D || e.pointerId !== D.id) return;
    const s = W.scale || 1;
    const dx = (e.clientX - D.x0) / s, dy = (e.clientY - D.y0) / s;
    const now = performance.now(), dt = Math.max(1, now - D.lt);
    D.vx = D.vx * 0.6 + (((e.clientX - D.lx) / s) / dt) * 0.4;
    D.vy = D.vy * 0.6 + (((e.clientY - D.ly) / s) / dt) * 0.4;
    D.lx = e.clientX; D.ly = e.clientY; D.lt = now;
    if (!D.axis) {
      if (Math.hypot(dx, dy) < 7) return;
      const isCenter = D.card && D.card.classList.contains('center') && !D.card.classList.contains('ghost');
      D.axis = dy > 0 && Math.abs(dy) > Math.abs(dx) * 1.1 && isCenter ? 'v' : 'h';
      if (D.axis === 'v') { W.dragCard = D.card; D.card.classList.add('dragging'); $('#driver').classList.add('armed'); }
    }
    if (D.axis === 'h') {
      W.pos = D.pos0 - dx / STEP;
      if (W.cards.length < 4) W.pos = clamp(W.pos, -0.35, W.cards.length - 0.65);
      layoutWheel();
    } else {
      W.dragY = dy < 0 ? dy * 0.2 : Math.min(dy, 200);
      layoutWheel();
    }
  });
  const end = (e) => {
    const D = W.drag;
    if (!D || e.pointerId !== D.id) return;
    W.drag = null;
    if (!D.axis) { // tap
      if (!D.card) return;
      const i = +D.card.dataset.i;
      if (i === centerIndex()) {
        if (D.card.classList.contains('ghost')) ejectChip(false);
        else insertCurrent(0);
      } else {
        const n = W.cards.length;
        const d = n >= 4 ? wrapD(i - W.pos, n) : i - W.pos;
        animateTo(Math.round(W.pos + d));
      }
      return;
    }
    if (D.axis === 'h') {
      const proj = W.pos - (D.vx * 220) / STEP;
      animateTo(Math.round(proj));
    } else {
      $('#driver').classList.remove('armed');
      if (W.dragY > 78 || (D.vy > 0.55 && W.dragY > 24)) insertCurrent(W.dragY);
      else springBackCard();
    }
  };
  wheel.addEventListener('pointerup', end);
  wheel.addEventListener('pointercancel', end);

  $('#ringBtn').addEventListener('click', toggleConvert);
  $('#kMon').addEventListener('click', () => {
    S.monitor = !S.monitor; VoxEngine.setMonitor(S.monitor); saveSettings(); updateDriver();
    toast(S.monitor ? 'モニターON：変換後の声を自分で聴けます（イヤホン推奨）' : 'モニターOFF：録音・出力のみ');
  });
  $('#kRec').addEventListener('click', toggleRec);
  $('#kFx').addEventListener('click', () => go('fx'));
  $('#casePill').addEventListener('click', openCasePicker);
  $('#slotClip').addEventListener('click', (e) => { if (e.target.closest('.slot-chip') && !W.inserting) ejectChip(false); });

  // volume knob
  const kh = $('#knobHit');
  let kd = null;
  kh.addEventListener('pointerdown', (e) => { kd = { y: e.clientY, v: S.volume }; try { kh.setPointerCapture(e.pointerId); } catch (err) {} });
  kh.addEventListener('pointermove', (e) => {
    if (!kd) return;
    S.volume = clamp(kd.v - (e.clientY - kd.y) / (W.scale * 160), 0, 1.5);
    VoxEngine.setVolume(S.volume); updateVol(true);
  });
  const kend = () => { if (kd) { kd = null; saveSettings(); } };
  kh.addEventListener('pointerup', kend); kh.addEventListener('pointercancel', kend);

  window.addEventListener('resize', fitStage);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', fitStage);
  VoxEngine.onChange(() => { updateDriver(); updateLivePill(); });
  requestAnimationFrame(screenLoop);
}

/* ---- slot chip (the cartridge physically in the driver) ---- */
function makeSlotChip(chip, y) {
  const el = document.createElement('div');
  el.className = 'slot-chip';
  el.dataset.id = chip.id;
  el.innerHTML = chipHTML(chip);
  el.style.transform = `translateY(${y}px)`;
  el.setAttribute('aria-label', chip.name + '（タップで取り出す）');
  $('#slotClip').append(el);
  return el;
}
function syncSlotChip() {
  const clip = $('#slotClip');
  const cur = clip.querySelector('.slot-chip');
  if (W.inserting) return;
  const chip = chipById(S.insertedId);
  if (!chip) { if (cur) cur.remove(); return; }
  if (cur && cur.dataset.id === chip.id) { cur.innerHTML = chipHTML(chip); return; }
  if (cur) cur.remove();
  makeSlotChip(chip, SLOT_FINAL);
}
function contactFx() {
  const drv = $('#driver');
  VoxEngine.sfx('insert');
  drv.classList.remove('thunk'); void drv.offsetWidth; drv.classList.add('thunk');
  try { navigator.vibrate && navigator.vibrate(18); } catch (e) {}
}
async function insertCurrent(fromY) {
  const ci = centerIndex();
  const chip = W.list[ci];
  if (!chip || W.inserting) return;
  W.inserting = true;
  const drv = $('#driver');
  if (S.insertedId && S.insertedId !== chip.id) await ejectChip(true);
  const card = W.cards[ci];
  card.classList.remove('dragging');
  W.dragCard = null; W.dragY = 0;
  S.insertedId = chip.id; // ghost the wheel card
  layoutWheel();
  const el = makeSlotChip(chip, fromY);
  drv.classList.add('armed');
  const dur = S.reduceMotion ? 1 : 600;
  const anim = el.animate([
    { transform: `translateY(${fromY}px)`, easing: 'cubic-bezier(.55,0,.85,.55)' },
    { transform: `translateY(${SLOT_FINAL + 12}px)`, offset: 0.6, easing: 'cubic-bezier(.2,.9,.3,1)' },
    { transform: `translateY(${SLOT_FINAL - 4}px)`, offset: 0.82 },
    { transform: `translateY(${SLOT_FINAL}px)` },
  ], { duration: dur, fill: 'forwards' });
  setTimeout(() => {
    contactFx(); drv.classList.remove('armed'); drv.classList.add('loaded', 'inject');
    setTimeout(() => drv.classList.remove('inject'), 750);
  }, dur * 0.6);
  try { await anim.finished; } catch (e) {}
  el.style.transform = `translateY(${SLOT_FINAL}px)`;
  try { anim.cancel(); } catch (e) {}
  W.inserting = false;
  saveSettings();
  applyParams();
  updateDriver();
  if (VoxEngine.status.state === 'live') toast(`「${chip.name}」の声に切り替えました`);
}
async function ejectChip(quick) {
  const el = $('#slotClip .slot-chip');
  const id = S.insertedId;
  if (!el || !id) { S.insertedId = null; updateDriver(); return; }
  if (!quick) {
    W.inserting = true;
    const i = W.list.findIndex((c) => c.id === id);
    if (i >= 0 && i !== centerIndex()) {
      const n = W.cards.length;
      await new Promise((r) => animateTo(Math.round(W.pos + (n >= 4 ? wrapD(i - W.pos, n) : i - W.pos)), r));
    }
    VoxEngine.sfx('eject');
  }
  const frames = quick
    ? [{ transform: `translateY(${SLOT_FINAL}px)`, opacity: 1 }, { transform: `translateY(${SLOT_FINAL - 110}px)`, opacity: 0 }]
    : [{ transform: `translateY(${SLOT_FINAL}px)` }, { transform: `translateY(${SLOT_FINAL + 8}px)`, offset: 0.14 }, { transform: 'translateY(-8px)', offset: 0.78 }, { transform: 'translateY(0)' }];
  const anim = el.animate(frames, { duration: S.reduceMotion ? 1 : quick ? 260 : 520, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'forwards' });
  $('#driver').classList.remove('loaded');
  try { await anim.finished; } catch (e) {}
  el.remove();
  S.insertedId = null;
  if (!quick) { W.inserting = false; saveSettings(); applyParams(); }
  layoutWheel();
  updateDriver();
}

/* ---- conversion / recording ---- */
let headphoneTipShown = false;
async function toggleConvert() {
  const st = VoxEngine.status;
  if (st.state === 'live') {
    if (VoxEngine.recording()) await toggleRec();
    VoxEngine.stop(); VoxEngine.sfx('off'); updateDriver(); return;
  }
  if (st.state === 'starting') return;
  if (!S.insertedId && W.list.length) await insertCurrent(0);
  VoxEngine.setParams(combinedParams());
  VoxEngine.status.monitor = S.monitor; VoxEngine.status.volume = S.volume;
  await VoxEngine.start({ safeMode: S.safeMode, noiseSuppression: S.noiseSup });
  if (st.state === 'live') {
    VoxEngine.sfx('on');
    if (!headphoneTipShown && S.monitor) { headphoneTipShown = true; toast('話してみてください。スピーカーで響く場合はイヤホンを使ってください', 3200); }
  } else if (st.state === 'error') showMicHelp();
  updateDriver();
}
function showMicHelp() {
  const st = VoxEngine.status;
  const framed = inFrame;
  openSheet('マイクを使えません', `
    <p class="lead">${esc(st.error || 'マイクを起動できませんでした')}</p>
    ${framed ? `<div class="note" style="margin-bottom:12px"><b>いま開いている画面（アプリ内プレビュー）は、ブラウザの安全制限でマイクが使えません。</b><br>iPhoneのSafariで公開版のURLを開くと、リアルタイム変換・録音・カメラ撮影が使えます。<br>この画面でも「音声ファイルを変換」なら試せます。</div>`
      : `<div class="note" style="margin-bottom:12px">iPhone：<b>設定 → Safari → マイク</b> を「確認」または「許可」に。<br>ページ上部の「ぁあ」→ Webサイトの設定 → マイク でも変更できます。<br>PC：アドレスバー左の鍵アイコンからマイクを許可。</div>`}
    <div class="footer-actions"><button class="btn ghost" data-close2>閉じる</button><label class="btn">${ICON.file} 音声ファイルを変換<input type="file" accept="audio/*,video/*" id="goFile" hidden></label></div>`, (b, close) => {
    b.querySelector('[data-close2]').onclick = close;
    $('#goFile', b).onchange = (e) => { const f = e.target.files && e.target.files[0]; close(); if (f) { go('output'); convertFile(f); } };
  });
}
async function toggleRec() {
  if (VoxEngine.recording()) {
    const res = await VoxEngine.stopRecording();
    if (res && res.blob.size) { const rec = await saveRecording(res, 'audio'); toast(`録音を保存：${rec.name}（出力タブ）`); }
    updateDriver(); return;
  }
  if (VoxEngine.status.state !== 'live') { toast('先に中央のリングで変換をONにしてください'); return; }
  if (!VoxEngine.startRecording()) { toast('このブラウザは録音に対応していません'); return; }
  updateDriver();
}
async function saveRecording(res, kind, nameOverride) {
  const id = uid('r');
  const chip = chipById(S.insertedId);
  const d = new Date();
  const rec = { id, kind, name: nameOverride || ((chip ? chip.name : 'VOXM') + (kind === 'video' ? 'の動画' : 'の声')), mime: res.mime || res.blob.type, seconds: res.seconds || 0, size: res.blob.size, createdAt: d.getTime(), chipId: chip ? chip.id : null };
  await VoxStore.put('blobs', id, res.blob);
  await VoxStore.put('recordings', id, rec);
  S.recordings.unshift(rec);
  return rec;
}

/* ---- driver display ---- */
function updateVol(flash) {
  const v = $('#volLed'); if (v) v.style.height = (S.volume / 1.5) * 100 + '%';
  if (flash) { W.volFlash = performance.now(); }
}
function updateDriver() {
  const drv = $('#driver'); if (!drv) return;
  const st = VoxEngine.status, chip = chipById(S.insertedId);
  const live = st.state === 'live', rec = VoxEngine.recording();
  drv.classList.toggle('loaded', !!chip && !W.inserting);
  drv.classList.toggle('live', live);
  drv.classList.toggle('rec', rec);
  $('#stage').classList.toggle('has-chip', !!chip);
  $('#scrName').textContent = chip ? chip.name : 'メモリを挿入';
  $('#ringLbl').textContent = live ? 'LIVE' : st.state === 'starting' ? '...' : 'CONVERT';
  $('#kMon').classList.toggle('on', S.monitor);
  $('#kRec').classList.toggle('on', rec);
  $('#kFx').classList.toggle('on', S.fx.length > 0);
  updateVol();
  const lat = VoxEngine.latencyMs();
  const fxNames = S.fx.map((l) => FX_LIB.find((f) => f.id === l.id)?.name).filter(Boolean);
  $('#statusStrip').innerHTML = `
    <button class="sq ${S.monitor ? 'hot' : ''}" id="sqMon"><span class="k">OUT</span><b>${S.monitor ? 'モニター' : 'ミュート'}</b></button>
    <button class="sq ${fxNames.length ? 'hot' : ''}" id="sqFx"><span class="k">FX</span><b>${fxNames.length ? esc(fxNames.join('+')) : 'なし'}</b></button>
    <button class="sq" id="sqLat"><span class="k">LAT</span><b>${lat ? '約' + lat + 'ms' : '—'}</b></button>`;
  $('#sqMon').onclick = () => $('#kMon').click();
  $('#sqFx').onclick = () => go('fx');
  $('#sqLat').onclick = () => go('output');
}

/* screen canvas */
let scrCtx = null, scrW = 0, scrH = 0;
const waveBuf = new Float32Array(2048);
function sizeCanvas() {
  const c = $('#scrWave'); if (!c) return;
  const dpr = Math.min(3, (window.devicePixelRatio || 1) * (W.scale || 1));
  scrW = Math.round(176 * dpr); scrH = Math.round(56 * dpr);
  c.width = scrW; c.height = scrH; scrCtx = c.getContext('2d');
}
let lastScr = 0;
function screenLoop(t) {
  requestAnimationFrame(screenLoop);
  if (S.tab !== 'home' || t - lastScr < 33) return;
  lastScr = t;
  if (!scrCtx) sizeCanvas();
  if (!scrCtx) return;
  const st = VoxEngine.status, live = st.state === 'live', chip = chipById(S.insertedId);
  const g = scrCtx; g.clearRect(0, 0, scrW, scrH);
  const mid = scrH / 2;
  // grid
  g.strokeStyle = 'rgba(164,135,255,.08)'; g.lineWidth = 1;
  for (let x = 0; x < scrW; x += scrW / 12) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, scrH); g.stroke(); }
  g.beginPath(); g.moveTo(0, mid); g.lineTo(scrW, mid); g.stroke();
  const grad = g.createLinearGradient(0, 0, scrW, 0);
  grad.addColorStop(0, 'rgba(127,220,255,.2)'); grad.addColorStop(0.5, chip ? chip.color : '#a487ff'); grad.addColorStop(1, 'rgba(164,135,255,.2)');
  g.strokeStyle = grad; g.lineWidth = Math.max(1.5, scrH / 28);
  g.shadowColor = chip ? chip.color : '#a487ff'; g.shadowBlur = scrH / 6;
  g.beginPath();
  const stage = $('#stage');
  if (live && st.outAnalyser) {
    st.outAnalyser.getFloatTimeDomainData(waveBuf);
    let pk = 0; for (let i = 0; i < 1024; i += 2) pk = Math.max(pk, Math.abs(waveBuf[i]));
    W.lv = (W.lv || 0) * 0.7 + Math.min(1, pk * 1.4) * 0.3;
    stage.style.setProperty('--lv', W.lv.toFixed(3));
    $('#driver').style.setProperty('--under', (0.3 + W.lv * 0.7).toFixed(3));
    const n = 512;
    let start = 0;
    for (let i = 1; i < 1024; i++) if (waveBuf[i - 1] < 0 && waveBuf[i] >= 0) { start = i; break; }
    for (let i = 0; i < n; i++) {
      const v = waveBuf[start + i] || 0;
      const x = (i / (n - 1)) * scrW, y = mid - clamp(v * 2.6, -1, 1) * mid * 0.92;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
  } else {
    if (W.lv) { W.lv = 0; stage.style.setProperty('--lv', '0'); $('#driver').style.setProperty('--under', '.28'); }
    const amp = chip ? 0.22 : 0.04, ph = t / 600;
    for (let i = 0; i <= 120; i++) {
      const x = (i / 120) * scrW, k = i / 120;
      const env = Math.sin(Math.PI * k);
      const v = (Math.sin(k * 26 + ph * 3) * 0.6 + Math.sin(k * 61 - ph * 2) * 0.4) * env * amp;
      const y = mid - v * mid;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
  }
  g.stroke(); g.shadowBlur = 0;
  // LED ring (output level) + VU (input level)
  if (!W.ringLeds) { W.ringLeds = $$('#ledRing line'); W.vu = $$('#scrVu i'); }
  const outN = live ? Math.round(clamp((W.lv || 0) * 1.25, 0, 1) * W.ringLeds.length) : 0;
  W.ringLeds.forEach((l, i) => { const on = i < outN; l.classList.toggle('on', on); l.classList.toggle('hot', on && i >= W.ringLeds.length - 4); });
  const inLv = live ? readLevel(st.inAnalyser) : 0;
  const inN = Math.round(clamp(inLv * 1.5, 0, 1) * W.vu.length);
  W.vu.forEach((v, i) => { const on = i < inN; v.classList.toggle('on', on); v.classList.toggle('hot', on && i >= W.vu.length - 3); });
  // text lines
  const stEl = $('#scrSt');
  let stTxt = !chip ? 'NO MEMORY' : 'READY', cls = 'st';
  if (live) { stTxt = 'LIVE'; cls = 'st live'; }
  if (VoxEngine.recording()) { stTxt = '● REC ' + fmtSec((Date.now() - st.recStart) / 1000); cls = 'st rec'; }
  if (st.state === 'error') stTxt = 'MIC ERROR';
  if (stEl.textContent !== stTxt) stEl.textContent = stTxt;
  stEl.className = cls;
  let L = '', R = '';
  if (W.volFlash && t - W.volFlash < 1200) { L = 'VOLUME'; R = Math.round((S.volume / 1.5) * 100) + '%'; }
  else if (live) { L = st.f0 ? 'IN ' + Math.round(st.f0) + 'Hz' : 'IN —'; R = st.f0 ? '♪ ' + noteName(st.f0) : '…'; }
  else if (chip) { L = KIND_LABEL[chip.kind] || ''; const p = combinedParams(); R = p.robotHz ? 'ROBO' : 'PITCH ' + signed(p.pitch, 1); }
  else { L = 'SLOT EMPTY'; R = ''; }
  const l = $('#scrL'), r = $('#scrR');
  if (l.textContent !== L) l.textContent = L;
  if (r.textContent !== R) r.textContent = R;
  if (live && t % 1000 < 40) updateDriver();
}

/* ---- case picker ---- */
function openCasePicker() {
  const item = (id, name, color, chips) => `<button class="list-item" data-case="${id}" style="width:100%;text-align:left">
    <span class="swatch ${S.homeCase === id ? 'on' : ''}" style="--c:${color};width:28px;height:28px"></span>
    <span class="grow"><b style="font-size:14px">${esc(name)}</b><span class="small muted" style="display:block;margin-top:2px">${chips.length}枚 · ${esc(chips.slice(0, 3).map((c) => c.name).join('、'))}${chips.length > 3 ? '…' : ''}</span></span>
    ${S.homeCase === id ? '<span class="status ok">使用中</span>' : ''}</button>`;
  openSheet('ドライバーに並べるケース', `
    ${item('all', 'すべてのメモリ', '#a487ff', S.chips)}
    ${S.cases.map((k) => item(k.id, k.name, k.color, k.chipIds.map(chipById).filter(Boolean))).join('')}
    <div class="footer-actions"><button class="btn ghost" id="mgCases">${ICON.box} ケースを整理する</button></div>`, (b, close) => {
    $$('[data-case]', b).forEach((el) => el.addEventListener('click', () => {
      S.homeCase = el.dataset.case; saveSettings(); close(); rebuildWheel();
    }));
    $('#mgCases', b).onclick = () => { close(); S.memTab = 'cases'; go('memory'); };
  });
}
