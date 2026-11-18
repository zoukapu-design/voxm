/* VOXM local storage — IndexedDB with an in-memory fallback (e.g. private mode / sandboxed frames). */
const VoxStore = (() => {
  const DB = 'voxm-db', VER = 1, STORES = ['chips', 'cases', 'blobs', 'recordings', 'kv'];
  let db = null;
  const mem = Object.fromEntries(STORES.map((s) => [s, new Map()]));
  let persistent = false;

  function open() {
    return new Promise((resolve) => {
      try {
        if (!window.indexedDB) return resolve(null);
        const req = indexedDB.open(DB, VER);
        req.onupgradeneeded = () => {
          const d = req.result;
          for (const s of STORES) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
        setTimeout(() => resolve(null), 2500);
      } catch (e) { resolve(null); }
    });
  }
  async function init() {
    db = await open();
    persistent = !!db;
    return persistent;
  }
  function tx(store, mode, fn) {
    return new Promise((resolve, reject) => {
      try {
        const t = db.transaction(store, mode);
        const s = t.objectStore(store);
        const r = fn(s);
        t.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      } catch (e) { reject(e); }
    });
  }
  async function get(store, key) {
    if (!db) return mem[store].get(key);
    try { return await tx(store, 'readonly', (s) => s.get(key)); } catch (e) { return mem[store].get(key); }
  }
  async function put(store, key, value) {
    mem[store].set(key, value);
    if (!db) return;
    try { await tx(store, 'readwrite', (s) => s.put(value, key)); } catch (e) { console.warn('store put failed', e); }
  }
  async function del(store, key) {
    mem[store].delete(key);
    if (!db) return;
    try { await tx(store, 'readwrite', (s) => s.delete(key)); } catch (e) {}
  }
  async function all(store) {
    if (!db) return [...mem[store].values()];
    try { return await tx(store, 'readonly', (s) => s.getAll()); } catch (e) { return [...mem[store].values()]; }
  }
  async function clear() {
    for (const s of STORES) { mem[s].clear(); if (db) { try { await tx(s, 'readwrite', (st) => st.clear()); } catch (e) {} } }
  }
  return { init, get, put, del, all, clear, isPersistent: () => persistent };
})();
