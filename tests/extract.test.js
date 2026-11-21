// speaker extraction + live speaker envelope sanity checks (synthetic voices)
const A = require('../src/analysis.js');
global.performance = global.performance || require('perf_hooks').performance;
const sr = 48000;
function voice(sec, f0, fScale, seed) {
  const n = Math.floor(sec * sr), out = new Float32Array(n);
  const F = [[700, 110], [1220, 120], [2600, 160]].map(([f, bw]) => [f * fScale, bw]);
  const vowels = [1, 0.75, 1.25, 0.9];
  let ph = 0, r = seed;
  const st = F.map(() => [0, 0]);
  for (let i = 0; i < n; i++) {
    const t = i / sr, v = vowels[Math.floor(t * 3) % 4];
    const f = f0 * (1 + 0.06 * Math.sin(2 * Math.PI * 1.3 * t)) * (1 + 0.01 * Math.sin(i * 0.001 * seed));
    ph += f / sr; let x = 0; if (ph >= 1) { ph -= 1; x = 1; }
    r = (r * 16807) % 2147483647; x += ((r / 2147483647) - 0.5) * 0.02;
    let y = 0;
    F.forEach(([fc, bw], k) => {
      const w = 2 * Math.PI * fc * (k === 0 ? v : 1) / sr, R = Math.exp(-Math.PI * bw / sr);
      const a1 = 2 * R * Math.cos(w), a2 = -R * R, s = st[k];
      const o = x + a1 * s[0] + a2 * s[1]; s[1] = s[0]; s[0] = o; y += o * (k === 0 ? 1 : 0.5);
    });
    out[i] = y * 0.02 * (0.6 + 0.4 * Math.abs(Math.sin(Math.PI * t * 3)));
  }
  return out;
}
function cat(parts) { const n = parts.reduce((s, p) => s + p.length, 0), o = new Float32Array(n); let k = 0; for (const p of parts) { o.set(p, k); k += p.length; } return o; }
const gap = (s) => { const g = new Float32Array(Math.floor(s * sr)); for (let i = 0; i < g.length; i++) g[i] = (Math.random() - 0.5) * 0.002; return g; };
const sig = cat([voice(3, 115, 1, 3), gap(0.6), voice(2.5, 225, 1.2, 7), gap(0.5), voice(4, 112, 1, 5), gap(0.7), voice(3, 232, 1.2, 9), gap(0.4), voice(2, 118, 1, 11)]);
(async () => {
  if (process.env.WAV) { require('fs').writeFileSync(process.env.WAV, Buffer.from(await A.wavBlob(sig, sr).arrayBuffer())); console.log('wrote', process.env.WAV); return; }
  const t0 = Date.now();
  const r = await A.segmentSpeakers(sig, sr);
  console.log('time', Date.now() - t0, 'ms', 'candidates', r.candidates.map((c) => ({ s: c.seconds, f0: Math.round(c.f0), segs: c.segments.length })));
  const ok = r.candidates.length === 2 && Math.abs(r.candidates[0].f0 - 115) < 15 && Math.abs(r.candidates[1].f0 - 228) < 20;
  if (!ok) { console.log('FAIL: expected two voices (~115 Hz longer, ~228 Hz)'); process.exit(1); }
  // extracted voice B analysed alone → profile vs voice A should be about +12 semitones and higher formants
  const bOnly = A.sliceSegments(sig, sr, r.candidates[1].segments);
  const aOnly = A.sliceSegments(sig, sr, r.candidates[0].segments);
  const pa = A.analyze(aOnly, sr), pb = A.analyze(bOnly, sr);
  const prof = A.profileFrom(pb, pa);
  console.log('profile B vs A', prof);
  if (Math.abs(prof.pitch - 12 * Math.log2(228 / 115)) > 1.5 || prof.formant < 1.5) { console.log('FAIL profile'); process.exit(1); }
  // live envelope frames average ≈ offline envelope → same warp
  const acc = new Float32Array(512); let n = 0;
  for (let i = 4096; i < aOnly.length; i += 4800) { const e = A.envFromRaw(aOnly.subarray(i - 4096, i), sr); if (e && e.rms > 0.003) { for (let k = 0; k < 512; k++) acc[k] += e.env[k]; n++; } }
  for (let k = 0; k < 512; k++) acc[k] /= n;
  const live = { f0: pa.f0, env: Array.from(acc), envSr: 16000 };
  const prof2 = A.profileFrom(pb, live);
  console.log('profile B vs live-A', prof2, 'frames', n);
  if (Math.abs(prof2.formant - prof.formant) > 1.2) { console.log('FAIL live env'); process.exit(1); }
  console.log('extract checks passed');
})();
