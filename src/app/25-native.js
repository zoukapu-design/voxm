/* ---------- native bridge (iOS app via Capacitor) ----------
   In the iOS app a small native plugin (VoxAudio, added in ci/prepare-ios.sh) reports whether earphones are
   connected and keeps the sound on the loudspeaker instead of the earpiece. In the browser these calls return
   null and the app falls back to the user's own earphone/speaker choice. */
const VoxNative = {
  isNative() { try { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); } catch (e) { return false; } },
  // native calls never block the app: give up after 1.5 s (e.g. plugin missing in an older build)
  async call(method, args = {}, timeout = 1500) {
    if (!this.isNative()) return null;
    const C = window.Capacitor;
    const run = async () => {
      const P = C.Plugins && C.Plugins.VoxAudio;
      if (P && typeof P[method] === 'function') return P[method](args);
      if (typeof C.nativePromise === 'function') return C.nativePromise('VoxAudio', method, args);
      return null;
    };
    try { return await Promise.race([run(), new Promise((r) => setTimeout(() => r(null), timeout))]); }
    catch (e) { console.warn('VoxAudio.' + method, e); return null; }
  },
};
const ROUTE = { headphones: null, timer: 0 };

/* Echo cancellation decides two things:
   - speaker: ON, otherwise the speaker feeds back into the mic (howling). Side effect: the phone's echo canceller
     treats the converted voice as "echo" and slowly turns your own voice down.
   - earphones: OFF — no fading, lower latency, better sound. */
async function audioOpts() {
  VoxEngine.prime(); // still inside the tap
  let safe = S.safeMode;
  const r = await VoxNative.call('prepare', { skip: S.nativeAudio === false });
  VLOG.add('IOS', 'prepare', S.nativeAudio === false ? '(skip)' : '', r);
  if (r && typeof r.headphones === 'boolean') { ROUTE.headphones = r.headphones; safe = !r.headphones; }
  else if (!S.routeAsked && !navigator.webdriver) safe = await askRoute(); // (skipped in automated tests)
  return { safeMode: safe, noiseSuppression: S.noiseSup };
}
function askRoute() {
  return new Promise((resolve) => {
    let done = false;
    const pick = (ear) => { done = true; S.routeAsked = true; S.safeMode = !ear; saveSettings(); resolve(!ear); };
    openSheet('イヤホンを使っていますか？', `
      <p class="lead">イヤホンだと、声が小さくならず遅延も少なくなります。</p>
      <div class="footer-actions" style="flex-direction:column;gap:10px">
        <button class="btn" data-ear style="width:100%">${ICON.headphones || ''} イヤホンで聴く</button>
        <button class="btn ghost" data-spk style="width:100%">スピーカーで聴く</button>
      </div>
      <p class="small muted" style="margin-top:12px;line-height:1.6">スピーカーの場合は、ハウリング防止のためにエコー除去をONにします。iPhoneの仕組み上、話し続けると声が少しずつ小さく聞こえることがあります。あとから設定で変えられます。</p>`, (b, close) => {
      b.querySelector('[data-ear]').onclick = () => { pick(true); close(); };
      b.querySelector('[data-spk]').onclick = () => { pick(false); close(); };
    }, { onClose: () => { if (!done) resolve(S.safeMode); } });
  });
}
// iOS app: follow earphones being plugged in / out while converting
function watchRoute(on) {
  clearInterval(ROUTE.timer);
  if (!on || !VoxNative.isNative()) return;
  ROUTE.timer = setInterval(async () => {
    if (VoxEngine.status.state !== 'live') return;
    const r = await VoxNative.call('route');
    if (!r || typeof r.headphones !== 'boolean' || r.headphones === ROUTE.headphones) return;
    ROUTE.headphones = r.headphones;
    await VoxEngine.reconfigure({ safeMode: !r.headphones });
    toast(r.headphones ? 'イヤホンを検出：高音質・低遅延モード' : 'スピーカーに切り替え：ハウリング防止ON');
  }, 2000);
}
