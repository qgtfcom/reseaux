// Cache local (IndexedDB) : documents, file d'attente de synchronisation, liens vers les dossiers de CET ordinateur.
const DB_NAME = 'pilote-reseaux';
const DB_VER = 1;
let _db = null;

function open() {
  if (_db) return Promise.resolve(_db);
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('docs')) { const s = d.createObjectStore('docs', { keyPath: 'k' }); s.createIndex('c', 'c'); }
      if (!d.objectStoreNames.contains('outbox')) d.createObjectStore('outbox', { keyPath: 'k' });
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'k' });
      if (!d.objectStoreNames.contains('handles')) d.createObjectStore('handles', { keyPath: 'k' });
    };
    r.onsuccess = () => { _db = r.result; res(_db); };
    r.onerror = () => rej(r.error);
  });
}
function tx(store, mode, fn) {
  return open().then(d => new Promise((res, rej) => {
    const t = d.transaction(store, mode); const s = t.objectStore(store);
    let out; try { out = fn(s); } catch (e) { rej(e); return; }
    t.oncomplete = () => res(out && out.result !== undefined ? out.result : out);
    t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  }));
}
const reqP = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export const uid = (p = 'id') => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const nowIso = () => new Date().toISOString();

/* ---- documents ---- */
export async function getDoc(c, id) { const d = await open(); return reqP(d.transaction('docs').objectStore('docs').get(c + '/' + id)).then(x => (x && !x.del) ? x : null); }
export async function listDocs(c) {
  const d = await open();
  const all = await reqP(d.transaction('docs').objectStore('docs').index('c').getAll(c));
  return all.filter(x => !x.del);
}
export async function putLocal(rec) { const d = await open(); return reqP(d.transaction('docs', 'readwrite').objectStore('docs').put(rec)); }
export async function deleteLocal(c, id) { const d = await open(); return reqP(d.transaction('docs', 'readwrite').objectStore('docs').delete(c + '/' + id)); }

/** Enregistre un document ET le met dans la file d'envoi (fonctionne hors connexion). */
export async function saveDoc(c, id, data) {
  const maj = nowIso();
  const rec = { k: c + '/' + id, c, id, maj, del: false, data };
  await putLocal(rec);
  await queue({ c, id, maj, del: false, data });
  return rec;
}
export async function removeDoc(c, id) {
  const maj = nowIso();
  await putLocal({ k: c + '/' + id, c, id, maj, del: true, data: null });
  await queue({ c, id, maj, del: true, data: null });
}
async function queue(ch) { const d = await open(); return reqP(d.transaction('outbox', 'readwrite').objectStore('outbox').put({ k: ch.c + '/' + ch.id, ...ch })); }
export async function outbox() { const d = await open(); return reqP(d.transaction('outbox').objectStore('outbox').getAll()); }
export async function clearOutbox(keys) {
  const d = await open(); const t = d.transaction('outbox', 'readwrite'); const s = t.objectStore('outbox');
  keys.forEach(k => s.delete(k)); return new Promise(r => { t.oncomplete = r; });
}
/** Applique des documents venus du serveur (sans écraser un changement local plus récent encore en attente). */
export async function applyRemote(docs) {
  const d = await open(); const pending = new Set((await outbox()).map(o => o.k));
  const t = d.transaction('docs', 'readwrite'); const s = t.objectStore('docs');
  docs.forEach(x => {
    const k = x.c + '/' + x.id; if (pending.has(k)) return;
    if (x.del) s.delete(k); else s.put({ k, c: x.c, id: x.id, maj: x.maj, srv: x.srv, del: false, data: x.data });
  });
  return new Promise(r => { t.oncomplete = r; });
}

/* ---- meta ---- */
export async function getMeta(k, def = null) { const d = await open(); const x = await reqP(d.transaction('meta').objectStore('meta').get(k)); return x ? x.v : def; }
export async function setMeta(k, v) { const d = await open(); return reqP(d.transaction('meta', 'readwrite').objectStore('meta').put({ k, v })); }

/* ---- dossiers de cet ordinateur (FileSystemDirectoryHandle) ---- */
export async function putHandle(key, handle) { const d = await open(); return reqP(d.transaction('handles', 'readwrite').objectStore('handles').put({ k: key, handle })); }
export async function getHandle(key) { const d = await open(); const x = await reqP(d.transaction('handles').objectStore('handles').get(key)); return x ? x.handle : null; }
export async function delHandle(key) { const d = await open(); return reqP(d.transaction('handles', 'readwrite').objectStore('handles').delete(key)); }
