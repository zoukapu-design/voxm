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


  // one cepstral envelope frame from the last NFFT samples of a 16 kHz-ish signal (live speaker tracking)
  const _re = new Float32Array(NFFT), _im = new Float32Array(NFFT);
  function envFrame(x, st, out) {
    for (let k = 0; k < NFFT; k++) { const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * k) / (NFFT - 1)); _re[k] = (x[st + k] || 0) * w; _im[k] = 0; }
    fft(_re, _im);
    for (let k = 0; k < NFFT; k++) { _re[k] = Math.log(_re[k] * _re[k] + _im[k] * _im[k] + 1e-10) * 0.5; _im[k] = 0; }
    fft(_re, _im);
    for (let k = 0; k < NFFT; k++) { const q = Math.min(k, NFFT - k); if (q > LIFTER) { _re[k] = 0; _im[k] = 0; } else { _re[k] /= NFFT; _im[k] /= NFFT; } }
    for (let k = 0; k < NFFT; k++) _im[k] = -_im[k];
    fft(_re, _im);
    out = out || new Float32Array(NFFT / 2);
    for (let k = 0; k < NFFT / 2; k++) out[k] = _re[k];
    return out;
  }
  // raw mic block at the context rate → { env, envSr, rms } (null if too short/quiet)
  function envFromRaw(buf, sr) {
    const { x, sr: s2 } = prepare(buf, sr);
    if (x.length < NFFT) return null;
    const st = x.length - NFFT;
    let e = 0; for (let k = st; k < x.length; k++) e += x[k] * x[k];
    return { env: envFrame(x, st), envSr: s2, rms: Math.sqrt(e / NFFT) };
  }

  /* ---- speaker extraction from a long recording / video soundtrack ----
     Finds voiced stretches, describes each by pitch + spectral envelope, and groups them into voices
     (agglomerative clustering). Returns candidate voices sorted by how long they speak. */
  const MEL = []; for (let i = 0; i < 18; i++) MEL.push(300 * Math.pow(4200 / 300, i / 17));
  async function segmentSpeakers(samples, sampleRate, onProgress) {
    const { x, sr } = prepare(samples, sampleRate);
    const hop = Math.round(sr * 0.03);
    const fr = [];
    const need = Math.ceil(sr / 60) * 2 + 80;
    let lastYield = performance.now();
    for (let st = 0; st + Math.max(need, NFFT) < x.length; st += hop) {
      const r = yinFrame(x, st, sr, 70, 500);
      fr.push({ st, f0: r.f0, rms: r.rms, cl: r.clarity });
      if (performance.now() - lastYield > 40) { onProgress && onProgress(st / x.length * 0.8); await new Promise((r2) => setTimeout(r2, 0)); lastYield = performance.now(); }
    }
    if (!fr.length) return { sr, candidates: [] };
    const rmsSorted = fr.map((f) => f.rms).sort((a, b) => a - b);
    const floor = rmsSorted[Math.floor(rmsSorted.length * 0.05)] || 0; // background noise level
    const peakR = rmsSorted[Math.floor(rmsSorted.length * 0.98)] || 0;
    const thr = Math.max(0.006, floor * 3, peakR * 0.03);
    const voiced = fr.map((f) => f.f0 > 0 && f.rms > thr);
    // voiced runs with short gaps bridged; long runs split so a turn change inside a run can be separated
    const segs = [];
    let i = 0;
    while (i < fr.length) {
      if (!voiced[i]) { i++; continue; }
      let j = i, gap = 0, last = i;
      while (j < fr.length && gap <= 8) { if (voiced[j]) { gap = 0; last = j; } else gap++; j++; }
      for (let a = i; a <= last; a += 130) { const b = Math.min(last, a + 129); if (b - a >= 16) segs.push([a, b]); }
      i = last + 1;
    }
    const env = new Float32Array(NFFT / 2);
    const items = [];
    for (const [a, b] of segs) {
      const f0s = [], picks = [];
      for (let k = a; k <= b; k++) if (voiced[k]) { f0s.push(fr[k].f0); picks.push(k); }
      if (f0s.length < 10) continue;
      let med = median(f0s); med = median(f0s.filter((f) => f > med * 0.7 && f < med * 1.42)) || med;
      const feat = new Float32Array(MEL.length);
      const step = Math.max(1, Math.floor(picks.length / 10));
      let n = 0;
      for (let q = 0; q < picks.length; q += step) {
        envFrame(x, fr[picks[q]].st, env);
        for (let m = 0; m < MEL.length; m++) feat[m] += envAt(env, sr, MEL[m]);
        n++;
      }
      let mean = 0; for (let m = 0; m < MEL.length; m++) { feat[m] /= n; mean += feat[m]; }
      mean /= MEL.length; for (let m = 0; m < MEL.length; m++) feat[m] -= mean;
      items.push({ t0: fr[a].st / sr, t1: (fr[b].st + hop) / sr, dur: (b - a + 1) * hop / sr, voicedDur: f0s.length * hop / sr, st: 12 * Math.log2(med / 100), feat });
    }
    onProgress && onProgress(0.9);
    const dist = (p, q) => {
      let d = 0; for (let m = 0; m < MEL.length; m++) d += (p.feat[m] - q.feat[m]) ** 2;
      return Math.abs(p.st - q.st) / 2.6 + Math.sqrt(d / MEL.length) / 0.32;
    };
    let cl = items.map((it) => ({ w: it.voicedDur, st: it.st, feat: Float32Array.from(it.feat), segs: [it] }));
    const merge = (A, B) => {
      const w = A.w + B.w, feat = new Float32Array(MEL.length);
      for (let m = 0; m < MEL.length; m++) feat[m] = (A.feat[m] * A.w + B.feat[m] * B.w) / w;
      return { w, st: (A.st * A.w + B.st * B.w) / w, feat, segs: A.segs.concat(B.segs) };
    };
    for (;;) {
      if (cl.length < 2) break;
      let bi = -1, bj = -1, bd = 1e9;
      for (let p = 0; p < cl.length; p++) for (let q = p + 1; q < cl.length; q++) { const d = dist(cl[p], cl[q]); if (d < bd) { bd = d; bi = p; bj = q; } }
      if (bd > 1.5 && cl.length <= 4) break;
      const m = merge(cl[bi], cl[bj]);
      cl = cl.filter((_, k) => k !== bi && k !== bj); cl.push(m);
    }
    const total = cl.reduce((s, c) => s + c.w, 0);
    const candidates = cl
      .filter((c) => c.w >= Math.min(1.5, total * 0.5))
      .sort((a, b) => b.w - a.w)
      .map((c) => ({ seconds: +c.w.toFixed(1), f0: 100 * Math.pow(2, c.st / 12), segments: c.segs.map((s) => [s.t0, s.t1]).sort((a, b) => a[0] - b[0]) }));
    onProgress && onProgress(1);
    return { duration: samples.length / sampleRate, candidates };
  }
  // concatenate time ranges (seconds) of a signal
  function sliceSegments(samples, sampleRate, segments, maxSec) {
    let n = 0; const parts = [];
    for (const [a, b] of segments) {
      const s0 = Math.max(0, Math.floor(a * sampleRate)), s1 = Math.min(samples.length, Math.ceil(b * sampleRate));
      if (s1 <= s0) continue;
      const take = maxSec ? Math.min(s1 - s0, Math.floor(maxSec * sampleRate) - n) : s1 - s0;
      if (take <= 0) break;
      parts.push(samples.subarray(s0, s0 + take)); n += take;
    }
    const out = new Float32Array(n); let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }
  // 16-bit mono WAV (for storing an extracted voice sample)
  function wavBlob(samples, sr) {
    const buf = new ArrayBuffer(44 + samples.length * 2), v = new DataView(buf);
    const w = (o, str) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, samples.length * 2, true);
    for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 32767, true);
    return new Blob([buf], { type: 'audio/wav' });
  }

  return { analyze, formantWarp, profileFrom, decodeBlob, fft, yinFrame, envFrame, envFromRaw, segmentSpeakers, sliceSegments, wavBlob };
})();
if (typeof module !== 'undefined') module.exports = VoxAnalysis;
