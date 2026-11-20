/* VOXM DSP core — shared by the AudioWorklet, the ScriptProcessor fallback and the Node tests.
 * TD-PSOLA style pitch / formant shifter with phase-coherent source marks,
 * monotone "robot" mode, hard pitch snap ("kerokero"), vibrato, ring modulation, tremolo, bit crusher,
 * a direct/processed crossfade and a zero-latency output limiter.
 * Latency: only the pitch/formant path has a fixed delay D (≈2 periods of the lowest voice, ~25 ms);
 * ring / tremolo / crusher-only voices run with zero added delay.
 */
function voxYin(buf, mask, end, ds, win, tmin, tmax, scratch) {
  // Downsample (box filter) the last win*ds samples ending at `end` into scratch.
  const start = end - win * ds;
  let energy = 0;
  for (let k = 0; k < win; k++) {
    let s = 0;
    const base = start + k * ds;
    for (let q = 0; q < ds; q++) s += buf[(base + q) & mask];
    s /= ds;
    scratch[k] = s;
    energy += s * s;
  }
  const rms = Math.sqrt(energy / win);
  if (rms < 0.004) return { tau: 0, clarity: 0, rms };
  const W = win - tmax;
  let running = 0;
  let bestTau = 0, bestVal = 1e9, found = 0;
  const d = voxYin._d || (voxYin._d = new Float32Array(1024));
  for (let tau = 1; tau <= tmax; tau++) {
    let sum = 0;
    for (let k = 0; k < W; k++) {
      const diff = scratch[k] - scratch[k + tau];
      sum += diff * diff;
    }
    running += sum;
    d[tau] = running > 0 ? (sum * tau) / running : 1;
  }
  for (let tau = tmin; tau <= tmax; tau++) {
    if (d[tau] < 0.18) {
      while (tau + 1 <= tmax && d[tau + 1] < d[tau]) tau++;
      bestTau = tau; bestVal = d[tau]; found = 1;
      break;
    }
    if (d[tau] < bestVal) { bestVal = d[tau]; bestTau = tau; }
  }
  if (!found && bestVal > 0.4) return { tau: 0, clarity: 1 - bestVal, rms };
  // parabolic interpolation
  let t = bestTau;
  if (bestTau > tmin && bestTau < tmax) {
    const a = d[bestTau - 1], b = d[bestTau], c = d[bestTau + 1];
    const den = a - 2 * b + c;
    if (Math.abs(den) > 1e-9) t = bestTau + 0.5 * (a - c) / den;
  }
  return { tau: t * ds, clarity: 1 - bestVal, rms };
}

class VoxCore {
  constructor(sr) {
    this.sr = sr;
    this.N = 16384; this.mask = this.N - 1;
    this.inBuf = new Float32Array(this.N);
    this.outBuf = new Float32Array(this.N);
    this.w = 0; this.o = 0;
    this.fmin = 80; this.fmax = 560;
    this.formantMin = 0.72;
    this.Pmax = Math.ceil(sr / this.fmin);
    // grains are capped at one (longest) period on the output side, so the delay is ~2 periods, not 2.4
    this.HoutMax = this.Pmax + 2;
    this.D = this.HoutMax + this.Pmax + 16; // fixed processing delay (samples)
    this.ds = Math.max(1, Math.round(sr / 11025));
    const srd = sr / this.ds;
    this.tmin = Math.floor(srd / this.fmax);
    this.tmax = Math.ceil(srd / this.fmin);
    this.win = this.tmax * 2 + 64;
    this.scratch = new Float32Array(this.win + 4);
    this.detEvery = 384; this.detCount = 0;
    this.period = sr / 140; this.voiced = false; this.f0 = 0; this.level = 0;
    this.srcMark = 0; this.nextOut = 0;
    this.ringPhase = 0; this.vibPhase = 0; this.tremPhase = 0;
    this.crushHold = 0; this.crushVal = 0;
    this.inE = 1e-6; this.outE = 1e-6; this.agc = 1; // loudness match for the processed path
    this.agcA = 1 / (0.25 * sr);
    this.mix = 0; // 0 = direct, 1 = processed
    this.p = { pitch: 1, formant: 1, robotHz: 0, ring: 0, ringHz: 40, vib: 0, vibHz: 5.5, tune: 0, trem: 0, tremHz: 6, crush: 0, active: false };
    this.faults = 0;
  }
  // clear all signal state (used to recover if anything ever goes non-finite)
  reset() {
    this.inBuf.fill(0); this.outBuf.fill(0);
    this.w = 0; this.o = 0; this.srcMark = 0; this.nextOut = 0;
    this.inE = 1e-6; this.outE = 1e-6; this.agc = 1; this.mix = 0;
    this.period = this.sr / 140; this.voiced = false; this.f0 = 0;
    this.crushVal = 0; this.crushHold = 0;
    this.faults++;
  }
  set(params) {
    Object.assign(this.p, params);
    const p = this.p;
    p.pitch = Math.min(2.6, Math.max(0.4, +p.pitch || 1));
    p.formant = Math.min(1.5, Math.max(this.formantMin, +p.formant || 1));
    const num = (v, lo, hi, d) => { v = +v; return v === v ? Math.min(hi, Math.max(lo, v)) : d; };
    p.robotHz = num(p.robotHz, 0, 400, 0); p.ring = num(p.ring, 0, 1, 0); p.ringHz = num(p.ringHz, 1, 2000, 40);
    p.vib = num(p.vib, 0, 4, 0); p.vibHz = num(p.vibHz, 0.5, 14, 5.5); p.tune = num(p.tune, 0, 1, 0);
    p.trem = num(p.trem, 0, 1, 0); p.tremHz = num(p.tremHz, 0.5, 30, 6); p.crush = num(p.crush, 0, 1, 0);
    p.active = Math.abs(p.pitch - 1) > 0.004 || Math.abs(p.formant - 1) > 0.004 || p.robotHz > 0 || p.vib > 0.01 || p.tune > 0.01;
  }
  latencySamples() { return this.p.active ? this.D : 0; }
  detect() {
    const r = voxYin(this.inBuf, this.mask, this.w, this.ds, this.win, this.tmin, this.tmax, this.scratch);
    this.level = r.rms;
    if (r.tau > 0 && r.clarity > 0.55) {
      const Pn = Math.min(this.Pmax, Math.max(this.sr / this.fmax, r.tau));
      if (this.voiced && Math.abs(Pn / this.period - 1) < 0.18) this.period = this.period * 0.6 + Pn * 0.4;
      else this.period = Pn;
      this.voiced = true; this.f0 = this.sr / this.period;
    } else {
      this.voiced = false; this.f0 = 0;
    }
  }
  placeGrain() {
    const p = this.p, sr = this.sr;
    const voiced = this.voiced;
    const P = voiced ? this.period : sr * 0.0065;
    let ratio = p.pitch;
    if (p.vib > 0) ratio *= Math.pow(2, (p.vib * Math.sin(this.vibPhase)) / 12);
    let hopOut;
    if (p.robotHz > 0) hopOut = sr / p.robotHz;
    else if (p.tune > 0 && voiced) {
      // snap the output pitch to the nearest semitone (hard tune), blended by `tune`
      const fo = (sr / P) * ratio;
      const semi = 12 * Math.log2(fo / 440);
      const snapped = 440 * Math.pow(2, Math.round(semi) / 12);
      hopOut = sr / (fo + (snapped - fo) * p.tune);
    } else hopOut = P / ratio;
    if (!(hopOut > 4)) hopOut = P;
    this.vibPhase += (2 * Math.PI * p.vibHz * hopOut) / sr;
    if (this.vibPhase > 6.283185307179586) this.vibPhase -= 6.283185307179586;
    const cOut = Math.round(this.nextOut) + this.HoutMax;
    const target = cOut - this.D;
    if (voiced) {
      if (this.srcMark > target || target - this.srcMark > 3 * P) this.srcMark = target - P * 0.5;
      while (this.srcMark + P <= target) this.srcMark += P;
    } else {
      this.srcMark = target;
    }
    const f = p.formant;
    const halfOut = Math.min(this.HoutMax - 1, Math.max(8, Math.round(P / f)));
    let gain = hopOut / halfOut;
    if (gain > 1.4) gain = 1.4;
    const inBuf = this.inBuf, outBuf = this.outBuf, mask = this.mask;
    const s0 = this.srcMark;
    const piOver = Math.PI / halfOut;
    for (let j = -halfOut; j <= halfOut; j++) {
      const win = 0.5 * (1 + Math.cos(piOver * j)) * gain;
      const pos = s0 + j * f;
      const i0 = Math.floor(pos);
      const fr = pos - i0;
      const a = inBuf[i0 & mask], b = inBuf[(i0 + 1) & mask];
      outBuf[(cOut + j) & mask] += win * (a + (b - a) * fr);
    }
    this.nextOut += hopOut;
  }
  process(input, output) {
    const n = input.length;
    const p = this.p, mask = this.mask;
    const target = p.active ? 1 : 0;
    const mixStep = 1 / (0.03 * this.sr);
    const ringInc = (2 * Math.PI * p.ringHz) / this.sr;
    const tremInc = (2 * Math.PI * p.tremHz) / this.sr;
    const holdN = 1 + Math.round(p.crush * 7 * (this.sr / 48000));
    const q = Math.pow(2, 15 - p.crush * 11.5);
    const crushMix = Math.min(1, p.crush * 2.5);
    for (let i = 0; i < n; i++) {
      const x = input[i];
      this.inBuf[this.w & mask] = x;
      this.w++;
      if (++this.detCount >= this.detEvery) { this.detCount = 0; this.detect(); }
      if (this.nextOut < this.o) this.nextOut = this.o;
      while (this.nextOut <= this.o) this.placeGrain();
      const idx = this.o & mask;
      let y = this.outBuf[idx];
      this.outBuf[idx] = 0;
      this.o++;
      // delayed input energy vs processed energy -> slow gain correction
      const xd = this.inBuf[(this.w - 1 - (p.active ? this.D : 0)) & mask];
      this.inE += (xd * xd - this.inE) * this.agcA;
      this.outE += (y * y - this.outE) * this.agcA;
      if (this.inE > 2e-6) {
        let g = Math.sqrt(this.inE / (this.outE + 1e-9));
        g = g < 0.6 ? 0.6 : g > 2.2 ? 2.2 : g;
        this.agc += (g - this.agc) * 0.0004;
      }
      y *= this.agc;
      if (this.mix < target) this.mix = Math.min(target, this.mix + mixStep);
      else if (this.mix > target) this.mix = Math.max(target, this.mix - mixStep);
      let v = this.mix >= 1 ? y : this.mix <= 0 ? x : x * (1 - this.mix) + y * this.mix;
      if (p.ring > 0) {
        this.ringPhase += ringInc;
        if (this.ringPhase > 6.283185307179586) this.ringPhase -= 6.283185307179586;
        v = v * (1 - p.ring) + v * Math.sin(this.ringPhase) * p.ring * 1.6;
      }
      if (p.trem > 0) {
        this.tremPhase += tremInc;
        if (this.tremPhase > 6.283185307179586) this.tremPhase -= 6.283185307179586;
        v *= 1 - p.trem * (0.5 + 0.5 * Math.sin(this.tremPhase));
      }
      if (p.crush > 0) {
        // sample-and-hold + bit reduction (8-bit game sound)
        if (--this.crushHold <= 0) { this.crushHold = holdN; this.crushVal = Math.round(v * q) / q; }
        v = v * (1 - crushMix) + this.crushVal * crushMix;
      }
      // zero-latency soft limiter (replaces a look-ahead compressor)
      const a = v < 0 ? -v : v;
      if (a > 0.7) v = (v < 0 ? -1 : 1) * (0.7 + 0.3 * Math.tanh((a - 0.7) / 0.3));
      if (v !== v || v > 4 || v < -4) { this.reset(); output.fill(0); return; }
      output[i] = v;
    }
  }
}
if (typeof module !== 'undefined') module.exports = { VoxCore, voxYin };
