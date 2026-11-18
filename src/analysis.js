/* VOXM voice analysis — measures a recording's pitch (F0) and average spectral envelope,
 * and estimates how far one voice's formants sit from another's (warp ratio).
 * This is a lightweight "voice character" profile, not an AI voice-cloning model.
 */
const VoxAnalysis = (() => {
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (-2 * Math.PI) / len;
      const wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const ar = re[i + k], ai = im[i + k];
          const br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
          const bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
          re[i + k] = ar + br; im[i + k] = ai + bi;
          re[i + k + len / 2] = ar - br; im[i + k + len / 2] = ai - bi;
          const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
        }
      }
    }
  }

  function yinFrame(x, start, sr, fmin, fmax) {
    // returns {f0, clarity, rms}
    const tmin = Math.floor(sr / fmax), tmax = Math.ceil(sr / fmin);
    const W = tmax + 64;
    let e = 0;
    for (let k = 0; k < W + tmax; k++) { const v = x[start + k] || 0; e += v * v; }
    const rms = Math.sqrt(e / (W + tmax));
    if (rms < 0.006) return { f0: 0, clarity: 0, rms };
    const d = new Float32Array(tmax + 2);
    let running = 0;
    for (let tau = 1; tau <= tmax + 1; tau++) {
      let s = 0;
      for (let k = 0; k < W; k++) { const df = x[start + k] - x[start + k + tau]; s += df * df; }
      running += s;
      d[tau] = running > 0 ? (s * tau) / running : 1;
    }
    let best = 0, bv = 1e9;
    for (let tau = tmin; tau <= tmax; tau++) {
      if (d[tau] < 0.15) { while (tau < tmax && d[tau + 1] < d[tau]) tau++; best = tau; bv = d[tau]; break; }
      if (d[tau] < bv) { bv = d[tau]; best = tau; }
    }
    if (!best || bv > 0.35) return { f0: 0, clarity: 1 - bv, rms };
    let t = best;
    const a = d[best - 1], b = d[best], c = d[best + 1];
    const den = a - 2 * b + c;
    if (Math.abs(den) > 1e-9) t = best + 0.5 * (a - c) / den;
    return { f0: sr / t, clarity: 1 - bv, rms };
  }

  // Downsample to ~16 kHz for analysis to keep it fast on phones.
  function prepare(samples, sr) {
    const ds = Math.max(1, Math.round(sr / 16000));
    const out = new Float32Array(Math.floor(samples.length / ds));
    for (let i = 0; i < out.length; i++) {
      let s = 0;
      for (let q = 0; q < ds; q++) s += samples[i * ds + q];
      out[i] = s / ds;
    }
    return { x: out, sr: sr / ds };
  }

  function median(arr) {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  }

  const NFFT = 1024, LIFTER = 22, FMAX_ENV = 5000;

  function analyze(samples, sampleRate) {
    const { x, sr } = prepare(samples, sampleRate);
    const hop = Math.round(sr * 0.01);
    const f0s = [], voicedStarts = [];
    let frames = 0, peak = 0, totalE = 0;
    for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > peak) peak = a; totalE += x[i] * x[i]; }
    const need = Math.ceil(sr / 60) * 2 + 80;
    for (let st = 0; st + Math.max(need, NFFT) < x.length; st += hop) {
      frames++;
      const r = yinFrame(x, st, sr, 60, 600);
      if (r.f0 > 0) { f0s.push(r.f0); voicedStarts.push(st); }
    }
    // remove octave outliers around the median
    let med = median(f0s);
    const clean = f0s.filter((f) => f > med * 0.7 && f < med * 1.42);
    med = median(clean);
    const env = new Float32Array(NFFT / 2);
    let envCount = 0;
    const re = new Float32Array(NFFT), im = new Float32Array(NFFT);
    const stride = Math.max(1, Math.floor(voicedStarts.length / 160));
    for (let v = 0; v < voicedStarts.length; v += stride) {
      const st = voicedStarts[v];
      for (let k = 0; k < NFFT; k++) {
        const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * k) / (NFFT - 1));
        re[k] = (x[st + k] || 0) * w; im[k] = 0;
      }
      fft(re, im);
      // log magnitude -> real cepstrum -> lifter -> smooth envelope
      for (let k = 0; k < NFFT; k++) { re[k] = Math.log(re[k] * re[k] + im[k] * im[k] + 1e-10) * 0.5; im[k] = 0; }
      fft(re, im);
      for (let k = 0; k < NFFT; k++) {
        const q = Math.min(k, NFFT - k);
        if (q > LIFTER) { re[k] = 0; im[k] = 0; }
        else { re[k] /= NFFT; im[k] /= NFFT; }
      }
      // inverse via conj trick
      for (let k = 0; k < NFFT; k++) im[k] = -im[k];
      fft(re, im);
      for (let k = 0; k < NFFT / 2; k++) env[k] += re[k];
      envCount++;
    }
    if (envCount) for (let k = 0; k < env.length; k++) env[k] /= envCount;
    return {
      f0: med || 0,
      voicedRatio: frames ? f0s.length / frames : 0,
      seconds: samples.length / sampleRate,
      peak,
      rms: Math.sqrt(totalE / Math.max(1, x.length)),
      envSr: sr,
      env: Array.from(env),
      ok: med > 0 && envCount >= 8,
    };
  }

  function envAt(env, sr, hz) {
    const bin = (hz / sr) * NFFT;
    const i = Math.floor(bin), f = bin - i;
    if (i < 0 || i + 1 >= env.length) return env[Math.max(0, Math.min(env.length - 1, i))];
    return env[i] + (env[i + 1] - env[i]) * f;
  }

  // Find alpha so that target(f) ≈ base(f / alpha). alpha > 1 → target formants are higher.
  function formantWarp(target, base) {
    let bestA = 1, bestC = -2;
    const freqs = [];
    for (let hz = 300; hz <= 4200; hz += 25) freqs.push(hz);
    for (let a = 0.74; a <= 1.42; a += 0.005) {
      const A = [], B = [];
      for (const hz of freqs) { A.push(envAt(target.env, target.envSr, hz)); B.push(envAt(base.env, base.envSr, hz / a)); }
      const ma = A.reduce((s, v) => s + v, 0) / A.length, mb = B.reduce((s, v) => s + v, 0) / B.length;
      let sab = 0, saa = 0, sbb = 0;
      for (let i = 0; i < A.length; i++) { const da = A[i] - ma, db = B[i] - mb; sab += da * db; saa += da * da; sbb += db * db; }
      const c = sab / Math.sqrt(saa * sbb + 1e-12);
      if (c > bestC) { bestC = c; bestA = a; }
    }
    return { ratio: bestA, confidence: bestC };
  }

  // Build a playable profile that moves `base` (the user's own voice) toward `target`.
  function profileFrom(target, base) {
    const pitchRatio = target.f0 / base.f0;
    const warp = formantWarp(target, base);
    const semis = 12 * Math.log2(pitchRatio);
    return {
      pitch: +Math.max(-12, Math.min(12, semis)).toFixed(2),
      formant: +(12 * Math.log2(Math.max(0.74, Math.min(1.42, warp.ratio)))).toFixed(2),
      confidence: +warp.confidence.toFixed(3),
    };
  }

  async function decodeBlob(blob, ctx) {
    const buf = await blob.arrayBuffer();
    const ac = ctx || new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 44100, 44100);
    const audio = await new Promise((res, rej) => {
      const p = ac.decodeAudioData(buf, res, rej);
      if (p && p.then) p.then(res, rej);
    });
    const ch0 = audio.getChannelData(0);
    let mono = ch0;
    if (audio.numberOfChannels > 1) {
      const ch1 = audio.getChannelData(1);
      mono = new Float32Array(ch0.length);
      for (let i = 0; i < ch0.length; i++) mono[i] = (ch0[i] + ch1[i]) * 0.5;
    }
    return { samples: mono, sampleRate: audio.sampleRate, buffer: audio };
  }

  return { analyze, formantWarp, profileFrom, decodeBlob, fft, yinFrame };
})();
if (typeof module !== 'undefined') module.exports = VoxAnalysis;
