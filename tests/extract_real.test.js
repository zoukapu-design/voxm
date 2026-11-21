// extraction on speech-like signals: quiet phone video, noise, reverb, conversations, AAC
const A = require('../src/analysis.js');
const Sy = require('./speech_synth.js');
global.performance = global.performance || require('perf_hooks').performance;
const fs = require('fs'), cp = require('child_process');
const sr = 48000;

function conversation(spk, total, seed) {
  const parts = [], truth = spk.map(() => []);
  let t = 0.3, k = 0, s = seed;
  while (t < total - 2) {
    const turn = 3 + ((s = (s * 48271) % 2147483647) % 1000) / 1000 * 5;
    const i = k % spk.length;
    const tk = Sy.talk(Math.min(turn, total - t), Object.assign({ seed: s % 9973 + 1 }, spk[i]));
    parts.push({ x: tk.x, at: t });
    for (const [a, b] of tk.speech) truth[i].push([t + a, t + b]);
    t += turn + 0.3; k++;
  }
  return { x: Sy.place(total, sr, parts), truth };
}
const overlap = (segs, truth) => { let o = 0; for (const [a, b] of segs) for (const [c, d] of truth) o += Math.max(0, Math.min(b, d) - Math.max(a, c)); return o; };
const dur = (segs) => segs.reduce((s, [a, b]) => s + b - a, 0);
function aacRoundtrip(x) {
  fs.writeFileSync('/tmp/_in.raw', Buffer.from(x.buffer));
  cp.execSync('ffmpeg -y -loglevel error -f f32le -ar 48000 -ac 1 -i /tmp/_in.raw -c:a aac -b:a 64k /tmp/_a.m4a && ffmpeg -y -loglevel error -i /tmp/_a.m4a -f f32le -ar 48000 -ac 1 /tmp/_out.raw');
  const b = fs.readFileSync('/tmp/_out.raw'); return new Float32Array(b.buffer, b.byteOffset, b.length / 4).slice();
}
async function run(name, x, truth, expectN) {
  const t0 = Date.now();
  const r = await A.segmentSpeakers(x, sr);
  const lines = [], fails = [];
  const used = new Set();
  truth.forEach((tr, i) => {
    // best candidate for this true speaker
    let best = -1, bo = 0;
    r.candidates.forEach((c, j) => { const o = overlap(c.segments, tr); if (o > bo) { bo = o; best = j; } });
    const c = r.candidates[best];
    const recall = bo / dur(tr), purity = c ? bo / dur(c.segments) : 0;
    lines.push(`spk${i}: recall ${(recall * 100).toFixed(0)}% purity ${(purity * 100).toFixed(0)}% → ${c ? 'cand ' + best + ' f0 ' + Math.round(c.f0) : 'none'}`);
    if (recall < 0.7) fails.push(`spk${i} recall`);
    if (purity < 0.8) fails.push(`spk${i} purity`);
    if (used.has(best)) fails.push(`spk${i} shares candidate`); used.add(best);
  });
  if (expectN && r.candidates.length !== expectN) fails.push(`expected ${expectN} candidates, got ${r.candidates.length}`);
  console.log(`[${name}] ${Date.now() - t0}ms cands=${r.candidates.map((c) => c.seconds + 's/' + Math.round(c.f0)).join(' ')} | ${lines.join(' | ')}${fails.length ? '  FAIL: ' + fails.join(', ') : '  ok'}`);
  return fails.length === 0;
}
(async () => {
  let ok = true;
  const male = { f0: 118, fs: 1 }, female = { f0: 225, fs: 1.17 }, male2 = { f0: 150, fs: 1.12, tilt: 0.45 };
  // 1) one person, quiet phone video with room + noise
  {
    const tk = Sy.talk(40, Object.assign({ seed: 3 }, male));
    let x = Sy.reverb(tk.x, sr); x = Sy.gain(x, 0.004 / Sy.rms(x)); x = Sy.mix(x, Sy.noise(x.length, 0.0015));
    ok = (await run('solo quiet', x, [tk.speech], 1)) && ok;
  }
  // 2) man + woman conversation, noise
  {
    const c = conversation([male, female], 60, 11);
    let x = Sy.reverb(c.x, sr); x = Sy.gain(x, 0.03 / Sy.rms(x)); x = Sy.mix(x, Sy.noise(x.length, 0.004));
    ok = (await run('man+woman', x, c.truth, 2)) && ok;
    ok = (await run('man+woman AAC', aacRoundtrip(x), c.truth, 2)) && ok;
  }
  // 3) two men
  {
    const c = conversation([male, male2], 60, 23);
    let x = Sy.reverb(c.x, sr); x = Sy.gain(x, 0.02 / Sy.rms(x)); x = Sy.mix(x, Sy.noise(x.length, 0.002));
    ok = (await run('two men', x, c.truth, 2)) && ok;
  }
  // 4) one woman, loud with music-like background hum
  {
    const tk = Sy.talk(30, Object.assign({ seed: 8 }, female));
    const hum = new Float32Array(tk.x.length); for (let i = 0; i < hum.length; i++) hum[i] = 0.004 * (Math.sin(2 * Math.PI * 98 * i / sr) + 0.5 * Math.sin(2 * Math.PI * 147 * i / sr));
    let x = Sy.gain(tk.x, 0.05 / Sy.rms(tk.x)); x = Sy.mix(x, hum, Sy.noise(x.length, 0.003));
    ok = (await run('solo + hum', x, [tk.speech], 1)) && ok;
  }
  console.log(ok ? 'real extract checks passed' : 'SOME FAILED'); process.exit(ok ? 0 : 1);
})();
