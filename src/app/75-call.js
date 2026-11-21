/* ===== VOXM CALL — talk with converted voices, VOXM to VOXM =====
   Media: WebRTC (the engine's converted output stream is what the other side hears).
   Signaling + friends: Firebase (anonymous auth + Firestore). A local simulator (?callsim=1) lets two tabs
   on the same device call each other for testing without Firebase.
   Chip swaps are sent over a data channel so the other side sees which chips you are using, live. */
const FB_VER = '10.12.2';
const CALL = { sig: null, ready: false, uid: null, error: '', pc: null, dc: null, id: null, role: null, peer: null, state: 'idle', remoteChips: [], t0: 0, muted: false, unsub: [], ring: 0, incoming: null, prevMonitor: null, audio: null };

/* ---- signaling: Firebase ---- */
async function fbSignal() {
  const app = await import(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-app.js`);
  const au = await import(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-auth.js`);
  const fs = await import(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-firestore.js`);
  const fapp = app.initializeApp(FIREBASE_CONFIG);
  const auth = au.getAuth(fapp);
  const db = fs.getFirestore(fapp);
  const cred = await au.signInAnonymously(auth);
  const uid = cred.user.uid;
  return {
    uid,
    async saveProfile(p) { await fs.setDoc(fs.doc(db, 'users', uid), { name: p.name, code: p.code, updatedAt: Date.now() }, { merge: true }); },
    async claimCode(code) { const r = fs.doc(db, 'codes', code); const s = await fs.getDoc(r); if (s.exists()) return s.data().uid === uid; await fs.setDoc(r, { uid }); return true; },
    async lookupCode(code) {
      const s = await fs.getDoc(fs.doc(db, 'codes', code)); if (!s.exists()) return null;
      const u = await fs.getDoc(fs.doc(db, 'users', s.data().uid));
      return { uid: s.data().uid, name: u.exists() ? u.data().name : 'VOXMユーザー', code };
    },
    async profile(id) { const u = await fs.getDoc(fs.doc(db, 'users', id)); return u.exists() ? u.data() : null; },
    async createCall(data) { const r = await fs.addDoc(fs.collection(db, 'calls'), Object.assign({ caller: uid, createdAt: Date.now() }, data)); return r.id; },
    onCall(id, cb) { return fs.onSnapshot(fs.doc(db, 'calls', id), (s) => cb(s.exists() ? s.data() : null)); },
    async updateCall(id, patch) { await fs.updateDoc(fs.doc(db, 'calls', id), patch); },
    async addCand(id, side, c) { await fs.addDoc(fs.collection(db, 'calls', id, side), c); },
    onCands(id, side, cb) { return fs.onSnapshot(fs.collection(db, 'calls', id, side), (q) => q.docChanges().forEach((ch) => { if (ch.type === 'added') cb(ch.doc.data()); })); },
    onIncoming(cb) {
      const q = fs.query(fs.collection(db, 'calls'), fs.where('callee', '==', uid), fs.where('status', '==', 'ringing'));
      return fs.onSnapshot(q, (qs) => qs.docChanges().forEach((ch) => { if (ch.type === 'added') cb(ch.doc.id, ch.doc.data()); }));
    },
  };
}
/* ---- signaling: local simulator (two tabs, same browser) ---- */
function simSignal() {
  const uid = sessionStorage.getItem('voxmSimUid') || ('sim' + Math.random().toString(36).slice(2, 8));
  sessionStorage.setItem('voxmSimUid', uid);
  const bc = new BroadcastChannel('voxm-callsim');
  const L = new Set();
  const get = (k) => { try { return JSON.parse(localStorage.getItem('vsim:' + k)); } catch (e) { return null; } };
  const put = (k, v) => { localStorage.setItem('vsim:' + k, JSON.stringify(v)); bc.postMessage({ k }); L.forEach((f) => f(k)); };
  bc.onmessage = (e) => L.forEach((f) => f(e.data.k));
  window.addEventListener('storage', (e) => { if (e.key && e.key.startsWith('vsim:')) L.forEach((f) => f(e.key.slice(5))); });
  const on = (fn) => { L.add(fn); return () => L.delete(fn); };
  return {
    uid,
    async saveProfile(p) { put('user:' + uid, p); },
    async claimCode(code) { const c = get('code:' + code); if (c && c.uid !== uid) return false; put('code:' + code, { uid }); return true; },
    async lookupCode(code) { const c = get('code:' + code); if (!c) return null; const u = get('user:' + c.uid) || {}; return { uid: c.uid, name: u.name || 'VOXMユーザー', code }; },
    async profile(id) { return get('user:' + id); },
    async createCall(data) { const id = 'c' + Date.now().toString(36); put('call:' + id, Object.assign({ caller: uid, createdAt: Date.now() }, data)); const idx = get('calls') || []; idx.push(id); put('calls', idx); return id; },
    onCall(id, cb) { cb(get('call:' + id)); return on((k) => { if (k === 'call:' + id) cb(get(k)); }); },
    async updateCall(id, patch) { put('call:' + id, Object.assign(get('call:' + id) || {}, patch)); },
    async addCand(id, side, c) { const k = `cand:${id}:${side}`; const a = get(k) || []; a.push(c); put(k, a); },
    onCands(id, side, cb) { let n = 0; const k = `cand:${id}:${side}`; const f = () => { const a = get(k) || []; while (n < a.length) cb(a[n++]); }; f(); return on((kk) => { if (kk === k) f(); }); },
    onIncoming(cb) { const seen = new Set(); const f = () => (get('calls') || []).forEach((id) => { const c = get('call:' + id); if (c && c.callee === uid && c.status === 'ringing' && !seen.has(id)) { seen.add(id); cb(id, c); } }); f(); return on((k) => { if (k === 'calls' || k.startsWith('call:')) f(); }); },
  };
}
const callSim = () => /[?&]callsim=1/.test(location.search);
const callConfigured = () => !!FIREBASE_CONFIG || callSim();

async function callInit() {
  if (CALL.ready || CALL.initing || !callConfigured()) return;
  CALL.initing = true;
  try {
    CALL.sig = callSim() ? simSignal() : await fbSignal();
    CALL.uid = CALL.sig.uid;
    if (!S.call) S.call = { name: '', code: '', friends: [] };
    if (!S.call.name) S.call.name = 'VOXMユーザー';
    if (!S.call.code || !(await CALL.sig.claimCode(S.call.code))) {
      for (let i = 0; i < 6; i++) { const c = Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join(''); if (await CALL.sig.claimCode(c)) { S.call.code = c; break; } }
    }
    await CALL.sig.saveProfile({ name: S.call.name, code: S.call.code });
    saveSettings();
    CALL.sig.onIncoming(onIncoming);
    CALL.ready = true; CALL.error = '';
  } catch (e) {
    console.warn('call init', e);
    CALL.error = 'サーバーに接続できませんでした（Firebaseの設定を確認してください）';
  }
  CALL.initing = false;
  if (S.tab === 'output') RENDER.output();
}

async function iceServers() {
  const list = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  if (TURN_CREDENTIALS_URL) { try { const r = await fetch(TURN_CREDENTIALS_URL); const j = await r.json(); if (Array.isArray(j)) list.push(...j); } catch (e) { console.warn('TURN', e); } }
  return list;
}
// the converted voice: start the engine if needed (monitor off during calls so you don't hear yourself twice)
async function callLocalStream() {
  if (VoxEngine.status.state !== 'live') { VoxEngine.setParams(combinedParams()); VoxEngine.status.volume = S.volume; await VoxEngine.start(await audioOpts()); }
  if (VoxEngine.status.state !== 'live') throw new Error('mic');
  CALL.prevMonitor = S.monitor; VoxEngine.setMonitor(false);
  return VoxEngine.status.recDest.stream;
}
async function chipPayload() {
  const out = [];
  for (const c of seatedChips()) {
    const item = { name: c.name, color: c.color, art: c.art || '', kind: c.kind };
    if (c.photo) item.thumb = await thumbOf(c);
    out.push(item);
  }
  return out;
}
function thumbOf(c) {
  return new Promise((res) => {
    const src = (typeof ASSET !== 'undefined' && ASSET[c.photo]) || c.photo;
    const img = new Image();
    img.onload = () => { const cv = document.createElement('canvas'); cv.width = cv.height = 56; const g = cv.getContext('2d'); const s = Math.min(img.width, img.height); g.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 56, 56); try { res(cv.toDataURL('image/jpeg', 0.7)); } catch (e) { res(''); } };
    img.onerror = () => res('');
    img.src = src;
  });
}
async function sendChips() { if (CALL.dc && CALL.dc.readyState === 'open') CALL.dc.send(JSON.stringify({ t: 'chips', chips: await chipPayload() })); }
let chipTimer = 0;
function callChipsChanged() { if (CALL.state !== 'active') return; clearTimeout(chipTimer); chipTimer = setTimeout(sendChips, 150); renderCallUI(); }

function setupPC(pc) {
  pc.ontrack = (e) => {
    if (!CALL.audio) { CALL.audio = document.createElement('audio'); CALL.audio.autoplay = true; CALL.audio.playsInline = true; document.body.append(CALL.audio); }
    CALL.audio.srcObject = e.streams[0] || new MediaStream([e.track]);
    CALL.audio.play().catch(() => {});
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'connected' && CALL.state !== 'active') { CALL.state = 'active'; CALL.t0 = Date.now(); stopRing(); VoxEngine.sfx('on'); renderCallUI(); }
    if (pc.connectionState === 'failed') { toast('通話がつながりませんでした（ネットワークを確認してください）'); endCall(false); }
    if (pc.connectionState === 'disconnected') setTimeout(() => { if (CALL.pc === pc && pc.connectionState === 'disconnected') endCall(true); }, 6000);
  };
}
function setupDC(dc) {
  CALL.dc = dc;
  dc.onopen = () => sendChips();
  dc.onmessage = (e) => {
    let m; try { m = JSON.parse(e.data); } catch (err) { return; }
    if (m.t === 'chips') {
      const before = CALL.remoteChips.map((c) => c.name).join('|');
      CALL.remoteChips = m.chips || [];
      const added = CALL.remoteChips.find((c) => !before.split('|').includes(c.name));
      renderCallUI();
      if (added && before !== '') swapFx(added);
      else if (added && CALL.state === 'active') swapFx(added);
    }
  };
}

async function startCall(friend) {
  if (CALL.state !== 'idle') return;
  if (!CALL.ready) { await callInit(); if (!CALL.ready) { toast(CALL.error || '通話の準備ができていません'); return; } }
  CALL.state = 'calling'; CALL.role = 'caller'; CALL.peer = friend; CALL.remoteChips = [];
  renderCallUI();
  try {
    const stream = await callLocalStream();
    const pc = CALL.pc = new RTCPeerConnection({ iceServers: await iceServers() });
    setupPC(pc);
    stream.getAudioTracks().forEach((t) => pc.addTrack(t, stream));
    setupDC(pc.createDataChannel('voxm'));
    const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
    const id = CALL.id = await CALL.sig.createCall({ callee: friend.uid, callerName: S.call.name, callerCode: S.call.code, status: 'ringing', offer: { type: offer.type, sdp: offer.sdp } });
    pc.onicecandidate = (e) => { if (e.candidate) CALL.sig.addCand(id, 'callerCands', e.candidate.toJSON()); };
    CALL.unsub.push(CALL.sig.onCall(id, async (d) => {
      if (!d || CALL.id !== id) return;
      if (d.answer && !CALL.answered) { CALL.answered = true; await pc.setRemoteDescription(d.answer).catch((e) => console.warn(e)); }
      if (d.status === 'declined') { toast(`${friend.name} さんは今は出られないようです`); endCall(true); }
      if (d.status === 'ended') endCall(true);
    }));
    CALL.unsub.push(CALL.sig.onCands(id, 'calleeCands', (c) => pc.addIceCandidate(c).catch(() => {})));
    startRing(true);
    setTimeout(() => { if (CALL.id === id && CALL.state === 'calling') { CALL.sig.updateCall(id, { status: 'missed' }).catch(() => {}); toast('応答がありませんでした'); endCall(true); } }, 40000);
  } catch (e) { console.warn(e); toast(e.message === 'mic' ? 'マイクを起動できませんでした' : '発信できませんでした'); endCall(true); }
}
function onIncoming(id, d) {
  if (CALL.state !== 'idle') { CALL.sig.updateCall(id, { status: 'declined' }).catch(() => {}); return; }
  if (Date.now() - (d.createdAt || 0) > 45000) return;
  CALL.incoming = { id, d };
  CALL.state = 'ringing'; CALL.role = 'callee';
  const known = (S.call.friends || []).find((f) => f.uid === d.caller);
  CALL.peer = known || { uid: d.caller, name: d.callerName || 'VOXMユーザー', code: d.callerCode || '' };
  startRing(false);
  renderCallUI();
  CALL.unsub.push(CALL.sig.onCall(id, (x) => { if (x && (x.status === 'ended' || x.status === 'missed') && CALL.id === null && CALL.state === 'ringing') { toast('着信は終了しました'); endCall(true); } }));
}
async function acceptCall() {
  const inc = CALL.incoming; if (!inc) return;
  CALL.id = inc.id; CALL.state = 'connecting'; stopRing(); renderCallUI();
  try {
    const stream = await callLocalStream();
    const pc = CALL.pc = new RTCPeerConnection({ iceServers: await iceServers() });
    setupPC(pc);
    pc.ondatachannel = (e) => setupDC(e.channel);
    stream.getAudioTracks().forEach((t) => pc.addTrack(t, stream));
    pc.onicecandidate = (e) => { if (e.candidate) CALL.sig.addCand(inc.id, 'calleeCands', e.candidate.toJSON()); };
    await pc.setRemoteDescription(inc.d.offer);
    const ans = await pc.createAnswer(); await pc.setLocalDescription(ans);
    await CALL.sig.updateCall(inc.id, { answer: { type: ans.type, sdp: ans.sdp }, status: 'active' });
    CALL.unsub.push(CALL.sig.onCands(inc.id, 'callerCands', (c) => pc.addIceCandidate(c).catch(() => {})));
    CALL.unsub.push(CALL.sig.onCall(inc.id, (d) => { if (d && d.status === 'ended') endCall(true); }));
    // remember who called
    if (!(S.call.friends || []).some((f) => f.uid === CALL.peer.uid)) { S.call.friends.push({ uid: CALL.peer.uid, name: CALL.peer.name, code: CALL.peer.code }); saveSettings(); }
  } catch (e) { console.warn(e); toast(e.message === 'mic' ? 'マイクを起動できませんでした' : '応答できませんでした'); endCall(false); }
}
function declineCall() { const inc = CALL.incoming; if (inc) CALL.sig.updateCall(inc.id, { status: 'declined' }).catch(() => {}); endCall(true); }
function endCall(remote) {
  if (CALL.ending || CALL.state === 'idle') return;
  CALL.ending = true;
  stopRing();
  // stop listening first, then tell the other side (avoids reacting to our own update)
  CALL.unsub.forEach((u) => { try { u(); } catch (e) {} }); CALL.unsub = [];
  if (CALL.id && !remote && CALL.sig) CALL.sig.updateCall(CALL.id, { status: 'ended' }).catch(() => {});
  try { CALL.dc && CALL.dc.close(); } catch (e) {}
  try { CALL.pc && CALL.pc.close(); } catch (e) {}
  if (CALL.audio) { CALL.audio.srcObject = null; }
  if (CALL.prevMonitor !== null) { VoxEngine.setMonitor(CALL.prevMonitor); CALL.prevMonitor = null; }
  const was = CALL.state;
  Object.assign(CALL, { pc: null, dc: null, id: null, role: null, peer: null, state: 'idle', remoteChips: [], incoming: null, muted: false, answered: false, min: false, ending: false });
  if (was === 'active') VoxEngine.sfx('off');
  renderCallUI();
  if (S.tab === 'output') RENDER.output();
}
function toggleMute() {
  CALL.muted = !CALL.muted;
  const s = VoxEngine.status.recDest && VoxEngine.status.recDest.stream;
  if (s) s.getAudioTracks().forEach((t) => { t.enabled = !CALL.muted; });
  renderCallUI();
}
function startRing(out) {
  stopRing();
  const beat = () => { VoxEngine.sfx(out ? 'tick' : 'on'); if (!out) setTimeout(() => VoxEngine.sfx('on'), 220); try { if (!out) navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (e) {} };
  beat(); CALL.ring = setInterval(beat, out ? 1800 : 1400);
}
function stopRing() { clearInterval(CALL.ring); CALL.ring = 0; }

/* ---- call UI: full-screen overlay (can be minimised to a pill while you change chips) ---- */
let callTick = 0;
const avatarOf = (name, color) => `<span class="cav" style="--c:${color || '#a487ff'}">${esc((name || '?').slice(0, 1))}</span>`;
const miniChip = (c) => `<span class="cchip" style="--c:${c.color}">${c.thumb ? `<img src="${c.thumb}" alt="">` : c.art && ART[c.art] ? `<span class="art">${artSVG(c.art, c.color)}</span>` : `<span class="art"></span>`}<b>${esc(c.name)}</b></span>`;
function renderCallUI() {
  let ov = $('#callOv');
  if (CALL.state === 'idle') { if (ov) ov.remove(); clearInterval(callTick); callTick = 0; const pill = $('#callPill'); if (pill) pill.remove(); return; }
  if (!ov) { ov = document.createElement('div'); ov.id = 'callOv'; ov.className = 'call-ov'; document.body.append(ov); }
  if (CALL.min) { ov.classList.add('min'); } else ov.classList.remove('min');
  const p = CALL.peer || {};
  const status = CALL.state === 'ringing' ? '着信中…' : CALL.state === 'calling' ? '呼び出し中…' : CALL.state === 'connecting' ? '接続中…' : fmtSec((Date.now() - CALL.t0) / 1000);
  const mine = seatedChips().map((c) => ({ name: c.name, color: c.color, art: c.art, thumb: '' }));
  ov.innerHTML = CALL.min ? `<button class="call-pill" id="cpOpen"><i></i>${esc(p.name || '')} · ${status}</button>` : `
    <div class="call-bg"></div>
    <div class="call-top"><button class="icon-btn" id="cMin" aria-label="小さくする">${ICON.back}</button><span class="eyebrow" style="margin:0">VOXM CALL</span><span style="width:40px"></span></div>
    <div class="call-peer">${avatarOf(p.name, CALL.remoteChips[0] && CALL.remoteChips[0].color)}<b>${esc(p.name || '')}</b><span class="call-st">${status}</span></div>
    <div class="call-chips"><div class="cc-h">相手のチップ</div><div class="cc-row" id="ccRemote">${CALL.remoteChips.length ? CALL.remoteChips.map(miniChip).join('') : '<span class="small muted">素の声</span>'}</div></div>
    <div class="call-chips"><div class="cc-h">あなたのチップ <button class="link" id="cChange">変更</button></div><div class="cc-row">${mine.length ? mine.map(miniChip).join('') : '<span class="small muted">素の声</span>'}</div></div>
    <div class="call-btns">${CALL.state === 'ringing' ? `<button class="cbig no" id="cDecline">${ICON.close}<span>拒否</span></button><button class="cbig yes" id="cAccept">${ICON.phone || ICON.mic}<span>応答</span></button>`
      : `<button class="cbig ${CALL.muted ? 'on' : ''}" id="cMute">${ICON.mic}<span>${CALL.muted ? 'ミュート中' : 'ミュート'}</span></button><button class="cbig no" id="cEnd">${ICON.close}<span>終了</span></button>`}</div>`;
  const b = (id, fn) => { const e = $('#' + id, ov); if (e) e.onclick = fn; };
  b('cAccept', acceptCall); b('cDecline', declineCall); b('cEnd', () => endCall(false)); b('cMute', toggleMute);
  b('cMin', () => { CALL.min = true; renderCallUI(); });
  b('cChange', () => { CALL.min = true; renderCallUI(); go('home'); toast('チップを差し替えると、相手にも伝わります'); });
  b('cpOpen', () => { CALL.min = false; renderCallUI(); });
  if (!callTick) callTick = setInterval(() => { if (CALL.state === 'active') { const st = $('.call-st', ov) || $('#cpOpen', ov); if (st && !CALL.min) st.textContent = fmtSec((Date.now() - CALL.t0) / 1000); else if (CALL.min) renderCallUI(); } }, 1000);
}
// the other side swapped a chip: fly it in
function swapFx(c) {
  VoxEngine.sfx('insert');
  const el = document.createElement('div');
  el.className = 'swap-fx';
  el.innerHTML = `<div class="sfx-card" style="--c:${c.color}">${c.thumb ? `<img src="${c.thumb}" alt="">` : c.art && ART[c.art] ? `<span class="art">${artSVG(c.art, c.color)}</span>` : ''}</div><div class="sfx-t"><b>${esc((CALL.peer && CALL.peer.name) || '相手')}</b> が「${esc(c.name)}」を差し込んだ！</div>`;
  document.body.append(el);
  setTimeout(() => el.remove(), 2600);
}

/* ---- call section on the output tab ---- */
function callSectionHTML() {
  if (!callConfigured()) return `<div class="callbox"><div class="row" style="gap:10px"><span class="ic" style="--sc:#a487ff">${ICON.users}</span><div class="grow"><b>VOXM通話</b><div class="small muted">変換した声のまま、VOXM同士で通話できます。</div></div><span class="status plan">準備中</span></div>
    <p class="small muted" style="margin:10px 0 0;line-height:1.6">サーバー（Firebase）の設定が済むと使えるようになります。</p></div>`;
  if (!CALL.ready) return `<div class="callbox"><b>VOXM通話</b><p class="small muted" style="margin-top:6px">${CALL.error || 'サーバーに接続中…'}</p>${CALL.error ? '<button class="btn ghost" id="callRetry" style="margin-top:8px">再接続</button>' : ''}</div>`;
  const fr = S.call.friends || [];
  return `<div class="callbox">
    <div class="row" style="gap:10px"><span class="ic" style="--sc:#a487ff">${ICON.users}</span><div class="grow"><b>VOXM通話</b><div class="small muted">変換した声のまま通話。チップの差し替えも相手に伝わります</div></div><span class="status ok">使える</span></div>
    <div class="cme"><div><span class="small muted">あなたの名前</span><input id="callName" maxlength="16" value="${esc(S.call.name)}"></div><div><span class="small muted">フレンドコード</span><button class="ccode" id="callCode">${esc(S.call.code)}</button></div></div>
    <div class="cadd"><input id="callAdd" maxlength="6" placeholder="友達のフレンドコード" autocapitalize="characters"><button class="btn" id="callAddBtn">追加</button></div>
    <div class="cfr">${fr.length ? fr.map((f, i) => `<div class="cfr-i">${avatarOf(f.name)}<div class="grow"><b>${esc(f.name)}</b><div class="small muted">${esc(f.code || '')}</div></div><button class="btn call" data-call="${i}">${ICON.phone || ICON.mic} 通話</button><button class="icon-btn" data-delf="${i}" aria-label="削除">${ICON.trash}</button></div>`).join('') : '<div class="small muted" style="padding:8px 2px">フレンドコードを交換して、友達を追加しましょう。</div>'}</div>
    <p class="small muted" style="margin-top:8px;line-height:1.6">相手もVOXMを開いている必要があります。イヤホンを使うと声がきれいに届きます。</p></div>`;
}
function bindCallSection(page) {
  if ($('#callRetry', page)) $('#callRetry', page).onclick = () => { CALL.error = ''; callInit(); RENDER.output(); };
  if (!CALL.ready) return;
  $('#callName', page).onchange = (e) => { S.call.name = e.target.value.trim() || 'VOXMユーザー'; saveSettings(); CALL.sig.saveProfile({ name: S.call.name, code: S.call.code }).catch(() => {}); toast('名前を保存しました'); };
  $('#callCode', page).onclick = async () => {
    const text = `VOXMで通話しよう！フレンドコード: ${S.call.code}`;
    try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(S.call.code); toast('コピーしました'); } } catch (e) {}
  };
  $('#callAddBtn', page).onclick = async () => {
    const code = $('#callAdd', page).value.trim().toUpperCase();
    if (code.length !== 6) { toast('6文字のコードを入れてください'); return; }
    if (code === S.call.code) { toast('自分のコードです'); return; }
    const f = await CALL.sig.lookupCode(code).catch(() => null);
    if (!f) { toast('見つかりませんでした'); return; }
    if (!S.call.friends.some((x) => x.uid === f.uid)) S.call.friends.push(f);
    saveSettings(); toast(`${f.name} さんを追加しました`); RENDER.output();
  };
  $$('[data-call]', page).forEach((b) => b.onclick = () => startCall(S.call.friends[+b.dataset.call]));
  $$('[data-delf]', page).forEach((b) => b.onclick = () => { S.call.friends.splice(+b.dataset.delf, 1); saveSettings(); RENDER.output(); });
}
