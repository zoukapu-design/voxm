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
  window.VOXM_DEBUG = { S, W, VoxEngine, go, insertCurrent, ejectChip, combinedParams, applyParams, CALL, startCall };
  callInit(); // VOXM calls (no-op until Firebase is configured)
}
boot();
