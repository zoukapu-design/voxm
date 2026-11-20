/* ===== HOME: memory wheel → HOLO DECK (straight insertion) ===== */
const W = { pos: 0, list: [], cards: [], drag: null, dragCard: null, dragY: 0, scale: 1, anim: 0, inserting: false, lastCenter: -1, lv: 0 };
const STEP = 104;
// The deck faces the viewer; its slit sits exactly under the wheel's centre card, so a chip drops straight in.
const DK = { W: 330, H: 184, R: 92, plateZ: 34, slitX: 165, slitY: 50 };
const CARD = { left: 130, w: 130, h: 180, show: 146 }; // `show`: how much of a seated chip stays above the slit
let SLIT_Y = 400; // slit line in stage px (measured)

function stageHTML() {
  return `<div class="stage-host" id="stageHost"><div class="stage" id="stage">
    <div class="ambient" aria-hidden="true">${Array.from({ length: 10 }, (_, i) => `<i style="left:${(i * 53) % 380 + 5}px;top:${(i * 97) % 600 + 20}px;animation-delay:${(i * 0.9) % 9}s;animation-duration:${10 + (i % 5) * 2}s"></i>`).join('')}</div>
    <div class="case-bar">
      <button class="case-pill" id="casePill"><i class="sw"></i><span id="caseName"></span><span class="cnt" id="caseCnt"></span>${ICON.down}</button>
      <div class="wheel-index" id="wIdx"></div>
    </div>
    <div class="wheel-rail" aria-hidden="true"></div>
    <div class="wheel" id="wheel" aria-label="ボイスメモリ。左右にスワイプで選択、下にドラッグかタップでデッキに差し込む"></div>
    <svg class="guide" id="guide" viewBox="0 0 390 640" aria-hidden="true"><defs><linearGradient id="gdg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c8b4ff" stop-opacity="0"/><stop offset=".4" stop-color="#d6c8ff" stop-opacity=".9"/><stop offset="1" stop-color="#ffffff"/></linearGradient></defs><path id="guidePath" d=""/><path id="guideBeam" d=""/><circle id="guideDot" r="3"/></svg>
    <div class="deck-floor"></div>
    <div class="deck-scene"><div class="deck-obj deck" id="deck"></div></div>
    <div class="slot-layer" id="slotLayer"><div class="ring-wrap" id="ringWrap"><canvas id="ringCv" width="480" height="480"></canvas></div></div>
    <div class="hit" id="hitVol" role="slider" aria-label="出力音量（左右にドラッグ）" tabindex="0"></div>
    <div class="ctrl">
      <button class="cbtn main" id="kConv"><i class="dot"></i><b id="kConvTxt">変換 ON</b></button>
      <button class="cbtn" id="kMon" aria-label="モニター">${ICON.headphones}<span>MON</span></button>
      <button class="cbtn rec" id="kRec" aria-label="録音">${ICON.rec}<span>REC</span></button>
      <button class="cbtn" id="kFx" aria-label="FX工房">${ICON.sliders}<span>FX</span></button>
    </div>
  </div></div>`;
}

/* ---- 3D deck construction ---- */
const mixHex = (a, b, t) => { const h = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16)); const A = h(a), B = h(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
function dEl(cls, style, parent, html) { const e = document.createElement('div'); e.className = cls; e.setAttribute('style', style); if (html) e.innerHTML = html; parent.appendChild(e); return e; }
function slab(p, { x = 0, y = 0, w, h, r, z0, depth, n, inset, bg, cls = 'L' }) {
  for (let i = 0; i < n; i++) { const t = n === 1 ? 1 : i / (n - 1); const k = inset(t);
    dEl(cls, `left:${x + k}px;top:${y + k}px;width:${w - 2 * k}px;height:${h - 2 * k}px;border-radius:${Math.max(4, r - k)}px;transform:translateZ(${(z0 + depth * t).toFixed(2)}px);background:${bg(t)}`, p); }
}
const DK_ICONS = [
  ['mon', '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><path d="M3 14h4v6H3zM17 14h4v6h-4z"/>'],
  ['rec', '<circle cx="12" cy="12" r="5"/>'],
  ['fx', '<path d="M5 4v16M12 4v16M19 4v16"/>'],
  ['out', '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/>'],
];
function buildDeck() {
  const o = $('#deck'); o.innerHTML = '';
  const { W: w, H: h, R } = DK;
  dEl('L floor-grid', `left:-220px;top:-160px;width:${w + 440}px;height:${h + 320}px;transform:translateZ(-1px)`, o);
  // graphite pedestal + glowing base
  slab(o, { w, h, r: R, z0: 0, depth: 10, n: 6, inset: (t) => 20 - t * 4, bg: (t) => `linear-gradient(90deg,#0d0c13,${mixHex('#2a2836', '#3c3a4c', t)} 30%,${mixHex('#4c4a5e', '#6a6680', t)} 48%,#242230 70%,#0b0a10)` });
  dEl('L', `left:16px;top:16px;width:${w - 32}px;height:${h - 32}px;border-radius:${R - 16}px;transform:translateZ(10.5px);background:radial-gradient(closest-side,#2a2442,#0d0b16);box-shadow:inset 0 0 0 1.5px #d6c8ff,0 0 18px 3px rgba(200,180,255,.6)`, o);
  // levitation gap: light rims only
  for (let i = 0; i < 6; i++) dEl('L gaprim', `left:22px;top:22px;width:${w - 44}px;height:${h - 44}px;border-radius:${R - 22}px;transform:translateZ(${12 + i * 2.6}px);border:1px solid rgba(214,198,255,${(0.6 - i * 0.07).toFixed(2)});box-shadow:0 0 ${8 + i * 2}px rgba(190,170,255,${(0.38 - i * 0.04).toFixed(2)})`, o);
  // floating pearl plate
  slab(o, { w, h, r: R, z0: 27, depth: 7, n: 7, inset: (t) => 3 * (1 - t), bg: (t) => `linear-gradient(90deg,rgba(150,140,190,.7),rgba(235,230,250,${(0.7 + t * 0.2).toFixed(2)}) 34%,#ffffff 48%,rgba(205,198,228,.8) 70%,rgba(120,110,160,.7))` });
  dEl('L', `left:0;top:0;width:${w}px;height:${h}px;border-radius:${R}px;transform:translateZ(27px);box-shadow:0 0 0 1px rgba(214,200,255,.9),0 0 16px 2px rgba(200,180,255,.55)`, o);
  const top = dEl('L', `left:0;top:0;width:${w}px;height:${h}px;border-radius:${R}px;transform:translateZ(${DK.plateZ}px);background:radial-gradient(110% 90% at 30% 0%,#ffffff 0%,#f4f1fa 42%,#e2ddee 100%);box-shadow:inset 0 0 0 1.2px rgba(255,255,255,.95),inset 0 0 0 3px rgba(200,180,255,.3),inset 0 -8px 18px rgba(150,130,210,.25)`, o);
  // emitter ring printed around the slit (the hologram ring rises from it)
  dEl('face dk-ring', `inset:auto;left:${DK.slitX - 70}px;top:${DK.slitY - 34}px;width:140px;height:68px;border-radius:50%`, top);
  // the slit, centred under the wheel
  dEl('face dk-slit', `inset:auto;left:${DK.slitX - 74}px;top:${DK.slitY - 4}px;width:148px;height:8px;border-radius:4px`, top);
  dEl('face dk-ripple', `inset:auto;left:${DK.slitX - 40}px;top:${DK.slitY - 40}px;width:80px;height:80px`, top).id = 'dkRipple';
  // light UI printed on the plate (front left / front right)
  top.insertAdjacentHTML('beforeend', `<div class="dk-ui dk-ui-l">
    <div class="dk-status" id="dkStatus">VOICE CORE · STANDBY</div>
    <div class="dk-name" id="dkName">メモリを挿入</div>
    <div class="dk-info" id="dkInfo">—</div></div>
    <div class="dk-ui dk-ui-r">
    <div class="dk-vol" id="dkVol"><i id="dkVolFill"></i><b id="dkVolKnob"></b></div>
    <div class="dk-icons">${DK_ICONS.map(([k, d]) => `<svg viewBox="0 0 24 24" class="${k}" data-ic="${k}">${d}</svg>`).join('')}</div></div>`);
}

RENDER.home = () => {
  const page = $('#page-home');
  if (!page.dataset.built) {
    page.innerHTML = stageHTML();
    page.dataset.built = '1';
    buildDeck();
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
  const s = Math.min(w / 390, h / 640, 1.3);
  W.scale = s;
  stage.style.setProperty('--s', s.toFixed(4));
  stage.style.top = Math.max(0, (h - 640 * s) / 2) + 'px';
  requestAnimationFrame(placeHits);
}
function stageRect(el) {
  const sr = $('#stage').getBoundingClientRect(), r = el.getBoundingClientRect();
  return { left: (r.left - sr.left) / W.scale, top: (r.top - sr.top) / W.scale, width: r.width / W.scale, height: r.height / W.scale };
}
// measure the slit line, size the clip layer and lay 2D hit areas over the 3D deck
function placeHits() {
  if (!$('#stage') || !W.scale) return;
  const slit = $('#deck .dk-slit');
  if (slit) {
    const r = stageRect(slit);
    if (r.height) {
      SLIT_Y = Math.round(r.top + r.height * 0.55);
      const layer = $('#slotLayer');
      layer.style.height = SLIT_Y + 'px';
      const ring = $('#ringWrap');
      ring.style.top = (SLIT_Y - 196) + 'px';
      const sc = $('#slotChip');
      if (sc && !W.inserting) sc.style.transform = `translateY(${restTop()}px)`;
    }
  }
  const hit = $('#hitVol'), vol = $('#dkVol');
  if (hit && vol) { const r = stageRect(vol); const pad = 14; Object.assign(hit.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' }); }
  drawGuide();
}
const restTop = () => SLIT_Y - CARD.show;

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
    const x = sg * (a <= 1 ? a * STEP : STEP + (a - 1) * 48);
    const z = -Math.min(a, 3) * 80;
    const ry = -clamp(d, -2, 2) * 28;
    const sc = 1 - Math.min(a, 2) * 0.08;
    const op = a > 2.7 ? 0 : a > 2 ? 1 - (a - 2) / 0.7 : 1;
    const dy = el === W.dragCard ? W.dragY : 0;
    const rx = 0;
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
      if (D.axis === 'v') { W.dragCard = D.card; D.card.classList.add('dragging'); $('#deck').classList.add('armed'); }
    }
    if (D.axis === 'h') {
      W.pos = D.pos0 - dx / STEP;
      if (W.cards.length < 4) W.pos = clamp(W.pos, -0.35, W.cards.length - 0.65);
      layoutWheel();
    } else {
      W.dragY = dy < 0 ? dy * 0.2 : Math.min(dy, 200);
      layoutWheel(); drawGuide();
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
      $('#deck').classList.remove('armed');
      if (W.dragY > 70 || (D.vy > 0.55 && W.dragY > 24)) insertCurrent();
      else { springBackCard(); setTimeout(drawGuide, 260); }
    }
  };
  wheel.addEventListener('pointerup', end);
  wheel.addEventListener('pointercancel', end);

  $('#kConv').addEventListener('click', toggleConvert);
  $('#kMon').addEventListener('click', () => {
    S.monitor = !S.monitor; VoxEngine.setMonitor(S.monitor); saveSettings(); updateDriver();
    toast(S.monitor ? 'モニターON：変換後の声を自分で聴けます（イヤホン推奨）' : 'モニターOFF：録音・出力のみ');
  });
  $('#kRec').addEventListener('click', toggleRec);
  $('#kFx').addEventListener('click', () => go('fx'));
  $('#casePill').addEventListener('click', openCasePicker);
  $('#slotLayer').addEventListener('click', (e) => { if (e.target.closest('.slot-chip') && !W.inserting && S.insertedId) ejectChip(false); });
  // volume: drag along the light slider printed on the plate
  const kh = $('#hitVol');
  let kd = null;
  kh.addEventListener('pointerdown', (e) => { kd = { x: e.clientX, v: S.volume }; try { kh.setPointerCapture(e.pointerId); } catch (err) {} });
  kh.addEventListener('pointermove', (e) => {
    if (!kd) return;
    S.volume = clamp(kd.v + ((e.clientX - kd.x) / (W.scale * 110)) * 1.5, 0, 1.5);
    VoxEngine.setVolume(S.volume); updateVol(true);
  });
  const kend = () => { if (kd) { kd = null; saveSettings(); } };
  kh.addEventListener('pointerup', kend); kh.addEventListener('pointercancel', kend);

  window.addEventListener('resize', fitStage);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', fitStage);
  VoxEngine.onChange(() => { updateDriver(); updateLivePill(); });
  requestAnimationFrame(screenLoop);
}

/* ---- straight insertion: the card drops from the wheel into the slit right below it ---- */
function makeSlotChip(chip, top, left = CARD.left) {
  let sc = $('#slotChip');
  if (sc) sc.remove();
  sc = document.createElement('div');
  sc.className = 'slot-chip'; sc.id = 'slotChip';
  sc.dataset.id = chip.id;
  sc.style.left = left + 'px';
  sc.style.transform = `translateY(${top}px)`;
  sc.setAttribute('aria-label', chip.name + '（タップで取り出す）');
  sc.innerHTML = chipHTML(chip);
  $('#slotLayer').append(sc);
  return sc;
}
function removeSlotChip() { const sc = $('#slotChip'); if (sc) sc.remove(); }
function syncSlotChip() {
  if (W.inserting) return;
  const chip = chipById(S.insertedId);
  if (!chip) { removeSlotChip(); return; }
  const sc = $('#slotChip');
  if (sc && sc.dataset.id === chip.id) { sc.innerHTML = chipHTML(chip); sc.querySelector('.chip').classList.add('active'); return; }
  makeSlotChip(chip, restTop()).querySelector('.chip').classList.add('active');
}
function ripple() {
  const r = $('#dkRipple'); if (!r || S.reduceMotion) return;
  r.animate([{ transform: 'scale(.2)', opacity: 1 }, { transform: 'scale(3.4)', opacity: 0 }], { duration: 650, easing: 'cubic-bezier(.2,.8,.3,1)' });
}
function contactFx() {
  const d = $('#deck');
  VoxEngine.sfx('insert');
  d.classList.remove('thunk'); void d.offsetWidth; d.classList.add('thunk');
  ripple();
  try { navigator.vibrate && navigator.vibrate(18); } catch (e) {}
}
function tween(el, frames, dur, easing) {
  const a = el.animate(frames, { duration: S.reduceMotion ? 1 : dur, easing, fill: 'forwards' });
  return a.finished.catch(() => {}).then(() => { const last = frames[frames.length - 1]; for (const k in last) if (k !== 'offset' && k !== 'easing') el.style[k] = last[k]; try { a.cancel(); } catch (e) {} });
}
async function insertCurrent() {
  const ci = centerIndex();
  const chip = W.list[ci];
  if (!chip || W.inserting) return;
  if (S.insertedId && S.insertedId !== chip.id) await ejectChip(true);
  W.inserting = true;
  const deck = $('#deck');
  const card = W.cards[ci];
  const r = stageRect(card.querySelector('.chip'));
  card.classList.remove('dragging');
  W.dragCard = null; W.dragY = 0;
  S.insertedId = chip.id;
  const sc = makeSlotChip(chip, r.top, r.left);
  layoutWheel(); // the wheel slot turns into a ghost; the identical card now sits in the slot layer
  drawGuide();
  deck.classList.add('armed');
  const rest = restTop();
  const dist = Math.max(40, rest - r.top);
  // drop straight down (accelerating like it's pulled in), then seat with a short spring
  await tween(sc, [{ transform: `translateY(${r.top}px)`, left: r.left + 'px' }, { transform: `translateY(${rest + 7}px)`, left: CARD.left + 'px' }], 180 + dist * 0.75, 'cubic-bezier(.55,0,.85,.45)');
  contactFx();
  deck.classList.remove('armed');
  sc.querySelector('.chip').classList.add('active');
  await tween(sc, [{ transform: `translateY(${rest + 7}px)` }, { transform: `translateY(${rest - 3}px)`, offset: 0.55 }, { transform: `translateY(${rest}px)` }], 260, 'ease-out');
  W.bootT = performance.now();
  deck.classList.add('loaded', 'booting');
  $('#ringWrap').classList.add('on');
  setTimeout(() => deck.classList.remove('booting'), 900);
  W.inserting = false;
  saveSettings(); applyParams(); updateDriver(); drawGuide();
  if (VoxEngine.status.state === 'live') toast(`「${chip.name}」の声に切り替えました`);
}
async function ejectChip(quick) {
  const id = S.insertedId;
  const sc = $('#slotChip');
  if (!id || !sc) { S.insertedId = null; removeSlotChip(); updateDriver(); return; }
  const deck = $('#deck');
  W.inserting = true;
  const i = W.list.findIndex((c) => c.id === id);
  let rot = Promise.resolve();
  if (!quick && i >= 0 && i !== centerIndex()) {
    const n = W.cards.length;
    rot = new Promise((r) => animateTo(Math.round(W.pos + (n >= 4 ? wrapD(i - W.pos, n) : i - W.pos)), r));
  }
  // ring sinks back into the slit, the slot kicks the chip up
  deck.classList.remove('loaded');
  $('#ringWrap').classList.remove('on');
  deck.classList.add('releasing');
  sc.querySelector('.chip').classList.remove('active');
  VoxEngine.sfx('eject');
  ripple();
  const rest = restTop();
  if (quick) {
    await tween(sc, [{ transform: `translateY(${rest}px)`, opacity: 1 }, { transform: `translateY(${rest - 90}px)`, opacity: 0 }], 240, 'cubic-bezier(.2,.7,.3,1)');
    sc.remove(); deck.classList.remove('releasing');
    S.insertedId = null; W.inserting = false; layoutWheel(); updateDriver(); drawGuide();
    return;
  }
  await tween(sc, [{ transform: `translateY(${rest}px)` }, { transform: `translateY(${rest - 26}px)` }], 160, 'cubic-bezier(.2,.9,.4,1)');
  await rot;
  // rise straight back up into its place in the wheel and hand over to the real card
  const card = i >= 0 ? W.cards[i] : null;
  const t = card ? stageRect(card.querySelector('.chip')) : { top: 40, left: CARD.left };
  const dist = Math.max(40, rest - 26 - t.top);
  await tween(sc, [{ transform: `translateY(${rest - 26}px)` }, { transform: `translateY(${t.top - 6}px)`, offset: 0.82 }, { transform: `translateY(${t.top}px)` }], 260 + dist * 0.7, 'cubic-bezier(.25,.75,.3,1)');
  deck.classList.remove('releasing');
  S.insertedId = null;
  layoutWheel();
  if (card) { card.classList.add('landing'); setTimeout(() => card.classList.remove('landing'), 500); }
  requestAnimationFrame(() => sc.remove());
  W.inserting = false;
  saveSettings(); applyParams(); updateDriver(); drawGuide();
}

/* ---- guide light straight down from the wheel to the slit ---- */
function drawGuide() {
  const g = $('#guide'); if (!g) return;
  const show = !S.insertedId && W.list.length;
  g.classList.toggle('show', !!show);
  const x = 195, y0 = 226, y1 = SLIT_Y - 4;
  $('#guidePath').setAttribute('d', `M${x} ${y0} L${x} ${y1}`);
  const k = clamp((W.dragY || 0) / 90, 0, 1);
  g.style.setProperty('--k', k.toFixed(3));
  $('#guideBeam').setAttribute('d', `M${x} ${y0 + (W.dragY || 0)} L${x} ${y1}`);
  $('#guideDot').setAttribute('cx', x); $('#guideDot').setAttribute('cy', y1);
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

/* ---- deck display ---- */
function updateVol(flash) {
  const p = (S.volume / 1.5) * 100;
  const f = $('#dkVolFill'), k = $('#dkVolKnob');
  if (f) f.style.width = p + '%';
  if (k) k.style.left = p + '%';
  if (flash) W.volFlash = performance.now();
}
function updateDriver() {
  const deck = $('#deck'); if (!deck) return;
  const st = VoxEngine.status, chip = chipById(S.insertedId);
  const live = st.state === 'live', rec = VoxEngine.recording();
  deck.classList.toggle('loaded', !!chip && !W.inserting);
  deck.classList.toggle('live', live);
  $('#stage').classList.toggle('has-chip', !!chip);
  $('#stage').classList.toggle('live', live);
  $('#kConv').classList.toggle('on', live);
  $('#kConvTxt').textContent = live ? '変換中' : st.state === 'starting' ? '起動中…' : '変換 ON';
  $('#kMon').classList.toggle('on', S.monitor);
  $('#kRec').classList.toggle('on', rec);
  $('#kFx').classList.toggle('on', S.fx.length > 0);
  const ic = { mon: S.monitor, rec, fx: S.fx.length > 0, out: !!st.sinkId };
  $$('#deck [data-ic]').forEach((s) => s.classList.toggle('on', !!ic[s.dataset.ic]));
  $('#dkName').textContent = chip ? chip.name : 'メモリを挿入';
  $('#ringWrap').classList.toggle('on', !!chip && !W.inserting);
  updateVol();
}

/* hologram ring that rises from the slit around the seated chip, driven by the converted voice */
let rgCtx = null;
const freqBuf = new Uint8Array(1024);
const waveBuf = new Float32Array(2048);
let lastScr = 0;
const RING_N = 96;
const ringVals = new Float32Array(RING_N);
function screenLoop(t) {
  requestAnimationFrame(screenLoop);
  if (S.tab !== 'home' || t - lastScr < 33) return;
  lastScr = t;
  const cv = $('#ringCv'); if (!cv) return;
  if (!rgCtx) rgCtx = cv.getContext('2d');
  const st = VoxEngine.status, live = st.state === 'live', chip = chipById(S.insertedId);
  let lvNow = 0;
  if (live && st.outAnalyser) {
    st.outAnalyser.getFloatTimeDomainData(waveBuf);
    let pk = 0; for (let i = 0; i < 1024; i += 2) pk = Math.max(pk, Math.abs(waveBuf[i]));
    lvNow = Math.min(1, pk * 1.4);
    st.outAnalyser.getByteFrequencyData(freqBuf);
  }
  W.lv = W.lv * 0.7 + lvNow * 0.3;
  $('#stage').style.setProperty('--lv', W.lv.toFixed(3));
  const half = RING_N / 2;
  for (let i = 0; i < RING_N; i++) {
    let target;
    if (live && st.outAnalyser) { const k = i < half ? i : RING_N - 1 - i; target = freqBuf[Math.floor(2 + Math.pow(k / half, 1.6) * 180)] / 255; }
    else target = 0.16 + 0.1 * Math.sin(t / 650 + i * 0.4) * Math.cos(t / 1000 + i * 0.12);
    ringVals[i] += (target - ringVals[i]) * 0.35;
  }
  const g = rgCtx, S2 = cv.width, c = S2 / 2;
  g.clearRect(0, 0, S2, S2);
  if (chip) {
    const boot = W.bootT ? clamp((performance.now() - W.bootT) / 700, 0, 1) : 1;
    const base = chip.color || '#c8b4ff';
    const r1 = S2 * 0.38, len = S2 * 0.1;
    g.lineCap = 'round';
    for (let pass = 0; pass < 2; pass++) {
      g.lineWidth = pass ? S2 / 170 : S2 / 110;
      g.globalAlpha = pass ? 1 : 0.28;
      for (let i = 0; i < RING_N; i++) {
        const a = (i / RING_N) * Math.PI * 2 - Math.PI / 2;
        const ang = (i / RING_N + 0.75) % 1;
        const v = clamp(ringVals[i], 0.05, 1) * (boot >= 1 ? 1 : clamp((boot - Math.abs(ang - 0.5) * 0.9) * 3, 0, 1));
        g.strokeStyle = pass ? mixHex(mixHex(base, '#ffffff', 0.35), '#ffb3e2', (Math.sin(a) + 1) / 2) : '#ffffff';
        g.beginPath();
        g.moveTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
        g.lineTo(c + Math.cos(a) * (r1 + v * len), c + Math.sin(a) * (r1 + v * len));
        g.stroke();
      }
    }
    g.globalAlpha = 1;
    g.strokeStyle = 'rgba(230,220,255,.45)'; g.lineWidth = S2 / 360;
    g.beginPath(); g.arc(c, c, S2 * 0.355, 0, Math.PI * 2); g.stroke();
    g.save(); g.translate(c, c); g.rotate(t / 2200);
    g.strokeStyle = 'rgba(230,220,255,.7)'; g.setLineDash([S2 * 0.2, S2 * 0.06, S2 * 0.02, S2 * 0.06]);
    g.beginPath(); g.arc(0, 0, S2 * 0.33, 0, Math.PI * 2); g.stroke(); g.restore(); g.setLineDash([]);
  }
  const rec = VoxEngine.recording();
  const status = !chip ? 'VOICE CORE · STANDBY' : rec ? 'VOICE CORE · ● REC ' + fmtSec((Date.now() - st.recStart) / 1000) : live ? 'VOICE CORE · LIVE' : 'VOICE CORE · LINKED';
  const db = W.lv > 0.001 ? Math.round(20 * Math.log10(W.lv)) : null;
  let info = '—';
  if (chip) { const pp = combinedParams(); info = pp.robotHz ? `ROBO ${Math.round(pp.robotHz)}Hz · TONE ${signed(pp.formant, 1)}` : `PITCH ${signed(pp.pitch, 1)} · TONE ${signed(pp.formant, 1)}`; }
  if (live) info = (st.f0 ? `${Math.round(st.f0)} Hz · ♪ ${noteName(st.f0)}` : '— Hz') + (db !== null ? ` · ${db} dB` : '');
  if (W.volFlash && t - W.volFlash < 1200) info = 'VOLUME ' + Math.round((S.volume / 1.5) * 100) + '%';
  const set = (id, v) => { const e = $('#' + id); if (e && e.textContent !== v) e.textContent = v; };
  set('dkStatus', status); set('dkInfo', info);
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
