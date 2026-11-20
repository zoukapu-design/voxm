/* ===== HOME: memory wheel → HOLO DECK ===== */
const W = { pos: 0, list: [], cards: [], drag: null, dragCard: null, dragY: 0, scale: 1, anim: 0, inserting: false, lastCenter: -1, lv: 0 };
const STEP = 104;
// deck geometry (deck-local px; the deck plane is rotateX(62deg) rotateZ(-18deg))
const DK = { W: 330, H: 180, R: 90, plateZ: 52.5, slitX: 106, slitY: 20, ex: 250, ey: 86, chipScale: 0.9, chipSink: 40, chipLift: 150 };

function stageHTML() {
  return `<div class="stage-host" id="stageHost"><div class="stage" id="stage">
    <div class="case-bar">
      <button class="case-pill" id="casePill"><i class="sw"></i><span id="caseName"></span><span class="cnt" id="caseCnt"></span>${ICON.down}</button>
      <div class="wheel-index" id="wIdx"></div>
    </div>
    <div class="ambient" aria-hidden="true">${Array.from({ length: 16 }, (_, i) => `<i style="left:${(i * 53) % 380 + 5}px;top:${(i * 97) % 600 + 20}px;animation-delay:${(i * 0.7) % 9}s;animation-duration:${9 + (i % 5) * 2}s"></i>`).join('')}</div>
    <div class="wheel-rail" aria-hidden="true"></div>
    <div class="wheel" id="wheel" aria-label="ボイスメモリ。左右にスワイプで選択、下にドラッグかタップでデッキに差し込む"></div>
    <svg class="guide" id="guide" viewBox="0 0 390 640" aria-hidden="true"><defs><linearGradient id="gdg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c8b4ff" stop-opacity="0"/><stop offset=".35" stop-color="#d6c8ff" stop-opacity=".9"/><stop offset="1" stop-color="#ffffff"/></linearGradient></defs><path id="guidePath" d=""/><path id="guideBeam" d=""/><circle id="guideDot" r="3"/></svg>
    <div class="deck-floor"></div>
    <div class="deck-scene"><div class="deck-obj deck" id="deck"></div></div>
    <button class="hit" id="hitCore" aria-label="変換のON/OFF（コアをタップ）"></button>
    <div class="hit" id="hitVol" role="slider" aria-label="出力音量（左右にドラッグ）" tabindex="0"></div>
    <button class="hit" id="hitChip" aria-label="差し込んだメモリを取り出す"></button>
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
function ring3d(p, { cx, cy, R, thick, z0, depth, n, bg }) {
  const m = `-webkit-mask:radial-gradient(circle,transparent ${R - thick}px,#000 ${R - thick + 0.6}px);mask:radial-gradient(circle,transparent ${R - thick}px,#000 ${R - thick + 0.6}px)`;
  for (let i = 0; i < n; i++) { const t = n === 1 ? 1 : i / (n - 1);
    dEl('L', `left:${cx - R}px;top:${cy - R}px;width:${2 * R}px;height:${2 * R}px;border-radius:50%;${m};transform:translateZ(${(z0 + depth * t).toFixed(2)}px);background:${bg(t)}`, p); }
}
const DK_ICONS = [
  ['mon', '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><path d="M3 14h4v6H3zM17 14h4v6h-4z"/>'],
  ['rec', '<circle cx="12" cy="12" r="5"/>'],
  ['fx', '<path d="M5 4v16M12 4v16M19 4v16"/>'],
  ['out', '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/>'],
];
function buildDeck() {
  const o = $('#deck'); o.innerHTML = '';
  const { W: w, H: h, R, ex, ey } = DK;
  // perspective floor grid under the deck
  dEl('L floor-grid', `left:-230px;top:-170px;width:${w + 460}px;height:${h + 340}px;transform:translateZ(-1px)`, o);
  // graphite pedestal
  slab(o, { w, h, r: R, z0: 0, depth: 12, n: 12, inset: (t) => 22 - t * 4, bg: (t) => `linear-gradient(90deg,#0d0c13,${mixHex('#2a2836', '#3c3a4c', t)} 30%,${mixHex('#4c4a5e', '#6a6680', t)} 46%,#242230 70%,#0b0a10)` });
  dEl('L', `left:18px;top:18px;width:${w - 36}px;height:${h - 36}px;border-radius:${R - 18}px;transform:translateZ(12.5px);background:radial-gradient(closest-side,#2a2442,#0d0b16);box-shadow:inset 0 0 0 1.5px #d6c8ff,0 0 18px 3px rgba(200,180,255,.6)`, o);
  // light rims in the levitation gap (space between stays dark)
  dEl('L', `left:40px;top:40px;width:${w - 80}px;height:${h - 80}px;border-radius:${R - 40}px;transform:translateZ(13px);background:radial-gradient(closest-side,rgba(205,185,255,.55),rgba(140,120,255,.12) 60%,transparent);filter:blur(4px)`, o);
  for (let i = 0; i < 12; i++) dEl('L gaprim', `left:24px;top:24px;width:${w - 48}px;height:${h - 48}px;border-radius:${R - 24}px;transform:translateZ(${14 + i * 2.3}px);border:1px solid rgba(214,198,255,${(0.55 - i * 0.035).toFixed(3)});box-shadow:0 0 ${6 + i}px rgba(190,170,255,${(0.35 - i * 0.025).toFixed(3)})`, o);
  // floating pearl-glass plate
  slab(o, { w, h, r: R, z0: 42, depth: 10, n: 12, inset: (t) => 3 * (1 - t), bg: (t) => `linear-gradient(90deg,rgba(150,140,190,.55),rgba(235,230,250,${(0.55 + t * 0.3).toFixed(2)}) 34%,rgba(255,255,255,${(0.6 + t * 0.3).toFixed(2)}) 46%,rgba(200,192,225,.55) 70%,rgba(120,110,160,.5))` });
  dEl('L', `left:0;top:0;width:${w}px;height:${h}px;border-radius:${R}px;transform:translateZ(42px);box-shadow:0 0 0 1px rgba(214,200,255,.9),0 0 16px 2px rgba(200,180,255,.55)`, o);
  const top = dEl('L', `left:0;top:0;width:${w}px;height:${h}px;border-radius:${R}px;transform:translateZ(${DK.plateZ}px);background:radial-gradient(110% 90% at 25% 0%,rgba(255,255,255,.94) 0%,rgba(246,243,252,.82) 40%,rgba(225,220,240,.78) 100%);box-shadow:inset 0 0 0 1.2px rgba(255,255,255,.95),inset 0 0 0 3px rgba(200,180,255,.35),inset 0 -8px 18px rgba(150,130,210,.25)`, o);
  // chip slit
  dEl('face dk-slit', `left:${DK.slitX - 62}px;top:${DK.slitY - 4}px;width:124px;height:8px;border-radius:4px;background:#0b0915;box-shadow:inset 0 2px 3px #000,0 0 0 1px rgba(200,180,255,.7),0 0 12px rgba(200,180,255,.8)`, top);
  // ripple used when a chip locks / releases
  dEl('face dk-ripple', `left:${DK.slitX - 40}px;top:${DK.slitY - 40}px;width:80px;height:80px;inset:auto`, top).id = 'dkRipple';
  // light UI printed on the plate
  top.insertAdjacentHTML('beforeend', `<div class="dk-ui">
    <div class="dk-status" id="dkStatus">VOICE CORE · STANDBY</div>
    <div class="dk-name" id="dkName">メモリを挿入</div>
    <div class="dk-info" id="dkInfo">—</div>
    <div class="dk-vol" id="dkVol"><i id="dkVolFill"></i><b id="dkVolKnob"></b></div>
    <div class="dk-icons">${DK_ICONS.map(([k, d]) => `<svg viewBox="0 0 24 24" class="${k}" data-ic="${k}">${d}</svg>`).join('')}</div>
  </div>`);
  // emitter: a raised collar grown out of the plate, with a recessed lens
  dEl('face', `left:${ex - 60}px;top:${ey - 60}px;width:120px;height:120px;border-radius:50%;background:radial-gradient(closest-side,transparent 72%,rgba(70,55,120,.35) 80%,transparent 100%)`, top);
  ring3d(o, { cx: ex, cy: ey, R: 48, thick: 13, z0: 52.5, depth: 9, n: 12, bg: (t) => `linear-gradient(90deg,${mixHex('#8d88a6', '#c9c4da', t)},#ffffff 42%,${mixHex('#d6d1e4', '#f4f1fa', t)} 60%,${mixHex('#7a7592', '#b2adc6', t)})` });
  ring3d(o, { cx: ex, cy: ey, R: 48, thick: 13, z0: 61.8, depth: 0, n: 1, bg: () => 'repeating-conic-gradient(#ffffff 0 1.5deg,#e4dfef 1.5deg 3deg)' });
  dEl('L', `left:${ex - 48}px;top:${ey - 48}px;width:96px;height:96px;border-radius:50%;transform:translateZ(62px);box-shadow:inset 0 0 0 1px rgba(255,255,255,.95),0 0 0 .6px rgba(150,140,190,.6)`, o);
  ring3d(o, { cx: ex, cy: ey, R: 36, thick: 2, z0: 55, depth: 6.5, n: 6, bg: () => 'linear-gradient(180deg,#2a2240,#0d0a18)' });
  dEl('L dk-lens', `left:${ex - 35}px;top:${ey - 35}px;width:70px;height:70px;border-radius:50%;transform:translateZ(55.5px);background:radial-gradient(circle,#ffffff 0%,#efe8ff 14%,#a68dff 36%,#3a2c66 62%,#120e22 100%);box-shadow:inset 0 0 0 1px rgba(255,255,255,.5),inset 0 4px 10px rgba(0,0,0,.6),0 0 22px rgba(185,165,255,.8)`, o).id = 'dkLens';
  dEl('L', `left:${ex - 60}px;top:${ey - 60}px;width:120px;height:120px;border-radius:50%;transform:translateZ(62.3px);background:radial-gradient(closest-side,rgba(200,180,255,0) 56%,rgba(205,185,255,.30) 62%,transparent 74%)`, o);
  // hologram plane (stands on the lens, turned to face the viewer)
  const V = dEl('p3 holo', `left:${ex - 110}px;top:${ey - 230}px;width:220px;height:230px;transform-origin:50% 100%;transform:translateZ(56px) rotateZ(18deg) rotateX(-90deg)`, o);
  const rise = dEl('holo-rise', '', V);
  rise.innerHTML = `<svg viewBox="0 0 220 230" width="220" height="230" style="position:absolute;inset:0"><defs><linearGradient id="dkcn" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#f1ebff" stop-opacity=".8"/><stop offset=".6" stop-color="#d6c8ff" stop-opacity=".26"/><stop offset="1" stop-color="#d6c8ff" stop-opacity="0"/></linearGradient><filter id="dkbb"><feGaussianBlur stdDeviation="2.6"/></filter></defs>
      <polygon points="82,230 138,230 182,96 38,96" fill="url(#dkcn)" filter="url(#dkbb)"/><polygon points="100,230 120,230 146,110 74,110" fill="url(#dkcn)" opacity=".8" filter="url(#dkbb)"/>
      ${[-3, -1, 1, 3].map((k) => `<line x1="${110 + k * 3}" y1="228" x2="${110 + k * 22}" y2="104" stroke="#fff" stroke-opacity=".18" stroke-width=".8"/>`).join('')}
      <ellipse cx="110" cy="228" rx="28" ry="4" fill="#fff" opacity=".75" filter="url(#dkbb)"/></svg>
    ${Array.from({ length: 10 }, (_, i) => `<i class="pt" style="left:${86 + ((i * 23) % 48)}px;top:${170 + ((i * 13) % 50)}px;animation-duration:${(2.6 + ((i * 0.41) % 3)).toFixed(2)}s;animation-delay:${((i * 0.41) % 3).toFixed(2)}s"></i>`).join('')}
    <canvas id="holoCv" width="320" height="320"></canvas>
    <div class="holo-scan"></div>
    <div class="holo-text"><span class="c" id="hoCode">VX-00</span><span class="n" id="hoName"></span><span class="i" id="hoInfo"></span></div>`;
  // chip link light + the chip itself: both parallel to the slit (deck x-axis), standing upright
  const link = dEl('p3 chip-link', `left:${DK.slitX - 56}px;top:${DK.slitY - 40}px;width:112px;height:40px;transform-origin:50% 100%;transform:translateZ(${DK.plateZ + 0.5}px) rotateX(-90deg)`, o);
  link.innerHTML = `<svg viewBox="0 0 112 40" width="112" height="40"><defs><linearGradient id="dklb" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#efe8ff" stop-opacity=".9"/><stop offset="1" stop-color="#c8b4ff" stop-opacity="0"/></linearGradient></defs><rect x="0" y="0" width="112" height="40" fill="url(#dklb)" opacity=".28"/>${[14, 34, 56, 78, 98].map((x) => `<rect x="${x}" y="2" width=".8" height="38" fill="#fff" opacity=".55"/>`).join('')}</svg>`;
  link.style.webkitMaskImage = link.style.maskImage = 'linear-gradient(90deg,transparent,#000 18%,#000 82%,transparent)';
  dEl('p3 chip3d', `left:${DK.slitX - 60}px;top:${DK.slitY - 166}px;width:120px;height:166px;transform-origin:50% 100%;transform:${chipTransform(DK.chipLift)}`, o).id = 'chip3d';
}
// The chip stands in the slit plane; z is how high its bottom edge sits above the plate (negative = inside the slit).
function chipTransform(lift) { return `translateZ(${(DK.plateZ - DK.chipSink + lift).toFixed(1)}px) rotateX(-90deg) scale(${DK.chipScale})`; }

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
  sizeHolo();
  requestAnimationFrame(placeHits);
}
// lay transparent 2D buttons over parts of the 3D deck (stage coordinates)
function placeHits() {
  const stage = $('#stage'); if (!stage || !W.scale) return;
  const sr = stage.getBoundingClientRect();
  const put = (id, el, pad = 0, show = true) => {
    const hit = $('#' + id); if (!hit) return;
    if (!el || !show) { hit.style.display = 'none'; return; }
    const r = el.getBoundingClientRect();
    if (!r.width) { hit.style.display = 'none'; return; }
    hit.style.display = '';
    hit.style.left = ((r.left - sr.left) / W.scale - pad) + 'px';
    hit.style.top = ((r.top - sr.top) / W.scale - pad) + 'px';
    hit.style.width = (r.width / W.scale + pad * 2) + 'px';
    hit.style.height = (r.height / W.scale + pad * 2) + 'px';
  };
  put('hitCore', $('#dkLens'), 16);
  put('hitVol', $('#dkVol'), 14);
  put('hitChip', $('#chip3d .chip'), 0, !!S.insertedId && !W.inserting);
  measureSlit(); drawGuide();
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
    const x = sg * (a <= 1 ? a * STEP : STEP + (a - 1) * 48);
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
  $('#hitCore').addEventListener('click', toggleConvert);
  $('#kMon').addEventListener('click', () => {
    S.monitor = !S.monitor; VoxEngine.setMonitor(S.monitor); saveSettings(); updateDriver();
    toast(S.monitor ? 'モニターON：変換後の声を自分で聴けます（イヤホン推奨）' : 'モニターOFF：録音・出力のみ');
  });
  $('#kRec').addEventListener('click', toggleRec);
  $('#kFx').addEventListener('click', () => go('fx'));
  $('#casePill').addEventListener('click', openCasePicker);
  $('#hitChip').addEventListener('click', () => { if (!W.inserting && S.insertedId) ejectChip(false); });
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

/* ---- chip insertion choreography ----
 * pick up (anticipation) → fly on an arc with a light trail, tilting into the deck's angle →
 * phase-shift flash at the hover point (2D card hands over to the 3D chip) → slide straight down
 * into the slit → lock (click, dip, ripple, slit flash) → hologram boots.
 */
function setChip3d(chip) {
  const c3 = $('#chip3d');
  c3.innerHTML = chip ? chipHTML(chip) : '';
  c3.dataset.id = chip ? chip.id : '';
}
function syncSlotChip() {
  if (W.inserting) return;
  const chip = chipById(S.insertedId);
  const c3 = $('#chip3d'); if (!c3) return;
  if (!chip) { setChip3d(null); c3.classList.remove('on'); }
  else {
    if (c3.dataset.id !== chip.id || !c3.innerHTML) setChip3d(chip);
    else c3.innerHTML = chipHTML(chip);
    c3.style.transform = chipTransform(0);
    c3.classList.add('on');
  }
  requestAnimationFrame(placeHits);
}
const ctr = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height });
function flyClone(chip, r, cls = '') {
  const el = document.createElement('div');
  el.className = 'fly-chip ' + cls;
  el.style.width = r.width + 'px'; el.style.height = r.height + 'px';
  el.style.fontSize = (r.width / 10) + 'px';
  el.innerHTML = chipHTML(chip);
  el.style.transform = `translate(${r.left}px,${r.top}px)`;
  document.body.append(el);
  return el;
}
// a keyframe that places the clone's centre at (x,y) with size scale k and a 3D attitude
const kf = (from, x, y, k, rx = 0, ry = 0, rz = 0, extra = {}) => Object.assign({ transform: `translate(${(x - from.w / 2).toFixed(1)}px,${(y - from.h / 2).toFixed(1)}px) perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg) scale(${k.toFixed(3)})` }, extra);
function burst(x, y, size, color = '#d6c8ff') {
  const b = document.createElement('div');
  b.className = 'burst';
  b.style.cssText = `left:${x - size / 2}px;top:${y - size / 2}px;width:${size}px;height:${size}px;--bc:${color}`;
  document.body.append(b);
  const a = b.animate([{ transform: 'scale(.25)', opacity: 1 }, { transform: 'scale(1.5)', opacity: 0 }], { duration: S.reduceMotion ? 1 : 420, easing: 'cubic-bezier(.2,.8,.3,1)' });
  a.onfinish = () => b.remove();
}
function ripple() {
  const r = $('#dkRipple'); if (!r || S.reduceMotion) return;
  r.animate([{ transform: 'scale(.2)', opacity: 1 }, { transform: 'scale(3.2)', opacity: 0 }], { duration: 650, easing: 'cubic-bezier(.2,.8,.3,1)' });
}
// fly a card along an arc between two screen rects, with a fading light trail
async function flyPath(chip, from, to, { dur = 520, outbound = true } = {}) {
  const A = ctr(from), B = ctr(to);
  const k = B.w / A.w;
  // attitude of the seated chip (leans back and turns with the deck) vs. the flat wheel card
  const tiltTo = outbound ? [22, -16, -2] : [0, 0, 0], tiltFrom = outbound ? [0, 0, 0] : [22, -16, -2];
  const midX = A.x + (B.x - A.x) * 0.45 + (outbound ? -26 : 26), midY = Math.min(A.y, B.y) + (B.y - A.y) * 0.3 - 30;
  const frames = outbound ? [
    kf(A, A.x, A.y, 1.06, ...tiltFrom, { offset: 0 }),
    kf(A, midX, midY, 1.1, (tiltFrom[0] + tiltTo[0]) / 2, (tiltFrom[1] + tiltTo[1]) / 2, -6, { offset: 0.45 }),
    kf(A, B.x, B.y, k, ...tiltTo, { offset: 1 }),
  ] : [
    // return trip: float up out of the deck, glide home on a wide arc, ease in and settle
    kf(A, A.x, A.y, 1, ...tiltFrom, { offset: 0 }),
    kf(A, A.x + (B.x - A.x) * 0.15, A.y - 34, 1.08, tiltFrom[0] * 0.6, tiltFrom[1] * 0.6, 4, { offset: 0.22 }),
    kf(A, midX, midY - 10, (1 + k) / 2 * 1.06, 6, -4, 3, { offset: 0.55 }),
    kf(A, B.x, B.y - 8, k * 1.04, 0, 0, 0, { offset: 0.86 }),
    kf(A, B.x, B.y, k, 0, 0, 0, { offset: 1 }),
  ];
  const easing = outbound ? 'cubic-bezier(.45,.05,.25,1)' : 'cubic-bezier(.45,0,.25,1)';
  const ghosts = S.reduceMotion ? [] : [0.42, 0.24, 0.12].map((op, i) => {
    const g = flyClone(chip, from, 'ghost');
    g.style.opacity = op;
    g.animate(frames, { duration: dur, delay: (i + 1) * 34, easing, fill: 'both' }).onfinish = () => g.remove();
    return g;
  });
  const main = flyClone(chip, from, 'lead');
  const a = main.animate(frames, { duration: S.reduceMotion ? 1 : dur, easing, fill: 'forwards' });
  try { await a.finished; } catch (e) {}
  return { main, ghosts };
}
async function animateLift(c3, from, to, dur, easing) {
  const a = c3.animate([{ transform: chipTransform(from) }, { transform: chipTransform(to) }], { duration: S.reduceMotion ? 1 : dur, easing, fill: 'forwards' });
  try { await a.finished; } catch (e) {}
  c3.style.transform = chipTransform(to);
  try { a.cancel(); } catch (e) {}
}
function contactFx() {
  const d = $('#deck');
  VoxEngine.sfx('insert');
  d.classList.remove('thunk'); void d.offsetWidth; d.classList.add('thunk');
  ripple();
  try { navigator.vibrate && navigator.vibrate(18); } catch (e) {}
}
async function insertCurrent() {
  const ci = centerIndex();
  const chip = W.list[ci];
  if (!chip || W.inserting) return;
  if (S.insertedId && S.insertedId !== chip.id) await ejectChip(true);
  W.inserting = true;
  const deck = $('#deck');
  const card = W.cards[ci];
  const from = card.querySelector('.chip').getBoundingClientRect();
  card.classList.remove('dragging');
  W.dragCard = null; W.dragY = 0;
  S.insertedId = chip.id;
  layoutWheel();
  drawGuide();
  const c3 = $('#chip3d');
  setChip3d(chip);
  c3.classList.remove('on');
  c3.style.transform = chipTransform(DK.chipLift);
  const to = c3.querySelector('.chip').getBoundingClientRect();
  deck.classList.add('armed');
  VoxEngine.sfx('tick');
  // 1) flight
  const { main } = await flyPath(chip, from, to, { dur: 520, outbound: true });
  // 2) phase-shift: flash, cross-fade 2D → 3D
  const B = ctr(to);
  burst(B.x, B.y, to.width * 1.6);
  c3.classList.add('on', 'materialize');
  main.animate([{ opacity: 1, filter: 'brightness(1.8)' }, { opacity: 0, filter: 'brightness(3)' }], { duration: S.reduceMotion ? 1 : 160, fill: 'forwards' }).onfinish = () => main.remove();
  await sleep(S.reduceMotion ? 0 : 90);
  // 3) slide down the slit axis, 4) lock
  deck.classList.add('inserting');
  await animateLift(c3, DK.chipLift, -5, 260, 'cubic-bezier(.6,0,.9,.5)');
  contactFx();
  deck.classList.remove('armed', 'inserting');
  c3.classList.remove('materialize');
  await animateLift(c3, -5, 0, 180, 'cubic-bezier(.2,.9,.3,1.4)');
  // 5) hologram boots
  W.bootT = performance.now();
  deck.classList.add('loaded', 'booting');
  setTimeout(() => deck.classList.remove('booting'), 900);
  W.inserting = false;
  saveSettings(); applyParams(); updateDriver(); placeHits();
  if (VoxEngine.status.state === 'live') toast(`「${chip.name}」の声に切り替えました`);
}
async function ejectChip(quick) {
  const id = S.insertedId;
  const c3 = $('#chip3d');
  if (!id || !c3) { S.insertedId = null; updateDriver(); return; }
  const deck = $('#deck');
  W.inserting = true;
  $('#hitChip').style.display = 'none';
  const chip = chipById(id);
  const i = W.list.findIndex((c) => c.id === id);
  // bring the chip's home slot to the centre while the deck releases it
  let rot = Promise.resolve();
  if (!quick && i >= 0 && i !== centerIndex()) {
    const n = W.cards.length;
    rot = new Promise((r) => animateTo(Math.round(W.pos + (n >= 4 ? wrapD(i - W.pos, n) : i - W.pos)), r));
  }
  // 1) hologram collapses into the lens
  deck.classList.add('collapsing');
  deck.classList.remove('loaded');
  await sleep(S.reduceMotion ? 0 : 180);
  // 2) release: the slot pushes the chip up and it hangs for a beat
  VoxEngine.sfx('eject');
  ripple();
  deck.classList.add('releasing');
  await animateLift(c3, 0, quick ? 60 : DK.chipLift, quick ? 220 : 420, 'cubic-bezier(.15,.85,.3,1.15)');
  deck.classList.remove('releasing', 'collapsing');
  if (quick) {
    const r = c3.querySelector('.chip').getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, r.width * 1.4);
    c3.classList.remove('on'); setChip3d(null);
    S.insertedId = null; W.inserting = false; layoutWheel(); updateDriver(); drawGuide();
    return;
  }
  await rot;
  await sleep(S.reduceMotion ? 0 : 90);
  // 3) phase back to a card and glide home
  const from = c3.querySelector('.chip').getBoundingClientRect();
  const card = i >= 0 ? W.cards[i] : null;
  const target = card ? card.querySelector('.chip').getBoundingClientRect() : null;
  burst(from.left + from.width / 2, from.top + from.height / 2, from.width * 1.3);
  c3.animate([{ opacity: 1 }, { opacity: 0 }], { duration: S.reduceMotion ? 1 : 140, fill: 'forwards' }).onfinish = () => { c3.classList.remove('on'); setChip3d(null); c3.getAnimations().forEach((x) => x.cancel()); };
  if (chip && target) {
    const { main } = await flyPath(chip, from, target, { dur: 680, outbound: false });
    // 4) land: the wheel card fades in under the arriving clone, then the clone dissolves
    S.insertedId = null;
    layoutWheel();
    card.classList.add('landing');
    setTimeout(() => card.classList.remove('landing'), 520);
    VoxEngine.sfx('tick');
    main.animate([{ opacity: 1 }, { opacity: 0 }], { duration: S.reduceMotion ? 1 : 260, easing: 'ease-out', fill: 'forwards' }).onfinish = () => main.remove();
  }
  S.insertedId = null;
  W.inserting = false;
  saveSettings(); applyParams();
  layoutWheel(); updateDriver(); drawGuide();
}

/* ---- guide light from the wheel to the slit ---- */
let slitPt = null;
function measureSlit() {
  const stage = $('#stage'), slit = $('#deck .dk-slit');
  if (!stage || !slit || !W.scale) return;
  const sr = stage.getBoundingClientRect(), r = slit.getBoundingClientRect();
  slitPt = { x: (r.left + r.width / 2 - sr.left) / W.scale, y: (r.top + r.height / 2 - sr.top) / W.scale };
}
function drawGuide() {
  const g = $('#guide'); if (!g || !slitPt) return;
  const show = !S.insertedId && W.list.length;
  g.classList.toggle('show', !!show);
  const sx = 195, sy = 222, ex = slitPt.x, ey = slitPt.y - 6;
  const d = `M${sx} ${sy} C ${sx} ${sy + 70}, ${ex} ${ey - 90}, ${ex} ${ey}`;
  $('#guidePath').setAttribute('d', d);
  // while dragging, a bright beam reaches from the card to the slit
  const k = clamp((W.dragY || 0) / 90, 0, 1);
  g.style.setProperty('--k', k.toFixed(3));
  const by = sy + (W.dragY || 0);
  $('#guideBeam').setAttribute('d', `M${sx} ${by} C ${sx} ${by + 40}, ${ex} ${ey - 50}, ${ex} ${ey}`);
  $('#guideDot').setAttribute('cx', ex); $('#guideDot').setAttribute('cy', ey);
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
  $('#kConv').classList.toggle('on', live);
  $('#kConvTxt').textContent = live ? '変換中' : st.state === 'starting' ? '起動中…' : '変換 ON';
  $('#kMon').classList.toggle('on', S.monitor);
  $('#kRec').classList.toggle('on', rec);
  $('#kFx').classList.toggle('on', S.fx.length > 0);
  const ic = { mon: S.monitor, rec, fx: S.fx.length > 0, out: !!st.sinkId };
  $$('#deck [data-ic]').forEach((s) => s.classList.toggle('on', !!ic[s.dataset.ic]));
  $('#dkName').textContent = chip ? chip.name : 'メモリを挿入';
  const tag = chip ? (chip.tag || KIND_TAG[chip.kind] || 'MEMORY') : '';
  $('#hoCode').textContent = chip ? `VX-${String(S.chips.indexOf(chip) + 1).padStart(2, '0')} · ${tag}` : '';
  $('#hoName').textContent = chip ? chip.name : '';
  updateVol();
}

/* hologram canvas: circular spectrum driven by the converted voice */
let hoCtx = null, hoSize = 0;
const freqBuf = new Uint8Array(1024);
const waveBuf = new Float32Array(2048);
function sizeHolo() {
  const c = $('#holoCv'); if (!c) return;
  const dpr = Math.min(3, (window.devicePixelRatio || 1) * (W.scale || 1));
  hoSize = Math.round(160 * dpr);
  c.width = c.height = hoSize; hoCtx = c.getContext('2d');
}
let lastScr = 0;
const HOLO_N = 84;
const holoVals = new Float32Array(HOLO_N);
function screenLoop(t) {
  requestAnimationFrame(screenLoop);
  if (S.tab !== 'home' || t - lastScr < 33) return;
  lastScr = t;
  if (!hoCtx) sizeHolo();
  if (!hoCtx) return;
  const st = VoxEngine.status, live = st.state === 'live', chip = chipById(S.insertedId);
  const stage = $('#stage');
  // level + spectrum
  let lvNow = 0;
  if (live && st.outAnalyser) {
    st.outAnalyser.getFloatTimeDomainData(waveBuf);
    let pk = 0; for (let i = 0; i < 1024; i += 2) pk = Math.max(pk, Math.abs(waveBuf[i]));
    lvNow = Math.min(1, pk * 1.4);
    st.outAnalyser.getByteFrequencyData(freqBuf);
  }
  W.lv = W.lv * 0.7 + lvNow * 0.3;
  stage.style.setProperty('--lv', W.lv.toFixed(3));
  const half = HOLO_N / 2;
  for (let i = 0; i < HOLO_N; i++) {
    let target;
    if (live && st.outAnalyser) {
      const k = i < half ? i : HOLO_N - 1 - i; // mirror: low freqs at the top, symmetric ring
      const bin = Math.floor(2 + Math.pow(k / half, 1.6) * 180);
      target = freqBuf[bin] / 255;
    } else {
      target = 0.18 + 0.12 * Math.sin(t / 700 + i * 0.45) * Math.cos(t / 1100 + i * 0.13);
    }
    holoVals[i] += (target - holoVals[i]) * 0.35;
  }
  if (chip) {
    const g = hoCtx, S2 = hoSize, c = S2 / 2;
    g.clearRect(0, 0, S2, S2);
    const r1 = S2 * 0.36, len = S2 * 0.12;
    const draw = (col, ox, alpha, width) => {
      g.globalAlpha = alpha; g.lineWidth = width; g.lineCap = 'round';
      for (let i = 0; i < HOLO_N; i++) {
        const a = (i / HOLO_N) * Math.PI * 2 - Math.PI / 2;
        const ang = (i / HOLO_N + 0.75) % 1; const v = clamp(holoVals[i], 0.06, 1) * (boot >= 1 ? 1 : clamp((boot - ang * 0.6) * 3, 0, 1));
        g.strokeStyle = typeof col === 'function' ? col(a) : col;
        g.beginPath();
        g.moveTo(c + ox + Math.cos(a) * r1, c + Math.sin(a) * r1);
        g.lineTo(c + ox + Math.cos(a) * (r1 + v * len), c + Math.sin(a) * (r1 + v * len));
        g.stroke();
      }
      g.globalAlpha = 1;
    };
    const boot = W.bootT ? clamp((performance.now() - W.bootT) / 700, 0, 1) : 1;
    const base = chip.color || '#c8b4ff';
    draw('#7fe8ff', S2 * 0.012, 0.3, S2 / 140);
    g.shadowColor = base; g.shadowBlur = S2 / 40;
    draw((a) => mixHex(mixHex(base, '#ffffff', 0.35), '#ffb3e2', (Math.sin(a) + 1) / 2), 0, 1, S2 / 150);
    g.shadowBlur = 0;
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = S2 / 300;
    g.beginPath(); g.arc(c, c, S2 * 0.325, 0, Math.PI * 2); g.stroke();
    g.save(); g.translate(c, c); g.rotate(t / 1900);
    g.strokeStyle = 'rgba(230,220,255,.75)'; g.setLineDash([S2 * 0.25, S2 * 0.075, S2 * 0.025, S2 * 0.075]);
    g.beginPath(); g.arc(0, 0, S2 * 0.29, 0, Math.PI * 2); g.stroke(); g.restore(); g.setLineDash([]);
  }
  // texts on the plate + hologram
  const rec = VoxEngine.recording();
  const status = !chip ? 'VOICE CORE · STANDBY' : rec ? 'VOICE CORE · ● REC ' + fmtSec((Date.now() - st.recStart) / 1000) : live ? 'VOICE CORE · LIVE' : 'VOICE CORE · LINKED';
  const db = W.lv > 0.001 ? Math.round(20 * Math.log10(W.lv)) : null;
  let info = '—', hinfo = '';
  if (chip) {
    const pp = combinedParams();
    info = pp.robotHz ? `ROBO ${Math.round(pp.robotHz)}Hz · TONE ${signed(pp.formant, 1)}` : `PITCH ${signed(pp.pitch, 1)} · TONE ${signed(pp.formant, 1)}`;
    hinfo = live ? 'TAP CORE TO STOP' : 'TAP CORE TO CONVERT';
  }
  if (live) { const f = st.f0 ? `${Math.round(st.f0)} Hz · ♪ ${noteName(st.f0)}` : '— Hz'; info = f + (db !== null ? ` · ${db} dB` : ''); hinfo = st.f0 ? f : 'LISTENING…'; }
  if (W.volFlash && t - W.volFlash < 1200) info = 'VOLUME ' + Math.round((S.volume / 1.5) * 100) + '%';
  const set = (id, v) => { const e = $('#' + id); if (e && e.textContent !== v) e.textContent = v; };
  set('dkStatus', status); set('dkInfo', info); set('hoInfo', hinfo);
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
