/* ===== CREATE: new voice memory chip ===== */
let C = null;
function newDraft() {
  return { step: 1, editId: null, type: null, name: '', color: COLORS[Math.floor(Math.random() * COLORS.length)], photo: '', art: null,
    consent: false, sampleBlob: null, analysis: null, profile: { pitch: 0, formant: 0 }, caseIds: [], preset: null, previewing: false };
}
const CHAR_PRESETS = BUILTIN_CHIPS.filter((c) => c.art);

RENDER.create = (opts = {}) => {
  if (opts.edit) {
    const c = chipById(opts.edit);
    if (c) {
      C = newDraft();
      Object.assign(C, { editId: c.id, type: c.kind === 'fx' || c.kind === 'music' ? 'character' : c.kind, name: c.name, color: c.color, photo: c.photo ? (ASSET[c.photo] || c.photo) : '', art: c.art || null,
        consent: !!c.consent, analysis: c.analysis || null, profile: JSON.parse(JSON.stringify(c.profile || {})), caseIds: casesOf(c.id).map((k) => k.id), step: 2, keepPhotoKey: c.photo && ASSET[c.photo] ? c.photo : null });
    }
  }
  if (!C || opts.reset) C = newDraft();
  if (opts.fromFx) { C = newDraft(); C.type = 'character'; C.art = 'wave'; C.profile = opts.fromFx; C.step = 2; C.name = 'MY FX'; }
  drawCreate();
};
const stepsFor = () => (C.type === 'character' ? [1, 2, 4] : [1, 2, 3, 4]);

function drawCreate() {
  const page = $('#page-create');
  const steps = stepsFor();
  const pos = steps.indexOf(C.step);
  const title = { 1: 'どんな声を作る？', 2: C.type === 'character' ? '見た目とベースの声' : '写真と名前', 3: '声を記録する', 4: '仕上げ' }[C.step];
  page.innerHTML = `
    <div class="eyebrow">${C.editId ? 'EDIT MEMORY' : 'NEW VOICE MEMORY'}</div>
    <h1 class="h1">${title}</h1>
    <div class="steps">${steps.map((s, i) => `<i class="${i <= pos ? 'on' : ''}"></i>`).join('')}</div>
    <div id="cBody"></div>`;
  ({ 1: stepType, 2: stepLook, 3: stepVoice, 4: stepTune })[C.step]($('#cBody'));
  page.scrollTop = 0;
}
function nextStep() { const s = stepsFor(); C.step = s[Math.min(s.length - 1, s.indexOf(C.step) + 1)]; drawCreate(); }
function prevStep() { const s = stepsFor(); const i = s.indexOf(C.step); if (i <= 0 || (C.editId && C.step === 2)) { endPreview(); C = null; go('memory'); return; } C.step = s[i - 1]; drawCreate(); }

function stepType(body) {
  const types = [
    ['friend', 'users', '友達の声', '本人の同意をもらって録音。声の高さと声色の傾向を測って、あなたの声をそれに近づけます。'],
    ['self', 'user', '自分の声', '自分の声をメモリ化。基準の声としても使われ、友達メモリの精度が上がります。'],
    ['character', 'sparkle', 'キャラクター・FX', 'ロボット・モンスターなどのベースを選んで、自分だけのキャラ声を調整。'],
  ];
  body.innerHTML = `<div class="type-cards">${types.map(([k, ic, t, d]) => `<button class="type-card ${C.type === k ? 'on' : ''}" data-t="${k}"><span class="ic">${ICON[ic]}</span><span><b>${t}</b><span>${d}</span></span></button>`).join('')}</div>
    <div class="note" style="margin-top:16px">${ICON.shield.replace('<svg', '<svg style="width:16px;height:16px;display:inline;vertical-align:-3px;margin-right:4px"')}<b>なりすまし防止：</b>友達の声は、本人の同意がある場合のみ作成できます。作成した声で本人のふりをして他人をだます使い方は禁止です。</div>`;
  $$('[data-t]', body).forEach((b) => b.addEventListener('click', () => {
    C.type = b.dataset.t;
    if (C.type === 'self' && !C.name) C.name = '自分の声';
    if (C.type === 'character' && !C.art) { C.art = 'robot'; C.profile = JSON.parse(JSON.stringify(CHAR_PRESETS[0].profile)); C.preset = CHAR_PRESETS[0].id; C.color = CHAR_PRESETS[0].color; }
    nextStep();
  }));
}

function draftChip() {
  return { id: C.editId || 'draft', name: C.name || (C.type === 'friend' ? '友達の名前' : 'NEW MEMORY'), kind: C.type || 'friend', color: C.color,
    photo: C.photo || '', art: C.photo ? null : C.art, profile: C.profile, tag: KIND_TAG[C.type] };
}
function stepLook(body) {
  const isChar = C.type === 'character';
  body.innerHTML = `
    <div class="photo-drop">
      <div id="cPrev">${chipHTML(draftChip())}</div>
      <div class="grow">
        <label class="btn ghost block" style="margin-bottom:10px">${ICON.image} ${C.photo ? '写真を変更' : '写真を選ぶ'}<input type="file" accept="image/*" id="cPhoto" hidden></label>
        ${C.photo ? '<button class="btn ghost sm block" id="cNoPhoto">写真を外す</button>' : `<div class="small muted" style="line-height:1.6">${isChar ? '写真なしならキャラのアイコンを表示' : 'カメラで撮影・アルバムから選択できます'}</div>`}
      </div>
    </div>
    <label class="field" style="margin-top:18px"><span>メモリの名前</span><input class="input" id="cName" maxlength="16" value="${esc(C.name)}" placeholder="${C.type === 'friend' ? '例：ゆうき' : '例：サイバー忍者'}"></label>
    <div class="field"><span>チップの色</span><div class="swatches">${COLORS.map((c) => `<button class="swatch ${c === C.color ? 'on' : ''}" data-col="${c}" style="--c:${c}"></button>`).join('')}</div></div>
    ${isChar ? `<div class="field"><span>ベースの声</span><div class="preset-grid">${CHAR_PRESETS.map((p) => `<button class="preset ${C.preset === p.id ? 'on' : ''}" data-pre="${p.id}" style="--c2:${shade(p.color, -0.5)}"><span class="art">${artSVG(p.art, p.color)}</span>${esc(p.name)}</button>`).join('')}</div></div>` : ''}
    <div class="footer-actions"><button class="btn ghost" id="cBack">${ICON.back} 戻る</button><button class="btn" id="cNext">次へ</button></div>`;
  const refresh = () => { $('#cPrev', body).innerHTML = chipHTML(draftChip()); };
  $('#cName', body).addEventListener('input', (e) => { C.name = e.target.value; refresh(); });
  $$('[data-col]', body).forEach((b) => b.addEventListener('click', () => { C.color = b.dataset.col; $$('[data-col]', body).forEach((x) => x.classList.toggle('on', x === b)); refresh(); }));
  $$('[data-pre]', body).forEach((b) => b.addEventListener('click', () => {
    const p = CHAR_PRESETS.find((x) => x.id === b.dataset.pre);
    C.preset = p.id; C.art = p.art; C.profile = JSON.parse(JSON.stringify(p.profile)); C.color = p.color;
    if (!C.name || CHAR_PRESETS.some((x) => x.name === C.name)) C.name = p.name;
    stepLook(body);
  }));
  $('#cPhoto', body).addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    try { C.photo = await cropPhoto(f); C.keepPhotoKey = null; stepLook(body); } catch (err) { toast('画像を読み込めませんでした'); }
  });
  if ($('#cNoPhoto', body)) $('#cNoPhoto', body).onclick = () => { C.photo = ''; C.keepPhotoKey = null; stepLook(body); };
  $('#cBack', body).onclick = prevStep;
  $('#cNext', body).onclick = () => {
    C.name = $('#cName', body).value.trim();
    if (!C.name) { toast('名前を入れてください'); $('#cName', body).focus(); return; }
    nextStep();
  };
}
function cropPhoto(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const W2 = 480, H2 = 456, r = Math.max(W2 / img.width, H2 / img.height);
      const w = img.width * r, h = img.height * r;
      const cv = document.createElement('canvas'); cv.width = W2; cv.height = H2;
      const g = cv.getContext('2d');
      g.drawImage(img, (W2 - w) / 2, Math.min(0, (H2 - h) * 0.3), w, h);
      URL.revokeObjectURL(url);
      resolve(cv.toDataURL('image/jpeg', 0.86));
    };
    img.onerror = reject;
    img.src = url;
  });
}

/* ---- step 3: voice capture & analysis ---- */
let decodeCtx = null;
function getDecodeCtx() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!decodeCtx) decodeCtx = new AC();
  if (decodeCtx.state !== 'running') decodeCtx.resume().catch(() => {});
  return decodeCtx;
}
function stepVoice(body) {
  const friend = C.type === 'friend';
  const needBase = friend && !S.baseline;
  body.innerHTML = `
    ${friend ? `<button class="check ${C.consent ? 'on' : ''}" id="cConsent"><span class="box">${ICON.check}</span><span><b>${esc(C.name)}さん本人から、声を録音してVOXMで使う同意をもらいました。</b><br><span class="small muted">本人のふりをして他人をだます目的には使いません。</span></span></button>` : ''}
    ${friend ? `<div class="h2">① あなたの基準の声 <small>${S.baseline ? '登録済み ' + Math.round(S.baseline.f0) + 'Hz' : '未登録'}</small></div>
      <div class="panel" id="baseBox"></div>` : ''}
    <div class="h2">${friend ? '② ' + esc(C.name) + 'さんの声' : 'あなたの声'} <small>10〜30秒</small></div>
    <div class="panel" id="sampleBox"></div>
    <div id="anaBox"></div>
    <div class="footer-actions"><button class="btn ghost" id="cBack">${ICON.back} 戻る</button><button class="btn" id="cNext" ${C.analysis || (C.editId && !friend) ? '' : 'disabled'}>次へ</button></div>`;
  if (friend) $('#cConsent', body).onclick = () => { C.consent = !C.consent; stepVoice(body); };
  const locked = friend && !C.consent;
  if (friend) recorderBlock($('#baseBox', body), {
    script: 'あいうえお。今日はいい天気ですね。わたしの声を登録します。', min: 4, max: 15, locked,
    done: !!S.baseline && !needBase, doneLabel: '登録済み（録り直す場合は録音）',
    onClip: async (blob) => {
      const a = await analyzeBlob(blob); if (!a) return;
      const key = uid('base'); await VoxStore.put('blobs', key, blob);
      if (S.baseline && S.baseline.blobKey) VoxStore.del('blobs', S.baseline.blobKey);
      S.baseline = { f0: a.f0, env: a.env, envSr: a.envSr, at: Date.now(), blobKey: key }; saveSettings();
      if (C.analysis && C.sampleAnalysisRaw) computeFriendProfile();
      toast('基準の声を登録しました'); stepVoice(body);
    },
  });
  recorderBlock($('#sampleBox', body), {
    script: SAMPLE_SCRIPT, min: 6, max: 40, locked: locked || needBase, lockedMsg: locked ? '先に同意を確認してください' : needBase ? '先に①を録音してください' : '',
    done: !!C.sampleBlob, doneLabel: '録音済み',
    onClip: async (blob) => {
      const a = await analyzeBlob(blob); if (!a) return;
      C.sampleBlob = blob; C.sampleAnalysisRaw = a;
      if (friend) computeFriendProfile();
      else {
        C.analysis = { f0: a.f0, confidence: 1, voicedRatio: a.voicedRatio, seconds: a.seconds };
        C.profile = Object.assign({}, C.profile, { pitch: 0, formant: 0 });
        if (!S.baseline) { const key = uid('base'); await VoxStore.put('blobs', key, blob); S.baseline = { f0: a.f0, env: a.env, envSr: a.envSr, at: Date.now(), blobKey: key }; saveSettings(); }
      }
      stepVoice(body);
    },
  });
  if (C.analysis) renderAnalysis($('#anaBox', body));
  $('#cBack', body).onclick = prevStep;
  $('#cNext', body).onclick = nextStep;
}
function computeFriendProfile() {
  const a = C.sampleAnalysisRaw;
  const prof = VoxAnalysis.profileFrom(a, S.baseline);
  C.analysis = { f0: a.f0, baseF0: S.baseline.f0, confidence: prof.confidence, voicedRatio: a.voicedRatio, seconds: a.seconds };
  C.profile = Object.assign({}, C.profile, { pitch: prof.pitch, formant: prof.formant });
}
async function analyzeBlob(blob) {
  try {
    toast('声を解析中…', 1200);
    const { samples, sampleRate } = await VoxAnalysis.decodeBlob(blob, getDecodeCtx());
    const a = VoxAnalysis.analyze(samples, sampleRate);
    if (!a.ok) { toast('声をうまく検出できませんでした。静かな場所で、はっきり読み上げてください', 3500); return null; }
    return a;
  } catch (e) { console.warn(e); toast('音声を読み込めませんでした'); return null; }
}
function renderAnalysis(box) {
  const a = C.analysis, friend = C.type === 'friend';
  let q = 'ok', ql = '良好';
  if (a.seconds < 8 || a.voicedRatio < 0.3 || (friend && a.confidence < 0.6)) { q = 'plan'; ql = 'ふつう（長めに録り直すと精度UP）'; }
  if (a.seconds < 4 || a.voicedRatio < 0.15) { q = 'no'; ql = '短すぎ・声が少ない'; }
  box.innerHTML = `<div class="panel" style="margin-top:14px">
    <div class="kv">
      ${friend ? `<span>${esc(C.name)}さんの平均の高さ</span><b>${Math.round(a.f0)} Hz（${noteName(a.f0)}）</b><span>あなたの平均の高さ</span><b>${Math.round(a.baseF0)} Hz（${noteName(a.baseF0)}）</b>
      <span>→ ピッチ補正</span><b>${signed(C.profile.pitch, 1)} 半音</b><span>→ 声色（フォルマント）補正</span><b>${signed(C.profile.formant, 1)} 半音</b><span>声色の一致度</span><b>${Math.round(a.confidence * 100)}%</b>`
      : `<span>平均の高さ</span><b>${Math.round(a.f0)} Hz（${noteName(a.f0)}）</b><span>録音の長さ</span><b>${a.seconds.toFixed(1)} 秒</b>`}
    </div>
    <div class="quality"><span class="status ${q}">${ql}</span></div>
    ${friend ? '<div class="small muted" style="margin-top:10px;line-height:1.6">※ 声の高さと声色の傾向を近づける簡易プロファイルです。本人そっくりのAI声質変換ではありません。</div>' : ''}
  </div>`;
}

/* recorder widget (mic or audio file) */
function recorderBlock(box, o) {
  const rec = { state: 'idle', t0: 0, timer: 0 };
  const paint = () => {
    const on = rec.state === 'rec';
    box.innerHTML = `<div class="rec-box">
      ${o.script ? `<div class="script">${esc(o.script)}</div>` : ''}
      ${o.locked ? `<div class="small muted" style="padding:10px">${esc(o.lockedMsg || '')}</div>` : `
      <button class="rec-big ${on ? 'on stop' : ''}" data-r aria-label="${on ? '録音を止める' : '録音する'}">${on ? '<i></i>' : ICON.mic}</button>
      <div class="small ${on ? '' : 'muted'}" data-rt>${on ? '録音中 0:00 / 最大' + fmtSec(o.max) : o.done ? '✓ ' + o.doneLabel : 'タップして読み上げ（' + o.min + '秒以上）'}</div>
      <div class="meter"><i data-rl></i></div>
      ${on ? '' : `<label class="btn ghost sm" style="margin-top:6px">${ICON.upload} 音声ファイルから<input type="file" accept="audio/*,video/*" data-f hidden></label>`}`}
    </div>`;
    const r = box.querySelector('[data-r]');
    if (r) r.onclick = () => (rec.state === 'rec' ? stop() : start());
    const f = box.querySelector('[data-f]');
    if (f) f.onchange = (e) => { const file = e.target.files && e.target.files[0]; if (file) o.onClip(file); };
  };
  let stream = null, mr = null, chunks = [], an = null, raf = 0, actx = null;
  async function start() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } });
    } catch (e) {
      toast(inFrame ? 'この画面ではマイクが使えません。「音声ファイルから」を使ってください' : 'マイクを使えません（設定で許可してください）', 3500); return;
    }
    if (!window.MediaRecorder) { toast('このブラウザは録音に未対応です'); stream.getTracks().forEach((t) => t.stop()); return; }
    chunks = [];
    const mime = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((m) => { try { return MediaRecorder.isTypeSupported(m); } catch (e) { return false; } });
    mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    mr.onstop = () => {
      stream.getTracks().forEach((t) => t.stop()); cancelAnimationFrame(raf); clearInterval(rec.timer);
      try { actx && actx.close(); } catch (e) {}
      const secs = (Date.now() - rec.t0) / 1000;
      rec.state = 'idle'; paint();
      if (secs < o.min) { toast(`短すぎます。${o.min}秒以上読み上げてください`); return; }
      o.onClip(new Blob(chunks, { type: mr.mimeType || 'audio/webm' }));
    };
    mr.start(200);
    rec.state = 'rec'; rec.t0 = Date.now(); paint();
    try {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      const src = actx.createMediaStreamSource(stream); an = actx.createAnalyser(); an.fftSize = 1024; src.connect(an);
      const loop = () => { const lv = readLevel(an); const el = box.querySelector('[data-rl]'); if (el) el.style.width = Math.min(100, lv * 160) + '%'; raf = requestAnimationFrame(loop); };
      loop();
    } catch (e) {}
    rec.timer = setInterval(() => {
      const s = (Date.now() - rec.t0) / 1000;
      const el = box.querySelector('[data-rt]'); if (el) el.textContent = `録音中 ${fmtSec(s)} / 最大${fmtSec(o.max)}`;
      if (s >= o.max) stop();
    }, 250);
  }
  function stop() { if (mr && mr.state === 'recording') mr.stop(); }
  paint();
}

/* ---- step 4: tune + save ---- */
function stepTune(body) {
  const p = Object.assign({ pitch: 0, formant: 0, robotHz: 0, ring: 0, echo: 0, reverb: 0, chorus: 0, drive: 0, lowcut: 70, highcut: 16000 }, C.profile);
  C.profile = p;
  const st = (v) => signed(v, 1);
  const pct = (v) => Math.round(v * 100) + '%';
  body.innerHTML = `
    <div class="row" style="gap:14px;align-items:flex-start;margin-bottom:6px"><div id="cPrev" style="font-size:9px;flex:none">${chipHTML(draftChip())}</div>
      <div class="grow"><div class="small muted" style="line-height:1.6;margin-bottom:10px">${C.type === 'friend' && C.analysis ? '録音から自動で設定済み。好みで微調整できます。' : '声のキャラを作り込みましょう。'}</div>
      <button class="btn sm block" id="cLive" style="margin-bottom:8px">${ICON.mic} ${VoxEngine.status.state === 'live' && C.previewing ? 'マイクで試聴中' : 'マイクで試す'}</button>
      ${S.baseline && S.baseline.blobKey ? `<button class="btn ghost sm block" id="cBase">${ICON.play} 自分の録音で試聴</button>` : ''}</div></div>
    <div class="panel" style="margin-top:10px">
      ${sliderHTML('pitch', 'ピッチ（声の高さ）', -12, 12, 0.1, p.pitch, (v) => st(v) + ' 半音')}
      ${sliderHTML('formant', '声色（フォルマント）', -5, 6, 0.1, p.formant, (v) => st(v) + ' 半音')}
      <div class="list-item" style="padding:4px 0 12px;border:0"><div class="grow"><b style="font-size:13px">ロボット抑揚</b><div class="small muted">声の高さを一定にして機械っぽく</div></div><button class="switch ${p.robotHz ? 'on' : ''}" id="swRobo"></button></div>
      ${sliderHTML('ring', '電子のゆらぎ', 0, 1, 0.01, p.ring, pct)}
      ${sliderHTML('chorus', 'ダブラー（二重の声）', 0, 1, 0.01, p.chorus, pct)}
      ${sliderHTML('echo', 'エコー', 0, 1, 0.01, p.echo, pct)}
      ${sliderHTML('reverb', 'リバーブ（響き）', 0, 1, 0.01, p.reverb, pct)}
      ${sliderHTML('drive', 'ドライブ（ガサつき）', 0, 1, 0.01, p.drive, pct)}
      <div class="list-item" style="padding:4px 0 0;border:0"><div class="grow"><b style="font-size:13px">ラジオ・電話の質感</b></div><button class="switch ${p.lowcut >= 300 ? 'on' : ''}" id="swRadio"></button></div>
    </div>
    <div class="h2">入れるケース</div>
    <div class="chips-row">${S.cases.map((k) => `<button class="pill ${C.caseIds.includes(k.id) ? 'on' : ''}" data-kc="${k.id}"><i class="swatch" style="--c:${k.color};width:10px;height:10px;border-radius:3px;border:0"></i>${esc(k.name)}</button>`).join('')}</div>
    <div class="footer-actions"><button class="btn ghost" id="cBack">${ICON.back} 戻る</button><button class="btn" id="cSave">${ICON.check} ${C.editId ? '保存' : 'メモリを作成'}</button></div>`;
  const live = () => { if (C.previewing && VoxEngine.status.state === 'live') VoxEngine.setParams(Object.assign({}, VoxEngine.DEFAULT, C.profile)); };
  const refresh = () => { $('#cPrev', body).innerHTML = chipHTML(draftChip()); live(); };
  for (const k of ['pitch', 'formant']) bindSlider(body, k, (v) => st(v) + ' 半音', (v) => { C.profile[k] = v; refresh(); });
  for (const k of ['ring', 'chorus', 'echo', 'reverb', 'drive']) bindSlider(body, k, pct, (v) => { C.profile[k] = v; if (k === 'ring' && !C.profile.ringHz) C.profile.ringHz = 40; refresh(); });
  $('#swRobo', body).onclick = (e) => { C.profile.robotHz = C.profile.robotHz ? 0 : 115; e.currentTarget.classList.toggle('on', !!C.profile.robotHz); refresh(); };
  $('#swRadio', body).onclick = (e) => {
    const on = C.profile.lowcut < 300;
    Object.assign(C.profile, on ? { lowcut: 520, highcut: 3000, presence: 5 } : { lowcut: 70, highcut: 16000, presence: 0 });
    e.currentTarget.classList.toggle('on', on); refresh();
  };
  $$('[data-kc]', body).forEach((b) => b.addEventListener('click', () => { const id = b.dataset.kc; C.caseIds.includes(id) ? (C.caseIds = C.caseIds.filter((x) => x !== id)) : C.caseIds.push(id); b.classList.toggle('on'); }));
  $('#cLive', body).onclick = async () => {
    if (C.previewing && VoxEngine.status.state === 'live') { endPreview(); stepTune(body); return; }
    C.previewing = true;
    VoxEngine.setParams(Object.assign({}, VoxEngine.DEFAULT, C.profile));
    if (VoxEngine.status.state !== 'live') { VoxEngine.status.monitor = true; VoxEngine.status.volume = S.volume; await VoxEngine.start({ safeMode: S.safeMode, noiseSuppression: S.noiseSup }); }
    else VoxEngine.setMonitor(true);
    if (VoxEngine.status.state !== 'live') { C.previewing = false; showMicHelp(); return; }
    toast('話してみてください（イヤホン推奨）'); stepTune(body);
  };
  if ($('#cBase', body)) $('#cBase', body).onclick = async () => {
    const blob = await VoxStore.get('blobs', S.baseline.blobKey);
    if (!blob) { toast('基準の録音が見つかりません'); return; }
    try {
      const { samples, sampleRate } = await VoxAnalysis.decodeBlob(blob, getDecodeCtx());
      const out = await VoxEngine.renderOffline(samples, sampleRate, C.profile);
      playBuffer(out);
    } catch (e) { console.warn(e); toast('試聴を作れませんでした'); }
  };
  $('#cBack', body).onclick = () => { endPreview(); prevStep(); };
  $('#cSave', body).onclick = saveDraft;
}
function endPreview() {
  if (C && C.previewing) { C.previewing = false; applyParams(); VoxEngine.setMonitor(S.monitor); }
}
let pbSrc = null;
function playBuffer(buf) {
  const ctx = getDecodeCtx();
  try { pbSrc && pbSrc.stop(); } catch (e) {}
  pbSrc = ctx.createBufferSource(); pbSrc.buffer = buf; pbSrc.connect(ctx.destination); pbSrc.start();
}
async function saveDraft() {
  endPreview();
  const isNew = !C.editId;
  const chip = isNew ? { id: uid('c'), createdAt: Date.now(), favorite: false } : chipById(C.editId);
  if (!chip) return;
  Object.assign(chip, {
    name: C.name || 'NEW MEMORY', kind: C.type, color: C.color, tag: KIND_TAG[C.type],
    photo: C.keepPhotoKey || C.photo || '', art: C.photo || C.keepPhotoKey ? null : (C.type === 'character' ? C.art || 'wave' : null),
    profile: JSON.parse(JSON.stringify(C.profile)), analysis: C.analysis || chip.analysis || null,
  });
  if (C.type === 'friend' && C.consent && !chip.consent) chip.consent = { at: Date.now() };
  if (chip.builtin && !isNew) { chip.demo = chip.demo && !C.sampleBlob; }
  if (C.sampleBlob) { const key = chip.sampleKey || uid('s'); await VoxStore.put('blobs', key, C.sampleBlob); chip.sampleKey = key; }
  if (isNew) S.chips.push(chip);
  if (chip.builtin) { chip.builtin = false; } // customised built-ins are stored like user chips
  saveChip(chip);
  for (const k of S.cases) {
    const has = k.chipIds.includes(chip.id), want = C.caseIds.includes(k.id);
    if (has !== want) { k.chipIds = want ? [...k.chipIds, chip.id] : k.chipIds.filter((x) => x !== chip.id); saveCase(k); }
  }
  C = null;
  S.selectedId = chip.id;
  if (S.homeCase !== 'all' && !caseById(S.homeCase).chipIds.includes(chip.id)) S.homeCase = 'all';
  saveSettings();
  if (isSeated(chip.id)) { applyParams(); syncSlotChips(); }
  go('home');
  toast(isNew ? `「${chip.name}」を作成しました。下にドラッグして装着！` : '保存しました', 3000);
}
