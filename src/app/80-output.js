/* ===== OUTPUT HUB: where the converted voice goes ===== */
const STATUS_LABEL = { ok: '今すぐ使える', pc: 'PCで使える', plan: '開発予定', no: 'iPhoneでは不可' };
const SERVICES = [
  { id: 'monitor', icon: 'headphones', color: '#6d4cf2', name: '自分で聴く（モニター）', status: 'ok',
    text: '変換した声をその場で確認。イヤホン・ヘッドホン推奨（スピーカーだとハウリングすることがあります）。' },
  { id: 'voice', icon: 'share', color: '#06c755', name: '録音して送る（LINE・SNS）', status: 'ok',
    text: '変換中にドライバーの<b>REC</b>で録音 → 下の一覧の共有ボタン → LINEのトークやSNSへ送信。' },
  { id: 'camera', icon: 'camera', color: '#ff4d68', name: 'カメラで撮る（変換ボイス動画）', status: 'ok',
    text: '自撮り動画に変換した声をのせて録画。そのまま共有できます。' },
  { id: 'file', icon: 'file', color: '#7fdcff', name: '音声ファイルを変換', status: 'ok',
    text: 'ボイスメモなどの録音ファイルを、装着中のメモリ＋FXで変換して保存。' },
  { id: 'pc', icon: 'monitor', color: '#5865f2', name: 'PC通話・配信（Discord / Zoom / Teams / OBS / LINE PC版）', status: 'pc',
    text: 'Windows/MacのChrome・EdgeでVOXMを開き、出力先を仮想オーディオケーブルに。通話・配信アプリのマイクにそのケーブルを選ぶと、変換した声が相手に届きます。' },
  { id: 'line', icon: 'phone', color: '#06c755', name: 'LINE通話（iPhoneアプリ）にリアルタイムで', status: 'no',
    text: 'iPhoneは他のアプリのマイク入力を置き換えることをOSが許可していません。代わりに「録音して送る」か、PC版LINE＋仮想ケーブルを使ってください。' },
  { id: 'call', icon: 'users', color: '#a487ff', name: 'VOXM通話（変換した声のまま通話）', status: 'plan',
    text: 'VOXMユーザー同士で、メモリを差し替えながら通話できる機能を開発予定（WebRTC・通話SDKを検討中）。' },
  { id: 'live', icon: 'broadcast', color: '#ff7a3d', name: 'ライブ配信（YouTube / Twitch）', status: 'pc',
    text: 'PCのOBSで仮想ケーブルをマイクに設定すれば配信できます。iPhone単体からの直接配信は開発予定。' },
];

RENDER.output = () => {
  const page = $('#page-output');
  const st = VoxEngine.status;
  const lat = VoxEngine.latencyMs();
  page.innerHTML = `
    <div class="eyebrow">OUTPUT HUB</div>
    <h1 class="h1">どこで使う？</h1>
    <p class="lead">変換した声の届け先。<b style="color:#fff">できること・できないこと</b>をそのまま表示しています。</p>
    ${SERVICES.map((s) => `<div class="svc ${s.status === 'ok' ? 'go' : ''}" data-svc="${s.id}">
      <span class="ic" style="--sc:${s.color}">${ICON[s.icon]}</span>
      <div class="grow"><div class="t"><b>${s.name}</b></div><p>${s.text}</p>
        <div class="row" style="margin-top:10px;flex-wrap:wrap;gap:8px"><span class="status ${s.status}">${STATUS_LABEL[s.status]}</span>${svcAction(s.id)}</div>
        ${s.id === 'pc' ? pcBlock() : ''}
      </div></div>`).join('')}
    <div class="h2">録音・動画 <small>${S.recordings.length}件</small></div>
    <div class="panel" style="padding:4px 14px">${S.recordings.length ? S.recordings.map(recItemHTML).join('') : '<div class="empty">まだありません。変換中にドライバーのRECを押すと録音できます。</div>'}</div>
    <div class="h2">接続診断</div>
    <div class="panel"><div class="kv">
      <span>マイク処理</span><b>${st.state === 'live' ? '動作中' : st.state === 'error' ? 'エラー' : '停止中'}</b>
      <span>音声エンジン</span><b>${st.coreKind || '—'}</b>
      <span>サンプルレート</span><b>${st.ctx ? st.ctx.sampleRate + ' Hz' : '—'}</b>
      <span>推定遅延（入力→出力）</span><b>${lat ? '約 ' + lat + ' ms' : '—'}</b>
      <span>出力デバイス選択</span><b>${VoxEngine.canPickOutput() ? '対応' : '非対応（端末の出力）'}</b>
      <span>保存</span><b>${S.persistent ? 'この端末内' : '一時メモリ'}</b>
    </div><div class="small muted" style="margin-top:10px;line-height:1.6">遅延は信号処理（約35ms）＋端末のオーディオ遅延の推定値です。Bluetoothイヤホンは大きく遅れるため、有線イヤホンがおすすめです。</div></div>`;
  bindOutput(page);
};
function svcAction(id) {
  if (id === 'monitor') return `<button class="pill ${S.monitor ? 'on' : ''}" data-act="mon">${S.monitor ? 'モニターON' : 'モニターOFF'}</button>`;
  if (id === 'voice') return `<button class="pill" data-act="home">${ICON.wave.replace('<svg', '<svg style="width:14px;height:14px"')} 変換画面へ</button>`;
  if (id === 'camera') return `<button class="pill on" data-act="cam">${ICON.camera.replace('<svg', '<svg style="width:14px;height:14px"')} カメラを開く</button>`;
  if (id === 'file') return `<label class="pill on">${ICON.upload.replace('<svg', '<svg style="width:14px;height:14px"')} ファイルを選ぶ<input type="file" accept="audio/*,video/*" data-act="file" hidden></label>`;
  return '';
}
function pcBlock() {
  return `<ol class="steps-list">
    <li>仮想オーディオケーブル（例：<b>VB-CABLE</b>、無料）をPCにインストール</li>
    <li>PCのChrome / EdgeでVOXMを開き、メモリを装着して変換ON</li>
    <li>下の「VOXMの出力先」で <b>CABLE Input</b> を選ぶ</li>
    <li>Discord・Zoom・OBS・LINE PC版などのマイク設定で <b>CABLE Output</b> を選ぶ</li></ol>
    ${VoxEngine.canPickOutput() ? `<label class="field" style="margin:12px 0 0"><span>VOXMの出力先</span><select class="input" id="sinkSel"><option value="">既定の出力（スピーカー）</option></select></label>
    <div class="small muted" style="margin-top:6px">デバイス名が出ない場合は、一度変換をONにしてマイクを許可してください。</div>` : '<div class="small muted" style="margin-top:8px">※ このブラウザは出力先の選択に未対応です（PCのChrome / Edgeで使えます）。</div>'}`;
}
function recItemHTML(r) {
  const d = new Date(r.createdAt);
  return `<div class="rec-item" data-rec="${r.id}">
    <button class="play" data-play aria-label="再生">${r.kind === 'video' ? ICON.camera : ICON.play}</button>
    <div class="grow"><div class="t">${esc(r.name)}</div><div class="m">${d.toLocaleDateString('ja-JP')} ${d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} · ${fmtSec(r.seconds)} · ${r.kind === 'video' ? '動画' : '音声'}</div></div>
    <div class="acts"><button data-share aria-label="共有">${ICON.share}</button><button data-del aria-label="削除">${ICON.trash}</button></div></div>`;
}
async function bindOutput(page) {
  $$('[data-act="mon"]', page).forEach((b) => b.onclick = () => { S.monitor = !S.monitor; VoxEngine.setMonitor(S.monitor); saveSettings(); RENDER.output(); });
  $$('[data-act="home"]', page).forEach((b) => b.onclick = () => go('home'));
  $$('[data-act="cam"]', page).forEach((b) => b.onclick = openCamera);
  $$('[data-act="file"]', page).forEach((inp) => inp.onchange = (e) => { const f = e.target.files && e.target.files[0]; if (f) convertFile(f); });
  $$('[data-rec]', page).forEach((row) => {
    const r = S.recordings.find((x) => x.id === row.dataset.rec);
    row.querySelector('[data-play]').onclick = () => playRecording(r);
    row.querySelector('[data-share]').onclick = () => shareRecording(r);
    row.querySelector('[data-del]').onclick = async () => {
      if (!(await confirmSheet('削除', `「${esc(r.name)}」を削除しますか？`, '削除', true))) return;
      S.recordings = S.recordings.filter((x) => x !== r); VoxStore.del('recordings', r.id); VoxStore.del('blobs', r.id); RENDER.output();
    };
  });
  const sel = $('#sinkSel', page);
  if (sel) {
    const outs = await VoxEngine.listOutputs();
    outs.filter((o) => o.id && o.id !== 'default').forEach((o) => { const opt = document.createElement('option'); opt.value = o.id; opt.textContent = o.label; sel.append(opt); });
    sel.value = VoxEngine.status.sinkId || '';
    sel.onchange = async () => { try { await VoxEngine.setOutput(sel.value); toast('出力先を切り替えました'); } catch (e) { toast('出力先を変更できませんでした'); } };
  }
}
async function playRecording(r) {
  const blob = await VoxStore.get('blobs', r.id);
  if (!blob) { toast('データが見つかりません'); return; }
  if (r.kind === 'video') {
    const url = URL.createObjectURL(blob);
    openSheet(esc(r.name), `<video src="${url}" controls playsinline style="width:100%;border-radius:16px;background:#000;max-height:60vh"></video>`, null, { onClose: () => URL.revokeObjectURL(url) });
  } else playBlob(blob);
}
function extFor(mime) { return /mp4/.test(mime) ? (/video/.test(mime) ? 'mp4' : 'm4a') : /wav/.test(mime) ? 'wav' : /ogg/.test(mime) ? 'ogg' : 'webm'; }
async function shareRecording(r) {
  const blob = await VoxStore.get('blobs', r.id);
  if (!blob) return;
  const fname = `VOXM_${r.name.replace(/[\\/:*?"<>|\s]/g, '_')}.${extFor(r.mime || blob.type)}`;
  const file = new File([blob], fname, { type: r.mime || blob.type });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'VOXM' }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  if (inFrame) { // Claude artifact viewer: hand the file over through the platform's save/share prompt
    try {
      const dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null;
      const ext = extFor(r.mime || blob.type);
      if (dl && (ext === 'mp4' || ext === 'm4a' || ext === 'webm')) {
        await dl.save({ filename: fname.replace(/\.m4a$/, '.mp4'), data: blob });
        return;
      }
      toast(dl ? 'この形式はこの画面から保存できません。公開版で開いてください' : 'この画面では保存・共有が制限されています', 3500);
    } catch (e) { if (!e || e.code !== 'declined') toast('保存できませんでした'); }
    return;
  }
  try {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fname; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } catch (e) { toast('この環境では共有できません'); }
}

/* file → converted wav */
async function convertFile(file) {
  try {
    toast('変換中…', 1500);
    const { samples, sampleRate } = await VoxAnalysis.decodeBlob(file, getDecodeCtx());
    const max = sampleRate * 90;
    const clip = samples.length > max ? samples.subarray(0, max) : samples;
    const out = await VoxEngine.renderOffline(clip, sampleRate, combinedParams());
    const blob = VoxEngine.encodeWav(out);
    const chip = chipById(S.insertedId);
    const rec = await saveRecording({ blob, mime: 'audio/wav', seconds: out.duration }, 'audio', (chip ? chip.name : '素の声') + '（ファイル変換）');
    playBlob(blob);
    toast(`変換しました${samples.length > max ? '（先頭90秒）' : ''}`);
    if (S.tab === 'output') RENDER.output();
    return rec;
  } catch (e) { console.warn(e); toast('このファイルは読み込めませんでした'); }
}

/* camera mode */
async function openCamera() {
  if (VoxEngine.status.state !== 'live') {
    if (!S.insertedId && W.list.length) { S.insertedId = W.list[Math.max(0, centerIndex())].id; syncSlotChip(); applyParams(); }
    VoxEngine.setParams(combinedParams()); VoxEngine.status.monitor = false; VoxEngine.status.volume = S.volume;
    await VoxEngine.start({ safeMode: S.safeMode, noiseSuppression: S.noiseSup });
    if (VoxEngine.status.state !== 'live') { showMicHelp(); return; }
  }
  let vstream;
  try { vstream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1080 }, height: { ideal: 1920 } }, audio: false }); }
  catch (e) { toast(inFrame ? 'この画面ではカメラが使えません。公開版で開いてください' : 'カメラを使えません（設定で許可してください）', 3500); return; }
  const prevMon = S.monitor; VoxEngine.setMonitor(false);
  const chip = chipById(S.insertedId);
  const ov = document.createElement('div');
  ov.className = 'cam';
  ov.innerHTML = `<video autoplay playsinline muted></video>
    <div class="cam-top"><div class="cam-tag">${chip ? chipHTML(chip, { noBadge: true }) : ''}<span>${esc(chip ? chip.name : '素の声')}</span></div><span class="timer" hidden>0:00</span><button class="icon-btn" data-x aria-label="閉じる">${ICON.close}</button></div>
    <div class="cam-bot"><span style="width:44px"></span><button class="shutter" aria-label="録画"><i></i></button><span style="width:44px"></span></div>`;
  document.body.append(ov);
  const v = ov.querySelector('video'); v.srcObject = vstream;
  const sh = ov.querySelector('.shutter'), tm = ov.querySelector('.timer');
  let timer = 0;
  const close = async () => {
    if (VoxEngine.recording()) await VoxEngine.stopRecording();
    clearInterval(timer); vstream.getTracks().forEach((t) => t.stop()); ov.remove(); VoxEngine.setMonitor(prevMon);
    if (S.tab === 'output') RENDER.output();
  };
  ov.querySelector('[data-x]').onclick = close;
  sh.onclick = async () => {
    if (VoxEngine.recording()) {
      clearInterval(timer); sh.classList.remove('on'); tm.hidden = true;
      const res = await VoxEngine.stopRecording();
      if (res && res.blob.size) {
        const rec = await saveRecording(res, 'video'); await close();
        openSheet('動画を保存しました', `<p class="lead">「${esc(rec.name)}」（${fmtSec(rec.seconds)}）。LINEやSNSに送れます。</p><div class="footer-actions"><button class="btn ghost" data-pv>${ICON.play} 見る</button><button class="btn" data-sh>${ICON.share} 共有</button></div>`, (b, c2) => {
          b.querySelector('[data-pv]').onclick = () => { c2(); playRecording(rec); };
          b.querySelector('[data-sh]').onclick = () => shareRecording(rec);
        });
      }
      return;
    }
    if (!VoxEngine.startRecording(vstream.getVideoTracks()[0])) { toast('このブラウザは動画録画に未対応です'); return; }
    sh.classList.add('on'); tm.hidden = false;
    const t0 = Date.now(); timer = setInterval(() => { tm.textContent = fmtSec((Date.now() - t0) / 1000); }, 300);
  };
}
