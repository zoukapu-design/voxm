// Speech-like test signals: syllables (consonant noise + vowel with moving formants and intonation),
// pauses, room reverb, background noise. Not real speech, but much closer than steady tones.
const VOWELS = { a: [800, 1200, 2500], i: [300, 2300, 3000], u: [350, 1300, 2400], e: [500, 1900, 2600], o: [500, 900, 2500] };
const VK = Object.keys(VOWELS);
function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// one speaker talking for `sec` seconds: returns {x, speech:[[t0,t1],...]} (speech = time ranges with sound)
function talk(sec, { f0 = 120, fs = 1, seed = 1, sr = 48000, tilt = 0.6, breath = 0.03 } = {}) {
  const R = rng(seed), n = Math.floor(sec * sr), x = new Float32Array(n), speech = [];
  const res = [0, 1, 2].map(() => [0, 0]);
  let t = 0.15 * sr, ph = 0, lp = 0;
  while (t < n - sr * 0.3) {
    // a phrase of 4-12 syllables, then a pause
    const syl = 4 + Math.floor(R() * 9), start = t;
    const base = f0 * Math.pow(2, (R() - 0.5) * 0.25);
    for (let s = 0; s < syl && t < n - sr * 0.3; s++) {
      // consonant: 30-90 ms of shaped noise (some syllables have none)
      if (R() < 0.7) {
        const cl = Math.floor((0.03 + R() * 0.06) * sr), hpf = R();
        let prev = 0;
        for (let k = 0; k < cl && t + k < n; k++) { const w = (R() - 0.5); const v = w - prev * hpf; prev = w; x[t + k] += v * 0.08 * Math.sin(Math.PI * k / cl); }
        t += cl;
      }
      // vowel: 90-220 ms, formants glide toward the next vowel, pitch follows a falling phrase contour
      const vl = Math.floor((0.09 + R() * 0.13) * sr);
      const V0 = VOWELS[VK[Math.floor(R() * 5)]], V1 = VOWELS[VK[Math.floor(R() * 5)]];
      const prog = (t - start) / (sr * 2);
      const fp = base * Math.pow(2, (-prog * 3 + (R() - 0.5) * 2) / 12);
      for (let k = 0; k < vl && t + k < n; k++) {
        const u = k / vl, env = Math.min(1, k / (0.02 * sr), (vl - k) / (0.03 * sr));
        const f = fp * (1 + 0.04 * Math.sin(2 * Math.PI * 5 * (t + k) / sr)) * (1 + (u - 0.5) * 0.06);
        ph += f / sr; let src = 0; if (ph >= 1) { ph -= 1; src = 1; }
        lp += (src - lp) * (1 - tilt); // spectral tilt of the glottal source
        let g = lp + (R() - 0.5) * breath;
        let y = 0;
        for (let q = 0; q < 3; q++) {
          const fc = (V0[q] + (V1[q] - V0[q]) * u) * fs, bw = 80 + q * 40;
          const w = 2 * Math.PI * fc / sr, rr = Math.exp(-Math.PI * bw / sr), st = res[q];
          const o = g + 2 * rr * Math.cos(w) * st[0] - rr * rr * st[1]; st[1] = st[0]; st[0] = o; y += o * [1, 0.6, 0.35][q];
        }
        x[t + k] += y * 0.01 * env;
      }
      t += vl;
    }
    speech.push([start / sr, t / sr]);
    t += Math.floor((0.25 + R() * 0.7) * sr);
  }
  return { x, speech };
}
function reverb(x, sr, rt = 0.35, mix = 0.25, seed = 9) {
  const R = rng(seed), L = Math.floor(rt * sr), ir = new Float32Array(L);
  for (let i = 0; i < L; i++) ir[i] = (R() - 0.5) * Math.exp(-6.9 * i / L);
  const out = Float32Array.from(x);
  // sparse convolution (every 8th tap) keeps the test fast
  for (let j = 1; j < L; j += 8) { const g = ir[j] * mix * 0.35; if (!g) continue; for (let i = j; i < x.length; i++) out[i] += x[i - j] * g; }
  return out;
}
function noise(n, level, seed = 5) { const R = rng(seed), o = new Float32Array(n); let b = 0; for (let i = 0; i < n; i++) { b = b * 0.97 + (R() - 0.5) * 0.3; o[i] = b * level; } return o; }
function mix(...arrs) { const n = Math.max(...arrs.map((a) => a.length)), o = new Float32Array(n); for (const a of arrs) for (let i = 0; i < a.length; i++) o[i] += a[i]; return o; }
function gain(x, g) { return x.map((v) => v * g); }
function rms(x) { let e = 0; for (const v of x) e += v * v; return Math.sqrt(e / x.length); }
function place(total, sr, parts) { // parts: [{x, at}] → one signal
  const o = new Float32Array(Math.floor(total * sr));
  for (const p of parts) { const s = Math.floor(p.at * sr); for (let i = 0; i < p.x.length && s + i < o.length; i++) o[s + i] += p.x[i]; }
  return o;
}
module.exports = { talk, reverb, noise, mix, gain, rms, place };
