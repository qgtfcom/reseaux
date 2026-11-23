// Archivage mensuel : un ZIP par société et par mois, rangé dans le dossier « Archives » de la société (G: et/ou P:).
// Règle : on n'archive QUE les posts publiés. Un post n'est supprimé de l'appli (et de la feuille Google) qu'après
// vérification que le ZIP est bien écrit et relu à l'identique dans TOUS les dossiers de destination choisis.
import * as DB from './db.js';
import * as FS from './fs.js';
import { NETS, STATUTS } from './model.js';
import { zip, crc32 } from './zip.js';

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MAX_MEDIA = 25 * 1024 * 1024;
export const LIEUX = { both: 'Les deux : G: (Google Drive) et P: (pCloud)', G: 'G: seulement (Google Drive)', P: 'P: seulement (pCloud)' };

export const moisCourant = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
export const libelleMois = k => { const [y, m] = k.split('-').map(Number); return MOIS[m - 1] + (y !== new Date().getFullYear() ? ' ' + y : ''); };
const slug = nom => String(nom || 'societe').trim().replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '-');
const moisDe = p => String(p.publieLe || p.date || '').slice(0, 7);

/** Posts publiés d'un mois ÉCOULÉ (jamais le mois en cours), regroupés par société et par mois. */
export function aArchiver(app) {
  const cur = moisCourant(), map = new Map();
  for (const p of app.posts) {
    if (p.statut !== 'publie') continue;
    const mois = moisDe(p); if (!/^\d{4}-\d{2}$/.test(mois) || mois >= cur) continue;
    const societe = app.societes.find(s => s.id === p.entrepriseId); if (!societe) continue;
    const k = mois + '|' + societe.id; if (!map.has(k)) map.set(k, { mois, societe, posts: [] });
    map.get(k).posts.push(p);
  }
  return [...map.values()].sort((a, b) => a.mois.localeCompare(b.mois) || a.societe.nom.localeCompare(b.societe.nom));
}
export function libelle(items) {
  const m = [...new Set(items.map(i => i.mois))].sort().map(libelleMois);
  return m.length > 1 ? m.slice(0, -1).join(', ') + ' et ' + m[m.length - 1] : (m[0] || '');
}

/** Crée (une seule fois, avec des identifiants fixes) les deux dossiers « Archives » G: et P: de chaque société. */
export async function ensureArchiveDossiers(app) {
  let n = 0;
  for (const s of app.societes) {
    if (s.dossiers.some(d => d.role === 'archives')) continue;
    const { id, ...data } = s;
    data.dossiers = [...s.dossiers,
      { id: 'arch-G', role: 'archives', lecteur: 'G', nom: 'Archives (Google Drive G:)', indic: 'Disque G: › dossier Archives de la société' },
      { id: 'arch-P', role: 'archives', lecteur: 'P', nom: 'Archives (pCloud P:)', indic: 'Disque P: › dossier Archives de la société' }];
    await DB.saveDoc('entreprises', id, { ...data, majLe: new Date().toISOString() }); n++;
  }
  return n;
}

/** Dossiers de destination selon le réglage « Où ranger les archives ». */
export function destinations(societe, lieu = 'both') {
  return societe.dossiers.filter(d => d.role === 'archives' && (lieu === 'both' || !d.lecteur || d.lecteur === lieu));
}

async function fetchMedia(url) {
  if (!/^https?:\/\//i.test(url || '')) return null;
  try {
    const r = await fetch(url); if (!r.ok) return null;
    if ((Number(r.headers.get('content-length')) || 0) > MAX_MEDIA) return null;
    const b = new Uint8Array(await r.arrayBuffer()); if (b.length > MAX_MEDIA) return null;
    const ext = (new URL(url).pathname.match(/\.([a-z0-9]{2,4})$/i) || [])[1] || ((r.headers.get('content-type') || '').split('/')[1] || 'bin').split(';')[0];
    return { bytes: b, ext: ext.toLowerCase() };
  } catch { return null; }
}

const texteLisible = p => {
  const nets = (p.reseaux || []).map(n => NETS[n]?.l || n).join(', ');
  const bloc = Object.entries(p.textes || {}).map(([n, t]) => `-- ${NETS[n]?.l || n} --\n${t}`).join('\n\n');
  return `=== ${p.date || '?'} ${p.heure || ''} · ${p.titre || '(sans titre)'} ===\nRéseaux : ${nets || '—'}\nStatut : ${STATUTS[p.statut] || p.statut}${p.publieLe ? ' le ' + String(p.publieLe).slice(0, 10) : ''}\n${bloc}${p.hashtags ? '\nHashtags : ' + p.hashtags : ''}\n`;
};

/** Construit le ZIP d'une société pour un mois. */
export async function construireZip({ mois, societe, posts }) {
  const files = [], manquants = []; let nbMedias = 0;
  const liste = posts.map(p => { const { id, ...d } = p; return { id, ...d }; });
  files.push({ name: 'posts.json', data: JSON.stringify(liste, null, 1) });
  files.push({ name: 'posts.txt', data: posts.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).map(texteLisible).join('\n') });
  for (const p of posts) {
    const m = p.media || {}, urls = [m.url, m.poster, ...(m.slides || [])].filter(Boolean);
    let i = 0;
    for (const u of urls) {
      if (/^data:/.test(u)) continue;                       // déjà contenu dans posts.json
      const r = await fetchMedia(u);
      if (r) { files.push({ name: `medias/${p.id}_${++i}.${r.ext}`, data: r.bytes }); nbMedias++; } else manquants.push(`${p.titre || p.id} : ${u}`);
    }
  }
  files.unshift({ name: 'LISEZMOI.txt', data: `Archive Pilote Réseaux — ${societe.nom} — ${libelleMois(mois)}\nCréée le ${new Date().toLocaleString('fr-FR')}\n\nContenu : ${posts.length} post(s) publié(s) ; ${nbMedias} fichier(s) média.\n- posts.json : toutes les données des posts (réimportables)\n- posts.txt : textes, dates et réseaux, lisibles\n- medias/ : visuels et petites vidéos récupérés\n\nLes médias seront compressés à la séance 3.\n` + (manquants.length ? `\nMédias NON inclus (adresse inaccessible ou fichier > 25 Mo) :\n- ${manquants.join('\n- ')}\nLes fichiers produits restent dans les dossiers d'enregistrement de la société.\n` : '') });
  return { bytes: zip(files), nbMedias, manquants };
}

async function existe(h, nom) { try { await h.getFileHandle(nom); return true; } catch { return false; } }

/** Écrit puis RELIT le fichier : taille et somme de contrôle doivent être identiques. */
export async function ecrireEtVerifier(h, nom, bytes) {
  let final = nom, i = 2;
  while (await existe(h, final)) final = nom.replace(/\.zip$/, `_${i++}.zip`);   // ne jamais écraser une archive existante
  await FS.writeFile(h, final, bytes);
  const relu = new Uint8Array(await (await (await h.getFileHandle(final)).getFile()).arrayBuffer());
  if (relu.length !== bytes.length || crc32(relu) !== crc32(bytes)) throw new Error('relecture différente du fichier écrit');
  return final;
}

/** Archive les éléments demandés. Retourne un rapport ; supprime les posts seulement si tout est vérifié. */
export async function archiver(app, items, lieu, suppr, onEtape = () => {}) {
  const rapport = [];
  // 1) autorisations d'abord (elles exigent un clic) : on ne commence rien tant que tout n'est pas prêt
  const prets = [];
  for (const it of items) {
    const dests = destinations(it.societe, lieu), cibles = [], absents = [];
    for (const d of dests) {
      const h = await FS.handleOf(it.societe.id, d.id);
      if (!h) { absents.push(d.nom); continue; }
      try { if (await FS.ensurePermission(h, true)) cibles.push({ d, h }); else absents.push(d.nom + ' (accès refusé)'); } catch { absents.push(d.nom); }
    }
    if (!dests.length || absents.length) rapport.push({ ...it, ok: false, msg: dests.length ? 'Dossier(s) à choisir sur cet ordinateur (Sociétés › Modifier › Dossiers) : ' + absents.join(', ') : 'Aucun dossier Archives pour ce réglage.' });
    else prets.push({ ...it, cibles });
  }
  // 2) construction, écriture, vérification, puis suppression
  for (const it of prets) {
    const nom = `${it.mois}_${slug(it.societe.nom)}.zip`;
    try {
      onEtape(`${it.societe.nom} · ${libelleMois(it.mois)} : création du ZIP…`);
      const z = await construireZip(it);
      const ecrits = [];
      for (const { d, h } of it.cibles) { onEtape(`${it.societe.nom} · ${libelleMois(it.mois)} : écriture dans ${d.nom}…`); ecrits.push(await ecrireEtVerifier(h, nom, z.bytes)); }
      if (suppr) for (const p of it.posts) await DB.removeDoc('posts', p.id);
      rapport.push({ ...it, ok: true, fichier: ecrits[0], nbMedias: z.nbMedias, manquants: z.manquants.length, msg: `${it.posts.length} post(s) archivé(s) dans ${it.cibles.length} dossier(s)` + (z.manquants.length ? `, ${z.manquants.length} média(s) non inclus` : '') });
    } catch (e) {
      rapport.push({ ...it, ok: false, msg: 'Échec, aucun post supprimé : ' + (e.message || e) });
    }
  }
  return rapport;
}
