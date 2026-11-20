// Numerical checks for the VOXM DSP core and the analysis module (run: node tests/dsp.test.js)
const { VoxCore } = require('../src/dsp-core.js');
const A = require('../src/analysis.js');

function synthVoice(sr, seconds, f0, formantScale, seed = 1) {
  const n = Math.floor(sr * seconds);
  const out = new Float32Array(n);
  let rnd = seed;
  const rand = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647) - 0.5;
  // glottal pulse train with slight vibrato
  const src = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const f = f0 * (1 + 0.02 * Math.sin((2 * Math.PI * 5 * i) / sr));
    ph += f / sr;
    if (ph >= 1) { ph -= 1; src[i] = 1; }
    src[i] += rand() * 0.02;
  }
  // three resonators (vowel /a/-ish)
  const formants = [[730, 90], [1090, 110], [2440, 160]].map(([f, bw]) => [f * formantScale, bw * formantScale]);
  let sig = src;
  for (const [f, bw] of formants) {
    const r = Math.exp((-Math.PI * bw) / sr);
    const c = 2 * r * Math.cos((2 * Math.PI * f) / sr);
    const d = -r * r;
    const y = new Float32Array(n);
    for (let i = 0; i < n; i++) y[i] = sig[i] * (1 - r) + c * (y[i - 1] || 0) + d * (y[i - 2] || 0);
    sig = y;
  }
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(sig[i]));
  for (let i = 0; i < n; i++) out[i] = (sig[i] / peak) * 0.5;
  return out;
}

function runCore(input, sr, params) {
  const core = new VoxCore(sr);
  core.set(params);
  core.mix = core.p.active ? 1 : 0;
  const out = new Float32Array(input.length);
  const B = 128;
  for (let i = 0; i + B <= input.length; i += B) core.process(input.subarray(i, i + B), out.subarray(i, i + B));
  return { out: out.subarray(Math.floor(sr * 0.25)), core };
}

let fails = 0;
function check(name, value, expect, tol) {
  const ok = Math.abs(value - expect) <= tol;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${value.toFixed(3)} (expect ${expect} ±${tol})`);
}

const sr = 48000;
const user = synthVoice(sr, 3, 120, 1.0);
const base = A.analyze(user, sr);
check('analysis F0 of 120 Hz voice', base.f0, 120, 4);

// friend: higher pitch, formants +15%
const friend = A.analyze(synthVoice(sr, 3, 210, 1.15, 7), sr);
check('analysis F0 of 210 Hz voice', friend.f0, 210, 6);
const warp = A.formantWarp(friend, base);
check('formant warp estimate (1.15)', warp.ratio, 1.15, 0.05);
const prof = A.profileFrom(friend, base);
check('profile pitch semitones (≈9.69)', prof.pitch, 9.69, 0.6);

// PSOLA pitch-only shift
for (const ratio of [1.5, 0.75]) {
  const { out, core } = runCore(user, sr, { pitch: ratio, formant: 1 });
  const r = A.analyze(out, sr);
  check(`PSOLA pitch x${ratio} → F0`, r.f0, 120 * ratio, 120 * ratio * 0.04);
  const w = A.formantWarp(r, base);
  check(`PSOLA pitch x${ratio} keeps formants`, w.ratio, 1.0, 0.06);
  if (ratio === 1.5) console.log(`      latency ${(core.latencySamples() / sr * 1000).toFixed(1)} ms`);
}
// formant-only shift
{
  const { out } = runCore(user, sr, { pitch: 1, formant: 1.18 });
  const r = A.analyze(out, sr);
  check('formant x1.18 keeps F0', r.f0, 120, 6);
  check('formant x1.18 → warp', A.formantWarp(r, base).ratio, 1.18, 0.06);
}
// robot monotone
{
  const { out } = runCore(synthVoice(sr, 3, 150, 1.0, 3), sr, { pitch: 1, formant: 1, robotHz: 100 });
  check('robot mode F0 locks to 100 Hz', A.analyze(out, sr).f0, 100, 4);
}
// output level sanity: no explosion
{
  const { out } = runCore(user, sr, { pitch: 1.9, formant: 0.8 });
  let pk = 0; for (const v of out) pk = Math.max(pk, Math.abs(v));
  check('peak level stays bounded', pk, 0.6, 0.45);
}
// lower formant (deeper timbre) still tracks
{
  const r = A.analyze(runCore(user, sr, { pitch: 1, formant: 0.84 }).out, sr);
  check('formant x0.84 keeps F0', r.f0, 120, 6);
  check('formant x0.84 → warp', A.formantWarp(r, base).ratio, 0.84, 0.07);
}
// hard tune: 126 Hz (between B2 and C3) snaps to a semitone
{
  const r = A.analyze(runCore(synthVoice(sr, 3, 126, 1.0, 5), sr, { pitch: 1, formant: 1, tune: 1 }).out, sr);
  const semi = 12 * Math.log2(r.f0 / 440);
  check('hard tune lands on a semitone', Math.abs(semi - Math.round(semi)), 0, 0.12);
}
// zero-latency effects: crusher / tremolo / ring do not delay the signal
{
  const c = new VoxCore(sr); c.set({ pitch: 1, formant: 1, crush: 0.7, trem: 0.5 });
  check('crusher/tremolo add no delay', c.latencySamples(), 0, 0);
}
// recovers from a non-finite sample instead of going silent forever
{
  const c = new VoxCore(sr); c.set({ pitch: 1.4, formant: 1 });
  const blk = new Float32Array(128), out = new Float32Array(128);
  for (let k = 0; k < 50; k++) { for (let i = 0; i < 128; i++) blk[i] = Math.sin(i * 0.1) * 0.3; c.process(blk, out); }
  blk[5] = NaN; c.process(blk, out);
  let alive = 0;
  for (let k = 0; k < 200; k++) { for (let i = 0; i < 128; i++) blk[i] = Math.sin((k * 128 + i) * 0.05) * 0.3; c.process(blk, out); for (const v of out) if (Number.isFinite(v) && Math.abs(v) > 0.01) alive++; }
  check('recovers after a NaN input (non-silent output)', alive > 1000 ? 1 : 0, 1, 0);
}
// CPU budget: seconds of audio processed per second
{
  const t = Date.now();
  runCore(synthVoice(sr, 10, 140, 1), sr, { pitch: 1.3, formant: 1.1 });
  const ms = Date.now() - t;
  console.log(`INFO  10 s of 48 kHz audio processed in ${ms} ms (${(10000 / ms).toFixed(0)}x realtime, incl. synthesis)`);
}
console.log(fails ? `\n${fails} check(s) failed` : '\nall checks passed');
process.exit(fails ? 1 : 0);
