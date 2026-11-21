/* ===== boot ===== */
async function boot() {
  buildShell();
  try { await loadAll(); } catch (e) { console.warn('load failed', e); S.chips = BUILTIN_CHIPS.map((c) => Object.assign({ builtin: true }, c)); S.cases = BUILTIN_CASES.map((c) => ({ ...c })); }
  document.documentElement.classList.toggle('reduce-motion', !!S.reduceMotion);
  const start = location.hash.slice(1);
  go(TABS.some((t) => t.id === start) ? start : 'home');
  if (start && start !== 'home') RENDER.home(); // keep the stage ready
  updateLivePill();
  requestAnimationFrame(meterLoop);
  window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (h && h !== S.tab && RENDER[h]) go(h); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && VoxEngine.status.ctx && VoxEngine.status.state === 'live') VoxEngine.status.ctx.resume().catch(() => {}); });
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !inFrame && window.VOXM_PWA) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  // block pinch / double-tap zoom (iOS ignores user-scalable in some cases)
  document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
  window.VOXM_DEBUG = { logText, VLOG, decodeViaElement, SPK, S, W, VoxEngine, go, insertCurrent, ejectChip, combinedParams, applyParams, CALL, startCall };
  dbgStart(); if (S.debugHud) setHud(true);
  if (VoxNative.isNative()) {
    VLOG.add('IOS', 'bridge', VoxNative.describe());
    const t0 = Date.now(); VoxNative.call('route', {}, 5000).then((r) => VLOG.add('IOS', 'ping route', (Date.now() - t0) + 'ms via ' + VoxNative.via, r));
  }
  spkStart(); setTimeout(() => ensureVoices(), 2500);
  callInit(); // VOXM calls (no-op until Firebase is configured)
}
boot();
