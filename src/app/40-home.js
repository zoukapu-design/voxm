/* ===== HOME: memory wheel → HOLO DECK (straight insertion) ===== */
const W = { pos: 0, list: [], cards: [], drag: null, dragCard: null, dragY: 0, scale: 1, anim: 0, inserting: false, lastCenter: -1, lv: 0, flyingId: null, bootBay: 1 };
const STEP = 104;
// The deck faces the viewer. One long rail slit holds three bays; the centre bay sits exactly under the
// wheel's centre card, so a chip always drops straight in. Seated chips slide sideways along the rail.
const DK = { W: 350, H: 176, R: 58, plateZ: 34, slitY: 44, bayX: [67, 175, 283] };
const CARD = { left: 130, w: 130, h: 180 };
const SEAT = { k: 0.6, show: 92 }; // seated chips: scale, and how much stays above the slit
let SLIT_Y = 400; // slit line in stage px (measured)
let BAY_X = [95, 195, 295]; // bay centres in stage px (measured)

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
    <div class="slot-layer" id="slotLayer"><canvas class="spec" id="specCv" width="780" height="360"></canvas>${[0, 1, 2].map((i) => `<div class="bay-holo" data-bay="${i}"><svg viewBox="0 0 78 108" aria-hidden="true"><path d="M4 .75H60L77.25 18V108H.75V4Z"/></svg><i class="scan"></i><b>0${i + 1}</b><span>EMPTY</span></div>`).join('')}</div>
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
  dEl('L', `left:16px;top:16px;width:${w - 32}px;height:${h - 32}px;border-radius:${R - 16}px;transform:translateZ(10.5px);background:radial-gradient(closest-side,#2a2442,#0d0b16);box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--tint) 45%,#fff),0 0 18px 3px color-mix(in srgb,var(--tint) 65%,transparent)`, o);
  // levitation gap: light rims only
  for (let i = 0; i < 6; i++) dEl('L gaprim', `left:22px;top:22px;width:${w - 44}px;height:${h - 44}px;border-radius:${R - 22}px;transform:translateZ(${12 + i * 2.6}px);border:1px solid color-mix(in srgb,color-mix(in srgb,var(--tint) 35%,#fff) ${Math.round((0.6 - i * 0.07) * 100)}%,transparent);box-shadow:0 0 ${8 + i * 2}px color-mix(in srgb,var(--tint) ${Math.round((0.4 - i * 0.04) * 100)}%,transparent)`, o);
  // floating pearl plate
  slab(o, { w, h, r: R, z0: 27, depth: 7, n: 7, inset: (t) => 3 * (1 - t), bg: (t) => `linear-gradient(90deg,rgba(150,140,190,.7),rgba(235,230,250,${(0.7 + t * 0.2).toFixed(2)}) 34%,#ffffff 48%,rgba(205,198,228,.8) 70%,rgba(120,110,160,.7))` });
  dEl('L', `left:0;top:0;width:${w}px;height:${h}px;border-radius:${R}px;transform:translateZ(27px);box-shadow:0 0 0 1px rgba(214,200,255,.9),0 0 16px 2px rgba(200,180,255,.55)`, o);
  const top = dEl('L', `left:0;top:0;width:${w}px;height:${h}px;border-radius:${R}px;transform:translateZ(${DK.plateZ}px);background:radial-gradient(110% 90% at 30% 0%,#ffffff 0%,#f4f1fa 42%,#e2ddee 100%);box-shadow:inset 0 0 0 1.2px rgba(255,255,255,.95),inset 0 0 0 3px rgba(200,180,255,.3),inset 0 -8px 18px rgba(150,130,210,.25)`, o);
  // under-glow per bay (lit in the seated chip's colour)
  DK.bayX.forEach((x, i) => dEl('face dk-spill', `inset:auto;left:${x - 64}px;top:${DK.slitY - 34}px;width:128px;height:68px`, top).dataset.bay = i);
  // the rail slit: one long opening, three bays
  dEl('face dk-slit', `inset:auto;left:16px;top:${DK.slitY - 4}px;width:${w - 32}px;height:8px;border-radius:4px`, top, '<i class="rail"></i>');
  DK.bayX.forEach((x, i) => {
    dEl('face dk-pt', `inset:auto;left:${x - 1}px;top:${DK.slitY - 1}px;width:2px;height:2px`, top).dataset.bay = i;
    dEl('face dk-bay', `inset:auto;left:${x - 34}px;top:${DK.slitY + 9}px;width:68px;height:12px`, top, `<i></i><b>0${i + 1}</b>`).dataset.bay = i;
    dEl('face dk-ripple', `inset:auto;left:${x - 36}px;top:${DK.slitY - 36}px;width:72px;height:72px`, top).id = 'dkRipple' + i;
  });
  dEl('face dk-lip', `inset:auto;left:${w / 2 - 110}px;top:${h - 13}px;width:220px;height:2px;border-radius:2px`, top, '<i></i>');
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
  syncSlotChips();
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
      $$('#deck .dk-pt').forEach((pt) => { const q = stageRect(pt); BAY_X[+pt.dataset.bay] = Math.round((q.left + q.width / 2) * 10) / 10; });
      $('#slotLayer').style.height = SLIT_Y + 'px';
      $('#specCv').style.top = (SLIT_Y - 180) + 'px';
      if (!W.inserting) $$('#slotLayer .slot-chip').forEach((sc) => { sc.style.transform = seatT(+sc.dataset.bay, restTop()); });
      $$('#slotLayer .bay-holo').forEach((h) => { h.style.transform = `translate(${(BAY_X[+h.dataset.bay] - 39).toFixed(1)}px,${restTop()}px)`; });
    }
  }
  const hit = $('#hitVol'), vol = $('#dkVol');
  if (hit && vol) { const r = stageRect(vol); const pad = 14; Object.assign(hit.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' }); }
  drawGuide();
}
const restTop = () => SLIT_Y - SEAT.show;
// transform of a chip whose top-centre sits at (x, top), scaled by k (transform-origin: top centre)
const chipT = (x, top, k) => `translate(${(x - CARD.w / 2).toFixed(1)}px,${top.toFixed(1)}px) scale(${k.toFixed(4)})`;
const seatT = (bay, top, k = SEAT.k) => chipT(BAY_X[bay], top, k);

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
    el.innerHTML = chipHTML(c, { dim: true }) + `<div class="ghost-frame">${ICON.eject}<span>IN SLOT</span><b class="gslot"></b></div>`;
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
    const gid = W.list[i] && W.list[i].id;
    const gh = !!gid && (isSeated(gid) || gid === W.flyingId);
    el.classList.toggle('ghost', gh);
    if (gh) { const b = S.slots.indexOf(gid); const g = el.querySelector('.gslot'); const v = b >= 0 ? '0' + (b + 1) : ''; if (g.textContent !== v) g.textContent = v; }
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
function animateTo(target, done, k = 0.2) {
  cancelAnimationFrame(W.anim);
  const n = W.cards.length;
  if (n < 4) target = clamp(target, 0, n - 1);
  const step = () => {
    const diff = target - W.pos;
    if (Math.abs(diff) < 0.002) {
      W.pos = n >= 4 ? ((target % n) + n) % n : target;
      layoutWheel(); done && done(); return;
    }
    W.pos += diff * (S.reduceMotion ? 1 : k);
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
        if (D.card.classList.contains('ghost')) ejectChip(W.list[i].id);
        else insertCurrent();
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
  bindSlotDrag();
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

/* ---- seated chips (2D, in a clip layer whose bottom edge is the slit) ---- */
const slotEl = (id) => $$('#slotLayer .slot-chip').find((e) => e.dataset.id === id) || null;
function makeSlotChip(chip, bay, transform) {
  const old = slotEl(chip.id); if (old) old.remove();
  const sc = document.createElement('div');
  sc.className = 'slot-chip';
  sc.dataset.id = chip.id; sc.dataset.bay = bay;
  sc.style.transform = transform;
  sc.setAttribute('aria-label', chip.name + '（タップか上に引いて取り出す）');
  sc.innerHTML = chipHTML(chip, { noBadge: true });
  $('#slotLayer').append(sc);
  return sc;
}
function removeSlotChip(id) { $$('#slotLayer .slot-chip').forEach((e) => { if (!id || e.dataset.id === id) e.remove(); }); }
function syncSlotChips() {
  if (W.inserting) return;
  const rest = restTop();
  $$('#slotLayer .slot-chip').forEach((e) => { if (!isSeated(e.dataset.id)) e.remove(); });
  S.slots.forEach((id, bay) => {
    const chip = chipById(id); if (!chip) return;
    let sc = slotEl(id);
    if (sc) { sc.innerHTML = chipHTML(chip, { noBadge: true }); sc.dataset.bay = bay; sc.style.transform = seatT(bay, rest); }
    else sc = makeSlotChip(chip, bay, seatT(bay, rest));
    sc.querySelector('.chip').classList.add('active');
  });
}
function ripple(bay = 1) {
  const r = $('#dkRipple' + bay); if (!r || S.reduceMotion) return;
  r.animate([{ transform: 'scale(.2)', opacity: 1 }, { transform: 'scale(3)', opacity: 0 }], { duration: 650, easing: 'cubic-bezier(.2,.8,.3,1)' });
}
function contactFx(bay = 1) {
  const d = $('#deck');
  VoxEngine.sfx('insert');
  d.classList.remove('thunk'); void d.offsetWidth; d.classList.add('thunk');
  ripple(bay);
  try { navigator.vibrate && navigator.vibrate(18); } catch (e) {}
}
function tween(el, frames, dur, easing) {
  const a = el.animate(frames, { duration: S.reduceMotion ? 1 : dur, easing, fill: 'forwards' });
  return a.finished.catch(() => {}).then(() => { const last = frames[frames.length - 1]; for (const k in last) if (k !== 'offset' && k !== 'easing') el.style[k] = last[k]; try { a.cancel(); } catch (e) {} });
}
function syncHolos() {
  const c = W.list[centerIndex()];
  const canDrop = c && !isSeated(c.id);
  $$('#slotLayer .bay-holo').forEach((h) => {
    const b = +h.dataset.bay;
    h.classList.toggle('off', !!S.slots[b]);
    h.classList.toggle('target', b === 1 && !S.slots[1] && !!canDrop);
  });
}
function lightBay(bay) { const e = $(`#deck .dk-bay[data-bay="${bay}"]`); if (!e) return; e.classList.remove('flash'); void e.offsetWidth; e.classList.add('flash'); }

/* Insert: the centre card always drops straight down into the centre bay. If that bay is taken, its chip
   first slides along the rail to a free bay; if all three are taken, it is swapped out. */
async function insertCurrent() {
  const ci = centerIndex();
  const chip = W.list[ci];
  if (!chip || W.inserting || isSeated(chip.id)) return;
  W.inserting = true;
  W.bootBase = seatedChips().length ? 1 : 0; W.bootT = performance.now() + 1e7; // bars wait for the chip to seat
  const deck = $('#deck');
  const rest = restTop();
  const occ = S.slots[1];
  if (occ) {
    const el = slotEl(occ);
    const free = !S.slots[0] ? 0 : !S.slots[2] ? 2 : -1;
    if (free >= 0) {
      S.slots[free] = occ; S.slots[1] = null;
      if (el) {
        el.dataset.bay = free;
        tween(el, [{ transform: seatT(1, rest) }, { transform: seatT(1, rest + 4), offset: 0.15 }, { transform: seatT(free, rest + 4), offset: 0.8 }, { transform: seatT(free, rest) }], 340, 'cubic-bezier(.45,0,.2,1)')
          .then(() => { lightBay(free); });
      }
      VoxEngine.sfx('tick');
    } else {
      S.slots[1] = null; // rack full: swap the centre chip out
      if (el) { el.querySelector('.chip').classList.remove('active'); tween(el, [{ transform: seatT(1, rest), opacity: 1 }, { transform: seatT(1, rest - 70), opacity: 0 }], 240, 'cubic-bezier(.2,.7,.3,1)').then(() => el.remove()); }
      VoxEngine.sfx('eject');
      toast(`「${chipById(occ)?.name || ''}」と入れ替えました`);
    }
  }
  const card = W.cards[ci];
  const r = stageRect(card.querySelector('.chip'));
  card.classList.remove('dragging');
  W.dragCard = null; W.dragY = 0;
  S.slots[1] = chip.id;
  const x0 = r.left + r.width / 2, k0 = r.width / CARD.w;
  const sc = makeSlotChip(chip, 1, chipT(x0, r.top, k0));
  layoutWheel(); // the wheel slot turns into a ghost; the identical card now lives in the slot layer
  drawGuide(); syncHolos();
  deck.classList.add('armed');
  const dist = Math.max(40, rest - r.top);
  // drop straight down, shrinking into the deck's depth (pulled in), then seat with a short spring
  await tween(sc, [{ transform: chipT(x0, r.top, k0) }, { transform: seatT(1, rest + 6) }], 190 + dist * 0.75, 'cubic-bezier(.55,0,.85,.45)');
  contactFx(1); lightBay(1);
  deck.classList.remove('armed');
  sc.querySelector('.chip').classList.add('active');
  await tween(sc, [{ transform: seatT(1, rest + 6) }, { transform: seatT(1, rest - 3), offset: 0.55 }, { transform: seatT(1, rest) }], 260, 'ease-out');
  W.bootT = performance.now(); W.bootBay = 1;
  deck.classList.add('booting');
  setTimeout(() => deck.classList.remove('booting'), 900);
  W.inserting = false;
  saveSettings(); applyParams(); updateDriver(); drawGuide();
  if (VoxEngine.status.state === 'live') toast(seatedChips().length > 1 ? `「${seatedName()}」をミックス中` : `「${chip.name}」の声に切り替えました`);
}

const HOME_TOP = 42; // stage y of the wheel's centre card (wheel top 34 + card top 8)
// Eject one chip: it pops out of its bay, then glides up into the wheel's centre slot in one motion
// (the wheel turns that chip's home slot to the centre meanwhile) and hands over to the wheel card.
async function ejectChip(id, quick, fromTop) {
  id = id || S.slots[1] || S.slots.find(Boolean);
  const bay = S.slots.indexOf(id);
  const sc = id && slotEl(id);
  if (bay < 0 || !sc || W.inserting) { if (bay >= 0 && !sc) { S.slots[bay] = null; updateDriver(); } return; }
  const deck = $('#deck');
  W.inserting = true;
  S.slots[bay] = null; W.flyingId = id; // the voice drops this chip right away; the wheel keeps its ghost until hand-over
  applyParams();
  const i = W.list.findIndex((c) => c.id === id);
  if (!quick && i >= 0 && i !== centerIndex()) {
    const n = W.cards.length;
    animateTo(Math.round(W.pos + (n >= 4 ? wrapD(i - W.pos, n) : i - W.pos)), null, 0.3);
  }
  deck.classList.add('releasing');
  sc.querySelector('.chip').classList.remove('active');
  VoxEngine.sfx('eject');
  ripple(bay);
  updateDriver(); syncHolos();
  const rest = restTop();
  const cur = fromTop ?? rest;
  const done = () => { W.flyingId = null; W.inserting = false; deck.classList.remove('releasing'); saveSettings(); applyParams(); layoutWheel(); updateDriver(); drawGuide(); };
  if (quick) {
    await tween(sc, [{ transform: seatT(bay, cur), opacity: 1 }, { transform: seatT(bay, cur - 80), opacity: 0 }], 240, 'cubic-bezier(.2,.7,.3,1)');
    sc.remove(); done(); return;
  }
  const hx = CARD.left + CARD.w / 2;
  const dist = Math.max(60, cur - HOME_TOP + Math.abs(BAY_X[bay] - hx) * 0.5);
  const dur = S.reduceMotion ? 1 : Math.round(520 + dist * 0.7);
  const popped = fromTop == null; // a drag already pulled it out, so skip the pop
  // rise first, then drift sideways to the centre: a gentle curve instead of a flat diagonal
  const mid = (t, ty, tk) => chipT(BAY_X[bay] + (hx - BAY_X[bay]) * t, cur - 32 + (HOME_TOP - cur + 32) * ty, SEAT.k + (1 - SEAT.k) * tk);
  const frames = popped ? [
    { transform: seatT(bay, cur), offset: 0, easing: 'cubic-bezier(.25,.8,.4,1)' },
    { transform: seatT(bay, cur - 32, SEAT.k + 0.03), offset: 0.17, easing: 'cubic-bezier(.45,.05,.55,.95)' },
    { transform: mid(0.4, 0.62, 0.55), offset: 0.6, easing: 'cubic-bezier(.3,.5,.2,1)' },
    { transform: chipT(hx, HOME_TOP, 1), offset: 1 },
  ] : [
    { transform: seatT(bay, cur), offset: 0, easing: 'cubic-bezier(.3,.6,.15,1)' },
    { transform: chipT(hx, HOME_TOP, 1), offset: 1 },
  ];
  const a = sc.animate(frames, { duration: popped ? dur : Math.round(dur * 0.75), fill: 'forwards' });
  setTimeout(() => deck.classList.remove('releasing'), 300);
  try { await a.finished; } catch (e) {}
  // hand over to the identical card in the wheel
  cancelAnimationFrame(W.anim);
  if (i >= 0) W.pos = i;
  W.flyingId = null;
  layoutWheel();
  const card = i >= 0 ? W.cards[i] : null;
  if (card) { card.classList.add('landing'); setTimeout(() => card.classList.remove('landing'), 600); }
  else sc.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' });
  VoxEngine.sfx('tick');
  setTimeout(() => sc.remove(), card ? 16 : 200);
  done();
}

/* drag any seated chip upward to pull it out (a tap also ejects it) */
function bindSlotDrag() {
  const layer = $('#slotLayer');
  let d = null;
  layer.addEventListener('pointerdown', (e) => {
    const sc = e.target.closest('.slot-chip');
    if (!sc || W.inserting || !isSeated(sc.dataset.id)) return;
    d = { y0: e.clientY, moved: false, id: e.pointerId, sc, cid: sc.dataset.id, bay: +sc.dataset.bay, rest: restTop(), lt: performance.now(), ly: e.clientY, vy: 0 };
    d.cur = d.rest;
    try { sc.setPointerCapture(e.pointerId); } catch (err) {}
  });
  layer.addEventListener('pointermove', (e) => {
    if (!d || e.pointerId !== d.id) return;
    const dy = (e.clientY - d.y0) / W.scale;
    const now = performance.now();
    d.vy = d.vy * 0.6 + (((e.clientY - d.ly) / W.scale) / Math.max(1, now - d.lt)) * 0.4;
    d.ly = e.clientY; d.lt = now;
    if (!d.moved && Math.abs(dy) < 6) return;
    d.moved = true;
    const up = Math.min(0, dy);
    d.cur = d.rest + (up > -36 ? up : -36 + (up + 36) * 0.9) + Math.max(0, dy) * 0.1;
    d.sc.style.transform = seatT(d.bay, d.cur);
    $('#deck').classList.toggle('armed', d.rest - d.cur > 30);
  });
  const end = (e) => {
    if (!d || e.pointerId !== d.id) return;
    const dd = d; d = null;
    $('#deck').classList.remove('armed');
    if (!dd.moved) { ejectChip(dd.cid); return; }
    if (dd.rest - dd.cur > 40 || dd.vy < -0.5) ejectChip(dd.cid, false, dd.cur);
    else tween(dd.sc, [{ transform: seatT(dd.bay, dd.cur) }, { transform: seatT(dd.bay, dd.rest) }], 220, 'cubic-bezier(.3,1.4,.5,1)');
  };
  layer.addEventListener('pointerup', end);
  layer.addEventListener('pointercancel', end);
}

/* ---- guide light straight down from the wheel to the centre bay ---- */
function drawGuide() {
  const g = $('#guide'); if (!g) return;
  const c = W.list[centerIndex()];
  const show = c && !isSeated(c.id) && !W.inserting;
  g.classList.toggle('show', !!show);
  syncHolos();
  const x = BAY_X[1], y0 = 226, y1 = SLIT_Y - 4;
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
  if (!seatedChips().length && W.list.length) await insertCurrent();
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
  const chip = seatedChips()[0];
  const d = new Date();
  const rec = { id, kind, name: nameOverride || ((seatedName() || 'VOXM') + (kind === 'video' ? 'の動画' : 'の声')), mime: res.mime || res.blob.type, seconds: res.seconds || 0, size: res.blob.size, createdAt: d.getTime(), chipId: chip ? chip.id : null };
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
  const st = VoxEngine.status, chips = seatedChips();
  const live = st.state === 'live', rec = VoxEngine.recording();
  deck.classList.toggle('loaded', chips.length > 0);
  deck.classList.toggle('live', live);
  $('#stage').classList.toggle('has-chip', chips.length > 0);
  $('#stage').classList.toggle('live', live);
  $('#stage').dataset.n = chips.length;
  $('#kConv').classList.toggle('on', live);
  $('#kConvTxt').textContent = live ? '変換中' : st.state === 'starting' ? '起動中…' : '変換 ON';
  $('#kMon').classList.toggle('on', S.monitor);
  $('#kRec').classList.toggle('on', rec);
  $('#kFx').classList.toggle('on', S.fx.length > 0);
  const ic = { mon: S.monitor, rec, fx: S.fx.length > 0, out: !!st.sinkId };
  $$('#deck [data-ic]').forEach((s) => s.classList.toggle('on', !!ic[s.dataset.ic]));
  // bays: LED + under-glow in each seated chip's colour
  S.slots.forEach((id, bay) => {
    const c = chipById(id);
    $$(`#deck [data-bay="${bay}"]`).forEach((e) => { e.classList.toggle('on', !!c); if (c) e.style.setProperty('--bc', c.color); });
  });
  // the whole scene takes the colour of the centre chip (or whichever is seated)
  const lead = chipById(S.slots[1]) || chips[0];
  $('#app').style.setProperty('--tint', lead ? lead.color : '#a487ff');
  $('#dkName').textContent = !chips.length ? 'メモリを挿入' : chips.length === 1 ? chips[0].name : chips.map((c) => c.name).join(' × ');
  $('#dkName').classList.toggle('mix', chips.length > 1);
  syncHolos();
  updateVol();
}

/* spectrum horizon: bars rise from the rail behind the seated chips, coloured bay by bay */
let spCtx = null;
const freqBuf = new Uint8Array(1024);
const waveBuf = new Float32Array(2048);
let lastScr = 0;
const SPEC_N = 84;
const specVals = new Float32Array(SPEC_N);
function screenLoop(t) {
  requestAnimationFrame(screenLoop);
  if (S.tab !== 'home' || t - lastScr < 33) return;
  lastScr = t;
  const cv = $('#specCv'); if (!cv) return;
  if (!spCtx) spCtx = cv.getContext('2d');
  const st = VoxEngine.status, live = st.state === 'live', chips = seatedChips();
  let lvNow = 0;
  if (live && st.outAnalyser) {
    st.outAnalyser.getFloatTimeDomainData(waveBuf);
    let pk = 0; for (let i = 0; i < 1024; i += 2) pk = Math.max(pk, Math.abs(waveBuf[i]));
    lvNow = Math.min(1, pk * 1.4);
    st.outAnalyser.getByteFrequencyData(freqBuf);
  }
  W.lv = W.lv * 0.7 + lvNow * 0.3;
  $('#stage').style.setProperty('--lv', W.lv.toFixed(3));
  const half = (SPEC_N - 1) / 2;
  for (let i = 0; i < SPEC_N; i++) {
    const k = Math.abs(i - half) / half;
    let target;
    if (live && st.outAnalyser) target = freqBuf[Math.floor(2 + Math.pow(k, 1.5) * 170)] / 255;
    else target = 0.13 + 0.09 * Math.sin(t / 620 + i * 0.33) * Math.cos(t / 1100 - i * 0.11);
    specVals[i] += (target - specVals[i]) * 0.35;
  }
  const g = spCtx, CW = cv.width, CH = cv.height, sx = CW / 390;
  g.clearRect(0, 0, CW, CH);
  if (chips.length) {
    const grad = g.createLinearGradient(0, 0, CW, 0);
    const lead = chipById(S.slots[1]) || chips[0];
    S.slots.forEach((id, bay) => { const c = chipById(id); grad.addColorStop(clamp(BAY_X[bay] / 390, 0, 1), mixHex((c || lead).color, '#ffffff', c ? 0.3 : 0.55)); });
    const boot = W.bootT ? (performance.now() - W.bootT) / 1000 : 9;
    const bx = BAY_X[W.bootBay] * sx;
    const x0 = 24 * sx, x1 = 366 * sx, base = CH - 2 * sx, maxH = CH * 0.62;
    g.lineCap = 'round';
    for (let pass = 0; pass < 2; pass++) {
      g.lineWidth = pass ? 2.1 * sx : 4.2 * sx;
      g.globalAlpha = pass ? 0.95 : 0.22;
      g.strokeStyle = grad;
      g.beginPath();
      for (let i = 0; i < SPEC_N; i++) {
        const x = x0 + (x1 - x0) * (i / (SPEC_N - 1));
        const k = Math.abs(i - half) / half;
        const dome = 0.5 + 0.5 * Math.cos(k * Math.PI / 2);
        const reveal = boot >= 1.2 ? 1 : boot < 0 ? W.bootBase : Math.max(W.bootBase, clamp((boot * 900 * sx - Math.abs(x - bx)) / (40 * sx), 0, 1));
        const v = clamp(specVals[i], 0.04, 1) * dome * reveal;
        if (v < 0.01) continue;
        g.moveTo(x, base); g.lineTo(x, base - v * maxH);
      }
      g.stroke();
    }
    g.globalAlpha = 1;
  }
  const rec = VoxEngine.recording();
  const n = chips.length;
  const status = !n ? 'VOICE CORE · STANDBY' : rec ? 'VOICE CORE · ● REC ' + fmtSec((Date.now() - st.recStart) / 1000) : (live ? 'VOICE CORE · LIVE' : 'VOICE CORE · LINKED') + (n > 1 ? ` · MIX ${n}` : '');
  const db = W.lv > 0.001 ? Math.round(20 * Math.log10(W.lv)) : null;
  let info = '—';
  if (n) { const pp = combinedParams(); info = (pp.robotHz ? `ROBO ${Math.round(pp.robotHz)}Hz` : `PITCH ${signed(pp.pitch, 1)}`) + ` · TONE ${signed(pp.formant, 1)}`; }
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
