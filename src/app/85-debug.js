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
    <div class="footer-actions" style="gap:8px;flex-wrap:wrap"><button class="btn ghost" id="btnLog">ログを書き出す</button><button class="btn ghost" id="btnRec">画面録画</button><button class="btn ghost" id="btnTone">テスト音</button><button class="btn ghost" id="btnCmp">声の比較セット</button></div>`;
}
function bindDebugSection(b) {
  const h = $('#swHud', b); if (h) h.onclick = () => { setHud(!DBG.hud); h.classList.toggle('on', DBG.hud); };
  const n = $('#swNat', b); if (n) n.onclick = () => { S.nativeSession = !S.nativeSession; n.classList.toggle('on', S.nativeSession); saveSettings(); VLOG.add('APP', 'nativeSession', S.nativeSession); };
  $('#btnLog', b).onclick = exportLog;
  $('#btnRec', b).onclick = () => { closeSheet(); toggleScreenRec(); };
  $('#btnTone', b).onclick = testTone;
  $('#btnCmp', b).onclick = () => { closeSheet(); openCompare(); };
}

/* ---- share files (Web Share → iOS share sheet via the plugin → download) ---- */
async function shareFiles(files, title) {
  try {
    const fs = files.map((f) => new File([f.blob], f.name, { type: f.blob.type || 'application/octet-stream' }));
    if (navigator.canShare && navigator.canShare({ files: fs })) { await navigator.share({ files: fs, title }); return true; }
  } catch (e) { if (e && e.name === 'AbortError') return true; VLOG.add('WARN', 'web share failed', e); }
  if (VoxNative.isNative()) {
    try {
      const payload = [];
      for (const f of files) {
        const buf = new Uint8Array(await f.blob.arrayBuffer());
        let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
        payload.push({ name: f.name, base64: btoa(bin) });
      }
      const r = await VoxNative.call('shareFiles', { files: payload }, 10 * 60 * 1000);
      if (r && r.ok) return true;
    } catch (e) { VLOG.add('WARN', 'native share failed', e); }
  }
  for (const f of files) { const a = document.createElement('a'); a.href = URL.createObjectURL(f.blob); a.download = f.name; document.body.append(a); a.click(); a.remove(); await sleep(300); }
  return true;
}
const extOf = (blob) => (/wav/.test(blob.type) ? 'wav' : /mp4|aac|m4a/.test(blob.type) ? 'm4a' : /webm/.test(blob.type) ? 'webm' : /mpeg|mp3/.test(blob.type) ? 'mp3' : 'audio');
const safeName = (s) => String(s || 'voice').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 24);

async function exportChipSample(c) {
  const blob = c.sampleKey && await VoxStore.get('blobs', c.sampleKey);
  if (!blob) { toast('このメモリには録音が保存されていません'); return; }
  await shareFiles([{ blob, name: `voxm_${safeName(c.name)}_registered.${extOf(blob)}` }], c.name + ' の登録した声');
}

/* ---- comparison set: registered voice + raw mic + converted output + settings ---- */
function compareTarget() {
  if (typeof C !== 'undefined' && C && C.previewing && C.sampleBlob) return { name: C.name || 'draft', blob: C.sampleBlob, voice: C.voice, profile: C.profile, auto: C.auto, autoEq: C.autoEq, id: '__draft' };
  const c = seatedChips().find((x) => x.sampleKey) || seatedChips()[0];
  return c ? { name: c.name, key: c.sampleKey, voice: c.voice, profile: c.profile, auto: c.auto, autoEq: c.autoEq, id: c.id, analysis: c.analysis } : null;
}
function openCompare() {
  if (VoxEngine.status.state !== 'live') { toast('先に「変換 ON」（または「マイクで試す」）を押してから使ってください', 3500); return; }
  let timer = 0;
  openSheet('比較用に録音して書き出す', `
    <p class="lead" style="margin-top:0">「録音開始」を押して、5〜15秒ほど普通に話してください。<br>次の4つを書き出します。</p>
    <div class="small muted" style="line-height:1.8">① 登録した声（メモリの元の録音）<br>② あなたのマイクの声（変換前）<br>③ 変換後の声<br>④ 設定と解析の数値</div>
    <div class="rec-box" style="margin-top:14px"><button class="rec-big" id="cmpBtn" aria-label="録音">${ICON.mic}</button><div class="small" id="cmpT">録音開始</div></div>`, (b, close) => {
    const btn = $('#cmpBtn', b), t = $('#cmpT', b);
    btn.onclick = async () => {
      if (!btn.classList.contains('on')) {
        if (!VoxEngine.startCapture(20)) { toast('録音を開始できませんでした'); return; }
        btn.classList.add('on', 'stop'); btn.innerHTML = '<i></i>';
        timer = setInterval(() => { const s2 = VoxEngine.captureSeconds(); t.textContent = `録音中 ${s2.toFixed(1)}秒 / 最大20秒（もう一度押して止める）`; if (s2 >= 20) btn.click(); }, 200);
        return;
      }
      clearInterval(timer);
      const cap = VoxEngine.stopCapture();
      btn.classList.remove('on', 'stop'); btn.innerHTML = ICON.mic; t.textContent = '書き出し中…';
      if (!cap || cap.raw.length < cap.sr) { toast('短すぎます。もう一度録音してください'); t.textContent = '録音開始'; return; }
      const tg = compareTarget();
      const files = [];
      if (tg) {
        const reg = tg.blob || (tg.key && await VoxStore.get('blobs', tg.key));
        if (reg) files.push({ blob: reg, name: `voxm_1_registered_${safeName(tg.name)}.${extOf(reg)}` });
      }
      files.push({ blob: VoxAnalysis.wavBlob(cap.raw, cap.sr), name: 'voxm_2_mic_raw.wav' });
      files.push({ blob: VoxAnalysis.wavBlob(cap.out, cap.sr), name: 'voxm_3_converted.wav' });
      const info = {
        at: new Date().toISOString(), ua: navigator.userAgent,
        target: tg ? { name: tg.name, voiceF0: tg.voice && Math.round(tg.voice.f0), profile: tg.profile, auto: tg.auto, autoEq: tg.autoEq, analysis: tg.analysis } : null,
        applied: VoxEngine.status.params, speaker: (() => { const v = spkVoice(); return v ? { f0: Math.round(v.f0), envReady: SPK.envReady, frames: SPK.f0s.length } : null; })(), match: SPK.cache,
        autoMatch: S.autoMatch !== false, engine: VoxEngine.debug(),
      };
      files.push({ blob: new Blob([JSON.stringify(info, null, 2)], { type: 'application/json' }), name: 'voxm_4_settings.json' });
      VLOG.add('APP', 'compare export', files.map((f) => f.name + ' ' + f.blob.size).join(', '));
      await shareFiles(files, 'VOXM 比較セット');
      t.textContent = '書き出しました（もう一度録音もできます）';
    };
  }, { onClose: () => { clearInterval(timer); VoxEngine.stopCapture(); } });
}
