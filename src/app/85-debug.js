/* ---------- debug tools: live HUD, log export, screen recording (iOS app) ---------- */
const DBG = { hud: false, timer: 0, nseq: 0, rec: false, recT0: 0, lastState: '' };

// periodic snapshots go into the log while converting (and every tick while the HUD is shown)
function dbgTick(force) {
  const st = VoxEngine.status;
  if (st.state !== DBG.lastState) { VLOG.add('ENG', 'state', DBG.lastState || '-', '→', st.state, st.error || ''); DBG.lastState = st.state; }
  if (!force && st.state !== 'live' && !DBG.hud) return null;
  const d = VoxEngine.debug();
  const sv = spkVoice(); d.spk = sv ? { f0: Math.round(sv.f0), env: SPK.envReady, n: SPK.f0s.length } : null; d.match = SPK.cache;
  d.slots = (S.slots || []).filter(Boolean).length; d.tab = (document.querySelector('.tab.on, .tabbar .on') || {}).textContent || ''; d.vis = document.visibilityState;
  return d;
}
let dbgN = 0;
async function dbgLoop() {
  const d = dbgTick();
  if (d && (DBG.hud || ++dbgN % 4 === 0)) VLOG.add('SNAP', d); // every 2 s while converting, every 0.5 s with the HUD
  if (d && DBG.hud) drawHud(d);
  if (VoxNative.isNative() && (d || dbgN % 20 === 0) && dbgN % 4 === 0) {
    const r = await VoxNative.call('diag', { after: DBG.nseq });
    if (r) {
      (r.logs || []).forEach((l) => VLOG.add('IOS', l));
      if (typeof r.seq === 'number') DBG.nseq = r.seq;
      DBG.native = r;
      if (DBG.hud) drawHud(d || VoxEngine.debug());
    }
  }
}
function dbgStart() { clearInterval(DBG.timer); DBG.timer = setInterval(dbgLoop, 500); }

/* ---- HUD ---- */
function setHud(on) {
  DBG.hud = on; S.debugHud = on; saveSettings();
  let el = $('#dbgHud');
  if (!on) { el && el.remove(); return; }
  if (!el) {
    el = document.createElement('div'); el.id = 'dbgHud'; el.className = 'dbg-hud';
    el.innerHTML = `<div class="dh-txt" id="dhTxt">…</div><div class="dh-row">
      <button data-d="rec">● 録画</button><button data-d="log">ログ</button><button data-d="tone">テスト音</button><button data-d="x">×</button></div>`;
    document.body.append(el);
    el.querySelector('[data-d="rec"]').onclick = toggleScreenRec;
    el.querySelector('[data-d="log"]').onclick = exportLog;
    el.querySelector('[data-d="tone"]').onclick = testTone;
    el.querySelector('[data-d="x"]').onclick = () => setHud(false);
  }
}
const bar = (v) => { if (v == null) return '—'; const db = v > 0 ? 20 * Math.log10(v) : -120; const n = Math.max(0, Math.min(10, Math.round((db + 70) / 7))); return '█'.repeat(n) + '·'.repeat(10 - n) + ' ' + db.toFixed(0) + 'dB'; };
function drawHud(d) {
  const t = $('#dhTxt'); if (!t) return;
  const n = DBG.native;
  const rec = DBG.rec ? `  ● REC ${fmtSec((Date.now() - DBG.recT0) / 1000)}` : '';
  t.textContent = [
    `ENG ${d.state}${d.error ? ' (' + d.error + ')' : ''}  ctx ${d.ctx} ${d.sr}Hz${rec}`,
    `IN  ${bar(d.inRms)}`,
    `OUT ${bar(d.outRms)}`,
    `mic ${d.mic ? `${d.mic.ready}${d.mic.muted ? ' MUTED' : ''} ec=${d.mic.ec}` : '—'}  mon=${d.monitor ? 'ON' : 'OFF'} vol=${d.vol}`,
    `spk ${d.spk ? d.spk.f0 + 'Hz n' + d.spk.n + (d.spk.env ? ' env✓' : ' env…') : '—'}  match ${Object.values(d.match || {}).map((m) => (m.pitch >= 0 ? '+' : '') + m.pitch.toFixed(1) + '/' + m.formant.toFixed(1)).join(' ') || '—'}`,
    `lat base ${d.base}ms out ${d.outLat}ms core ${d.coreLat}ms  heal ${d.restarts}${d.needsResume ? ' NEED-TAP' : ''}`,
    n ? `iOS ${n.category || '?'}/${n.mode || '?'} out=${(n.outputs || []).join(',')} in=${(n.inputs || []).join(',')}` : (VoxNative.isNative() ? 'iOS diag: 応答なし' : 'web'),
    n ? `iOS sr ${n.sampleRate} io ${n.ioBuffer != null ? (n.ioBuffer * 1000).toFixed(1) : '?'}ms vol ${n.outputVolume != null ? n.outputVolume.toFixed(2) : '?'} other=${n.otherAudio}` : '',
  ].filter(Boolean).join('\n');
}

/* ---- log export ---- */
async function logText() {
  const n = VoxNative.isNative() ? await VoxNative.call('diag', { after: 0 }) : null;
  const safeS = {}; for (const k of ['slots', 'monitor', 'volume', 'safeMode', 'routeAsked', 'boost', 'noiseSup', 'fineTune', 'nativeSession', 'debugHud']) safeS[k] = S[k];
  const head = [
    'VOXM debug log', new Date().toString(), navigator.userAgent,
    `native=${VoxNative.isNative()} screen=${screen.width}x${screen.height}@${devicePixelRatio} viewport=${innerWidth}x${innerHeight}`,
    'settings ' + JSON.stringify(safeS),
    'engine ' + JSON.stringify(VoxEngine.debug()),
    'ios ' + (n ? JSON.stringify(Object.assign({}, n, { logs: undefined })) : 'n/a'),
    '---- native log ----', ...((n && n.logs) || []),
    '---- app log ----',
  ];
  return head.concat(VLOG.lines()).join('\n');
}
async function exportLog() {
  const txt = await logText();
  const name = 'voxm-log-' + new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '') + '.txt';
  try {
    const file = new File([txt], name, { type: 'text/plain' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
    if (navigator.share) { await navigator.share({ title: name, text: txt }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; VLOG.add('WARN', 'share failed', e); }
  try { await navigator.clipboard.writeText(txt); toast('ログをコピーしました。チャットに貼り付けてください'); }
  catch (e) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' })); a.download = name; a.click();
  }
}

/* ---- screen recording (iOS app: ReplayKit; saves to Photos from the preview) ---- */
async function toggleScreenRec() {
  if (!VoxNative.isNative()) { toast('画面録画はiPhoneアプリ版で使えます（ブラウザではコントロールセンターの画面収録を使ってください）', 3600); return; }
  if (!DBG.rec) {
    VLOG.add('APP', 'screen rec start');
    const r = await VoxNative.call('recStart', { mic: false }, 20000);
    if (r && r.ok) { DBG.rec = true; DBG.recT0 = Date.now(); toast('画面録画を開始しました'); }
    else toast('画面録画を開始できませんでした' + (r && r.error ? '：' + r.error : '（このビルドは未対応かも）'), 3600);
  } else {
    VLOG.add('APP', 'screen rec stop');
    DBG.rec = false;
    const r = await VoxNative.call('recStop', {}, 20000);
    if (!r || !r.ok) toast('録画を保存できませんでした' + (r && r.error ? '：' + r.error : ''), 3600);
  }
  const b = $('#dbgHud [data-d="rec"]'); if (b) b.textContent = DBG.rec ? '■ 停止' : '● 録画';
}

/* ---- test tone: checks the output path without the mic ---- */
function testTone() {
  VoxEngine.prime();
  const ctx = VoxEngine.status.ctx; if (!ctx) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.value = 660; g.gain.setValueAtTime(0, ctx.currentTime); g.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.02); g.gain.setValueAtTime(0.25, ctx.currentTime + 0.5); g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6);
  o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.65);
  VLOG.add('APP', 'test tone', 'ctx', ctx.state, ctx.sampleRate);
  toast('テスト音（ピッ）が聞こえればスピーカー出力はOKです');
}

function debugSectionHTML() {
  return `<div class="h2">デバッグ</div>
    <div class="list-item"><div class="grow"><b style="font-size:14px">デバッグ表示</b><div class="small muted" style="margin-top:3px;line-height:1.5">画面上に入力/出力レベル・iPhoneの音声経路を表示。録画・ログ書き出し・テスト音ボタンも出ます。</div></div><button class="switch ${S.debugHud ? 'on' : ''}" id="swHud" aria-label="デバッグ表示"></button></div>
    ${VoxNative.isNative() ? `<div class="list-item"><div class="grow"><b style="font-size:14px">iPhoneの音声セッションをアプリで設定（実験）</b><div class="small muted" style="margin-top:3px;line-height:1.5">通常はOFF。OFFのときはiPhone側に任せ、スピーカー出力の切り替えだけ行います（次の「変換 ON」から反映）。</div></div><button class="switch ${S.nativeSession ? 'on' : ''}" id="swNat" aria-label="iPhoneの音声セッション"></button></div>` : ''}
    <div class="footer-actions" style="gap:8px;flex-wrap:wrap"><button class="btn ghost" id="btnLog">ログを書き出す</button><button class="btn ghost" id="btnRec">画面録画</button><button class="btn ghost" id="btnTone">テスト音</button></div>`;
}
function bindDebugSection(b) {
  const h = $('#swHud', b); if (h) h.onclick = () => { setHud(!DBG.hud); h.classList.toggle('on', DBG.hud); };
  const n = $('#swNat', b); if (n) n.onclick = () => { S.nativeSession = !S.nativeSession; n.classList.toggle('on', S.nativeSession); saveSettings(); VLOG.add('APP', 'nativeSession', S.nativeSession); };
  $('#btnLog', b).onclick = exportLog;
  $('#btnRec', b).onclick = () => { closeSheet(); toggleScreenRec(); };
  $('#btnTone', b).onclick = testTone;
}
