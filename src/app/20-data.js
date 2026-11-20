/* ===== built-in content ===== */
const ASSET = window.VOXM_ASSETS || {};
const COLORS = ['#a487ff', '#7fdcff', '#ff7ab6', '#ffb86b', '#5fe0a8', '#ff6b81', '#c3ff6b', '#8fa2ff'];

// Voice profile parameters (all optional): pitch/formant in semitones, robotHz, ring 0-1, ringHz,
// lowcut/highcut Hz, bass/presence dB, drive/chorus/echo/reverb 0-1
const BUILTIN_CHIPS = [
  { id: 'c_friendA', name: '友達Aの声', kind: 'friend', tag: 'FRIEND', photo: 'friendA', color: '#ffb86b', demo: true, profile: { pitch: 3, formant: 1.6, presence: 1.5 } },
  { id: 'c_friendB', name: '友達Bの声', kind: 'friend', tag: 'FRIEND', photo: 'friendB', color: '#7fdcff', demo: true, profile: { pitch: -2.5, formant: -1, bass: 1.5 } },
  { id: 'c_android', name: 'ANDROID', kind: 'character', tag: 'SYNTH', art: 'robot', color: '#7fdcff', profile: { robotHz: 112, ring: 0.18, ringHz: 55, presence: 3, chorus: 0.15 } },
  { id: 'c_nebula', name: '宇宙人', kind: 'character', tag: 'COSMIC', art: 'alien', color: '#5fe0a8', profile: { pitch: 4, formant: 3, ring: 0.45, ringHz: 31, reverb: 0.28 } },
  { id: 'c_phantom', name: 'PHANTOM', kind: 'character', tag: 'SPECTRAL', art: 'ghost', color: '#8fa2ff', profile: { pitch: -1, formant: 0.5, chorus: 0.7, reverb: 0.6, echo: 0.25, lowcut: 260 } },
  { id: 'c_monster', name: 'モンスター', kind: 'character', tag: 'BEAST', art: 'monster', color: '#ff6b81', profile: { pitch: -7, formant: -3.5, drive: 0.32, bass: 4 } },
  { id: 'c_angel', name: '天使', kind: 'character', tag: 'HOLY', art: 'angel', color: '#ffe08a', profile: { pitch: 4, formant: 1.5, reverb: 0.55, chorus: 0.35, presence: 2 } },
  { id: 'c_helium', name: 'ヘリウム', kind: 'fx', tag: 'HIGH TONE', art: 'helium', color: '#ff7ab6', profile: { pitch: 9, formant: 5 } },
  { id: 'c_radio', name: 'ラジオ無線', kind: 'fx', tag: 'VINTAGE', art: 'radio', color: '#c3ff6b', profile: { lowcut: 520, highcut: 3000, drive: 0.25, presence: 5 } },
];
const BUILTIN_CASES = [
  { id: 'k_friends', name: 'フレンズ', color: '#ffb86b', chipIds: ['c_friendA', 'c_friendB'] },
  { id: 'k_chara', name: 'キャラクター', color: '#a487ff', chipIds: ['c_android', 'c_nebula', 'c_phantom', 'c_monster', 'c_angel'] },
  { id: 'k_fx', name: 'エフェクト', color: '#ff7ab6', chipIds: ['c_helium', 'c_radio'] },
];
const KIND_LABEL = { friend: '友達', self: '自分', character: 'キャラ', fx: 'エフェクト' };
const KIND_TAG = { friend: 'FRIEND', self: 'MY VOICE', character: 'CHARACTER', fx: 'EFFECT' };

const FX_LIB = [
  { id: 'echo', name: 'ECHO', sub: 'やまびこ', icon: 'echo', color: '#7fdcff', p: { echo: 0.6 } },
  { id: 'hall', name: 'HALL', sub: '大ホール残響', icon: 'hall', color: '#a487ff', p: { reverb: 0.65 } },
  { id: 'robot', name: 'ROBOT', sub: '機械の抑揚', icon: 'robot', color: '#8fa2ff', p: { robotHz: 118, ring: 0.15, ringHz: 60 } },
  { id: 'alien', name: 'ALIEN', sub: '電子のゆらぎ', icon: 'alien', color: '#5fe0a8', p: { ring: 0.5, ringHz: 33, pitch: 1.5 } },
  { id: 'radio', name: 'RADIO', sub: '無線・電話', icon: 'radio', color: '#c3ff6b', p: { lowcut: 520, highcut: 3000, drive: 0.25, presence: 5 } },
  { id: 'double', name: 'DOUBLER', sub: '二重の声', icon: 'doubler', color: '#ff7ab6', p: { chorus: 0.75 } },
  { id: 'drive', name: 'DRIVE', sub: 'ガサついた迫力', icon: 'drive', color: '#ff6b81', p: { drive: 0.55, bass: 3 } },
  { id: 'high', name: 'HIGH', sub: '高く・小さく', icon: 'up', color: '#ffe08a', p: { pitch: 5, formant: 2.5 } },
  { id: 'low', name: 'LOW', sub: '低く・大きく', icon: 'downArrow', color: '#ffb86b', p: { pitch: -5, formant: -2.5 } },
];

const SAMPLE_SCRIPT = 'こんにちは。今日はいい天気ですね。あいうえお、かきくけこ。私の声をボイスメモリに記録します。好きな食べ物はカレーライスで、休みの日は散歩をしています。ありがとう、またね。';

/* ===== state ===== */
const S = {
  tab: 'home',
  chips: [], cases: [],
  selectedId: 'c_friendA', insertedId: null,
  homeCase: 'all',
  fx: [], // [{id, amt}]
  fineTune: 0,
  monitor: true, volume: 0.8, safeMode: true, noiseSup: false, reduceMotion: false, ticks: true,
  baseline: null, // {f0, env, envSr, at, blobKey}
  recordings: [],
  memTab: 'chips', memQuery: '', memKind: 'all',
  persistent: false,
};

async function loadAll() {
  S.persistent = await VoxStore.init();
  const [chips, cases, kv, recs] = await Promise.all([VoxStore.all('chips'), VoxStore.all('cases'), VoxStore.get('kv', 'settings'), VoxStore.all('recordings')]);
  const builtinIds = new Set(BUILTIN_CHIPS.map((c) => c.id));
  const stored = new Map((chips || []).map((c) => [c.id, c]));
  const removed = new Set((kv && kv.removedBuiltins) || []);
  S.chips = [
    ...BUILTIN_CHIPS.filter((c) => !removed.has(c.id)).map((c) => {
      const sv = stored.get(c.id);
      if (sv && sv.builtin === false) return sv; // user-customised copy of a built-in
      return Object.assign({ builtin: true, favorite: false, createdAt: 0 }, c, sv ? { favorite: !!sv.favorite } : {});
    }),
    ...(chips || []).filter((c) => !builtinIds.has(c.id)).sort((a, b) => a.createdAt - b.createdAt),
  ];
  S.removedBuiltins = [...removed];
  S.cases = cases && cases.length ? cases.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) : BUILTIN_CASES.map((c, i) => Object.assign({ order: i, createdAt: 0 }, c));
  if (kv) for (const k of ['selectedId', 'insertedId', 'homeCase', 'fx', 'fineTune', 'monitor', 'volume', 'safeMode', 'noiseSup', 'reduceMotion', 'ticks', 'baseline']) if (k in kv) S[k] = kv[k];
  if (!chipById(S.selectedId)) S.selectedId = S.chips[0]?.id || null;
  if (S.insertedId && !chipById(S.insertedId)) S.insertedId = null;
  if (S.homeCase !== 'all' && !S.cases.find((c) => c.id === S.homeCase)) S.homeCase = 'all';
  S.recordings = (recs || []).sort((a, b) => b.createdAt - a.createdAt);
}
let saveTimer = 0;
function saveSettings() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const kv = {};
    for (const k of ['selectedId', 'insertedId', 'homeCase', 'fx', 'fineTune', 'monitor', 'volume', 'safeMode', 'noiseSup', 'reduceMotion', 'ticks', 'baseline']) kv[k] = S[k];
    kv.removedBuiltins = S.removedBuiltins || [];
    VoxStore.put('kv', 'settings', kv);
  }, 200);
}
function saveChip(c) { VoxStore.put('chips', c.id, c); }
function saveCase(k) { VoxStore.put('cases', k.id, k); }
function saveAllCases() { S.cases.forEach((k, i) => { k.order = i; saveCase(k); }); }

const chipById = (id) => S.chips.find((c) => c.id === id) || null;
const caseById = (id) => S.cases.find((c) => c.id === id) || null;
const casesOf = (chipId) => S.cases.filter((k) => k.chipIds.includes(chipId));
function wheelList() {
  if (S.homeCase === 'all') return S.chips;
  const k = caseById(S.homeCase);
  const list = k ? k.chipIds.map(chipById).filter(Boolean) : [];
  return list.length ? list : S.chips;
}

/* ===== voice parameters ===== */
function combinedParams() {
  const chip = chipById(S.insertedId);
  const p = Object.assign({}, VoxEngine.DEFAULT, chip ? chip.profile : {});
  for (const layer of S.fx) {
    const fx = FX_LIB.find((f) => f.id === layer.id);
    if (!fx) continue;
    const a = layer.amt;
    for (const [k, v] of Object.entries(fx.p)) {
      if (k === 'pitch' || k === 'formant' || k === 'bass' || k === 'presence') p[k] += v * a;
      else if (k === 'robotHz') { if (a > 0.25) p.robotHz = p.robotHz || v; }
      else if (k === 'ringHz') { if (!p.ring || fx.p.ring * a > p.ring) p.ringHz = v; }
      else if (k === 'lowcut') p.lowcut = Math.max(p.lowcut, 70 + (v - 70) * a);
      else if (k === 'highcut') p.highcut = Math.min(p.highcut, 16000 + (v - 16000) * a);
      else p[k] = Math.max(p[k] || 0, v * a);
    }
  }
  p.pitch = clamp(p.pitch + S.fineTune, -12, 14);
  p.formant = clamp(p.formant, -5.5, 7);
  return p;
}
function applyParams() { VoxEngine.setParams(combinedParams()); }

function profileLine(p) {
  p = p || {};
  const parts = [];
  if (p.robotHz) parts.push(`<span>ROBO <b>${Math.round(p.robotHz)}Hz</b></span>`);
  else if (p.pitch) parts.push(`<span>PITCH <b>${signed(p.pitch, 1)}</b></span>`);
  if (p.formant) parts.push(`<span>TONE <b>${signed(p.formant, 1)}</b></span>`);
  if (!parts.length) {
    if (p.reverb || p.echo) parts.push('<span>SPACE <b>FX</b></span>');
    else if (p.lowcut > 200) parts.push('<span>BAND <b>LO-FI</b></span>');
    else parts.push('<span>NATURAL</span>');
  }
  return parts.slice(0, 2).join('');
}

/* ===== chip renderer (data cartridge) ===== */
function chipPhotoHTML(c) {
  if (c.photo) {
    const src = ASSET[c.photo] || c.photo;
    return `<img src="${esc(src)}" alt="" draggable="false">`;
  }
  if (c.art) return `<div class="art">${artSVG(c.art, c.color)}</div>`;
  return `<div class="mono">${esc((c.name || '?').trim().charAt(0).toUpperCase())}</div>`;
}
const CIRCUIT = '<svg class="chip-circuit" viewBox="0 0 100 139" preserveAspectRatio="none" aria-hidden="true"><path d="M4 88V100H14V127"/><path d="M24 116H46V127"/><path d="M95 64V114H72V127"/><path d="M56 121V127"/><path d="M4 30V60"/><path d="M84 6H98"/><circle cx="14" cy="100" r="1"/><circle cx="46" cy="116" r="1"/><circle cx="72" cy="114" r="1"/></svg>';
const RARITY = { friend: 3, self: 3, character: 2, fx: 1 };
function chipHTML(c, opts = {}) {
  if (!c) return '';
  const idx = S.chips.indexOf(c) + 1;
  const tag = c.tag || KIND_TAG[c.kind] || 'MEMORY';
  const r = c.rarity || RARITY[c.kind] || 1;
  return `<div class="chip" style="--c:${c.color};--c2:${shade(c.color, -0.6)}">
    <div class="chip-edge"></div>
    <div class="chip-shell"><div class="chip-body">
      ${CIRCUIT}
      <div class="chip-head"><span class="logo">VXM</span><span class="code">VX-${String(idx).padStart(2, '0')}</span></div>
      <div class="chip-pips">${[1, 2, 3].map((n) => `<i class="${n <= r ? 'on' : ''}"></i>`).join('')}</div>
      <div class="chip-grip"></div>
      <div class="chip-win">${chipPhotoHTML(c)}<i class="hud tl"></i><i class="hud br"></i><span class="kind">${esc(tag)}</span>${c.demo && !opts.noBadge ? '<span class="badge">SAMPLE</span>' : ''}</div>
      <div class="chip-plate"><b class="nm">${esc(c.name)}</b><div class="prof"><em class="kp">${esc(KIND_LABEL[c.kind] || 'MEMORY')}</em>${profileLine(c.profile)}</div></div>
      <i class="chip-core"></i><i class="chip-notchlight"></i>
      <div class="chip-bar"></div>
      <div class="chip-pins"></div>
    </div></div>
    <div class="chip-sheen"></div>${opts.dim ? '<div class="dim"></div>' : ''}
  </div>`;
}
