/* ===== built-in content ===== */
const ASSET = window.VOXM_ASSETS || {};
const COLORS = ['#a487ff', '#7fdcff', '#ff7ab6', '#ffb86b', '#5fe0a8', '#ff6b81', '#c3ff6b', '#8fa2ff'];

// Voice profile parameters (all optional): pitch/formant in semitones, robotHz, ring 0-1, ringHz,
// lowcut/highcut Hz, bass/presence dB, drive/chorus/echo/reverb 0-1,
// vib (semitones) + vibHz, tune 0-1 (snap to semitones), trem 0-1 + tremHz, crush 0-1 (8-bit),
// water 0-1, inst 1-7 (piano/guitar/music box/organ/synth/theremin/bass) + instMix + instOct, perc (beatbox) 0-1,
// blip (game sounds) 0-1, harm 0-1 + harmType (0 major / 1 octaves / 2 fifth / 3 minor), voc (vocoder) 0-1,
// comb 0-1 + combMs (tube / can), wah 0-1, glitch 0-1
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
  { id: 'c_hamster', name: 'ハムスター', kind: 'character', tag: 'TINY', art: 'hamster', color: '#ffc9a3', profile: { pitch: 10, formant: 5.5, vib: 0.25, vibHz: 7 } },
  { id: 'c_giant', name: '巨人', kind: 'character', tag: 'TITAN', art: 'giant', color: '#b08cff', profile: { pitch: -10, formant: -4.5, bass: 4, reverb: 0.45 } },
  { id: 'c_dragon', name: 'ドラゴン', kind: 'character', tag: 'MYTHIC', art: 'dragon', color: '#ff8a5c', profile: { pitch: -8, formant: -3, ring: 0.25, ringHz: 22, drive: 0.45, bass: 5, reverb: 0.3 } },
  { id: 'c_ufo', name: 'UFO', kind: 'character', tag: 'UNKNOWN', art: 'ufo', color: '#6bffd8', profile: { pitch: 3, vib: 2.5, vibHz: 3, ring: 0.35, ringHz: 18, echo: 0.35 } },
  { id: 'c_elder', name: 'おじいちゃん', kind: 'character', tag: 'ELDER', art: 'elder', color: '#d9c7a1', profile: { pitch: -3, formant: -1, vib: 0.45, vibHz: 5.5, lowcut: 150, highcut: 6000, drive: 0.12 } },
  { id: 'c_kid', name: 'キッズ', kind: 'character', tag: 'KIDS', art: 'kid', color: '#7fe3ff', profile: { pitch: 6, formant: 3.5, presence: 1 } },
  { id: 'c_8bit', name: '8BIT', kind: 'fx', tag: 'RETRO GAME', art: 'game', color: '#ff5ce1', profile: { crush: 0.75, pitch: 2, highcut: 7000 } },
  { id: 'c_kero', name: 'ケロケロ', kind: 'fx', tag: 'HYPER POP', art: 'note', color: '#9dff5c', profile: { tune: 1, pitch: 1, chorus: 0.25, reverb: 0.2 } },
  { id: 'c_phone', name: '電話', kind: 'fx', tag: 'CALL', art: 'phone', color: '#ffe066', profile: { lowcut: 340, highcut: 3400, drive: 0.18, presence: 4 } },
  { id: 'c_mega', name: 'メガホン', kind: 'fx', tag: 'LOUD', art: 'megaphone', color: '#ff9f43', profile: { lowcut: 600, highcut: 4200, drive: 0.55, presence: 6, echo: 0.15 } },
  { id: 'c_cave', name: '洞くつ', kind: 'fx', tag: 'ECHO', art: 'cave', color: '#5ca8ff', profile: { echo: 0.65, reverb: 0.55, lowcut: 120 } },
  { id: 'c_water', name: '水の中', kind: 'fx', tag: 'UNDERWATER', art: 'bubble', color: '#4fc3ff', profile: { water: 0.9, vib: 0.35, vibHz: 1.2, chorus: 0.3 } },
  { id: 'c_piano', name: 'ピアノ', kind: 'music', tag: 'PIANO', art: 'piano', color: '#e9e6ff', profile: { inst: 1, instMix: 0.75, reverb: 0.25 } },
  { id: 'c_guitar', name: 'ギター', kind: 'music', tag: 'GUITAR', art: 'guitar', color: '#ffb35c', profile: { inst: 2, instMix: 0.75, reverb: 0.15 } },
  { id: 'c_musicbox', name: 'オルゴール', kind: 'music', tag: 'MUSIC BOX', art: 'musicbox', color: '#ffc4ec', profile: { inst: 3, instMix: 0.7, reverb: 0.35 } },
  { id: 'c_organ', name: 'オルガン', kind: 'music', tag: 'ORGAN', art: 'organ', color: '#c9a0ff', profile: { inst: 4, instMix: 0.8, reverb: 0.45 } },
  { id: 'c_synth', name: 'シンセ', kind: 'music', tag: 'SYNTH LEAD', art: 'synth', color: '#5cf2ff', profile: { inst: 5, instMix: 0.8, echo: 0.25, chorus: 0.2 } },
  { id: 'c_theremin', name: 'テルミン', kind: 'music', tag: 'THEREMIN', art: 'theremin', color: '#a6ff9e', profile: { inst: 6, instMix: 0.85, reverb: 0.4 } },
  { id: 'c_bass', name: 'ベース', kind: 'music', tag: 'BASS', art: 'bass', color: '#ff7a7a', profile: { inst: 7, instMix: 0.8 } },
  { id: 'c_vocoder', name: 'ボコーダー', kind: 'music', tag: 'VOCODER', art: 'vocoder', color: '#7d9cff', profile: { voc: 1, chorus: 0.2 } },
  { id: 'c_beatbox', name: 'ビートボックス', kind: 'music', tag: 'BEATBOX', art: 'drum', color: '#ffcf5c', profile: { perc: 0.9 } },
  { id: 'c_choir', name: '合唱団', kind: 'character', tag: 'CHOIR', art: 'choir', color: '#ffe9b0', profile: { harm: 0.9, harmType: 0, reverb: 0.5, chorus: 0.3 } },
  { id: 'c_maou', name: '魔王', kind: 'character', tag: 'DEMON LORD', art: 'crown', color: '#c84bff', profile: { pitch: -4, formant: -2, harm: 0.8, harmType: 1, reverb: 0.5, drive: 0.2 } },
  { id: 'c_gamese', name: 'ゲームSE', kind: 'fx', tag: 'GAME SE', art: 'coin', color: '#ffe14d', profile: { blip: 0.8, crush: 0.2 } },
  { id: 'c_can', name: '缶の中', kind: 'fx', tag: 'TIN CAN', art: 'can', color: '#c0c8d8', profile: { comb: 0.85, combMs: 3.2, lowcut: 250 } },
  { id: 'c_helmet', name: '宇宙ヘルメット', kind: 'fx', tag: 'SPACE SUIT', art: 'helmet', color: '#9ad7ff', profile: { comb: 0.6, combMs: 9, highcut: 5000, lowcut: 200, drive: 0.1 } },
  { id: 'c_wah', name: 'ワウワウ', kind: 'fx', tag: 'WAH', art: 'wah', color: '#ff8ad8', profile: { wah: 0.9 } },
  { id: 'c_glitch', name: 'グリッチ', kind: 'fx', tag: 'GLITCH', art: 'glitch', color: '#ff4fd1', profile: { glitch: 0.8, crush: 0.15, ring: 0.1, ringHz: 80 } },
];
// built-ins that shipped before the newest additions (used to slot new chips into existing saved cases once)
const BUILTIN_V1 = ['c_friendA', 'c_friendB', 'c_android', 'c_nebula', 'c_phantom', 'c_monster', 'c_angel', 'c_helium', 'c_radio'];
const BUILTIN_CASES_V1 = ['k_friends', 'k_chara', 'k_fx'];
const BUILTIN_CASES = [
  { id: 'k_friends', name: 'フレンズ', color: '#ffb86b', chipIds: ['c_friendA', 'c_friendB'] },
  { id: 'k_chara', name: 'キャラクター', color: '#a487ff', chipIds: ['c_android', 'c_nebula', 'c_phantom', 'c_monster', 'c_angel', 'c_hamster', 'c_giant', 'c_dragon', 'c_ufo', 'c_elder', 'c_kid'] },
  { id: 'k_fx', name: 'エフェクト', color: '#ff7ab6', chipIds: ['c_helium', 'c_radio', 'c_8bit', 'c_kero', 'c_phone', 'c_mega', 'c_cave'] },
  { id: 'k_music', name: '楽器ボイス', color: '#5cf2ff', chipIds: ['c_piano', 'c_guitar', 'c_musicbox', 'c_organ', 'c_synth', 'c_theremin', 'c_bass', 'c_vocoder', 'c_beatbox'] },
  { id: 'k_weird', name: 'へんな声', color: '#ff4fd1', chipIds: ['c_water', 'c_gamese', 'c_can', 'c_helmet', 'c_wah', 'c_glitch', 'c_choir', 'c_maou'] },
];
const KIND_LABEL = { friend: '友達', self: '自分', character: 'キャラ', music: '楽器', fx: 'エフェクト' };
const KIND_TAG = { friend: 'FRIEND', self: 'MY VOICE', character: 'CHARACTER', music: 'INSTRUMENT', fx: 'EFFECT' };

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
  { id: 'vibrato', name: 'VIBRATO', sub: 'ゆらゆら声', icon: 'wave', color: '#6bffd8', p: { vib: 0.9, vibHz: 6 } },
  { id: 'tune', name: 'KERO', sub: '音程カチッと補正', icon: 'sparkle', color: '#9dff5c', p: { tune: 1 } },
  { id: '8bit', name: '8BIT', sub: 'ゲーム機の音', icon: 'bolt', color: '#ff5ce1', p: { crush: 0.7 } },
  { id: 'trem', name: 'TREMOLO', sub: 'ふるえる音量', icon: 'broadcast', color: '#ffe066', p: { trem: 0.65, tremHz: 8 } },
  { id: 'water', name: 'WATER', sub: '水の中', icon: 'wave', color: '#4fc3ff', p: { water: 0.8 } },
  { id: 'choir', name: 'CHOIR', sub: '声が和音に', icon: 'users', color: '#ffe9b0', p: { harm: 0.8, harmType: 0 } },
  { id: 'octave', name: 'OCTAVE', sub: '上下オクターブ', icon: 'up', color: '#c84bff', p: { harm: 0.75, harmType: 1 } },
  { id: 'vocoder', name: 'VOCODER', sub: 'シンセで歌う', icon: 'sliders', color: '#7d9cff', p: { voc: 0.9 } },
  { id: 'piano', name: 'PIANO', sub: '声にピアノを重ねる', icon: 'sparkle', color: '#e9e6ff', p: { inst: 1, instMix: 0.55 } },
  { id: 'beat', name: 'BEATBOX', sub: '声でドラム', icon: 'rec', color: '#ffcf5c', p: { perc: 0.8 } },
  { id: 'game', name: 'GAME SE', sub: 'しゃべるとピコッ', icon: 'star', color: '#ffe14d', p: { blip: 0.7 } },
  { id: 'can', name: 'TIN CAN', sub: '缶・筒の響き', icon: 'box', color: '#c0c8d8', p: { comb: 0.8, combMs: 3.5 } },
  { id: 'wah', name: 'WAH', sub: 'ワウワウ', icon: 'magic', color: '#ff8ad8', p: { wah: 0.85 } },
  { id: 'glitch', name: 'GLITCH', sub: 'ぶつ切れ連打', icon: 'bolt', color: '#ff4fd1', p: { glitch: 0.7 } },
];

const SAMPLE_SCRIPT = 'こんにちは。今日はいい天気ですね。あいうえお、かきくけこ。私の声をボイスメモリに記録します。好きな食べ物はカレーライスで、休みの日は散歩をしています。ありがとう、またね。';

/* ===== state ===== */
const S = {
  tab: 'home',
  chips: [], cases: [],
  selectedId: 'c_friendA', slots: [null, null, null], // 3 bays on the deck: [left, centre, right]
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
  // new built-in chips join their default case once (saved cases from older versions don't list them yet)
  const seen = new Set((kv && kv.seenBuiltins) || (cases && cases.length ? BUILTIN_V1 : BUILTIN_CHIPS.map((c) => c.id)));
  const seenCases = new Set((kv && kv.seenCases) || (cases && cases.length ? BUILTIN_CASES_V1 : BUILTIN_CASES.map((c) => c.id)));
  for (const bc of BUILTIN_CASES) if (!seenCases.has(bc.id) && !S.cases.find((c) => c.id === bc.id)) {
    const k = Object.assign({ order: S.cases.length, createdAt: Date.now() }, bc, { chipIds: [...bc.chipIds] });
    S.cases.push(k); saveCase(k);
  }
  S.seenCases = BUILTIN_CASES.map((c) => c.id);
  for (const bc of BUILTIN_CASES) {
    const k = S.cases.find((c) => c.id === bc.id); if (!k) continue;
    const add = bc.chipIds.filter((id) => !seen.has(id) && !k.chipIds.includes(id));
    if (add.length) { k.chipIds.push(...add); saveCase(k); }
  }
  S.seenBuiltins = BUILTIN_CHIPS.map((c) => c.id);
  if (!kv || !kv.seenBuiltins || !kv.seenCases) saveSettings();
  if (kv) for (const k of ['selectedId', 'slots', 'homeCase', 'fx', 'fineTune', 'monitor', 'volume', 'safeMode', 'routeAsked', 'noiseSup', 'reduceMotion', 'ticks', 'baseline']) if (k in kv) S[k] = kv[k];
  if (kv && !kv.slots && kv.insertedId) S.slots = [null, kv.insertedId, null]; // single-slot era
  if (!chipById(S.selectedId)) S.selectedId = S.chips[0]?.id || null;
  S.slots = [0, 1, 2].map((i) => (Array.isArray(S.slots) && chipById(S.slots[i]) ? S.slots[i] : null));
  if (S.homeCase !== 'all' && !S.cases.find((c) => c.id === S.homeCase)) S.homeCase = 'all';
  S.recordings = (recs || []).sort((a, b) => b.createdAt - a.createdAt);
}
let saveTimer = 0;
function saveSettings() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const kv = {};
    for (const k of ['selectedId', 'slots', 'homeCase', 'fx', 'fineTune', 'monitor', 'volume', 'safeMode', 'routeAsked', 'noiseSup', 'reduceMotion', 'ticks', 'baseline']) kv[k] = S[k];
    kv.removedBuiltins = S.removedBuiltins || [];
    kv.seenBuiltins = S.seenBuiltins || BUILTIN_CHIPS.map((c) => c.id);
    kv.seenCases = S.seenCases || BUILTIN_CASES.map((c) => c.id);
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
const seatedChips = () => S.slots.map(chipById).filter(Boolean);
const isSeated = (id) => !!id && S.slots.includes(id);
const seatedName = (sep = ' × ') => seatedChips().map((c) => c.name).join(sep);
const ADDITIVE = ['pitch', 'formant', 'bass', 'presence'];
function layerParams(p, src, a, skipAdditive) {
  for (const [k, v] of Object.entries(src || {})) {
    if (ADDITIVE.includes(k)) { if (!skipAdditive) p[k] += v * a; }
    else if (k === 'robotHz') { if (a > 0.25 && v) p.robotHz = p.robotHz || v; }
    else if (k === 'ring') { if (v * a > p.ring) { p.ring = v * a; if (src.ringHz) p.ringHz = src.ringHz; } }
    else if (k === 'ringHz') { if (!src.ring) p.ringHz = v; }
    else if (k === 'inst' || k === 'harmType' || k === 'instOct' || k === 'combMs' || k === 'instMix') { if (a > 0.25) p[k] = v; }
    else if (k === 'lowcut') p.lowcut = Math.max(p.lowcut, 70 + (v - 70) * a);
    else if (k === 'highcut') p.highcut = Math.min(p.highcut, 16000 + (v - 16000) * a);
    else if (k in p) p[k] = Math.max(p[k] || 0, v * a);
  }
}
// Several chips at once: people's voices (friend / self) are blended (averaged) into one identity,
// character and effect chips are layered on top of it, then the FX rack.
function combinedParams() {
  const chips = seatedChips();
  const p = Object.assign({}, VoxEngine.DEFAULT);
  const voices = chips.filter((c) => c.kind === 'friend' || c.kind === 'self');
  for (const k of ADDITIVE) if (voices.length) p[k] = voices.reduce((s, c) => s + ((c.profile || {})[k] || 0), 0) / voices.length;
  for (const c of voices) layerParams(p, c.profile, 1, true);
  for (const c of chips) if (!voices.includes(c)) layerParams(p, c.profile, 1);
  for (const layer of S.fx) { const fx = FX_LIB.find((f) => f.id === layer.id); if (fx) layerParams(p, fx.p, layer.amt); }
  p.pitch = clamp(p.pitch + S.fineTune, -12, 14);
  p.formant = clamp(p.formant, -5.5, 7);
  return p;
}
function applyParams() { VoxEngine.setParams(combinedParams()); }

function profileLine(p) {
  p = p || {};
  const parts = [];
  const INST_NAME = ['', 'PIANO', 'GUITAR', 'M.BOX', 'ORGAN', 'SYNTH', 'THEREMIN', 'BASS'];
  const tag = p.inst ? INST_NAME[p.inst] : p.voc ? 'VOCODER' : p.perc ? 'DRUMS' : p.blip ? 'GAME SE' : p.harm ? (p.harmType === 1 ? 'OCTAVES' : 'CHORD') : p.water ? 'WATER' : p.glitch ? 'GLITCH' : p.wah ? 'WAH' : p.comb ? 'TUBE' : p.tune ? 'HARD TUNE' : p.crush ? '8-BIT' : '';
  if (tag) parts.push(`<span>MODE <b>${tag}</b></span>`);
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
const RARITY = { friend: 3, self: 3, character: 2, music: 2, fx: 1 };
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
