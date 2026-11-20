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


/* VoxFun — playful zero-latency effects that run after the voice core:
 * instruments that follow the voice (piano / guitar / music box / organ / synth / theremin / bass),
 * beatbox drums and game sounds triggered by syllables, underwater (muffle + bubbles), vocoder,
 * tube/can comb resonance, auto-wah and glitch stutter. All synthesized, no samples. */
const TWO_PI = 6.283185307179586;
const INST = { none: 0, piano: 1, guitar: 2, musicbox: 3, organ: 4, synth: 5, theremin: 6, bass: 7 };
class VoxFun {
  constructor(sr) {
    this.sr = sr;
    const k = (sec) => 1 - Math.exp(-1 / (sec * sr));
    this.kAtk = k(0.002); this.kRel = k(0.03); this.kSlow = k(0.25); this.kV = k(0.006); this.kVr = k(0.09); this.kZ = k(0.012);
    this.envF = 0; this.envS = 0; this.envV = 0; this.zcr = 0; this.prevX = 0; this.since = 1e9; this.onset = false;
    this.seed = 22222;
    // instruments
    this.voices = []; for (let i = 0; i < 6; i++) this.voices.push({ on: false, t: 0, f: 0, amp: 0, n: 0, c: new Float64Array(6), s1: new Float64Array(6), s2: new Float64Array(6), a: new Float64Array(6), d: new Float64Array(6), ks: new Float32Array(2400), L: 0, idx: 0 });
    this.vNext = 0;
    this.note = -1; this.cand = -1; this.candN = 0; this.wasVoiced = false;
    this.susF = 0; this.susTarget = 0; this.susPh = new Float64Array(5); this.saw2 = 0; this.synLp = 0; this.vibPh = 0;
    // drums / game sounds / bubbles
    this.hits = []; for (let i = 0; i < 4; i++) this.hits.push({ on: false, type: 0, t: 0, ph: 0, hp: 0, amp: 0 });
    this.blips = []; for (let i = 0; i < 2; i++) this.blips.push({ on: false, type: 0, t: 0, ph: 0 });
    this.bubbles = []; for (let i = 0; i < 4; i++) this.bubbles.push({ on: false, t: 0, f: 0, dur: 0, ph: 0, amp: 0 });
    // water filter
    this.w1 = 0; this.w2 = 0; this.wLfo = 0; this.wA = 0.1; this.wCnt = 0;
    // comb
    this.cbuf = new Float32Array(2048); this.cw = 0;
    // wah
    this.wLow = 0; this.wBand = 0; this.wEnv = 0;
    // glitch
    this.hist = new Float32Array(16384); this.hw = 0; this.gLen = 0; this.gStart = 0; this.gPos = 0; this.gReps = 0;
    // vocoder: 14 log-spaced bands, analysis + carrier filter states
    this.vb = [];
    for (let i = 0; i < 14; i++) {
      const fc = 180 * Math.pow(5500 / 180, i / 13), w = TWO_PI * fc / sr, al = Math.sin(w) / (2 * 5);
      const a0 = 1 + al;
      this.vb.push({ b0: al / a0, b2: -al / a0, a1: -2 * Math.cos(w) / a0, a2: (1 - al) / a0, x1: 0, x2: 0, y1: 0, y2: 0, c1: 0, c2: 0, d1: 0, d2: 0, e: 0 });
    }
    this.kVb = k(0.006);
    this.carPh = new Float64Array(3); this.carRoot = 130.81;
  }
  rnd() { this.seed ^= this.seed << 13; this.seed ^= this.seed >>> 17; this.seed ^= this.seed << 5; return ((this.seed >>> 0) / 4294967296); }
  // called after each pitch detection (~8 ms)
  pitch(core, p) {
    const voiced = core.voiced && core.f0 > 0;
    if (p.inst > 0 && voiced) {
      const m = 69 + 12 * Math.log2((core.f0 * p.pitch) / 440) + 12 * p.instOct;
      const mq = Math.round(m);
      const pluck = p.inst === INST.piano || p.inst === INST.guitar || p.inst === INST.musicbox || p.inst === INST.bass;
      if (pluck) {
        if (!this.wasVoiced) { this.note = mq; this.trigger(p.inst, mq); }
        else if (mq !== this.note) {
          if (mq === this.cand) { if (++this.candN >= 2) { this.note = mq; this.trigger(p.inst, mq); } }
          else { this.cand = mq; this.candN = 1; }
        }
      } else {
        this.note = mq;
        this.susTarget = p.inst === INST.theremin ? 440 * Math.pow(2, (m + 12 - 69) / 12) : 440 * Math.pow(2, (mq - 69) / 12);
        if (!this.susF) this.susF = this.susTarget;
      }
      this.carRoot = 440 * Math.pow(2, (mq - 12 * p.instOct - 69 - 12) / 12);
    } else if (voiced) {
      this.carRoot = 440 * Math.pow(2, (Math.round(69 + 12 * Math.log2(core.f0 * p.pitch / 440)) - 69 - 12) / 12);
    }
    this.wasVoiced = voiced;
  }
  trigger(type, midi) {
    const v = this.voices[this.vNext]; this.vNext = (this.vNext + 1) % this.voices.length;
    let f = 440 * Math.pow(2, (midi - 69) / 12);
    if (type === INST.musicbox) f *= 4;
    if (type === INST.bass) f /= 4;
    f = Math.min(5000, Math.max(30, f));
    v.on = true; v.t = 0; v.f = f; v.type = type;
    v.amp = Math.min(1, 0.35 + this.envF * 5);
    // additive partials as recursive sine oscillators with per-sample decay (cheap: no sin/exp per sample)
    const sr = this.sr;
    const part = type === INST.musicbox ? [[1, 1, 2.2], [2.01, 0.35, 4.5], [4.1, 0.15, 9]]
      : [1, 2, 3, 4, 5, 6].map((k) => [k * (1 + 0.0004 * k * k), 1 / Math.pow(k, 1.1), 1.1 + 0.9 * k]);
    v.n = 0;
    for (const [mul, am, dc] of part) {
      const w = TWO_PI * f * mul / sr; if (w >= Math.PI) break;
      const k = v.n++; v.c[k] = 2 * Math.cos(w); v.s1[k] = 0; v.s2[k] = -Math.sin(w); v.a[k] = am; v.d[k] = Math.exp(-dc / sr);
    }
    if (type === INST.guitar || type === INST.bass) {
      v.L = Math.max(2, Math.min(2399, Math.round(this.sr / f))); v.idx = 0;
      let lp = 0;
      const bright = type === INST.bass ? 0.35 : 0.7;
      for (let i = 0; i < v.L; i++) { lp += (this.rnd() * 2 - 1 - lp) * bright; v.ks[i] = lp; }
    }
  }
  hit(bright) {
    const h = this.hits.find((x) => !x.on) || this.hits[0];
    h.on = true; h.t = 0; h.ph = 0; h.hp = 0;
    h.type = bright > 3200 ? 2 : bright > 1300 ? 1 : 0; // kick / snare / hat by how hissy the syllable is
    h.amp = Math.min(1, 0.5 + this.envF * 5);
  }
  blip() {
    const b = this.blips[0].on ? this.blips[1] : this.blips[0];
    b.on = true; b.t = 0; b.ph = 0; b.type = Math.floor(this.rnd() * 4);
  }
  process(v, x, p, core) {
    const sr = this.sr;
    // envelopes, onsets, brightness
    const a = x < 0 ? -x : x;
    this.envF += (a - this.envF) * (a > this.envF ? this.kAtk : this.kRel);
    this.envS += (a - this.envS) * this.kSlow;
    this.envV += (a - this.envV) * (a > this.envV ? this.kV : this.kVr);
    this.zcr += (((x >= 0) !== (this.prevX >= 0) ? 1 : 0) - this.zcr) * this.kZ; this.prevX = x;
    this.since++;
    this.onset = false;
    if (this.envF > 0.02 && this.envF > this.envS * 2.2 && this.since > 0.09 * sr) { this.onset = true; this.since = 0; }
    if (this.onset) {
      if (p.perc > 0) this.hit(this.zcr * sr * 0.5);
      if (p.blip > 0) this.blip();
      if (p.inst > 0 && this.note >= 0 && (p.inst === INST.piano || p.inst === INST.guitar || p.inst === INST.musicbox || p.inst === INST.bass)) this.trigger(p.inst, this.note);
      if (p.glitch > 0 && !this.gReps && this.rnd() < p.glitch) {
        this.gLen = Math.round((0.045 + this.rnd() * 0.07) * sr); this.gStart = this.hw - this.gLen; this.gPos = 0; this.gReps = 2 + Math.floor(this.rnd() * 3);
      }
    }
    let out = v;
    // glitch stutter: replay the last 45-115 ms a few times
    const hm = 16383;
    this.hist[this.hw & hm] = v; this.hw++;
    if (this.gReps > 0) {
      let g = this.hist[(this.gStart + this.gPos) & hm];
      const edge = Math.min(this.gPos, this.gLen - this.gPos, 96) / 96;
      out = g * edge;
      if (++this.gPos >= this.gLen) { this.gPos = 0; this.gReps--; }
    }
    // underwater: wobbling muffle + bubbles
    if (p.water > 0) {
      if (++this.wCnt >= 32) {
        this.wCnt = 0; this.wLfo += TWO_PI * 0.6 * 32 / sr;
        const fc = (720 - p.water * 380) * (1 + 0.35 * Math.sin(this.wLfo));
        this.wA = 1 - Math.exp(-TWO_PI * fc / sr);
      }
      this.w1 += (out - this.w1) * this.wA; this.w2 += (this.w1 - this.w2) * this.wA;
      let bub = 0;
      if (this.rnd() < p.water * (1.5 + this.envF * 40) / sr) {
        const b = this.bubbles.find((q) => !q.on); if (b) { b.on = true; b.t = 0; b.f = 350 + this.rnd() * 900; b.dur = 0.03 + this.rnd() * 0.05; b.ph = 0; b.amp = 0.06 + this.rnd() * 0.1; }
      }
      for (const b of this.bubbles) if (b.on) {
        const t = b.t / sr; if (t > b.dur) { b.on = false; continue; }
        b.ph += TWO_PI * b.f * Math.exp(t * 14) / sr; bub += Math.sin(b.ph) * b.amp * Math.sin(Math.PI * t / b.dur); b.t++;
      }
      out = out * (1 - p.water) + (this.w2 * 1.5 + bub) * p.water;
    }
    // tube / can / helmet: short feedback comb
    if (p.comb > 0) {
      const M = Math.max(8, Math.min(2000, Math.round(p.combMs * sr / 1000)));
      const y = out + (0.55 + p.comb * 0.33) * this.cbuf[(this.cw - M) & 2047];
      this.cbuf[this.cw & 2047] = y; this.cw++;
      out = out * (1 - p.comb) + y * p.comb * 0.55;
    }
    // auto-wah: band-pass swept by loudness
    if (p.wah > 0) {
      this.wEnv += (Math.min(1, this.envF * 7) - this.wEnv) * (this.envF * 7 > this.wEnv ? 0.004 : 0.0006);
      const fc = 320 + this.wEnv * 2600, f = 2 * Math.sin(Math.PI * fc / sr);
      this.wLow += f * this.wBand; const high = out - this.wLow - 0.28 * this.wBand; this.wBand += f * high;
      out = out * (1 - p.wah) + this.wBand * 2.2 * p.wah;
    }
    // vocoder: the voice's spectral envelope imposed on a synth chord that follows the voice pitch
    if (p.voc > 0) {
      const r = this.carRoot;
      let car = 0;
      const ratios = [1, 1.2599, 1.4983];
      for (let i = 0; i < 3; i++) { this.carPh[i] += r * ratios[i] / sr; if (this.carPh[i] >= 1) this.carPh[i] -= 1; car += this.carPh[i] * 2 - 1; }
      car = car * 0.4 + (this.rnd() * 2 - 1) * 0.06;
      let y = 0;
      for (const b of this.vb) {
        const xa = b.b0 * out + b.b2 * b.x2 - b.a1 * b.y1 - b.a2 * b.y2; b.x2 = b.x1; b.x1 = out; b.y2 = b.y1; b.y1 = xa;
        const ea = xa < 0 ? -xa : xa; b.e += (ea - b.e) * this.kVb;
        const xc = b.b0 * car + b.b2 * b.d2 - b.a1 * b.c1 - b.a2 * b.c2; b.d2 = b.d1; b.d1 = car; b.c2 = b.c1; b.c1 = xc;
        y += xc * b.e;
      }
      out = out * (1 - p.voc) + y * 22 * p.voc;
    }
    // instruments that follow the voice
    if (p.inst > 0) {
      let ins = 0;
      for (const vo of this.voices) if (vo.on) {
        const t = vo.t / sr; let s = 0;
        if (vo.type === INST.guitar || vo.type === INST.bass) {
          const L = vo.L, i0 = vo.idx, i1 = i0 + 1 >= L ? 0 : i0 + 1;
          s = vo.ks[i0];
          vo.ks[i0] = (vo.ks[i0] + vo.ks[i1]) * (vo.type === INST.bass ? 0.4975 : 0.4985);
          vo.idx = i1;
          s *= vo.type === INST.bass ? 1.6 : 1.1;
          if (t > 3) vo.on = false;
        } else { // piano (slightly inharmonic partials, highs fade first, hammer tick) / music box (bell partials)
          for (let k = 0; k < vo.n; k++) {
            const o = vo.c[k] * vo.s1[k] - vo.s2[k]; vo.s2[k] = vo.s1[k]; vo.s1[k] = o;
            s += o * vo.a[k]; vo.a[k] *= vo.d[k];
          }
          if (vo.type === INST.musicbox) { s *= 0.5; if (t > 2.5) vo.on = false; }
          else { if (vo.t < 0.003 * sr) s += (this.rnd() * 2 - 1) * 0.3 * (1 - vo.t / (0.003 * sr)); s *= 0.38; if (t > 3) vo.on = false; }
        }
        ins += s * vo.amp; vo.t++;
      }
      // sustained instruments: pitch glides, loudness follows the voice
      if (p.inst === INST.organ || p.inst === INST.synth || p.inst === INST.theremin) {
        this.susF += (this.susTarget - this.susF) * (p.inst === INST.theremin ? 0.0012 : 0.004);
        const amp = Math.min(1, this.envV * 6);
        if (p.inst === INST.organ) {
          const mul = [1, 2, 3, 4], am = [1, 0.55, 0.32, 0.18];
          let s = 0; for (let k = 0; k < 4; k++) { this.susPh[k] += this.susF * mul[k] / sr; if (this.susPh[k] > 1) this.susPh[k] -= 1; s += Math.sin(TWO_PI * this.susPh[k]) * am[k]; }
          ins += s * 0.32 * amp;
        } else if (p.inst === INST.synth) {
          this.susPh[0] += this.susF / sr; if (this.susPh[0] >= 1) this.susPh[0] -= 1;
          this.saw2 += this.susF * 1.006 / sr; if (this.saw2 >= 1) this.saw2 -= 1;
          const raw = (this.susPh[0] * 2 - 1) + (this.saw2 * 2 - 1);
          const fc = 300 + amp * 5200, al = 1 - Math.exp(-TWO_PI * fc / sr);
          this.synLp += (raw - this.synLp) * al;
          ins += this.synLp * 0.3 * amp;
        } else {
          this.vibPh += TWO_PI * 5.5 / sr;
          this.susPh[0] += this.susF * Math.pow(2, 0.35 * Math.sin(this.vibPh) / 12) / sr; if (this.susPh[0] > 1) this.susPh[0] -= 1;
          ins += Math.sin(TWO_PI * this.susPh[0]) * 0.5 * amp;
        }
      }
      out = out * (1 - p.instMix) + ins * p.instMix;
    }
    // beatbox drums triggered by syllables
    if (p.perc > 0) {
      let d = 0;
      for (const h of this.hits) if (h.on) {
        const t = h.t / sr; let s = 0;
        if (h.type === 0) { h.ph += (45 + 110 * Math.exp(-t / 0.028)) / sr; s = Math.sin(TWO_PI * h.ph) * Math.exp(-t / 0.17) * 1.1; if (t > 0.6) h.on = false; }
        else if (h.type === 1) { const n = this.rnd() * 2 - 1; const hpn = n - h.hp; h.hp = n; h.ph += 190 / sr; s = (hpn * 0.5 * Math.exp(-t / 0.09) + Math.sin(TWO_PI * h.ph) * 0.45 * Math.exp(-t / 0.045)); if (t > 0.4) h.on = false; }
        else { const n = this.rnd() * 2 - 1; const d1 = n - h.hp; h.hp = n; s = d1 * 0.35 * Math.exp(-t / 0.032); if (t > 0.2) h.on = false; }
        d += s * h.amp; h.t++;
      }
      out = out * (1 - p.perc * 0.7) + d * p.perc * 0.8;
    }
    // game sounds on syllables: coin / laser / jump / power-up
    if (p.blip > 0) {
      let g = 0;
      for (const b of this.blips) if (b.on) {
        const t = b.t / sr; let f = 0, am = 0;
        if (b.type === 0) { f = t < 0.07 ? 988 : 1319; am = t < 0.07 ? 1 : Math.exp(-(t - 0.07) / 0.12); if (t > 0.5) b.on = false; }
        else if (b.type === 1) { f = 150 + 1700 * Math.exp(-t / 0.05); am = Math.exp(-t / 0.09); if (t > 0.25) b.on = false; }
        else if (b.type === 2) { f = 280 * Math.pow(2, t / 0.09); am = t < 0.14 ? 1 : 0; if (t > 0.14) b.on = false; }
        else { const notes = [523, 659, 784, 1047]; const i = Math.min(3, Math.floor(t / 0.055)); f = notes[i]; am = t < 0.22 ? 1 : 0; if (t > 0.22) b.on = false; }
        b.ph += f / sr; if (b.ph >= 1) b.ph -= 1;
        g += (b.ph < 0.5 ? 1 : -1) * am * 0.13; b.t++;
      }
      out = out * (1 - p.blip * 0.4) + g * p.blip;
    }
    return out;
  }
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
    this.p = { pitch: 1, formant: 1, robotHz: 0, ring: 0, ringHz: 40, vib: 0, vibHz: 5.5, tune: 0, trem: 0, tremHz: 6, crush: 0,
      water: 0, inst: 0, instMix: 0.85, instOct: 0, perc: 0, blip: 0, harm: 0, harmType: 0, voc: 0, comb: 0, combMs: 5, wah: 0, glitch: 0, fun: false, active: false };
    this.faults = 0;
    this.fun = new VoxFun(sr);
    // harmony: two extra pitch-shifted copies of the voice (chord / octaves)
    this.main = { nextOut: 0, srcMark: 0, buf: this.outBuf };
    this.harmS = [0, 1].map(() => ({ nextOut: 0, srcMark: 0, buf: new Float32Array(this.N) }));
  }
  // clear all signal state (used to recover if anything ever goes non-finite)
  reset() {
    this.inBuf.fill(0); this.outBuf.fill(0);
    this.w = 0; this.o = 0; this.srcMark = 0; this.nextOut = 0;
    this.main.nextOut = 0; this.main.srcMark = 0;
    for (const h of this.harmS) { h.buf.fill(0); h.nextOut = 0; h.srcMark = 0; }
    this.fun = new VoxFun(this.sr);
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
    p.water = num(p.water, 0, 1, 0); p.inst = Math.round(num(p.inst, 0, 7, 0)); p.instMix = num(p.instMix, 0, 1, 0.85); p.instOct = Math.round(num(p.instOct, -2, 2, 0));
    p.perc = num(p.perc, 0, 1, 0); p.blip = num(p.blip, 0, 1, 0); p.harm = num(p.harm, 0, 1, 0); p.harmType = Math.round(num(p.harmType, 0, 3, 0));
    p.voc = num(p.voc, 0, 1, 0); p.comb = num(p.comb, 0, 1, 0); p.combMs = num(p.combMs, 0.5, 20, 5); p.wah = num(p.wah, 0, 1, 0); p.glitch = num(p.glitch, 0, 1, 0);
    p.fun = p.water > 0 || p.inst > 0 || p.perc > 0 || p.blip > 0 || p.voc > 0 || p.comb > 0 || p.wah > 0 || p.glitch > 0;
    p.active = Math.abs(p.pitch - 1) > 0.004 || Math.abs(p.formant - 1) > 0.004 || p.robotHz > 0 || p.vib > 0.01 || p.tune > 0.01 || p.harm > 0.01;
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
    if (this.p.fun) this.fun.pitch(this, this.p);
  }
  placeGrain(st = this.main, mul = 1) {
    const isMain = st === this.main;
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
    hopOut /= mul;
    if (!(hopOut > 4)) hopOut = P;
    if (isMain) {
      this.vibPhase += (2 * Math.PI * p.vibHz * hopOut) / sr;
      if (this.vibPhase > 6.283185307179586) this.vibPhase -= 6.283185307179586;
    }
    const cOut = Math.round(st.nextOut) + this.HoutMax;
    const target = cOut - this.D;
    if (voiced) {
      if (st.srcMark > target || target - st.srcMark > 3 * P) st.srcMark = target - P * 0.5;
      while (st.srcMark + P <= target) st.srcMark += P;
    } else {
      st.srcMark = target;
    }
    const f = p.formant;
    const halfOut = Math.min(this.HoutMax - 1, Math.max(8, Math.round(P / f)));
    let gain = hopOut / halfOut;
    if (gain > 1.4) gain = 1.4;
    const inBuf = this.inBuf, outBuf = st.buf, mask = this.mask;
    const s0 = st.srcMark;
    const piOver = Math.PI / halfOut;
    for (let j = -halfOut; j <= halfOut; j++) {
      const win = 0.5 * (1 + Math.cos(piOver * j)) * gain;
      const pos = s0 + j * f;
      const i0 = Math.floor(pos);
      const fr = pos - i0;
      const a = inBuf[i0 & mask], b = inBuf[(i0 + 1) & mask];
      outBuf[(cOut + j) & mask] += win * (a + (b - a) * fr);
    }
    st.nextOut += hopOut;
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
    const harm = p.harm > 0 ? p.harm * 0.62 : 0;
    const HT = [[4, 7], [-12, 12], [7, 12], [3, 7]][p.harmType] || [4, 7];
    const hMul = [Math.pow(2, HT[0] / 12), Math.pow(2, HT[1] / 12)];
    for (let i = 0; i < n; i++) {
      const x = input[i];
      this.inBuf[this.w & mask] = x;
      this.w++;
      if (++this.detCount >= this.detEvery) { this.detCount = 0; this.detect(); }
      const M = this.main;
      if (M.nextOut < this.o) M.nextOut = this.o;
      while (M.nextOut <= this.o) this.placeGrain(M, 1);
      const idx = this.o & mask;
      let y = this.outBuf[idx];
      this.outBuf[idx] = 0;
      if (harm) {
        for (let h = 0; h < 2; h++) {
          const H = this.harmS[h];
          if (H.nextOut < this.o) H.nextOut = this.o;
          while (H.nextOut <= this.o) this.placeGrain(H, hMul[h]);
          y += H.buf[idx] * harm; H.buf[idx] = 0;
        }
      }
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
      if (p.fun) v = this.fun.process(v, x, p, this);
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
if (typeof module !== 'undefined') module.exports = { VoxCore, VoxFun, voxYin, INST };
