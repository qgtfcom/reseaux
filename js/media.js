// Médias des posts : retrouver les fichiers produits dans les dossiers d'enregistrement de la société (sur ce PC),
// les rattacher à un post, fabriquer la miniature stockée avec le post, et les afficher.
// Le post ne contient QUE : les noms de fichiers + une petite miniature (≤ 20 Ko, la feuille Google limite chaque cellule à ~50 000 caractères).
// Les fichiers eux-mêmes restent dans les dossiers du PC (G:, P:, Documents) : jamais déplacés, jamais modifiés.
import * as FS from './fs.js';
import * as C from './compress.js';
import * as DB from './db.js';

export const MAX_MINIATURE = 20000;
export const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** « Société - AAAA-MM-JJ - Titre - Réseau [N].ext » → informations, ou null si le nom ne suit pas cette forme. */
export function parseNom(nom) {
  const kind = FS.kindOf(nom); if (kind !== 'image' && kind !== 'video') return null;
  const parts = nom.replace(/\.[^.]+$/, '').split(' - ').map(x => x.trim());
  const i = parts.findIndex(x => /^\d{4}-\d{2}-\d{2}$/.test(x));
  if (i < 1 || parts.length < i + 2) return null;
  let reseau = '', role = 'principal', n = 0, titre = parts.slice(i + 1).join(' - ');
  if (parts.length >= i + 3) {
    const m = norm(parts[parts.length - 1]).match(/^(facebook|instagram|tiktok|linkedin|whatsapp)?\s*(carrousel|story|stories)?\s*(\d+)?$/);
    if (m && (m[1] || m[2])) { reseau = m[1] || ''; role = m[2] ? (m[2] === 'carrousel' ? 'slide' : 'story') : 'principal'; n = Number(m[3]) || 0; titre = parts.slice(i + 1, -1).join(' - '); }
  }
  return { nom, type: kind, societe: parts.slice(0, i).join(' - '), date: parts[i], titre, reseau, role, n };
}

const mots = s => new Set(norm(s).split(' ').filter(w => w.length > 2));
export function correspond(post, p) {
  const a = mots(post.titre), b = mots(p.titre); if (!a.size || !b.size) return false;
  let k = 0; for (const w of a) if (b.has(w)) k++;
  const j = Math.abs((new Date(post.date + 'T12:00') - new Date(p.date + 'T12:00')) / 864e5);
  return k / Math.min(a.size, b.size) >= 0.75 && (isNaN(j) || j <= 14);
}
const ordre = (a, b) => ({ principal: 0, slide: 1, story: 2 }[a.role] - { principal: 0, slide: 1, story: 2 }[b.role]) || (a.type === b.type ? 0 : a.type === 'video' ? -1 : 1) || a.n - b.n || a.nom.localeCompare(b.nom);
/** Fichiers de l'index qui correspondent à un post (proposition, à confirmer par l'utilisateur). */
export const proposer = (post, files) => files.filter(f => f.p && correspond(post, f.p)).map(f => f.p).sort(ordre);

/** Fabrique le champ `media` du post à partir de la sélection (liste d'infos de fichiers). */
export function typeMedia(sel) { return sel.some(f => f.type === 'video' && f.role === 'principal') ? 'video' : sel.filter(f => f.role === 'slide').length >= 2 ? 'carousel' : 'image'; }

/* ---------------- index des fichiers de la société sur CE PC ---------------- */
const cache = new Map();
export const oublier = id => id ? cache.delete(id) : cache.clear();
/** Liste les médias des dossiers d'enregistrement liés. `geste:true` (clic) autorise à redemander l'accès. */
export async function indexer(societe, { geste = false, force = false } = {}) {
  if (!force && cache.has(societe.id)) return cache.get(societe.id);
  const files = [], vus = new Set(); let lies = 0, refuses = 0;
  for (const d of (societe.dossiers || []).filter(x => x.role === 'enregistrement')) {
    const h = await FS.handleOf(societe.id, d.id); if (!h) continue; lies++;
    try {
      const ok = geste ? await FS.ensurePermission(h) : (await h.queryPermission({ mode: 'read' })) === 'granted';
      if (!ok) { refuses++; continue; }
      for (const f of await FS.listFiles(h, { kinds: ['image', 'video'], depth: 2, limit: 3000 })) { if (vus.has(f.name)) continue; vus.add(f.name); files.push({ ...f, dossier: d.nom, p: parseNom(f.name) }); }
    } catch { refuses++; }
  }
  const r = { files, lies, refuses };
  if (!refuses) cache.set(societe.id, r);
  return r;
}
export async function ouvrirFichier(societe, nom, opts) {
  const r = await indexer(societe, opts); const f = r.files.find(x => x.name === nom);
  return f ? f.handle.getFile() : null;
}

/* ---------------- miniature et rattachement ---------------- */
/** Miniature unique du post (≤ 20 Ko) : image de la vidéo, mosaïque du carrousel ou image seule. */
export async function fabriquerMiniature(societe, sel) {
  const type = typeMedia(sel), ouvrir = f => ouvrirFichier(societe, f.nom);
  let r = null;
  if (type === 'video') r = await C.miniatureVideo(await ouvrir(sel.find(f => f.type === 'video' && f.role === 'principal')), { maxBytes: MAX_MINIATURE });
  else if (type === 'carousel') { const fs = (await Promise.all(sel.filter(f => f.role === 'slide').sort(ordre).map(ouvrir))).filter(Boolean); r = await C.mosaique(fs, { maxBytes: MAX_MINIATURE }); }
  else { const f = sel.find(x => x.type === 'image' && x.role === 'principal') || sel.find(x => x.type === 'image'); if (f) r = await C.miniatureImage(await ouvrir(f), { maxBytes: MAX_MINIATURE }); }
  if (!r) throw new Error('Aucune image exploitable dans la sélection');
  return { poster: await C.dataUrl(r.blob), octets: r.blob.size };
}
export async function construireMedia(societe, sel) {
  const { poster, octets } = await fabriquerMiniature(societe, sel);
  return { kind: typeMedia(sel), fichiers: sel.map(({ nom, type, role, reseau, n }) => ({ nom, type, role, reseau, n })), poster, posterOctets: octets, attacheLe: new Date().toISOString() };
}

/* ---------------- affichage local (PC) ---------------- */
const blobs = new Map();
export async function urlLocale(societe, nom) {
  const k = societe.id + '|' + nom; if (blobs.has(k)) return blobs.get(k);
  const f = await ouvrirFichier(societe, nom).catch(() => null); if (!f) return null;
  const u = URL.createObjectURL(f); blobs.set(k, u); return u;
}
/** Remplace, dans la page, les aperçus (miniature) par les vrais fichiers quand ce PC y a accès. */
export async function hydrater(root, app) {
  const els = [...root.querySelectorAll('[data-lm]')]; let aAutoriser = false;
  for (const el of els) {
    let d; try { d = JSON.parse(el.dataset.lm); } catch { continue; }
    const s = app.societes.find(x => x.id === d.s); if (!s) continue;
    const urls = (await Promise.all(d.n.map(n => urlLocale(s, n)))).filter(Boolean);
    if (urls.length !== d.n.length) { el.classList.add('apercu'); if ((await indexer(s)).refuses) aAutoriser = true; continue; }
    const poster = el.querySelector('img')?.src || '';
    if (d.k === 'video') { el.classList.add('v'); el.innerHTML = `<video src="${urls[0]}" controls playsinline preload="metadata" ${poster ? `poster="${poster}"` : ''}></video>`; }
    else if (d.k === 'carousel') { el.classList.add('car'); el.innerHTML = urls.map((u, i) => `<img src="${u}" alt="image ${i + 1}">`).join(''); }
    else el.innerHTML = `<img src="${urls[0]}" alt="">`;
  }
  const prev = root.querySelector('#medacces');
  if (aAutoriser && !prev) root.querySelector('.content')?.insertAdjacentHTML('afterbegin', `<div class="banner warn" id="medacces">🔒 Les fichiers de cet ordinateur ne sont pas encore autorisés pour cette session. <button class="btn sm" data-act="med-autoriser">Autoriser l'accès</button></div>`);
  if (!aAutoriser && prev) prev.remove();
}

/** Fichiers d'un post à télécharger pour un réseau donné (ou les Stories). */
export function fichiersPour(media, reseau) {
  const f = media?.fichiers || [];
  if (reseau === 'story') return f.filter(x => x.role === 'story');
  const base = f.filter(x => x.role !== 'story'), propres = base.filter(x => x.reseau === reseau);
  if (propres.length) return propres;
  const neutres = base.filter(x => !x.reseau);
  if (neutres.length) return neutres;
  if (media?.kind === 'video') return base.filter(x => x.type === 'video').slice(0, 1);
  const slides = base.filter(x => x.role === 'slide');
  return slides.length ? slides : base.slice(0, 1);
}

/** Séance 3 : ajoute (une seule fois, identifiants fixes) les dossiers locaux « Documents\\QG Tfcom\\Reseaux » de chaque société. */
const SOUS = { 'biz-3ccshop': '3cc.shop', 'biz-solarbat': 'Solar-Bat' };
export async function ensureDossiersLocaux(app) {
  let n = 0;
  for (const s of app.societes) {
    const ajout = [], sous = SOUS[s.id] || s.nom;
    if (!s.dossiers.some(d => d.id === 'rec-C')) ajout.push({ id: 'rec-C', role: 'enregistrement', nom: 'Documents › QG Tfcom › Reseaux › ' + sous, indic: 'Documents\\QG Tfcom\\Reseaux\\' + sous + ' (disque C:)' });
    if (!s.dossiers.some(d => d.id === 'mus-C')) ajout.push({ id: 'mus-C', role: 'musiques', nom: 'My music (disque C:)', indic: 'Documents\\QG Tfcom\\Reseaux\\My music' });
    if (!ajout.length) continue;
    const { id, ...data } = s;
    await DB.saveDoc('entreprises', id, { ...data, dossiers: [...s.dossiers, ...ajout], majLe: new Date().toISOString() }); n++;
  }
  return n;
}
