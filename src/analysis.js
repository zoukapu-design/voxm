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

  function yinFrame(x, start, sr, fmin, fmax, maxAp = 0.35) {
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
    if (!best || bv > maxAp) return { f0: 0, clarity: 1 - bv, rms };
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
  // bring quiet recordings (a phone video from across the room) up to a working level:
  // the loud end of the frame-energy distribution goes to ~0.12 RMS
  function normalized(x, sr) {
    const L = Math.max(64, Math.round(sr * 0.02)), es = [];
    for (let i = 0; i + L <= x.length; i += L) { let e = 0; for (let k = i; k < i + L; k++) e += x[k] * x[k]; es.push(Math.sqrt(e / L)); }
    if (!es.length) return x;
    es.sort((a, b) => a - b);
    const p95 = es[Math.floor(es.length * 0.95)] || 0;
    if (p95 < 1e-6) return x;
    const g = Math.max(0.5, Math.min(80, 0.12 / p95));
    if (Math.abs(g - 1) < 0.05) return x;
    const o = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) { const v = x[i] * g; o[i] = v > 1 ? 1 : v < -1 ? -1 : v; }
    return o;
  }

  function analyze(samples, sampleRate) {
    const pr = prepare(samples, sampleRate), sr = pr.sr, x = normalized(pr.x, pr.sr);
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

  // Residual tone difference after the formant warp, as gains (dB) for a few peaking EQ bands.
  const EQ_BANDS = [320, 650, 1150, 2000, 3200, 5000];
  function timbreEq(target, base, ratio) {
    const out = [], diff = [];
    for (const fb of EQ_BANDS) {
      let d = 0, n = 0;
      for (let f = fb / 1.22; f <= fb * 1.22; f *= 1.04) { d += envAt(target.env, target.envSr, f) - envAt(base.env, base.envSr, f / ratio); n++; }
      diff.push(d / n);
    }
    const mean = diff.reduce((s2, v) => s2 + v, 0) / diff.length;
    for (const d of diff) out.push(+Math.max(-9, Math.min(9, (d - mean) * 8.686 * 0.75)).toFixed(1));
    return out;
  }
  // Build a playable profile that moves `base` (the user's own voice) toward `target`.
  function profileFrom(target, base) {
    const pitchRatio = target.f0 / base.f0;
    const warp = formantWarp(target, base);
    const semis = 12 * Math.log2(pitchRatio);
    const ratio = Math.max(0.74, Math.min(1.42, warp.ratio));
    return {
      eq: timbreEq(target, base, ratio),
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
  // log-spaced points (≈1 semitone apart): a vocal-tract length difference is a shift along this axis
  const MEL = []; for (let i = 0; i < 52; i++) MEL.push(260 * Math.pow(2, i / 12));
  async function segmentSpeakers(samples, sampleRate, onProgress) {
    const pr = prepare(samples, sampleRate), sr = pr.sr, x = normalized(pr.x, pr.sr);
    const hop = Math.round(sr * 0.02), half = Math.round(sr * 0.02);
    const need = Math.ceil(sr / 65) * 2 + 80;
    const fr = [];
    let lastYield = performance.now();
    for (let st = 0; st + Math.max(need, NFFT) < x.length; st += hop) {
      // energy of the 40 ms around this hop
      let e = 0; for (let k = st; k < st + 2 * half; k++) e += x[k] * x[k];
      const rms = Math.sqrt(e / (2 * half));
      const y = rms > 0.004 ? yinFrame(x, st, sr, 65, 520, 0.45) : { f0: 0 };
      fr.push({ st, rms, f0: y.f0 });
      if (performance.now() - lastYield > 40) { onProgress && onProgress((st / x.length) * 0.8); await new Promise((r) => setTimeout(r, 0)); lastYield = performance.now(); }
    }
    if (fr.length < 20) return { duration: samples.length / sampleRate, candidates: [] };
    // speech = clearly above the file's own noise floor
    const db = fr.map((f) => 20 * Math.log10(f.rms + 1e-9));
    const sorted = [...db].sort((a, b) => a - b);
    const floor = sorted[Math.floor(sorted.length * 0.1)], top = sorted[Math.floor(sorted.length * 0.97)];
    const thr = Math.max(Math.min(floor + 9, top - 10), top - 38); // (continuous talking has no quiet floor)
    const speech = db.map((d) => d > thr);
    // speech runs: bridge gaps up to 300 ms, keep runs ≥ 0.4 s that contain enough voiced frames
    const runs = [];
    for (let i = 0; i < fr.length;) {
      if (!speech[i]) { i++; continue; }
      let j = i, last = i, gap = 0;
      while (j < fr.length && gap <= 11) { if (speech[j]) { last = j; gap = 0; } else gap++; j++; }
      let nv = 0; for (let k = i; k <= last; k++) if (fr[k].f0 > 0 && speech[k]) nv++;
      if (last - i >= 20 && nv >= 8) runs.push([i, last]);
      i = last + 1;
    }
    // describe ~2 s chunks of speech by pitch + envelope
    const env = new Float32Array(NFFT / 2);
    const chunks = [];
    for (const [ri, [a, b]] of runs.entries()) {
      const n = Math.max(1, Math.round((b - a + 1) / 100));
      const len = (b - a + 1) / n;
      for (let c = 0; c < n; c++) {
        const s0 = Math.round(a + c * len), s1 = Math.round(a + (c + 1) * len) - 1;
        const vf = []; for (let k = s0; k <= s1; k++) if (fr[k].f0 > 0 && speech[k]) vf.push(k);
        if (vf.length < 6) { if (chunks.length && chunks[chunks.length - 1].run === ri) chunks[chunks.length - 1].t1 = (fr[s1].st + hop) / sr; continue; }
        const f0s = vf.map((k) => fr[k].f0);
        let med = median(f0s); med = median(f0s.filter((f) => f > med * 0.7 && f < med * 1.42)) || med;
        const feat = new Float32Array(MEL.length);
        const step = Math.max(1, Math.floor(vf.length / 14)); let m = 0;
        for (let q = 0; q < vf.length; q += step) {
          envFrame(x, fr[vf[q]].st, env);
          for (let b2 = 0; b2 < MEL.length; b2++) feat[b2] += envAt(env, sr, MEL[b2]);
          m++;
        }
        let mean = 0; for (let b2 = 0; b2 < MEL.length; b2++) { feat[b2] /= m; mean += feat[b2]; }
        mean /= MEL.length; for (let b2 = 0; b2 < MEL.length; b2++) feat[b2] -= mean;
        chunks.push({ run: ri, t0: fr[s0].st / sr, t1: (fr[s1].st + hop) / sr, w: (s1 - s0 + 1) * hop / sr, st: 12 * Math.log2(med / 100), feat });
      }
    }
    onProgress && onProgress(0.9);
    if (!chunks.length) return { duration: samples.length / sampleRate, candidates: [] };
    // voice distance = formant shift between the two (vocal tract length) + leftover tone difference
    //                 + pitch gap beyond what one person's intonation covers (±3.5 semitones)
    const at = (f, x2) => { const i = Math.floor(x2), fr2 = x2 - i; if (i < 0) return f[0]; if (i >= f.length - 1) return f[f.length - 1]; return f[i] + (f[i + 1] - f[i]) * fr2; };
    const dist = (p, q) => {
      let best = 1e9, bs = 0;
      for (let sh = -4; sh <= 4.001; sh += 0.25) {
        let d = 0, n = 0, mp = 0, mq = 0;
        for (let m = 6; m < MEL.length - 6; m++) { mp += p.feat[m]; mq += at(q.feat, m + sh); n++; }
        mp /= n; mq /= n;
        for (let m = 6; m < MEL.length - 6; m++) { const v = (p.feat[m] - mp) - (at(q.feat, m + sh) - mq); d += v * v; }
        d = Math.sqrt(d / n);
        if (d < best) { best = d; bs = sh; }
      }
      return Math.abs(bs) / 1.3 + best / 0.45 + Math.max(0, Math.abs(p.st - q.st) - 3.5) / 2.5;
    };
    let cl = chunks.map((c) => ({ w: c.w, st: c.st, feat: Float32Array.from(c.feat), items: [c] }));
    const merge = (A2, B2) => {
      const w = A2.w + B2.w, feat = new Float32Array(MEL.length);
      for (let m = 0; m < MEL.length; m++) feat[m] = (A2.feat[m] * A2.w + B2.feat[m] * B2.w) / w;
      return { w, st: (A2.st * A2.w + B2.st * B2.w) / w, feat, items: A2.items.concat(B2.items) };
    };
    const closest = () => { let bi = -1, bj = -1, bd = 1e9; for (let p = 0; p < cl.length; p++) for (let q = p + 1; q < cl.length; q++) { const d = dist(cl[p], cl[q]); if (d < bd) { bd = d; bi = p; bj = q; } } return [bi, bj, bd]; };
    const doMerge = (bi, bj) => { const m = merge(cl[bi], cl[bj]); cl = cl.filter((_, k) => k !== bi && k !== bj); cl.push(m); };
    const total = cl.reduce((s2, c) => s2 + c.w, 0);
    for (let pass = 0; pass < 6; pass++) {
    const before = cl.length;
    for (;;) { if (cl.length < 2) break; const [bi, bj, bd] = closest(); if (bd > 1.7) break; doMerge(bi, bj); }
    // stray little groups (a laugh, a shout, background music) join the nearest voice instead of being lost
    for (;;) {
      if (cl.length < 2) break;
      cl.sort((a2, b2) => a2.w - b2.w);
      const small = cl[0];
      if (small.w >= Math.max(4, total * 0.15) && cl.length <= 4) break;
      let bj = 1, bd = 1e9; for (let q = 1; q < cl.length; q++) { const d = dist(small, cl[q]); if (d < bd) { bd = d; bj = q; } }
      doMerge(0, bj);
    }
    if (cl.length === before) break;
    }
    const candidates = cl.sort((a2, b2) => b2.w - a2.w).map((c) => {
      const segs = c.items.map((it) => [it.t0, it.t1]).sort((a2, b2) => a2[0] - b2[0]);
      const merged = []; for (const sg of segs) { const l = merged[merged.length - 1]; if (l && sg[0] - l[1] < 0.05) l[1] = Math.max(l[1], sg[1]); else merged.push([sg[0], sg[1]]); }
      return { seconds: +c.w.toFixed(1), f0: 100 * Math.pow(2, c.st / 12), segments: merged };
    });
    onProgress && onProgress(1);
    return { duration: samples.length / sampleRate, speech: +runs.reduce((s2, [a, b]) => s2 + (b - a + 1) * hop / sr, 0).toFixed(1), candidates };
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

  return { EQ_BANDS, timbreEq, analyze, formantWarp, profileFrom, decodeBlob, fft, yinFrame, envFrame, envFromRaw, segmentSpeakers, sliceSegments, wavBlob };
})();
if (typeof module !== 'undefined') module.exports = VoxAnalysis;
