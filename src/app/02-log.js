/* ---------- debug log (always on, ring buffer) ----------
   Collects console output, errors, engine snapshots and native audio-session events so a user can
   export one text file when something goes wrong on their device. Loaded first so it sees everything. */
const VLOG = (() => {
  const buf = [], MAX = 4000, t0 = Date.now();
  const fmt = (a) => {
    if (a instanceof Error) return `${a.name}: ${a.message}${a.stack ? ' @ ' + String(a.stack).split('\n').slice(0, 3).join(' | ') : ''}`;
    if (a && typeof a === 'object') { try { return JSON.stringify(a); } catch (e) { return String(a); } }
    return String(a);
  };
  function add(tag, ...args) {
    const t = ((Date.now() - t0) / 1000).toFixed(2).padStart(8);
    buf.push(`${t} ${tag.padEnd(5)} ${args.map(fmt).join(' ')}`);
    if (buf.length > MAX) buf.splice(0, buf.length - MAX);
  }
  for (const k of ['log', 'info', 'warn', 'error']) {
    const orig = console[k] && console[k].bind(console);
    console[k] = (...a) => { try { add(k === 'log' ? 'LOG' : k.toUpperCase(), ...a); } catch (e) {} orig && orig(...a); };
  }
  window.addEventListener('error', (e) => add('ERR', e.message, (e.filename || '').split('/').pop() + ':' + e.lineno + ':' + e.colno, e.error || ''));
  window.addEventListener('unhandledrejection', (e) => add('REJ', e.reason || ''));
  document.addEventListener('visibilitychange', () => add('APP', 'visibility', document.visibilityState));
  window.addEventListener('pagehide', () => add('APP', 'pagehide'));
  add('APP', 'boot', new Date().toISOString(), navigator.userAgent);
  return { add, lines: () => buf.slice(), t0 };
})();
