/* ---------- extract a friend's voice from a video / audio file ----------
   1. decode the soundtrack (decodeAudioData; for big or unsupported videos, play it silently through a
      media element at 2x with pitch preservation off and treat the capture as half the sample rate)
   2. find the voices in it (VoxAnalysis.segmentSpeakers) and let the user pick "this person" by listening
   3. return a WAV of only that person's speech + its analysis */
const EX_MAX_SEC = 180;

async function decodeViaElement(file, onProg) {
  const url = URL.createObjectURL(file);
  const isVid = /^video\//.test(file.type) || /\.(mov|mp4|m4v)$/i.test(file.name || '');
  const el = document.createElement(isVid ? 'video' : 'audio');
  el.src = url; el.playsInline = true; el.setAttribute('playsinline', ''); el.preload = 'auto';
  try { el.preservesPitch = false; el.webkitPreservesPitch = false; el.mozPreservesPitch = false; } catch (e) {}
  await new Promise((res, rej) => { el.onloadedmetadata = res; el.onerror = () => rej(new Error('この形式は読み込めません')); setTimeout(() => rej(new Error('読み込みがタイムアウトしました')), 15000); });
  const dur = Math.min(isFinite(el.duration) ? el.duration : EX_MAX_SEC, EX_MAX_SEC);
  const ctx = getDecodeCtx();
  const src = ctx.createMediaElementSource(el);
  const sp = ctx.createScriptProcessor(4096, 1, 1);
  const mute = ctx.createGain(); mute.gain.value = 0;
  const chunks = []; let n = 0;
  sp.onaudioprocess = (e) => { const d = e.inputBuffer.getChannelData(0); chunks.push(new Float32Array(d)); n += d.length; };
  src.connect(sp); sp.connect(mute); mute.connect(ctx.destination);
  const rate = 2;
  el.playbackRate = rate;
  await ctx.resume().catch(() => {});
  await el.play();
  await new Promise((res) => {
    const t = setInterval(() => { onProg && onProg(Math.min(1, el.currentTime / dur)); if (el.ended || el.currentTime >= dur) { clearInterval(t); res(); } }, 200);
    el.onended = () => { clearInterval(t); res(); };
  });
  el.pause(); try { src.disconnect(); sp.disconnect(); } catch (e) {}
  URL.revokeObjectURL(url);
  const out = new Float32Array(n); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; }
  const sr = ctx.sampleRate / (el.playbackRate || rate); // pitch-shifted 2x capture == original at half the rate
  return { samples: out, sampleRate: sr };
}

// iOS app: pick a video from Photos natively; the soundtrack comes back as 16 kHz mono PCM
async function nativeVideoAudio() {
  const r = await VoxNative.call('pickVideo', {}, 15 * 60 * 1000);
  if (!r) throw new Error('このビルドは未対応です（最新のTestFlightに更新してください）');
  if (r.cancelled) return null;
  if (!r.ok) throw new Error(r.error || '動画を読み込めませんでした');
  const bin = atob(r.pcm16), n = bin.length >> 1, out = new Float32Array(n);
  for (let i = 0; i < n; i++) { let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8); if (v >= 32768) v -= 65536; out[i] = v / 32768; }
  VLOG.add('APP', 'native video audio', r.seconds + 's of', r.total + 's');
  return { samples: out, sampleRate: r.sampleRate || 16000 };
}

async function decodeAny(file, onProg) {
  if (file === 'native') return nativeVideoAudio();
  const big = file.size > 60 * 1024 * 1024;
  if (!big) {
    try {
      const r = await VoxAnalysis.decodeBlob(file, getDecodeCtx());
      const lim = Math.floor(r.sampleRate * EX_MAX_SEC);
      return { samples: r.samples.length > lim ? r.samples.subarray(0, lim) : r.samples, sampleRate: r.sampleRate };
    } catch (e) { VLOG.add('WARN', 'decodeAudioData failed, trying media element', e); }
  }
  return decodeViaElement(file, onProg);
}

function openExtractor(file, who) {
  return new Promise((resolve) => {
    let result = null, audio = null, playing = null;
    const stopPreview = () => { try { if (playing) { playing.pause(); playing = null; } } catch (e) {} };
    openSheet('声を取り出す', `<div id="exBody"><div class="small muted" id="exMsg">読み込み中…</div><div class="meter" style="margin-top:10px"><i id="exBar" style="width:2%"></i></div></div>`, async (b, close) => {
      const msg = (t) => { const e = $('#exMsg', b); if (e) e.textContent = t; };
      const bar = (v) => { const e = $('#exBar', b); if (e) e.style.width = Math.round(v * 100) + '%'; };
      let dec;
      if (file === 'native') msg('動画を選んでください…（選んだあと音声を取り出します）');
      try { dec = await decodeAny(file, (v) => { msg('音声を取り出し中… ' + Math.round(v * 100) + '%'); bar(v * 0.5); }); }
      catch (e) {
        VLOG.add('WARN', 'extract decode', e);
        msg('このファイルは読み込めませんでした（' + ((e && e.message) || e) + '）。' + (VoxNative.isNative() && file !== 'native' ? '「動画から」ボタンで写真アプリから選ぶと読み込めます。' : '画面収録やボイスメモで音声にしてから試してください。'));
        return;
      }
      if (!dec) { close(); return; }
      VLOG.add('APP', 'extract decoded', file === 'native' ? 'native' : file.type + ' ' + file.size, dec.samples.length / dec.sampleRate + 's', dec.sampleRate);
      msg('声を探しています…');
      const seg = await VoxAnalysis.segmentSpeakers(dec.samples, dec.sampleRate, (v) => bar(0.5 + v * 0.5));
      if (!seg.candidates.length) { msg('はっきりした話し声が見つかりませんでした。BGMが小さく、声がよく聞こえる部分のファイルで試してください。'); return; }
      audio = dec;
      const dur = seg.duration;
      const box = $('#exBody', b);
      box.innerHTML = `<p class="lead" style="margin-top:0">${seg.candidates.length > 1 ? `${seg.candidates.length}人分の声が見つかりました。▶で聴いて、${esc(who)}の声を選んでください。` : '声が見つかりました。▶で確認して選んでください。'}</p>
        <div class="small muted" style="margin:-6px 0 6px">動画 ${Math.round(dur)}秒のうち、話し声 ${Math.round(seg.speech || 0)}秒を検出</div>
        ${seg.candidates.map((c, i) => `<div class="ex-cand" data-i="${i}">
          <button class="icon-btn ex-play" data-play="${i}" aria-label="再生">${ICON.play}</button>
          <div class="grow"><b>声 ${String.fromCharCode(65 + i)}</b> <span class="small muted">${c.seconds}秒 · 平均 ${Math.round(c.f0)}Hz（${noteName(c.f0)}）</span>
            <div class="ex-tl">${c.segments.map(([a, z]) => `<i style="left:${(a / dur) * 100}%;width:${Math.max(0.6, ((z - a) / dur) * 100)}%"></i>`).join('')}</div></div>
          <button class="btn sm" data-pick="${i}">この声</button></div>`).join('')}
        <div class="small muted" style="margin-top:10px;line-height:1.6">本人の同意を得た声だけを使ってください。取り出した声は端末内にだけ保存されます。</div>`;
      // preview through an <audio> element (plays reliably on iOS, even while converting)
      $$('[data-play]', box).forEach((btn) => btn.onclick = () => {
        const c = seg.candidates[+btn.dataset.play];
        stopPreview();
        const clip = VoxAnalysis.sliceSegments(dec.samples, dec.sampleRate, c.segments, 10);
        let pk = 0; for (let k = 0; k < clip.length; k++) pk = Math.max(pk, Math.abs(clip[k]));
        if (pk > 0 && pk < 0.5) { const g = 0.7 / pk; for (let k = 0; k < clip.length; k++) clip[k] *= g; }
        const url = URL.createObjectURL(VoxAnalysis.wavBlob(clip, Math.round(dec.sampleRate)));
        playing = new Audio(url); playing.playsInline = true;
        playing.onended = () => { URL.revokeObjectURL(url); btn.innerHTML = ICON.play; };
        playing.play().then(() => { btn.innerHTML = '■'; }).catch((e) => { VLOG.add('WARN', 'preview play', e); toast('再生できませんでした'); });
      });
      $$('[data-pick]', box).forEach((btn) => btn.onclick = () => {
        const c = seg.candidates[+btn.dataset.pick];
        stopPreview();
        const voice = VoxAnalysis.sliceSegments(dec.samples, dec.sampleRate, c.segments, 60);
        const a = VoxAnalysis.analyze(voice, dec.sampleRate);
        if (!a.ok) { toast('この声はうまく解析できませんでした。別の候補か、長めのファイルで試してください', 3500); return; }
        // store at 16 kHz-ish to keep the sample small
        const ds = Math.max(1, Math.floor(dec.sampleRate / 16000));
        const small = new Float32Array(Math.floor(voice.length / ds)); for (let k = 0; k < small.length; k++) small[k] = voice[k * ds];
        result = { blob: VoxAnalysis.wavBlob(small, Math.round(dec.sampleRate / ds)), analysis: a };
        VLOG.add('APP', 'extract picked', String.fromCharCode(65 + +btn.dataset.pick), c.seconds + 's', Math.round(a.f0) + 'Hz');
        close();
      });
    }, { onClose: () => { stopPreview(); audio = null; resolve(result); } });
  });
}
