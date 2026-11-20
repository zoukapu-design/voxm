/* VOXM audio engine — microphone → VoxCore (pitch/formant/robot/ring) → FX chain → monitor / recorder / output device.
 * The UI never touches nodes directly; it calls VoxEngine.* and reads VoxEngine.status.
 */
const VoxEngine = (() => {
  const st = {
    state: 'off', // off | starting | live | error
    error: '',
    ctx: null, stream: null, src: null, core: null, coreKind: '', fx: null,
    inAnalyser: null, outAnalyser: null, outGain: null, monitorGain: null, recDest: null,
    f0: 0, level: 0, params: null, monitor: true, volume: 0.8, sinkId: '',
    recorder: null, recChunks: [], recStart: 0, recMime: '',
    fallbackCore: null, lastMsg: 0, needsResume: false, restarts: 0, opts: {},
  };
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => { try { fn(st); } catch (e) { console.warn(e); } });

  const DEFAULT = { pitch: 0, formant: 0, robotHz: 0, ring: 0, ringHz: 40, vib: 0, vibHz: 5.5, tune: 0, trem: 0, tremHz: 6, crush: 0, lowcut: 70, highcut: 16000, bass: 0, presence: 0, drive: 0, chorus: 0, echo: 0, reverb: 0 };

  function supported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && (window.AudioContext || window.webkitAudioContext));
  }

  function makeIR(ctx, seconds, decay) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      let seed = 1234 + c * 77;
      for (let i = 0; i < len; i++) {
        seed = (seed * 16807) % 2147483647;
        const n = seed / 2147483647 * 2 - 1;
        const t = i / len;
        d[i] = n * Math.pow(1 - t, decay) * (i < 90 ? i / 90 : 1);
      }
    }
    return ir;
  }

  function shaperCurve(amount) {
    const n = 2048, curve = new Float32Array(n);
    const k = 2 + amount * 60;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x)) * 0.7;
    }
    return curve;
  }

  // Native-node FX chain. Works on AudioContext and OfflineAudioContext.
  function buildFx(ctx, input) {
    const n = {};
    n.bass = ctx.createBiquadFilter(); n.bass.type = 'lowshelf'; n.bass.frequency.value = 180;
    n.pres = ctx.createBiquadFilter(); n.pres.type = 'peaking'; n.pres.frequency.value = 3000; n.pres.Q.value = 0.9;
    n.hp = ctx.createBiquadFilter(); n.hp.type = 'highpass'; n.hp.Q.value = 0.7;
    n.lp = ctx.createBiquadFilter(); n.lp.type = 'lowpass'; n.lp.Q.value = 0.7;
    input.connect(n.bass); n.bass.connect(n.pres); n.pres.connect(n.hp); n.hp.connect(n.lp);
    // drive (parallel)
    n.dry = ctx.createGain(); n.shaper = ctx.createWaveShaper(); n.shaper.oversample = 'none'; n.wetDrive = ctx.createGain(); // no oversampling: it would delay the wet path
    n.sum1 = ctx.createGain();
    n.lp.connect(n.dry); n.dry.connect(n.sum1);
    n.lp.connect(n.shaper); n.shaper.connect(n.wetDrive); n.wetDrive.connect(n.sum1);
    // chorus / doubler
    n.chDelay = ctx.createDelay(0.1); n.chDelay.delayTime.value = 0.018;
    n.lfo = ctx.createOscillator(); n.lfo.frequency.value = 0.9; n.lfoGain = ctx.createGain(); n.lfoGain.gain.value = 0.006;
    n.lfo.connect(n.lfoGain); n.lfoGain.connect(n.chDelay.delayTime); n.lfo.start();
    n.chWet = ctx.createGain();
    n.sum2 = ctx.createGain();
    n.sum1.connect(n.sum2); n.sum1.connect(n.chDelay); n.chDelay.connect(n.chWet); n.chWet.connect(n.sum2);
    // echo
    n.echo = ctx.createDelay(1.0); n.echo.delayTime.value = 0.27;
    n.echoFb = ctx.createGain(); n.echoFb.gain.value = 0.38;
    n.echoTone = ctx.createBiquadFilter(); n.echoTone.type = 'lowpass'; n.echoTone.frequency.value = 3800;
    n.echoWet = ctx.createGain();
    n.sum2.connect(n.echo); n.echo.connect(n.echoTone); n.echoTone.connect(n.echoFb); n.echoFb.connect(n.echo); n.echoTone.connect(n.echoWet);
    // reverb
    n.verb = ctx.createConvolver(); n.verb.buffer = makeIR(ctx, 2.4, 2.6); n.verbWet = ctx.createGain();
    n.sum2.connect(n.verb); n.verb.connect(n.verbWet);
    // master
    n.master = ctx.createGain();
    n.sum2.connect(n.master); n.echoWet.connect(n.master); n.verbWet.connect(n.master);
    // zero-latency soft clipper instead of DynamicsCompressor (which adds a ~6 ms look-ahead delay)
    n.comp = ctx.createWaveShaper(); n.comp.oversample = 'none';
    { const c = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1, a = Math.abs(x); c[i] = a < 0.6 ? x : Math.sign(x) * (0.6 + 0.38 * Math.tanh((a - 0.6) / 0.38)); } n.comp.curve = c; }
    n.master.connect(n.comp);
    let lastDrive = -1;
    function update(p, instant) {
      const t = ctx.currentTime;
      const set = (param, v) => { if (instant || !param.setTargetAtTime) param.value = v; else param.setTargetAtTime(v, t, 0.03); };
      set(n.bass.gain, p.bass); set(n.pres.gain, p.presence);
      set(n.hp.frequency, Math.max(20, p.lowcut)); set(n.lp.frequency, Math.min(ctx.sampleRate / 2 - 100, p.highcut));
      const dr = Math.round(p.drive * 20) / 20;
      if (dr !== lastDrive) { n.shaper.curve = shaperCurve(dr); lastDrive = dr; }
      set(n.dry.gain, 1 - p.drive * 0.75); set(n.wetDrive.gain, p.drive * 0.9);
      set(n.chWet.gain, p.chorus * 0.8);
      set(n.echoWet.gain, p.echo * 0.7); set(n.echoFb.gain, 0.25 + p.echo * 0.3);
      set(n.verbWet.gain, p.reverb * 0.9);
      set(n.master.gain, 1 - Math.min(0.35, (p.echo + p.reverb) * 0.15));
    }
    return { output: n.comp, update, nodes: n };
  }

  function coreParams(p) {
    return { pitch: Math.pow(2, p.pitch / 12), formant: Math.pow(2, p.formant / 12), robotHz: p.robotHz, ring: p.ring, ringHz: p.ringHz, vib: p.vib, vibHz: p.vibHz, tune: p.tune, trem: p.trem, tremHz: p.tremHz, crush: p.crush };
  }

  async function createCoreNode(ctx) {
    const srcText = document.getElementById('voxm-dsp-src')?.textContent || '';
    if (ctx.audioWorklet && srcText && window.isSecureContext) {
      try {
        const code = srcText + `
class VoxmProcessor extends AudioWorkletProcessor {
  constructor(){ super(); this.core = new VoxCore(sampleRate); this.tick = 0;
    this.port.onmessage = (e) => { if (e.data && e.data.params) this.core.set(e.data.params); }; }
  process(inputs, outputs){
    const inp = inputs[0] && inputs[0][0]; const out = outputs[0][0];
    if (!out) return true;
    try { if (inp) this.core.process(inp, out); else out.fill(0); }
    catch (e) { this.core.reset(); out.fill(0); } // never let an exception kill the node (it would go silent for good)
    if (++this.tick >= 12) { this.tick = 0; this.port.postMessage({ f0: this.core.f0, level: this.core.level, lat: this.core.latencySamples(), faults: this.core.faults }); }
    return true;
  }
}
registerProcessor('voxm-core', VoxmProcessor);`;
        const url = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
        await ctx.audioWorklet.addModule(url);
        const node = new AudioWorkletNode(ctx, 'voxm-core', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 1, channelCountMode: 'explicit' });
        node.port.onmessage = (e) => { st.lastMsg = performance.now(); st.f0 = e.data.f0; st.level = e.data.level; st.coreLatency = e.data.lat / ctx.sampleRate; };
        st.coreKind = 'AudioWorklet';
        return { node, set: (pp) => node.port.postMessage({ params: pp }) };
      } catch (e) { console.warn('AudioWorklet unavailable, falling back', e); }
    }
    // ScriptProcessor fallback (older iOS, insecure contexts)
    const core = new VoxCore(ctx.sampleRate);
    const node = ctx.createScriptProcessor(512, 1, 1);
    node.onaudioprocess = (e) => {
      st.lastMsg = performance.now();
      core.process(e.inputBuffer.getChannelData(0), e.outputBuffer.getChannelData(0));
      st.f0 = core.f0; st.level = core.level; st.coreLatency = core.latencySamples() / ctx.sampleRate + 512 / ctx.sampleRate;
    };
    st.coreKind = 'ScriptProcessor';
    return { node, set: (pp) => core.set(pp) };
  }

  // mic → core → FX → out. Re-runnable on the same context (used to self-heal after iOS interruptions).
  async function buildGraph() {
    const ctx = st.ctx, opts = st.opts;
    const safe = opts.safeMode !== false;
    try { if (navigator.audioSession) navigator.audioSession.type = 'play-and-record'; } catch (e) {}
    st.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: safe, noiseSuppression: !!opts.noiseSuppression, autoGainControl: false, channelCount: 1, latency: { ideal: 0 } },
    });
    st.src = ctx.createMediaStreamSource(st.stream); // kept on `st` so it is never garbage-collected
    st.inAnalyser = ctx.createAnalyser(); st.inAnalyser.fftSize = 1024;
    st.src.connect(st.inAnalyser);
    st.core = await createCoreNode(ctx);
    st.src.connect(st.core.node);
    st.fx = buildFx(ctx, st.core.node);
    st.outGain = ctx.createGain();
    st.fx.output.connect(st.outGain);
    st.outAnalyser = ctx.createAnalyser(); st.outAnalyser.fftSize = 2048;
    st.outGain.connect(st.outAnalyser);
    st.monitorGain = ctx.createGain();
    st.outGain.connect(st.monitorGain); st.monitorGain.connect(ctx.destination);
    if (!st.recDest) st.recDest = ctx.createMediaStreamDestination(); // reused across self-heals so recordings continue
    st.outGain.connect(st.recDest);
    if (st.sinkId && ctx.setSinkId) { try { await ctx.setSinkId(st.sinkId); } catch (e) { console.warn(e); } }
    setParams(st.params || DEFAULT, true);
    setMonitor(st.monitor); setVolume(st.volume);
    const track = st.stream.getAudioTracks()[0];
    if (track) {
      track.addEventListener('ended', () => { if (st.state === 'live' && st.stream && st.stream.getAudioTracks()[0] === track) heal('mic-ended'); });
      track.addEventListener('unmute', () => resumeCtx());
    }
    st.lastMsg = performance.now();
  }

  async function start(opts = {}) {
    if (st.state === 'live' || st.state === 'starting') return;
    if (!supported()) { st.state = 'error'; st.error = 'このブラウザはマイク処理に未対応です'; emit(); return; }
    st.state = 'starting'; st.error = ''; st.opts = opts; emit();
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!st.ctx || st.ctx.state === 'closed') {
        st.ctx = new AC({ latencyHint: 'interactive' });
        st.ctx.addEventListener('statechange', () => { if (st.state === 'live' && st.ctx.state !== 'running') resumeCtx(); });
      }
      if (st.ctx.state !== 'running') await st.ctx.resume();
      await buildGraph();
      st.state = 'live'; st.needsResume = false; emit();
      startWatchdog();
    } catch (e) {
      console.warn(e);
      st.state = 'error';
      st.error = e && e.name === 'NotAllowedError' ? 'マイクの使用が許可されていません'
        : e && e.name === 'NotFoundError' ? 'マイクが見つかりません'
        : 'マイクを起動できませんでした';
      teardown(false);
      emit();
    }
  }

  /* ---- self-healing: iOS can suspend/interrupt the audio context (calls, Siri, lock screen, other apps),
     end or mute the mic track, or a node can stop producing audio. Detect and rebuild automatically. ---- */
  let watchTimer = 0, deadIn = 0, deadOut = 0, healing = false, lastHeal = 0;
  const rmsOf = (an, buf) => { an.getFloatTimeDomainData(buf); let e = 0; for (let i = 0; i < buf.length; i += 4) e += buf[i] * buf[i]; return Math.sqrt(e / (buf.length / 4)); };
  const bufIn = new Float32Array(1024), bufOut = new Float32Array(2048);
  async function resumeCtx() {
    if (!st.ctx || st.ctx.state === 'running' || st.ctx.state === 'closed') return true;
    try { await st.ctx.resume(); } catch (e) {}
    const ok = st.ctx.state === 'running';
    if (!ok && !st.needsResume) { st.needsResume = true; emit(); } // needs a tap (iOS gesture rule)
    if (ok && st.needsResume) { st.needsResume = false; emit(); }
    return ok;
  }
  async function heal(reason) {
    if (healing || st.state !== 'live') return;
    const now = performance.now();
    if (now - lastHeal < 2500) return;
    healing = true; lastHeal = now; st.restarts++;
    console.warn('VOXM audio self-heal:', reason);
    try {
      teardown(false, true);
      await resumeCtx();
      await buildGraph();
      deadIn = deadOut = 0;
    } catch (e) {
      console.warn(e);
      st.state = 'error'; st.error = 'マイクが切断されました（もう一度「変換 ON」を押してください）';
      teardown(true); emit();
    }
    healing = false;
  }
  function startWatchdog() {
    clearInterval(watchTimer);
    deadIn = deadOut = 0;
    watchTimer = setInterval(async () => {
      if (st.state !== 'live' || healing) return;
      if (st.ctx.state !== 'running') { await resumeCtx(); return; }
      const track = st.stream && st.stream.getAudioTracks()[0];
      if (!track || track.readyState === 'ended') return heal('track-ended');
      if (performance.now() - st.lastMsg > 1500) return heal('core-stalled');
      const inR = rmsOf(st.inAnalyser, bufIn), outR = rmsOf(st.outAnalyser, bufOut);
      deadIn = inR < 1e-7 && !track.muted ? deadIn + 1 : 0; // a live mic is never bit-exact silent
      if (outR > 1e-5 || st.volume <= 0.01) deadOut = 0; else if (inR > 0.0015) deadOut++; // voice in, nothing out
      if (deadIn >= 6) heal('mic-silent');
      else if (deadOut >= 4) heal('output-silent');
    }, 500);
  }
  // returning to the app: make sure the audio is running again
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && st.state === 'live') resumeCtx().then(() => { st.lastMsg = performance.now(); }); });
  // any tap resumes a context that iOS left suspended
  const tapResume = () => { if (st.state === 'live' && st.ctx && st.ctx.state !== 'running') resumeCtx(); };
  document.addEventListener('pointerdown', tapResume, true);
  document.addEventListener('touchend', tapResume, true);

  function teardown(closeCtx, keepRec) {
    if (!keepRec) clearInterval(watchTimer);
    try { st.stream && st.stream.getTracks().forEach((t) => t.stop()); } catch (e) {}
    try { st.src && st.src.disconnect(); } catch (e) {}
    try { st.core && st.core.node.disconnect(); } catch (e) {}
    try { st.outGain && st.outGain.disconnect(); } catch (e) {}
    try { st.monitorGain && st.monitorGain.disconnect(); } catch (e) {}
    st.stream = st.src = st.core = st.fx = st.outGain = st.monitorGain = st.inAnalyser = st.outAnalyser = null;
    if (!keepRec) st.recDest = null;
    st.f0 = 0; st.level = 0;
    if (closeCtx && st.ctx) { try { st.ctx.suspend(); } catch (e) {} }
  }

  function stop() {
    if (st.recorder && st.recorder.state === 'recording') { try { st.recorder.stop(); } catch (e) {} }
    teardown(true);
    st.needsResume = false;
    st.state = 'off'; emit();
  }

  function setParams(p, instant) {
    st.params = Object.assign({}, DEFAULT, p);
    if (st.core) st.core.set(coreParams(st.params));
    if (st.fx) st.fx.update(st.params, instant);
  }
  function setMonitor(on) {
    st.monitor = !!on;
    if (st.monitorGain) st.monitorGain.gain.setTargetAtTime(on ? 1 : 0, st.ctx.currentTime, 0.02);
    emit();
  }
  function setVolume(v) {
    st.volume = Math.max(0, Math.min(1.5, v));
    if (st.outGain) st.outGain.gain.setTargetAtTime(st.volume, st.ctx.currentTime, 0.03);
  }
  function latencyMs() {
    if (!st.ctx || st.state !== 'live') return null;
    const base = (st.ctx.baseLatency || 0) + (st.ctx.outputLatency || 0);
    return Math.round((base + (st.coreLatency || 0) + 128 / st.ctx.sampleRate) * 1000);
  }

  // Output device (Chrome/Edge desktop: route to a virtual cable for Discord / Zoom / OBS / LINE PC)
  function canPickOutput() { return !!(window.AudioContext && AudioContext.prototype.setSinkId); }
  async function listOutputs() {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      return all.filter((d) => d.kind === 'audiooutput').map((d) => ({ id: d.deviceId, label: d.label || '出力デバイス' }));
    } catch (e) { return []; }
  }
  async function setOutput(id) {
    st.sinkId = id || '';
    if (st.ctx && st.ctx.setSinkId) await st.ctx.setSinkId(st.sinkId);
    emit();
  }

  function pickMime(video) {
    const list = video
      ? ['video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm']
      : ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'];
    if (!window.MediaRecorder) return '';
    for (const m of list) { try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (e) {} }
    return '';
  }

  function startRecording(videoTrack) {
    if (!st.recDest || !window.MediaRecorder) return false;
    const tracks = [...st.recDest.stream.getAudioTracks()];
    if (videoTrack) tracks.unshift(videoTrack);
    const stream = new MediaStream(tracks);
    const mime = pickMime(!!videoTrack);
    st.recChunks = [];
    st.recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    st.recMime = st.recorder.mimeType || mime || (videoTrack ? 'video/webm' : 'audio/webm');
    st.recorder.ondataavailable = (e) => { if (e.data && e.data.size) st.recChunks.push(e.data); };
    st.recorder.start(250);
    st.recStart = Date.now();
    emit();
    return true;
  }
  function stopRecording() {
    return new Promise((resolve) => {
      const r = st.recorder;
      if (!r || r.state !== 'recording') return resolve(null);
      r.onstop = () => {
        const blob = new Blob(st.recChunks, { type: st.recMime });
        st.recorder = null; emit();
        resolve({ blob, mime: st.recMime, seconds: (Date.now() - st.recStart) / 1000 });
      };
      r.stop();
    });
  }
  const recording = () => !!(st.recorder && st.recorder.state === 'recording');

  // Offline: convert a decoded clip with the same DSP + FX (used for previews and for the file-based mode)
  async function renderOffline(samples, sampleRate, p) {
    const params = Object.assign({}, DEFAULT, p);
    const core = new VoxCore(sampleRate);
    core.set(coreParams(params));
    core.mix = core.p.active ? 1 : 0;
    const lat = core.latencySamples();
    const padded = new Float32Array(samples.length + lat + 256);
    padded.set(samples);
    const processed = new Float32Array(padded.length);
    for (let i = 0; i < padded.length; i += 128) core.process(padded.subarray(i, i + 128), processed.subarray(i, i + 128));
    const trimmed = processed.subarray(lat);
    const tail = Math.round(sampleRate * (params.reverb > 0 || params.echo > 0 ? 2.2 : 0.2));
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const oc = new OAC(1, trimmed.length + tail, sampleRate);
    const buf = oc.createBuffer(1, trimmed.length, sampleRate);
    buf.getChannelData(0).set(trimmed);
    const s = oc.createBufferSource(); s.buffer = buf;
    const fx = buildFx(oc, s);
    fx.update(params, true);
    fx.output.connect(oc.destination);
    s.start();
    const out = await new Promise((res, rej) => { const pr = oc.startRendering(); if (pr && pr.then) pr.then(res, rej); else oc.oncomplete = (e) => res(e.renderedBuffer); });
    return out;
  }

  function encodeWav(audioBuffer) {
    const ch = audioBuffer.getChannelData(0), sr = audioBuffer.sampleRate;
    const buf = new ArrayBuffer(44 + ch.length * 2), v = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + ch.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true);
    v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, ch.length * 2, true);
    for (let i = 0; i < ch.length; i++) { const s = Math.max(-1, Math.min(1, ch[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
    return new Blob([buf], { type: 'audio/wav' });
  }

  // Short UI sound effects (cartridge click, power) — synthesized, no assets.
  let sfxCtx = null;
  function sfx(kind) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = st.ctx && st.ctx.state === 'running' ? st.ctx : (sfxCtx || (sfxCtx = new AC()));
      if (ctx.state !== 'running') ctx.resume();
      const t = ctx.currentTime;
      const g = ctx.createGain(); g.connect(ctx.destination);
      const tone = (f, at, dur, type, vol) => {
        const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t + at);
        const gg = ctx.createGain(); gg.gain.setValueAtTime(0.0001, t + at);
        gg.gain.exponentialRampToValueAtTime(vol, t + at + 0.004); gg.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
        o.connect(gg); gg.connect(g); o.start(t + at); o.stop(t + at + dur + 0.02);
      };
      if (kind === 'insert') { tone(1800, 0, 0.03, 'square', 0.05); tone(240, 0.01, 0.08, 'sine', 0.18); tone(3200, 0.09, 0.025, 'square', 0.035); tone(660, 0.16, 0.18, 'sine', 0.06); tone(990, 0.22, 0.22, 'sine', 0.04); }
      else if (kind === 'eject') { tone(900, 0, 0.04, 'square', 0.04); tone(300, 0.02, 0.1, 'sine', 0.12); }
      else if (kind === 'tick') { tone(2400, 0, 0.012, 'square', 0.018); }
      else if (kind === 'on') { tone(440, 0, 0.12, 'sine', 0.06); tone(880, 0.08, 0.2, 'sine', 0.05); }
      else if (kind === 'off') { tone(660, 0, 0.1, 'sine', 0.05); tone(330, 0.07, 0.16, 'sine', 0.05); }
    } catch (e) {}
  }

  return {
    status: st, DEFAULT, supported, start, stop, setParams, setMonitor, setVolume, latencyMs,
    canPickOutput, listOutputs, setOutput, startRecording, stopRecording, recording,
    renderOffline, encodeWav, sfx, onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  };
})();
