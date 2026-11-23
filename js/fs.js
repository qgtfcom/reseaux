// Accès aux dossiers de CET ordinateur (File System Access API : Chrome / Edge sur PC).
// Google Drive pour ordinateur (disque G:) et pCloud (disque P:) sont de simples dossiers locaux.
import * as DB from './db.js';

export const supported = () => typeof window.showDirectoryPicker === 'function';
const IMG = /\.(jpe?g|png|webp|gif|heic|avif)$/i, VID = /\.(mp4|mov|m4v|webm|mkv)$/i, AUD = /\.(mp3|wav|m4a|aac|ogg|flac)$/i;
export const kindOf = n => IMG.test(n) ? 'image' : VID.test(n) ? 'video' : AUD.test(n) ? 'audio' : null;
const key = (societeId, dossierId) => societeId + '|' + dossierId;

export async function link(societeId, dossierId) {
  if (!supported()) throw new Error("Ce navigateur ne permet pas de choisir un dossier. Utilise Chrome ou Edge sur ordinateur.");
  const h = await window.showDirectoryPicker({ id: 'pr-' + dossierId.slice(0, 20), mode: 'readwrite' });
  await DB.putHandle(key(societeId, dossierId), h);
  return h.name;
}
export async function unlink(societeId, dossierId) { await DB.delHandle(key(societeId, dossierId)); }
export async function handleOf(societeId, dossierId) { try { return await DB.getHandle(key(societeId, dossierId)); } catch { return null; } }
export async function linkedName(societeId, dossierId) { const h = await handleOf(societeId, dossierId); return h ? h.name : ''; }

/** Vérifie (et au besoin redemande, sur un clic) l'autorisation d'accès. */
export async function ensurePermission(h, write = false) {
  const o = { mode: write ? 'readwrite' : 'read' };
  if ((await h.queryPermission(o)) === 'granted') return true;
  return (await h.requestPermission(o)) === 'granted';
}

/** Liste les fichiers d'un dossier (sous-dossiers compris, profondeur 3). */
export async function listFiles(h, { kinds = ['image', 'video'], depth = 3, limit = 400 } = {}) {
  const out = [];
  async function walk(dir, path, d) {
    for await (const [name, e] of dir.entries()) {
      if (out.length >= limit) return;
      if (e.kind === 'directory') { if (d < depth && !name.startsWith('.')) await walk(e, path + name + '/', d + 1); }
      else { const k = kindOf(name); if (k && kinds.includes(k)) out.push({ name, path: path + name, kind: k, handle: e }); }
    }
  }
  await walk(h, '', 0);
  return out;
}

/** Écrit un fichier dans un dossier (crée les sous-dossiers du chemin si besoin). */
export async function writeFile(h, relPath, data) {
  const parts = relPath.split('/').filter(Boolean); const name = parts.pop();
  let dir = h; for (const p of parts) dir = await dir.getDirectoryHandle(p, { create: true });
  const f = await dir.getFileHandle(name, { create: true });
  const w = await f.createWritable(); await w.write(data); await w.close();
  return relPath;
}
export async function testWrite(h) {
  await ensurePermission(h, true);
  const n = 'test-pilote-reseaux.txt';
  await writeFile(h, n, 'Test d\'enregistrement Pilote Réseaux — ' + new Date().toLocaleString('fr-FR') + '\nCe fichier peut être supprimé.');
  return n;
}
/** Enregistre dans TOUS les dossiers d'enregistrement liés sur cet ordinateur pour la société. */
export async function saveToAll(societe, id, relPath, data) {
  const done = [], skipped = [];
  for (const d of (societe.dossiers || []).filter(x => x.role === 'enregistrement')) {
    const h = await handleOf(id, d.id);
    if (!h) { skipped.push(d.nom); continue; }
    try { if (await ensurePermission(h, true)) { await writeFile(h, relPath, data); done.push(d.nom); } else skipped.push(d.nom); } catch { skipped.push(d.nom); }
  }
  return { done, skipped };
}
