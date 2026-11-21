/* ===== utilities ===== */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = (p = 'id') => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmtSec = (s) => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const signed = (v, d = 1) => (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(d);
const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (hz) => { if (!hz) return '—'; const m = Math.round(69 + 12 * Math.log2(hz / 440)); return NOTE[(m % 12 + 12) % 12] + (Math.floor(m / 12) - 1); };
function shade(hex, amt) { // amt -1..1
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
  r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
const inFrame = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();

/* ===== icons (24px line icons) ===== */
const I = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
const ICON = {
  wave: I('<path d="M3 12h2M7 8v8M11 5v14M15 9v6M19 7v10M21 12h0"/>'),
  chips: I('<rect x="4" y="3" width="11" height="15" rx="2"/><path d="M9 21h9a2 2 0 0 0 2-2V8"/><path d="M7 15h5"/>'),
  plus: I('<path d="M12 5v14M5 12h14"/>'),
  sliders: I('<path d="M5 4v16M12 4v16M19 4v16"/><rect x="3" y="13" width="4" height="3" rx="1"/><rect x="10" y="7" width="4" height="3" rx="1"/><rect x="17" y="15" width="4" height="3" rx="1"/>'),
  link: I('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/>'),
  gear: I('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  power: I('<path d="M12 3v8"/><path d="M6.3 6.8a8 8 0 1 0 11.4 0"/>', 'stroke-width="2.2"'),
  down: I('<path d="M6 9l6 6 6-6"/>'),
  close: I('<path d="M6 6l12 12M18 6L6 18"/>'),
  check: I('<path d="M5 12l5 5 9-10"/>', 'stroke-width="3"'),
  mic: I('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
  headphones: I('<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>'),
  rec: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6" fill="currentColor"/></svg>',
  graph: I('<circle cx="6" cy="7" r="2.6"/><circle cx="18" cy="6" r="2.6"/><circle cx="12" cy="18" r="2.6"/><path d="M8.3 8.4l2.6 7.2M16.8 8.3l-3.6 7.4M8.6 6.8l6.8-.6"/>'),
  play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><rect x="6.5" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1" fill="currentColor"/></svg>',
  share: I('<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>'),
  trash: I('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  camera: I('<path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="4"/>'),
  monitor: I('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>'),
  phone: I('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>'),
  broadcast: I('<circle cx="12" cy="12" r="2"/><path d="M8.5 15.5a5 5 0 0 1 0-7M15.5 8.5a5 5 0 0 1 0 7M5.6 18.4a9 9 0 0 1 0-12.8M18.4 5.6a9 9 0 0 1 0 12.8"/>'),
  file: I('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 14h6M9 17h4"/>'),
  user: I('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  users: I('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"/>'),
  sparkle: I('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>'),
  image: I('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>'),
  star: '<svg viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" fill="currentColor"/></svg>',
  starLine: I('<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>'),
  box: I('<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>'),
  magic: I('<path d="M5 19L17 7"/><path d="M15 5l4 4"/><path d="M8 3v3M6.5 4.5h3M19 14v3M17.5 15.5h3"/>'),
  search: I('<circle cx="11" cy="11" r="6"/><path d="M20 20l-4-4"/>'),
  eject: I('<path d="M12 5l7 8H5z"/><path d="M5 18h14"/>'),
  upload: I('<path d="M12 15V4M7 9l5-5 5 5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>'),
  download: I('<path d="M12 4v11M7 10l5 5 5-5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>'),
  edit: I('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>'),
  back: I('<path d="M15 5l-7 7 7 7"/>'),
  shield: I('<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>'),
  bolt: I('<path d="M13 3L5 13h6l-1 8 8-10h-6z"/>'),
  echo: I('<path d="M4 12h2M8 9v6M12 6v12"/><path d="M16 9v6" opacity=".6"/><path d="M20 10.5v3" opacity=".35"/>'),
  hall: I('<path d="M3 20V10l9-6 9 6v10"/><path d="M8 20v-6h8v6"/><path d="M12 4v3" opacity=".5"/>'),
  robot: I('<rect x="5" y="7" width="14" height="11" rx="3"/><path d="M12 3v4M9 12h.01M15 12h.01M9 15h6"/>'),
  alien: I('<path d="M12 3c4.5 0 7.5 3 7.5 7.2 0 4.8-4.3 9.8-7.5 10.8C8.8 20 4.5 15 4.5 10.2 4.5 6 7.5 3 12 3z"/><path d="M7.5 11.5l3.5 1.5M16.5 11.5L13 13"/>'),
  radio: I('<rect x="3" y="8" width="18" height="12" rx="2"/><circle cx="8.5" cy="14" r="3"/><path d="M14 12h4M14 15h4M7 8l9-5"/>'),
  doubler: I('<path d="M3 12c2.5-4 4.5-4 7 0s4.5 4 7 0"/><path d="M7 12c2.5-4 4.5-4 7 0s4.5 4 7 0" opacity=".5"/>'),
  drive: I('<path d="M3 12h3l2-6 3 12 3-9 2 3h5"/>'),
  up: I('<path d="M12 19V5M6 11l6-6 6 6"/>'),
  downArrow: I('<path d="M12 5v14M6 13l6 6 6-6"/>'),
};

/* ===== emblem art for character / FX chips (original line art, 100×100) ===== */
const ART = {
  yamabiko: `<path d="M8 80l22-36 12 18 14-26 36 44z" class="s"/><path d="M60 22c5 3 5 11 0 14M68 16c9 6 9 20 0 26M76 10c13 9 13 29 0 38" class="s t"/>`,
  hall: `<path d="M14 82V46l36-26 36 26v36" class="s"/><path d="M28 82V58a8 8 0 0 1 16 0v24M56 82V58a8 8 0 0 1 16 0v24" class="s t"/><path d="M8 82h84" class="s"/><circle cx="50" cy="40" r="4" class="f"/>`,
  twins: `<circle cx="38" cy="42" r="16" class="s"/><circle cx="62" cy="42" r="16" class="s t"/><path d="M14 84c2-16 12-24 24-24s22 8 24 24M38 84c2-16 12-24 24-24s22 8 24 24" class="s t"/>`,
  flame: `<path d="M50 14c6 16 24 24 24 44a24 24 0 0 1-48 0c0-10 6-18 12-22 0 8 4 12 8 12-2-14 0-24 4-34z" class="s"/><path d="M50 58c4 5 8 8 8 14a8 8 0 0 1-16 0c0-6 4-9 8-14z" class="f"/>`,
  wobble: `<path d="M8 50c7-16 14-16 21 0s14 16 21 0 14-16 21 0 14 16 21 0" class="s"/><path d="M8 72c7-8 14-8 21 0s14 8 21 0 14-8 21 0 14 8 21 0" class="s t"/><path d="M8 28c7-8 14-8 21 0s14 8 21 0 14-8 21 0 14 8 21 0" class="s t"/>`,
  pulse: `<path d="M14 50h12l6-18 10 40 10-52 10 46 6-16h18" class="s"/><path d="M14 80h72" class="s t"/>`,
  bubble: `<circle cx="40" cy="58" r="16" class="s"/><circle cx="65" cy="36" r="10" class="s"/><circle cx="58" cy="70" r="6" class="s t"/><circle cx="74" cy="16" r="5" class="s t"/><path d="M33 53a9 9 0 0 1 8-6M61 32a5 5 0 0 1 4-3" class="s t"/><path d="M10 88c8-5 14-5 22 0s14 5 22 0 14-5 22 0 10-3 14-2" class="s t"/>`,
  piano: `<rect x="14" y="26" width="72" height="50" rx="5" class="s"/><path d="M26 26v50M38 26v50M50 26v50M62 26v50M74 26v50" class="s t"/><rect x="22.5" y="26" width="7" height="28" class="f"/><rect x="34.5" y="26" width="7" height="28" class="f"/><rect x="58.5" y="26" width="7" height="28" class="f"/><rect x="70.5" y="26" width="7" height="28" class="f"/>`,
  guitar: `<path d="M39 50c-13-2-24 6-24 18 0 11 9 18 19 18 12 0 18-9 18-19 6-1 10-5 10-11 0-7-8-11-14-8z" class="s"/><path d="M48 51L79 20" class="s"/><path d="M75 16l9 9" class="s"/><circle cx="35" cy="67" r="5.5" class="f"/><path d="M26 75l9 9" class="s t"/>`,
  musicbox: `<rect x="16" y="46" width="56" height="34" rx="4" class="s"/><path d="M16 56h56" class="s t"/><path d="M72 62h11v-9" class="s"/><path d="M41 18v18l11 3" class="s t"/><circle cx="37" cy="37" r="4.2" class="f"/><path d="M61 12v16" class="s t"/><circle cx="57" cy="28" r="3.6" class="f"/>`,
  organ: `<rect x="15" y="46" width="12" height="34" rx="6" class="s"/><rect x="31" y="32" width="12" height="48" rx="6" class="s"/><rect x="47" y="18" width="12" height="62" rx="6" class="s"/><rect x="63" y="32" width="12" height="48" rx="6" class="s"/><path d="M10 84h70" class="s"/><path d="M18 56h6M34 42h6M50 28h6M66 42h6" class="s t"/><path d="M82 30l4-4M84 40h6" class="s t"/>`,
  synth: `<rect x="10" y="32" width="80" height="42" rx="6" class="s"/><circle cx="24" cy="44" r="4.2" class="f"/><circle cx="38" cy="44" r="4.2" class="f"/><path d="M52 40h28M52 48h18" class="s t"/><path d="M10 58h80M23 58v16M36 58v16M49 58v16M62 58v16M75 58v16" class="s t"/>`,
  theremin: `<rect x="18" y="60" width="50" height="16" rx="4" class="s"/><path d="M60 60V14" class="s"/><path d="M18 62c-7-10-5-23 4-31" class="s t"/><path d="M72 30c6 4 6 13 0 17M81 23c10 7 10 23 0 31" class="s t"/>`,
  bass: `<path d="M28 42c0-13 11-22 24-22 15 0 24 11 24 24 0 24-24 38-46 44" class="s"/><circle cx="32" cy="42" r="6.5" class="f"/><circle cx="85" cy="34" r="3.6" class="f"/><circle cx="85" cy="52" r="3.6" class="f"/>`,
  drum: `<ellipse cx="50" cy="46" rx="30" ry="10" class="s"/><path d="M20 46v24c0 6 13 10 30 10s30-4 30-10V46" class="s"/><path d="M27 53l11 25M73 53L62 78M50 57v23" class="s t"/><path d="M30 14l16 24M72 12L56 36" class="s"/>`,
  coin: `<circle cx="50" cy="52" r="28" class="s"/><circle cx="50" cy="52" r="19" class="s t"/><path d="M50 40v24" class="s"/><path d="M16 20l7 7M84 20l-7 7M50 8v9" class="s t"/>`,
  choir: `<circle cx="28" cy="44" r="10" class="s"/><circle cx="50" cy="36" r="11" class="s"/><circle cx="72" cy="44" r="10" class="s"/><ellipse cx="28" cy="47" rx="3" ry="4" class="f"/><ellipse cx="50" cy="40" rx="3.4" ry="4.6" class="f"/><ellipse cx="72" cy="47" rx="3" ry="4" class="f"/><path d="M12 82c2-14 9-22 16-22M88 82c-2-14-9-22-16-22M34 82c2-14 8-22 16-22s14 8 16 22" class="s t"/>`,
  vocoder: `<rect x="18" y="20" width="18" height="34" rx="9" class="s"/><path d="M12 46a15 15 0 0 0 30 0M27 61v15" class="s t"/><path d="M54 72V56M63 72V38M72 72V48M81 72V28M90 72V52" class="s"/>`,
  can: `<ellipse cx="50" cy="24" rx="21" ry="7" class="s"/><path d="M29 24v52c0 4 9 7 21 7s21-3 21-7V24" class="s"/><path d="M29 40c0 4 9 7 21 7s21-3 21-7M29 60c0 4 9 7 21 7s21-3 21-7" class="s t"/>`,
  helmet: `<circle cx="50" cy="44" r="28" class="s"/><rect x="30" y="31" width="40" height="26" rx="13" class="f3"/><path d="M37 39c5-4 12-4 16 0" class="s t"/><path d="M30 70l-5 14h50l-5-14" class="s"/>`,
  wah: `<path d="M16 72l66-15v11L16 82z" class="s"/><path d="M20 68l58-26" class="s"/><circle cx="32" cy="76" r="2.6" class="f"/><path d="M60 26c4-6 10-6 14 0M55 17c7-10 18-10 24 0" class="s t"/>`,
  glitch: `<rect x="16" y="22" width="42" height="14" class="s"/><rect x="34" y="43" width="50" height="14" class="s"/><rect x="20" y="64" width="38" height="12" class="s"/><rect x="63" y="22" width="11" height="14" class="f"/><rect x="16" y="43" width="11" height="14" class="f"/><path d="M63 70h21" class="s t"/>`,
  crown: `<path d="M18 70l-5-42 21 17 16-27 16 27 21-17-5 42z" class="s"/><path d="M18 81h64" class="s"/><circle cx="50" cy="55" r="4.8" class="f"/><circle cx="32" cy="59" r="3.2" class="f"/><circle cx="68" cy="59" r="3.2" class="f"/>`,
  hamster: `<circle cx="50" cy="55" r="26" class="s"/><circle cx="30" cy="31" r="8" class="s"/><circle cx="70" cy="31" r="8" class="s"/><circle cx="41" cy="51" r="3.6" class="f"/><circle cx="59" cy="51" r="3.6" class="f"/><path d="M46 61c2 2.4 6 2.4 8 0" class="s t"/><ellipse cx="33" cy="63" rx="6" ry="4" class="f3"/><ellipse cx="67" cy="63" rx="6" ry="4" class="f3"/><path d="M24 46l-9-3M24 52h-10M76 46l9-3M76 52h10" class="s t"/>`,
  giant: `<path d="M22 86V42c0-17 12-28 28-28s28 11 28 28v44" class="s"/><path d="M30 41l13 5M70 41l-13 5" class="s"/><circle cx="40" cy="52" r="3.6" class="f"/><circle cx="60" cy="52" r="3.6" class="f"/><path d="M37 69h26" class="s"/><path d="M43 69v6M50 69v6M57 69v6" class="s t"/><path d="M10 86h80" class="s t"/>`,
  game: `<path d="M24 36h52c8 0 12 6 13 14l2 16c1 7-6 11-11 6l-8-8H28l-8 8c-5 5-12 1-11-6l2-16c1-8 5-14 13-14z" class="s"/><path d="M32 44v12M26 50h12" class="s"/><circle cx="64" cy="46" r="3.4" class="f"/><circle cx="72" cy="54" r="3.4" class="f"/><rect x="40" y="18" width="5" height="5" class="f"/><rect x="48" y="14" width="5" height="5" class="f"/><rect x="56" y="18" width="5" height="5" class="f"/><path d="M38 80h24" class="s t"/>`,
  note: `<path d="M58 20v44" class="s"/><path d="M58 20l18 6v10l-18-6z" class="f"/><ellipse cx="47" cy="66" rx="11" ry="8" class="s"/><path d="M14 52h8v-8h8v8h8" class="s t"/><path d="M68 80h7v-7h7v-7h7" class="s t"/>`,
  elder: `<circle cx="50" cy="47" r="25" class="s"/><circle cx="40" cy="45" r="6" class="s t"/><circle cx="60" cy="45" r="6" class="s t"/><path d="M46 45h8" class="s t"/><path d="M35 59c5-4 10-4 15 0 5-4 10-4 15 0" class="s"/><path d="M30 31c9-8 31-8 40 0" class="s t"/><path d="M37 78c2 6 24 6 26 0" class="s t"/>`,
  ufo: `<ellipse cx="50" cy="46" rx="35" ry="10" class="s"/><path d="M33 40c2-13 32-13 34 0" class="s"/><circle cx="33" cy="47" r="2.6" class="f"/><circle cx="50" cy="50" r="2.6" class="f"/><circle cx="67" cy="47" r="2.6" class="f"/><path d="M40 58l-9 24M60 58l9 24M31 82h38" class="s t"/>`,
  phone: `<path d="M30 20h12l6 14-7 5a30 30 0 0 0 16 16l5-7 14 6v12a6 6 0 0 1-6 6C44 72 26 54 24 26a6 6 0 0 1 6-6z" class="s"/><path d="M62 18a18 18 0 0 1 18 18M62 28a8 8 0 0 1 8 8" class="s t"/>`,
  megaphone: `<path d="M20 42h11l35-17v50L31 58H20z" class="s"/><path d="M27 58l4 19h9l-3-19" class="s t"/><path d="M76 40c4 4 4 16 0 20M84 33c7 8 7 26 0 34" class="s t"/>`,
  cave: `<path d="M10 84c4-31 19-58 40-58s36 27 40 58" class="s"/><path d="M33 84c1-19 7-31 17-31s16 12 17 31" class="s"/><path d="M27 35l5 7M71 33l-4 8M50 26v7" class="s t"/><path d="M59 62c4 2 4 8 0 10M66 57c7 4 7 15 0 19" class="s t"/>`,
  dragon: `<path d="M18 72c6-23 21-38 42-38l8-15 4 17c9 4 15 11 17 19l-15 2c-4 0-8 4-12 6-11 6-25 9-44 9z" class="s"/><circle cx="64" cy="47" r="3.2" class="f"/><path d="M78 58h10M76 64l10 5" class="s t"/><path d="M28 66l6-9 4 9 6-9 4 9" class="s t"/>`,
  kid: `<circle cx="50" cy="53" r="25" class="s"/><path d="M44 28c2-9 11-11 15-6-6 0-9 2-9 6" class="s"/><circle cx="41" cy="51" r="4.2" class="f"/><circle cx="59" cy="51" r="4.2" class="f"/><path d="M42 63c4 5 12 5 16 0" class="s"/><ellipse cx="32" cy="61" rx="4.5" ry="3" class="f3"/><ellipse cx="68" cy="61" rx="4.5" ry="3" class="f3"/>`,
  robot: `<rect x="27" y="28" width="46" height="40" rx="12" class="s"/><rect x="33" y="39" width="34" height="13" rx="6.5" class="f"/><path d="M50 28V18" class="s"/><circle cx="50" cy="15" r="3.4" class="f"/><path d="M27 44h-6v12h6M73 44h6v12h-6" class="s"/><path d="M38 60h24M42 60v4M50 60v4M58 60v4" class="s t"/><path d="M40 68v8h20v-8" class="s"/>`,
  alien: `<path d="M50 14c17 0 27 11 27 26 0 18-15 36-27 40-12-4-27-22-27-40 0-15 10-26 27-26z" class="s"/><path d="M30 42c6-1 13 3 16 10-7 2-14-2-16-10zM70 42c-6-1-13 3-16 10 7 2 14-2 16-10z" class="f"/><path d="M45 68h10" class="s t"/><circle cx="50" cy="8" r="2" class="f"/><path d="M14 30c4-3 7-3 10 0M76 30c3-3 6-3 10 0" class="s t"/>`,
  ghost: `<path d="M26 82V44c0-14 11-26 24-26s24 12 24 26v38l-8-7-8 7-8-7-8 7-8-7z" class="s"/><ellipse cx="41" cy="45" rx="4.5" ry="7" class="f"/><ellipse cx="59" cy="45" rx="4.5" ry="7" class="f"/><path d="M44 61c4 3 8 3 12 0" class="s t"/><path d="M14 36c3-4 6-4 9-1M80 54c3-3 6-3 8 0" class="s t"/>`,
  monster: `<path d="M24 34c-6-8-6-16 0-22 2 8 8 12 14 13M76 34c6-8 6-16 0-22-2 8-8 12-14 13" class="s"/><path d="M50 22c16 0 27 12 27 28 0 17-12 30-27 30S23 67 23 50c0-16 11-28 27-28z" class="s"/><path d="M33 44l12 5M67 44l-12 5" class="s"/><path d="M36 52h.1M64 52h.1" class="s glowdot"/><path d="M34 64l5 7 5-7 6 7 6-7 5 7 5-7" class="f2"/>`,
  helium: `<circle cx="38" cy="34" r="14" class="s"/><circle cx="62" cy="30" r="12" class="s"/><circle cx="52" cy="52" r="13" class="s"/><path d="M38 48c2 10-2 20 6 32M62 42c-2 12 0 24-8 38M52 65c1 6-1 10-2 15" class="s t"/><path d="M32 28c2-4 5-6 9-6M57 24c2-3 4-4 7-4M47 46c2-3 4-4 7-4" class="f3"/>`,
  radio: `<rect x="18" y="38" width="64" height="42" rx="8" class="s"/><circle cx="38" cy="59" r="11" class="s"/><circle cx="38" cy="59" r="4" class="f"/><path d="M58 52h16M58 59h16M58 66h12" class="s t"/><path d="M30 38l36-22" class="s"/><path d="M72 10c4 4 4 10 0 14M78 6c7 7 7 15 0 22" class="s t"/>`,
  angel: `<ellipse cx="50" cy="20" rx="14" ry="4.5" class="s glow"/><path d="M50 34v44" class="s"/><path d="M46 40c-8-8-22-10-32-4 4 4 6 10 14 12-6 2-8 6-12 8 10 4 22 2 30-8M54 40c8-8 22-10 32-4-4 4-6 10-14 12 6 2 8 6 12 8-10 4-22 2-30-8" class="s"/><circle cx="50" cy="34" r="3" class="f"/>`,
  nebula: `<circle cx="50" cy="50" r="16" class="s"/><ellipse cx="50" cy="50" rx="34" ry="10" transform="rotate(-20 50 50)" class="s t"/><circle cx="50" cy="50" r="6" class="f"/><path d="M20 22l2 5 5 2-5 2-2 5-2-5-5-2 5-2zM80 70l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z" class="f3"/>`,
  wave: `<path d="M14 50h6M26 38v24M34 26v48M42 34v32M50 18v64M58 30v40M66 24v52M74 38v24M82 50h4" class="s"/>`,
  mic: `<rect x="38" y="16" width="24" height="42" rx="12" class="s"/><path d="M28 48c0 13 10 22 22 22s22-9 22-22M50 70v12M38 84h24" class="s"/><path d="M44 30h12M44 38h12" class="s t"/>`,
};
function artAttr(cls, gid, c2) {
  const k = cls.split(' ');
  const stroke = (col, w) => `fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
  if (k[0] === 's') {
    if (k.includes('glowdot')) return stroke('#fff', 7);
    if (k.includes('glow')) return stroke('#fff', 3.2);
    return stroke(`url(#${gid})`, k.includes('t') ? 2.2 : 3.2);
  }
  if (k[0] === 'f2') return stroke('#fff', 2.4);
  if (k[0] === 'f3') return `fill="${c2}" opacity=".85"`;
  return `fill="${c2}"`;
}
function artSVG(key, color) {
  const c = color || '#a487ff', c2 = shade(c, 0.55);
  const gid = 'g' + Math.random().toString(36).slice(2, 8);
  return `<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice"><defs>
    <linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="0" y1="10" x2="0" y2="90"><stop offset="0" stop-color="${c2}"/><stop offset="1" stop-color="${c}"/></linearGradient>
    <filter id="${gid}f" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <radialGradient id="${gid}r" cx=".5" cy=".42" r=".6"><stop offset="0" stop-color="${c}" stop-opacity=".35"/><stop offset="1" stop-color="#05060a" stop-opacity="0"/></radialGradient></defs>
    <rect width="100" height="100" fill="url(#${gid}r)"/>
    <g opacity=".14" stroke="${c2}" stroke-width=".4">${[20, 40, 60, 80].map((v) => `<path d="M${v} 0V100M0 ${v}H100"/>`).join('')}</g>
    <g filter="url(#${gid}f)">${(ART[key] || ART.wave).replace(/class="([^"]+)"/g, (m, cls) => artAttr(cls, gid, c2))}
    </g></svg>`;
}
