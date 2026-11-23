// Modèle de données, règles par défaut et import depuis l'ancienne appli « Pilote Réseaux » (artefact Claude).
import * as DB from './db.js';

export const NETS = {
  facebook:  { l: 'Facebook',  c: '#1877f2', publier: 'https://business.facebook.com/latest/home' },
  instagram: { l: 'Instagram', c: '#c13584', publier: 'https://business.facebook.com/latest/home' },
  tiktok:    { l: 'TikTok',    c: '#111111', publier: 'https://www.tiktok.com/tiktokstudio/upload' },
  whatsapp:  { l: 'WhatsApp',  c: '#25d366', publier: 'https://web.whatsapp.com/' },
  linkedin:  { l: 'LinkedIn',  c: '#0a66c2', publier: 'https://www.linkedin.com/feed/' },
};
export const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
export const STATUTS = { idee: 'Idée', a_creer: 'En production', a_valider: 'À valider', a_refaire: 'À refaire', pret: 'Validé', programme: 'Programmé', publie: 'Publié' };
export const ROLES_DOSSIER = { sources: 'Photos / vidéos SOURCES', enregistrement: "ENREGISTREMENT des fichiers produits", musiques: 'MUSIQUES', archives: 'ARCHIVES (ZIP mensuels des posts publiés)' };
export const POLICES = ['Montserrat', 'Poppins', 'Bebas Neue', 'Oswald', 'Anton', 'Inter', 'Roboto', 'Lato', 'Playfair Display', 'Bricolage Grotesque', 'Arial', 'Georgia'];

const CREER = "Média manquant : si on n'a pas la vidéo ou la photo qui correspond au thème du post, on la crée (montage, visuel, motion design). Un média créé n'est jamais présenté comme un vrai chantier ou un vrai client.";
const RYTHME = 'Rythme de fabrication : les visuels (carrousels, Stories) sont construits par exemple le lundi et le mardi ; les vidéos le mercredi ou le jeudi, selon les semaines.';
export const REGLES_DEFAUT = [
  'Le texte est toujours placé EN BAS de l\'image ou de la vidéo, sans cadre ni forme colorée.',
  'Aucun visage de face (vues de dos et mains acceptées).',
  'Le cutter ne reste jamais plus d\'une demi-seconde à l\'écran (idéalement aucun plan cutter). Montrer plutôt le décapeur thermique.',
  'Plaques d\'immatriculation et inscriptions de t-shirts : toujours floutées.',
  'Jamais de faux avant/après, de faux avis ni de fausse réaction client.',
  'Un média généré n\'est jamais présenté comme un vrai chantier ou une vraie réalisation.',
  'Musique : uniquement celle du dossier Musiques, passage différent à chaque vidéo, volume bas, avec fondu. Jamais de musique synthétique douce.',
  RYTHME,
  CREER,
].map((texte, i) => ({ id: 'g' + (i + 1), texte, actif: true }));

export const VISIBILITE_DEFAUT = "Accroche forte dans les 2 premières secondes (résultat, question directe ou erreur courante, jamais de bonjour ni de logo au début) ; vidéos de 15 à 30 s avec un plan toutes les 2 à 3 s et des sous-titres incrustés ; donner une raison d'enregistrer ou de partager (astuce utile, liste, « envoie ça à… ») ; terminer chaque texte par une question qui appelle un commentaire ; glisser des mots-clés locaux (métier + ville) dans le texte et à l'oral ; pas de lien externe dans le texte Facebook ; pour TikTok, suggérer un type de son tendance à choisir dans l'appli ; pour LinkedIn, ton professionnel et concret, orienté entreprises, gestionnaires de bâtiments et collectivités, 3 à 4 hashtags maximum. Dans chaque script, indique l'accroche, le texte à l'écran et la durée de chaque plan.";

export const REGLES_SOCIETE_DEFAUT = {
  'biz-solarbat': ['Ne jamais citer les marques des produits utilisés (films, stores, laques), ni dans les textes ni sur les visuels.'],
};
export const DOSSIERS_DEFAUT = {
  'biz-3ccshop': [
    { role: 'sources', nom: 'Media 3CC.shop (pCloud)', indic: 'P:\\Dossier pro\\3CC.shop\\Media 3CC.shop' },
    { role: 'enregistrement', nom: 'QGTScom › Réseaux sociaux › 3CC Shop', indic: 'Disque G: (Google Drive pour ordinateur)' },
    { role: 'enregistrement', nom: 'Vidéos prêtes à publier (pCloud)', indic: 'P:\\Dossier pro\\3CC.shop\\Vidéos prêtes à publier' },
    { role: 'musiques', nom: 'My Music (pCloud)', indic: 'Dossier Musiques fourni par le gérant' },
  ],
  'biz-solarbat': [
    { role: 'sources', nom: 'Media Solarbat (pCloud)', indic: 'P:\\Dossier pro\\SolarBat\\Media Solarbat' },
    { role: 'sources', nom: 'Chantier Films solaires (pCloud)', indic: 'P:\\Dossier pro\\SolarBat\\Chantier Films solaires' },
    { role: 'enregistrement', nom: 'QGTScom › Réseaux sociaux › SolarBat', indic: 'Disque G: (Google Drive pour ordinateur)' },
    { role: 'enregistrement', nom: 'Vidéos prêtes à publier (pCloud)', indic: 'P:\\Dossier pro\\SolarBat\\Vidéos prêtes à publier' },
    { role: 'musiques', nom: 'My Music (pCloud)', indic: 'Dossier Musiques fourni par le gérant' },
  ],
};

export const uid = (p = 'x') => p + Math.random().toString(36).slice(2, 8);

/** Complète une fiche société avec tous les champs du nouveau logiciel (sans rien perdre de l'ancienne). */
export function normalizeSociete(id, d = {}) {
  const s = {
    nom: '', domaine: '', zone: '', cible: '', ton: '', offres: '', eviter: '', consignes: '',
    couleur: '#2f54eb', couleur2: '', police: '', policeTexte: '', logo: '',
    reseaux: [], liensReseaux: {}, jours: [], heure: '10:00', postsParSemaine: 2,
    retours: [], regles: [], dossiers: [], contacts: [], musiques: [], modeles: {},
    waNumero: '', waAccueil: '', waAbsence: '', waRapides: '', veilleMots: [], liens: '',
    ...d,
  };
  // liens (ancien champ texte multi-lignes) -> liensReseaux
  if (!Object.keys(s.liensReseaux || {}).length && s.liens) {
    s.liens.split('\n').map(x => x.trim()).filter(Boolean).forEach(u => {
      const k = /facebook\./.test(u) ? 'facebook' : /instagram\./.test(u) ? 'instagram' : /tiktok\./.test(u) ? 'tiktok' : /linkedin\./.test(u) ? 'linkedin' : 'site';
      s.liensReseaux[k] = u;
    });
  }
  if (!s.regles.length && REGLES_SOCIETE_DEFAUT[id]) s.regles = REGLES_SOCIETE_DEFAUT[id].map(t => ({ id: uid('r'), texte: t, actif: true }));
  if (!s.dossiers.length && DOSSIERS_DEFAUT[id]) s.dossiers = DOSSIERS_DEFAUT[id].map(x => ({ id: uid('d'), ...x }));
  s.musiques = (s.musiques || []).map(m => ({ fichier: '', ...m }));
  return s;
}

export function newSocieteId(nom) {
  const slug = (nom || 'societe').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '').slice(0, 20) || 'societe';
  return 'biz-' + slug + '-' + Math.random().toString(36).slice(2, 5);
}

export async function ensureParametres() {
  const rg = await DB.getDoc('parametres', 'regles');
  if (!rg) await DB.saveDoc('parametres', 'regles', { globales: REGLES_DEFAUT, visibilite: VISIBILITE_DEFAUT });
  else { const d = rg.data || rg; if (Array.isArray(d.globales)) { const manque = [RYTHME, CREER].filter(t => !d.globales.some(r => r.texte === t)); if (manque.length) await DB.saveDoc('parametres', 'regles', { ...d, globales: [...d.globales, ...manque.map((texte, i) => ({ id: 'g' + (d.globales.length + 1 + i) + 'r', texte, actif: true }))] }); } }
  if (!(await DB.getDoc('parametres', 'app'))) await DB.saveDoc('parametres', 'app', { retentionJours: 365, archiveStockage: 'both' });
}

/** Importe sociétés, posts et vidéos de l'ancienne appli depuis les fichiers JSON choisis sur l'ordinateur
 *  (entreprises.json, posts.json, videos.json). Ils ne sont JAMAIS publiés sur GitHub. Idempotent. */
export async function importerAncienneAppli({ files = [], force = false } = {}) {
  const get = async name => { const f = files.find(x => x.name.toLowerCase() === name); if (!f) return []; try { return JSON.parse(await f.text()); } catch { throw new Error('Fichier illisible : ' + name); } };
  if (!files.some(x => /^(entreprises|posts|videos)\.json$/i.test(x.name))) throw new Error('Choisis les fichiers entreprises.json, posts.json et videos.json du dossier « donnees-a-importer ».');
  const [ent, posts, vids] = await Promise.all([get('entreprises.json'), get('posts.json'), get('videos.json')]);
  const res = { societes: 0, posts: 0, videos: 0, ignores: 0 };
  for (const e of ent) {
    if (!force && await DB.getDoc('entreprises', e.id)) { res.ignores++; continue; }
    await DB.saveDoc('entreprises', e.id, normalizeSociete(e.id, e.data)); res.societes++;
  }
  for (const p of posts) {
    if (!force && await DB.getDoc('posts', p.id)) { res.ignores++; continue; }
    const d = { ...p.data };
    if (d.statut === 'publie' && !d.publieLe) d.publieLe = d.valideLe || (d.date ? d.date + 'T12:00:00.000Z' : new Date().toISOString());
    await DB.saveDoc('posts', p.id, d); res.posts++;
  }
  for (const v of vids) {
    if (!force && await DB.getDoc('videos', v.id)) { res.ignores++; continue; }
    await DB.saveDoc('videos', v.id, v.data); res.videos++;
  }
  await ensureParametres();
  await DB.setMeta('imported', new Date().toISOString());
  return res;
}
