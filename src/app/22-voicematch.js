/* ---------- auto voice match: friend chips work for whoever is speaking ----------
   A friend / self chip stores the target voice itself (chip.voice = average pitch + spectral envelope).
   While converting, VOXM keeps learning the current speaker's pitch and envelope from the mic and recomputes
   the pitch / formant shift from *that* voice, so the chip sounds like the friend no matter who talks.
   chip.profile.pitch/formant stay as they were tuned against the creator's voice (chip.auto); the difference
   (profile − auto) is the user's manual tweak and is kept on top of the live match. */
const SPK = { f0s: [], env: null, envN: 0, sr: 16000, ready: false, envReady: false, cache: {}, timer: 0, tick: 0, jump: 0, lastShown: 0 };

function spkReset(keepRecent) {
  SPK.f0s = keepRecent ? SPK.f0s.slice(-15) : [];
  SPK.env = null; SPK.envN = 0; SPK.ready = SPK.f0s.length >= 12; SPK.envReady = false; SPK.cache = {}; SPK.jump = 0;
}
const medianOf = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

function spkSample() {
  const fr = VoxEngine.inputFrame();
  if (!fr) return;
  if (!(fr.f0 > 65 && fr.f0 < 600 && fr.level > 0.004)) return;
  SPK.f0s.push(fr.f0);
  if (SPK.f0s.length > 160) SPK.f0s.shift();
  const e = VoxAnalysis.envFromRaw(fr.buf, fr.sr);
  if (e && e.rms > 0.003) {
    if (!SPK.env || SPK.env.length !== e.env.length) { SPK.env = Float32Array.from(e.env); SPK.envN = 1; }
    else {
      SPK.envN++;
      const a = 1 / Math.min(SPK.envN, 60); // running mean, then a ~60-frame memory
      for (let k = 0; k < SPK.env.length; k++) SPK.env[k] += (e.env[k] - SPK.env[k]) * a;
    }
    SPK.sr = e.envSr;
  }
}

function spkUpdate() {
  const n = SPK.f0s.length;
  SPK.ready = n >= 12;
  SPK.envReady = SPK.envN >= 18;
  if (!SPK.ready) return false;
  // someone else took over: recent pitch far from the long-term pitch for a while → relearn quickly
  if (n >= 40) {
    const lo = medianOf(SPK.f0s), sh = medianOf(SPK.f0s.slice(-14));
    if (Math.abs(12 * Math.log2(sh / lo)) > 4) { if (++SPK.jump >= 3) { VLOG.add('SPK', 'speaker change', Math.round(lo), '→', Math.round(sh)); spkReset(true); return true; } }
    else SPK.jump = 0;
  }
  return true;
}
function spkVoice() {
  if (!SPK.ready) return null;
  return { f0: medianOf(SPK.f0s), env: SPK.envReady ? SPK.env : null, envSr: SPK.sr };
}

// live pitch/formant for one target voice (null = not enough speech yet)
function liveMatch(voice) {
  const me = spkVoice();
  if (!me || !voice || !voice.f0) return null;
  const pitch = Math.max(-12, Math.min(12, 12 * Math.log2(voice.f0 / me.f0)));
  let formant;
  if (me.env && voice.env) formant = VoxAnalysis.profileFrom(voice, me).formant;
  else formant = pitch * 0.33; // until the envelope settles: formants roughly follow the pitch gap
  return { pitch, formant };
}

// effective profile of a seated chip, used by combinedParams()
function effVoiceProfile(c) {
  const p = c.profile || {};
  if (S.autoMatch === false || !c.voice || !(c.kind === 'friend' || c.kind === 'self')) return p;
  const m = SPK.cache[c.id] || liveMatch(c.voice);
  const auto = c.auto || { pitch: 0, formant: 0 };
  if (!m) return c.auto ? p : Object.assign({}, p, { pitch: (p.pitch || 0) - auto.pitch, formant: (p.formant || 0) - auto.formant });
  return Object.assign({}, p, { pitch: m.pitch + (p.pitch || 0) - auto.pitch, formant: m.formant + (p.formant || 0) - auto.formant });
}
// the create screen's live preview
function draftVoiceProfile(profile, voice, auto) {
  return effVoiceProfile({ id: '__draft', kind: 'friend', profile, voice, auto });
}

function spkLoop() {
  if (VoxEngine.status.state !== 'live') return;
  spkSample();
  if (++SPK.tick % 10) return; // once a second: refresh the match
  const changed0 = spkUpdate();
  if (!SPK.ready || S.autoMatch === false) return;
  const targets = seatedChips().filter((c) => c.voice && (c.kind === 'friend' || c.kind === 'self'));
  const draft = typeof C !== 'undefined' && C && C.previewing && C.voice ? { id: '__draft', voice: C.voice } : null;
  if (draft) targets.push(draft);
  let changed = changed0;
  for (const c of targets) {
    const m = liveMatch(c.voice); if (!m) continue;
    const old = SPK.cache[c.id];
    if (!old || Math.abs(old.pitch - m.pitch) > 0.15 || Math.abs(old.formant - m.formant) > 0.15) {
      // glide large corrections over a few seconds so the voice doesn't lurch
      const step = (a, b) => (old ? a + Math.max(-1.5, Math.min(1.5, b - a)) : b);
      SPK.cache[c.id] = { pitch: step(old ? old.pitch : 0, m.pitch), formant: step(old ? old.formant : 0, m.formant) };
      changed = true;
    }
  }
  if (!changed) return;
  if (draft) { delete SPK.cache.__draft; const m = liveMatch(C.voice); if (m) SPK.cache.__draft = m; VoxEngine.setParams(Object.assign({}, VoxEngine.DEFAULT, draftVoiceProfile(C.profile, C.voice, C.auto))); }
  else applyParams();
  if (Date.now() - SPK.lastShown > 30000) { SPK.lastShown = Date.now(); VLOG.add('SPK', 'match', Math.round(spkVoice().f0) + 'Hz', SPK.envReady ? 'env ok' : 'env learning', JSON.stringify(SPK.cache)); }
}
function spkStart() { clearInterval(SPK.timer); SPK.timer = setInterval(spkLoop, 100); }

// older friend chips: rebuild the target voice from their stored sample once
async function ensureVoices() {
  for (const c of S.chips) {
    if (c.voice || !(c.kind === 'friend' || c.kind === 'self') || !c.sampleKey) continue;
    try {
      const blob = await VoxStore.get('blobs', c.sampleKey); if (!blob) continue;
      const { samples, sampleRate } = await VoxAnalysis.decodeBlob(blob);
      const a = VoxAnalysis.analyze(samples, sampleRate); if (!a.ok) continue;
      c.voice = { f0: a.f0, env: a.env, envSr: a.envSr };
      c.auto = { pitch: (c.profile || {}).pitch || 0, formant: (c.profile || {}).formant || 0 }; // tuned against the creator's voice
      saveChip(c);
      VLOG.add('SPK', 'voice rebuilt', c.name, Math.round(a.f0) + 'Hz');
    } catch (e) { VLOG.add('WARN', 'ensureVoices', c.name, e); }
  }
}
function spkStatusText() {
  if (S.autoMatch === false) return 'OFF';
  const v = spkVoice();
  if (!v) return VoxEngine.status.state === 'live' ? '話す人の声を聞き取り中…' : '変換中に自動で合わせます';
  return `いまの話者 ${Math.round(v.f0)}Hz（${SPK.envReady ? '声色も一致中' : '声色を学習中'}）`;
}
