import * as DB from './db.js';
import * as S from './sync.js';
import * as FS from './fs.js';
import * as IA from './ia.js';
import * as Arch from './archive.js';
import * as Media from './media.js';
import { createEcrans } from './ecrans.js';
import { ic } from './icons.js';
import { NETS, JOURS, STATUTS, ROLES_DOSSIER, POLICES, normalizeSociete, newSocieteId, ensureParametres, importerAncienneAppli, uid } from './model.js';

const VERSION = '1.3.3';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = d => { try { return new Date(String(d).slice(0, 10) + 'T12:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }); } catch { return ''; } };
const fmtTime = d => d ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';

const app = { route: 'accueil', societes: [], posts: [], videos: [], regles: null, params: { retentionJours: 30, archiveStockage: 'both' }, events: [], archItems: [], arch: null, user: null, wiz: null, acces: null, imported: null, toastT: null };

/* ============================ Données & droits ============================ */
async function loadAll() {
  app.societes = (await DB.listDocs('entreprises')).map(x => ({ id: x.id, ...normalizeSociete(x.id, x.data) })).sort((a, b) => a.nom.localeCompare(b.nom));
  app.posts = (await DB.listDocs('posts')).map(x => ({ id: x.id, ...x.data })).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  app.videos = (await DB.listDocs('videos')).map(x => ({ id: x.id, ...x.data }));
  app.regles = (await DB.getDoc('parametres', 'regles'))?.data || null;
  app.params = { retentionJours: 30, archiveStockage: 'both', ...((await DB.getDoc('parametres', 'app'))?.data || {}) };
  app.events = (await DB.listDocs('evenements')).map(x => ({ id: x.id, ...x.data }));
  app.imported = await DB.getMeta('imported');
  app.user = S.state.user || (await DB.getMeta('user')) || null;
  app.archItems = Arch.aArchiver(app);
}
const role = () => app.user?.role || (S.savedEmail() ? 'lecture' : '');
const canEdit = () => ['admin', 'edition'].includes(role());
const isAdmin = () => role() === 'admin';
const socName = id => app.societes.find(s => s.id === id)?.nom || id || '';

function toast(msg, ms = 3500) {
  let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.className = 'show'; clearTimeout(app.toastT); app.toastT = setTimeout(() => t.className = '', ms);
}
const copy = async txt => { try { await navigator.clipboard.writeText(txt); toast('Copié'); } catch { toast('Copie impossible'); } };

/* ================================ Écrans ================================ */
const NAV = [
  ['accueil', 'Accueil', 'home'], ['avalider', 'À valider', 'circle-check'], ['planning', 'Planning', 'calendar'], ['publier', 'Publier', 'send'],
  ['societes', 'Sociétés', 'building'], ['acces', 'Accès', 'key'], ['reglages', 'Réglages', 'sliders'], ['aide', 'Aide', 'help'],
];
/* thème clair / sombre et menu replié : mémorisés sur cet appareil */
const theme = () => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
function setTheme(t) { document.documentElement.dataset.theme = t; try { localStorage.setItem('pr.theme', t); } catch {} const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = t === 'dark' ? '#171411' : '#faf8f5'; }
const collapsed = () => { try { return localStorage.getItem('pr.side') === '1'; } catch { return false; } };
const FAB = { planning: ['ev-add', 'Événement', () => canEdit()], societes: ['soc-new', 'Société', () => isAdmin()] };

function shell(inner) {
  const st = S.state;
  const nav = NAV.filter(n => n[0] !== 'acces' || isAdmin()).map(([k, l, i]) =>
    `<button class="nav ${app.route === k ? 'on' : ''}" data-act="nav" data-r="${k}" title="${l}"><span class="ic">${ic(i)}</span><span class="lb">${l}</span></button>`).join('');
  const pend = st.pending ? `<span class="chip warn">${st.pending} en attente</span>` : '';
  const net = st.online ? '<span class="chip ok">En ligne</span>' : '<span class="chip off">Hors connexion</span>';
  const user = app.user ? `${esc(app.user.email || S.savedEmail())} · ${esc(app.user.role)}` : esc(S.savedEmail());
  const f = FAB[app.route], fab = f && f[2]() ? `<button class="btn fab" data-act="${f[0]}">${ic('plus')}<span>${f[1]}</span></button>` : '';
  return `<div class="layout ${collapsed() ? 'collapsed' : ''}"><aside class="side"><div class="brand"><span class="logo-b">${ic('send', 18)}</span><span class="t">Pilote Réseaux</span></div><nav>${nav}</nav>
    <div class="sidefoot"><button class="nav" data-act="side-toggle" title="Replier le menu"><span class="ic">${ic('panel')}</span><span class="lb">Replier</span></button><div class="who">${user}</div></div></aside>
    <main class="main"><header class="top"><div class="statusbar">${net}${pend}${st.syncing ? '<span class="chip">Synchronisation…</span>' : (st.lastSync ? `<span class="chip">Synchro ${fmtTime(st.lastSync)}</span>` : '')}</div>
    <div class="row"><button class="btn ghost iconbtn" data-act="theme" title="Mode clair / sombre" aria-label="Basculer clair / sombre">${ic(theme() === 'dark' ? 'sun' : 'moon')}</button>
    <button class="btn ghost ${st.syncing ? 'loading' : ''}" data-act="sync">${ic('refresh', 18)}<span>Synchroniser</span></button></div></header>
    ${bandeauArchive()}
    ${st.error ? `<div class="banner bad">${esc(st.error)} <span id="gbtn-inline"></span></div>` : ''}
    <div class="content">${inner}</div>${fab}</main></div>`;
}

function bandeauArchive() {
  if (!app.archItems.length || !canEdit() || !FS.supported()) return '';
  const n = app.archItems.reduce((t, i) => t + i.posts.length, 0);
  return `<div class="banner warn">${ic('box')} <b>Archiver ${esc(Arch.libelle(app.archItems))} ?</b> ${n} post(s) publié(s) à ranger en ZIP par société. <button class="btn sm" data-act="arch-open">Archiver</button></div>`;
}

function viewAccueil() {
  const counts = {}; app.posts.forEach(p => counts[p.statut] = (counts[p.statut] || 0) + 1);
  const linked = app.societes.reduce((n, s) => n + s.dossiers.length, 0);
  const todo = [
    [S.cfg.ready, 'Connexion à la passerelle Google configurée'],
    [!!app.user, 'Connecté avec ton compte Google'],
    [app.societes.length > 0, 'Au moins une société créée'],
    [!!app.imported, "Données de l'ancienne appli importées"],
    [linked > 0, 'Dossiers sources / enregistrement / musiques déclarés'],
  ];
  const rows = app.posts.slice(0, 30).map(p => `<tr><td>${fmtDate(p.date)}</td><td>${esc(socName(p.entrepriseId))}</td><td>${esc(p.titre)}</td><td><span class="tag s-${esc(p.statut)}">${esc(STATUTS[p.statut] || p.statut)}</span></td><td>${(p.reseaux || []).map(r => `<i class="dot" style="background:${NETS[r]?.c || '#999'}" title="${esc(NETS[r]?.l || r)}"></i>`).join('')}</td></tr>`).join('');
  const today = new Date().toISOString().slice(0, 10);
  const tiles = app.societes.map(sc => {
    const ps = app.posts.filter(p => p.entrepriseId === sc.id), n = f => ps.filter(f).length;
    const b = (k, st, bg, fg, v, l) => `<button data-act="tile-go" data-s="${esc(sc.id)}" data-st="${st}" style="background:${bg};color:${fg}"><span class="n">${v}</span><span class="l">${l}</span></button>`;
    return `<article class="soctile" style="--c:${esc(sc.couleur)}"><h2>${esc(sc.nom)}</h2><div class="mini">
      ${b('', 'a_valider', 'var(--accent-soft)', 'var(--accent)', n(p => p.statut === 'a_valider'), 'À valider')}${b('', 'pret', 'var(--ok-soft)', 'var(--ok)', n(p => p.statut === 'pret'), 'Validés')}${b('', 'passe', 'var(--hot-soft)', 'var(--hot)', n(p => p.statut !== 'publie' && p.date && p.date < today), 'Dates passées')}</div>
      <p class="muted small" style="margin:10px 0 0">${n(p => p.media?.fichiers?.length)} post(s) avec média · ${n(p => p.statut === 'publie')} publié(s)</p></article>`;
  }).join('');
  return `<h1>Bienvenue</h1>
  ${tiles ? `<div class="soctiles">${tiles}</div>` : ''}
  <section class="card"><h2>Mise en route</h2><ul class="check">${todo.map(([ok, t]) => `<li class="${ok ? 'ok' : ''}">${ok ? '✔' : '○'} ${t}</li>`).join('')}</ul>
  ${!app.imported && canEdit() ? `<button class="btn" data-act="import">Importer mes sociétés et posts (choisir les 3 fichiers .json)</button>` : ''}</section>
  <section class="card"><h2>Mes publications (${app.posts.length})</h2>
  <p class="muted">${Object.entries(counts).map(([k, v]) => `${v} ${esc((STATUTS[k] || k).toLowerCase())}`).join(' · ') || 'Aucune publication pour l\'instant.'}</p>
  ${rows ? `<div class="tablewrap"><table><thead><tr><th>Date</th><th>Société</th><th>Titre</th><th>Statut</th><th>Réseaux</th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}
  <p class="muted small">Les posts publiés sont archivés chaque mois en ZIP (un par société), puis retirés de l'application.</p></section>`;
}

/* ----------------------------- Sociétés ----------------------------- */
function viewSocietes() {
  const cards = app.societes.map(s => `<article class="card soc" style="--c:${esc(s.couleur)}"><div class="socbar"></div>
    <div class="sochead">${s.logo ? `<img class="logo" src="${esc(s.logo)}" alt="">` : `<div class="logo ph">${esc(s.nom.slice(0, 2))}</div>`}<div><h2>${esc(s.nom)}</h2><div class="muted small">${esc(s.domaine).slice(0, 110)}</div></div></div>
    <div class="chips">${s.reseaux.map(r => `<span class="chip" style="border-color:${NETS[r]?.c}">${esc(NETS[r]?.l || r)}</span>`).join('')}</div>
    <p class="muted small">${s.postsParSemaine} post(s)/semaine · ${s.jours.map(j => JOURS[j]).join(', ') || 'jours non définis'} · ${esc(s.heure)}<br>${s.dossiers.length} dossier(s) · ${s.retours.length} retour(s) enregistrés · ${s.regles.length} règle(s) propres</p>
    <div class="row">${canEdit() ? `<button class="btn" data-act="soc-edit" data-id="${esc(s.id)}">Modifier</button>` : ''}${isAdmin() ? `<button class="btn ghost danger" data-act="soc-del" data-id="${esc(s.id)}">Supprimer</button>` : ''}</div></article>`).join('');
  return `<h1>Sociétés</h1><div class="row between"><p class="muted">Chaque société a sa charte, son ton, ses règles et ses dossiers.</p>${isAdmin() ? '<button class="btn" data-act="soc-new">+ Ajouter une société</button>' : ''}</div>
  <div class="grid">${cards || '<section class="card"><p>Aucune société pour l\'instant.</p></section>'}</div>`;
}

/* ------------------------------ Assistant ------------------------------ */
const STEPS = ['Identité', 'Réseaux', 'Public & ton', 'Offres & consignes', 'Planning', 'Dossiers', 'Règles & contacts'];
function wizBody() {
  const d = app.wiz.data, s = app.wiz.step;
  const f = (label, name, val, extra = '') => `<label>${label}<input name="${name}" value="${esc(val)}" ${extra}></label>`;
  const ta = (label, name, val, ph = '', rows = 4) => `<label>${label}<textarea name="${name}" rows="${rows}" placeholder="${esc(ph)}">${esc(val)}</textarea></label>`;
  if (s === 0) return `${f('Nom de la société', 'nom', d.nom, 'required')}${ta('Domaine d\'activité', 'domaine', d.domaine, 'Ex. films pour vitrages du bâtiment, stores…', 3)}
    <div class="two"><label>Couleur principale<input type="color" name="couleur" value="${esc(d.couleur || '#2f54eb')}"></label><label>Couleur secondaire<input type="color" name="couleur2" value="${esc(d.couleur2 || '#ffffff')}"></label></div>
    <div class="two"><label>Police des titres<input name="police" list="polices" value="${esc(d.police)}" placeholder="Ex. Montserrat"></label><label>Police des textes<input name="policeTexte" list="polices" value="${esc(d.policeTexte)}" placeholder="Ex. Inter"></label></div>
    <datalist id="polices">${POLICES.map(p => `<option>${p}`).join('')}</datalist>
    <label>Logo (PNG de préférence, fond transparent)<input type="file" accept="image/*" data-act="logo"></label>
    ${d.logo ? `<div class="logoprev" style="background:${esc(d.couleur || '#222')}"><img src="${esc(d.logo)}" alt="logo"></div><button type="button" class="btn ghost" data-act="logo-del">Retirer le logo</button>` : '<p class="muted small">Sans logo, les initiales de la société seront utilisées.</p>'}`;
  if (s === 1) return `<p class="muted">Coche les réseaux utilisés et colle l'adresse de chaque page.</p>` + Object.entries(NETS).map(([k, n]) =>
    `<div class="netrow"><label class="chk"><input type="checkbox" name="net-${k}" ${d.reseaux.includes(k) ? 'checked' : ''}> <b style="color:${n.c}">${n.l}</b></label><input name="lien-${k}" placeholder="Adresse de la page ou du compte" value="${esc(d.liensReseaux?.[k] || '')}"></div>`).join('')
    + f('Site internet', 'lien-site', d.liensReseaux?.site || '');
  if (s === 2) return `${f('Zone géographique', 'zone', d.zone, 'placeholder="Ex. Grand Est (Vosges, Alsace)"')}${ta('Cible', 'cible', d.cible, 'Qui veux-tu toucher ?', 3)}${ta('Ton et style (tutoiement / vouvoiement…)', 'ton', d.ton, 'Ex. Expert, rassurant, vouvoiement', 3)}`;
  if (s === 3) return `${ta('Offres et actualités à mettre en avant', 'offres', d.offres, '', 4)}${ta('Sujets à éviter', 'eviter', d.eviter, 'Ex. ne jamais citer les marques', 3)}${ta('Consignes permanentes (piliers de contenu, style visuel, appel à l\'action…)', 'consignes', d.consignes, '', 10)}`;
  if (s === 4) return `<div class="days">${JOURS.map((j, i) => `<label class="chk day"><input type="checkbox" name="jour-${i}" ${d.jours.includes(i) ? 'checked' : ''}> ${j}</label>`).join('')}</div>
    <div class="two"><label>Heure de publication<input type="time" name="heure" value="${esc(d.heure || '10:00')}"></label><label>Posts par semaine<input type="number" min="1" max="14" name="postsParSemaine" value="${esc(d.postsParSemaine || 2)}"></label></div>
    ${ta('Mots-clés de veille (un par ligne)', 'veille', (d.veilleMots || []).join('\n'), '', 4)}`;
  if (s === 5) return wizDossiers();
  if (s === 6) return wizRegles();
}
function wizDossiers() {
  const d = app.wiz.data;
  const blocks = Object.entries(ROLES_DOSSIER).map(([role, label]) => {
    const items = d.dossiers.filter(x => x.role === role).map(x => `<li data-did="${esc(x.id)}"><div><b>${esc(x.nom)}</b>${x.indic ? `<div class="muted small">${esc(x.indic)}</div>` : ''}<div class="small" data-link="${esc(x.id)}">…</div></div>
      <div class="row"><button type="button" class="btn sm" data-act="dos-link" data-id="${esc(x.id)}">Choisir le dossier</button>${role === 'enregistrement' ? `<button type="button" class="btn sm ghost" data-act="dos-test" data-id="${esc(x.id)}">Tester</button>` : ''}${role === 'sources' ? `<button type="button" class="btn sm ghost" data-act="dos-voir" data-id="${esc(x.id)}">Voir les photos</button>` : ''}<button type="button" class="btn sm ghost danger" data-act="dos-del" data-id="${esc(x.id)}">✕</button></div></li>`).join('');
    return `<div class="dosblock"><h3>${label}</h3><ul class="dos">${items || '<li class="muted">Aucun dossier.</li>'}</ul>
      <div class="row"><input id="newdos-${role}" placeholder="Nom du nouveau dossier (ex. Photos chantiers)"><button type="button" class="btn sm" data-act="dos-add" data-role="${role}">+ Ajouter</button></div></div>`;
  }).join('');
  return `<p class="muted">Un dossier peut être local ou sur Google Drive pour ordinateur (disque G:) ou pCloud : pour le logiciel, c'est pareil. ${FS.supported() ? 'Le choix du dossier est propre à <b>cet ordinateur</b> : sur un autre PC, il faudra le « choisir » à nouveau.' : '<b class="bad">Ce navigateur ne gère pas les dossiers : utilise Chrome ou Edge sur ordinateur.</b>'}</p>${blocks}`;
}
function wizRegles() {
  const d = app.wiz.data;
  const reg = d.regles.map(r => `<li><label class="chk"><input type="checkbox" data-rid="${esc(r.id)}" ${r.actif !== false ? 'checked' : ''}> ${esc(r.texte)}</label><button type="button" class="btn sm ghost danger" data-act="reg-del" data-id="${esc(r.id)}">✕</button></li>`).join('');
  const con = d.contacts.map(c => `<li><div><b>${esc(c.nom)}</b> <span class="chip">${c.type === 'groupe' ? 'Groupe' : 'Contact'}</span><div class="muted small">${esc(c.tel)}</div></div><button type="button" class="btn sm ghost danger" data-act="con-del" data-id="${esc(c.id)}">✕</button></li>`).join('');
  const ret = d.retours.map((r, i) => `<li><div><span class="muted small">${fmtDate(r.date)} · ${esc(r.type || '')}</span><div>${esc(r.texte)}</div></div><button type="button" class="btn sm ghost danger" data-act="ret-del" data-i="${i}">Oublier</button></li>`).join('');
  return `<h3>Règles propres à cette société</h3><p class="muted small">Les règles communes à toutes les sociétés se gèrent dans Réglages. Celles-ci s'y ajoutent.</p>
  <ul class="dos">${reg || '<li class="muted">Aucune règle propre.</li>'}</ul><div class="row"><input id="newreg" placeholder="Ex. Ne jamais citer les marques des produits"><button type="button" class="btn sm" data-act="reg-add">+ Ajouter</button></div>
  <h3>WhatsApp : contacts et groupes</h3><ul class="dos">${con || '<li class="muted">Aucun contact enregistré.</li>'}</ul>
  <div class="row"><input id="con-nom" placeholder="Nom"><select id="con-type"><option value="contact">Contact</option><option value="groupe">Groupe</option></select><input id="con-tel" placeholder="Numéro (06…) ou lien du groupe"><button type="button" class="btn sm" data-act="con-add">+ Ajouter</button></div>
  <label>Numéro WhatsApp de la société<input name="waNumero" value="${esc(d.waNumero)}"></label>
  <h3>Retours déjà enregistrés (${d.retours.length})</h3><ul class="dos">${ret || '<li class="muted">Aucun retour.</li>'}</ul>`;
}
function collectStep() {
  const m = $('#modal'); if (!m) return; const d = app.wiz.data, s = app.wiz.step, g = n => m.querySelector(`[name="${n}"]`)?.value ?? '';
  if (s === 0) Object.assign(d, { nom: g('nom').trim(), domaine: g('domaine'), couleur: g('couleur'), couleur2: g('couleur2'), police: g('police'), policeTexte: g('policeTexte') });
  if (s === 1) { d.reseaux = Object.keys(NETS).filter(k => m.querySelector(`[name="net-${k}"]`)?.checked); d.liensReseaux = {}; [...Object.keys(NETS), 'site'].forEach(k => { const v = g('lien-' + k).trim(); if (v) d.liensReseaux[k] = v; }); }
  if (s === 2) Object.assign(d, { zone: g('zone'), cible: g('cible'), ton: g('ton') });
  if (s === 3) Object.assign(d, { offres: g('offres'), eviter: g('eviter'), consignes: g('consignes') });
  if (s === 4) { d.jours = JOURS.map((_, i) => i).filter(i => m.querySelector(`[name="jour-${i}"]`)?.checked); d.heure = g('heure') || '10:00'; d.postsParSemaine = Math.max(1, Number(g('postsParSemaine')) || 2); d.veilleMots = g('veille').split('\n').map(x => x.trim()).filter(Boolean); }
  if (s === 6) { d.waNumero = g('waNumero'); $$('[data-rid]', m).forEach(c => { const r = d.regles.find(x => x.id === c.dataset.rid); if (r) r.actif = c.checked; }); }
}
async function renderWiz() {
  const w = app.wiz; if (!w) { $('#modal')?.remove(); return; }
  let m = $('#modal'); if (!m) { m = document.createElement('div'); m.id = 'modal'; document.body.appendChild(m); }
  m.innerHTML = `<div class="dialog"><header><h2>${w.isNew ? 'Nouvelle société' : esc(w.data.nom || 'Société')}</h2><button class="btn ghost" data-act="wiz-close">✕</button></header>
  <ol class="steps">${STEPS.map((t, i) => `<li class="${i === w.step ? 'on' : i < w.step ? 'done' : ''}" data-act="wiz-go" data-i="${i}">${i + 1}. ${t}</li>`).join('')}</ol>
  <form class="body" id="wizform" onsubmit="return false">${wizBody()}</form>
  <footer>${w.step > 0 ? '<button class="btn ghost" data-act="wiz-prev">← Précédent</button>' : '<span></span>'}<div class="row">${w.step < STEPS.length - 1 ? '<button class="btn" data-act="wiz-next">Suivant →</button>' : ''}<button class="btn ${w.step === STEPS.length - 1 ? '' : 'ghost'}" data-act="wiz-save">Enregistrer</button></div></footer></div>`;
  if (w.step === 5) for (const el of $$('[data-link]', m)) { el.textContent = (await FS.linkedName(w.id, el.dataset.link)) ? '✔ Lié sur cet ordinateur : ' + (await FS.linkedName(w.id, el.dataset.link)) : '○ À choisir sur cet ordinateur'; }
}

/* ----------------------------- Accès ----------------------------- */
async function loadAcces() {
  try { app.acces = (await S.api.accesList()).rows; } catch (e) { app.acces = null; toast(e.message); }
  render();
}
function viewAcces() {
  if (!isAdmin()) return '<h1>Accès</h1><section class="card"><p>Réservé aux administrateurs.</p></section>';
  if (!app.acces) return `<h1>Accès</h1><section class="card"><p>Chargement de la liste… (connexion nécessaire)</p><button class="btn" data-act="acces-load">Réessayer</button></section>`;
  const row = (r, i) => {
    const all = (r.societes || '*').trim() === '*'; const sel = (r.societes || '').split(/[,;]/).map(x => x.trim());
    return `<tr data-i="${i}"><td><input class="a-email" value="${esc(r.email)}" placeholder="prenom@gmail.com"></td>
      <td><select class="a-role">${[['admin', 'Administrateur'], ['edition', 'Modification'], ['lecture', 'Lecture seule']].map(([v, l]) => `<option value="${v}" ${r.role === v ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
      <td><label class="chk"><input type="checkbox" class="a-all" ${all ? 'checked' : ''}> Toutes</label> ${app.societes.map(s => `<label class="chk"><input type="checkbox" class="a-soc" value="${esc(s.id)}" ${!all && sel.includes(s.id) ? 'checked' : ''}> ${esc(s.nom)}</label>`).join(' ')}</td>
      <td><input class="a-note" value="${esc(r.note || '')}" placeholder="Note"></td><td><button class="btn sm ghost danger" data-act="acces-del" data-i="${i}">✕</button></td></tr>`;
  };
  return `<h1>Accès</h1><section class="card"><p class="muted">Seules les adresses Google listées ici peuvent utiliser le logiciel. Le propriétaire de la feuille est toujours administrateur.</p>
  <div class="tablewrap"><table class="acces"><thead><tr><th>Adresse Google</th><th>Droit</th><th>Sociétés autorisées</th><th>Note</th><th></th></tr></thead><tbody>${app.acces.filter(r => r.note !== 'Propriétaire').map(row).join('')}</tbody></table></div>
  <div class="row"><button class="btn ghost" data-act="acces-add">+ Ajouter une adresse</button><button class="btn" data-act="acces-save">Enregistrer les accès</button></div></section>`;
}
function collectAcces() {
  return $$('.acces tbody tr').map(tr => {
    const all = $('.a-all', tr).checked, socs = $$('.a-soc', tr).filter(c => c.checked).map(c => c.value);
    return { email: $('.a-email', tr).value.trim(), role: $('.a-role', tr).value, societes: all || !socs.length ? '*' : socs.join(','), note: $('.a-note', tr).value };
  }).filter(r => r.email);
}

/* ----------------------------- Réglages ----------------------------- */
function viewReglages() {
  const ia = IA.conf(); const g = app.regles?.globales || [];
  return `<h1>Réglages</h1>
  <section class="card"><h2>Connexion</h2><label>Adresse du script (passerelle Google)<input id="set-url" value="${esc(S.cfg.url)}"></label><label>Identifiant client Google<input id="set-cid" value="${esc(S.cfg.clientId)}"></label>
  <div class="row"><button class="btn" data-act="set-save">Enregistrer</button><button class="btn ghost" data-act="signout">Se déconnecter</button></div></section>
  <section class="card"><h2>Règles communes à toutes les sociétés</h2><p class="muted small">Ces règles sont rappelées à chaque génération de texte et appliquées à la fabrication des visuels et vidéos (séance 3).</p>
  <ul class="dos" id="g-regles">${g.map(r => `<li><label class="chk"><input type="checkbox" data-gid="${esc(r.id)}" ${r.actif !== false ? 'checked' : ''} ${canEdit() ? '' : 'disabled'}> ${esc(r.texte)}</label>${isAdmin() ? `<button class="btn sm ghost danger" data-act="g-del" data-id="${esc(r.id)}">✕</button>` : ''}</li>`).join('')}</ul>
  ${isAdmin() ? `<div class="row"><input id="g-new" placeholder="Nouvelle règle commune"><button class="btn sm" data-act="g-add">+ Ajouter</button><button class="btn sm" data-act="g-save">Enregistrer les cases</button></div>
  <label>Règles de visibilité (réseaux sociaux)<textarea id="g-vis" rows="6">${esc(app.regles?.visibilite || '')}</textarea></label><button class="btn sm" data-act="g-vis-save">Enregistrer</button>` : ''}</section>
  <section class="card"><h2>Archivage mensuel</h2><p class="muted">Chaque mois, les posts <b>publiés</b> du mois écoulé sont rangés dans un fichier ZIP par société (par exemple <code>2026-11_Solar-Bat.zip</code>), puis supprimés de l'application et de la feuille Google, <b>seulement après vérification</b> que le ZIP est bien écrit. Les posts non publiés ne sont jamais archivés ni supprimés.</p>
  <label>Où ranger les archives<select id="arch-lieu" data-chg="arch-lieu" ${isAdmin() ? '' : 'disabled'}>${Object.entries(Arch.LIEUX).map(([k, v]) => `<option value="${k}" ${app.params.archiveStockage === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
  <p class="muted small">Le dossier « Archives » de chaque société se choisit une fois sur cet ordinateur : Sociétés › Modifier › Dossiers.</p>
  <div class="row">${canEdit() && FS.supported() ? `<button class="btn" data-act="arch-open" ${app.archItems.length ? '' : 'disabled'}>${app.archItems.length ? 'Archiver ' + esc(Arch.libelle(app.archItems)) : 'Rien à archiver'}</button>` : '<span class="muted small">L\'archivage se fait depuis Chrome ou Edge sur ordinateur.</span>'}</div></section>
  <section class="card"><h2>IA (optionnelle)</h2><p class="muted small">Aucun texte n'est envoyé à une IA sans ton clic. La clé et les réglages restent sur cet ordinateur uniquement.</p>
  <label>Mode<select id="ia-mode">${Object.entries(IA.MODES).map(([k, v]) => `<option value="${k}" ${ia.mode === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
  <div class="two"><label>Clé API Claude<input id="ia-key" type="password" value="${esc(ia.apiKey)}" placeholder="sk-ant-…"></label><label>Modèle Claude<input id="ia-model" value="${esc(ia.apiModel)}"></label></div>
  <div class="two"><label>Adresse d'Ollama<input id="ia-ourl" value="${esc(ia.ollamaUrl)}"></label><label>Modèle Ollama<input id="ia-omodel" value="${esc(ia.ollamaModel)}"></label></div>
  <div class="row"><button class="btn" data-act="ia-save">Enregistrer</button><button class="btn ghost" data-act="ia-test">Tester</button></div><pre id="ia-out" class="muted small"></pre></section>
  <section class="card"><h2>Données</h2><p class="muted">Importées de l'ancienne appli : ${app.imported ? new Date(app.imported).toLocaleString('fr-FR') : 'jamais'}.</p>
  <div class="row">${canEdit() ? '<button class="btn ghost" data-act="import">Importer (sans écraser)</button>' : ''}${isAdmin() ? '<button class="btn ghost danger" data-act="import-force">Réimporter en écrasant</button>' : ''}<button class="btn ghost" data-act="clear-cache">Vider le cache de cet appareil</button></div>
  <p class="muted small">Version ${VERSION}</p></section>`;
}

function viewAide() {
  return `<h1>Aide</h1>
  <section class="card"><h2>Comment ça marche</h2><ul>
  <li><b>Tes données</b> sont dans une feuille Google Sheets de ton Drive. Le logiciel est une page web installée sur GitHub Pages.</li>
  <li><b>Hors connexion</b> : tu peux consulter et modifier. Tout est envoyé automatiquement au retour du réseau (compteur « en attente » en haut).</li>
  <li><b>Installer sur PC / téléphone</b> : dans Chrome ou Edge, menu ⋮ puis « Installer Pilote Réseaux » (sur iPhone : Partager puis « Sur l'écran d'accueil »).</li>
  <li><b>Dossiers</b> : seulement sur ordinateur (Chrome ou Edge). Le choix du dossier est à refaire une fois sur chaque ordinateur ; ensuite il est mémorisé.</li>
  <li><b>Médias</b> : les fichiers restent dans les dossiers d'enregistrement du PC. Nomme-les « Société - AAAA-MM-JJ - Titre du post - Réseau » (ex. « … - TikTok.mp4 », « … - Instagram carrousel 2.jpg », « … - Story 1.jpg ») : dans À valider, « Rattacher automatiquement » les retrouve. Le téléphone ne voit que la miniature.</li>
  <li><b>Archives</b> : le 1er de chaque mois, le logiciel propose « Archiver … ? » sur ordinateur : un ZIP par société est rangé dans le dossier Archives (G: et/ou P:), puis les posts publiés sont retirés de l'application.</li>
  <li><b>Droits</b> : administrateur (tout), modification, lecture seule ; chaque personne peut être limitée à certaines sociétés (écran Accès).</li></ul></section>
  <section class="card"><h2>Ollama (IA locale, optionnelle)</h2><p>Installe Ollama (ollama.com), puis dans une invite de commandes : <code>ollama pull llama3.1</code>. Pour autoriser le logiciel, définis la variable d'environnement <code>OLLAMA_ORIGINS</code> avec l'adresse de ton logiciel, puis relance Ollama. Voir le guide d'installation.</p></section>
  <section class="card"><h2>Besoin d'aide ?</h2><p>Reviens dans une conversation Claude avec le fichier GUIDE-INSTALLATION.md : colle-le et décris l'erreur affichée.</p></section>`;
}

/* ============================== Rendu principal ============================== */
function gate() {
  if (!S.cfg.ready) return `<div class="gate"><h1>Pilote Réseaux</h1><p>Première connexion : renseigne les 2 informations créées pendant l'installation (voir GUIDE-INSTALLATION.md).</p>
    <label>Adresse du script (se termine par /exec)<input id="set-url" placeholder="https://script.google.com/macros/s/…/exec"></label>
    <label>Identifiant client Google (se termine par .apps.googleusercontent.com)<input id="set-cid"></label>
    <button class="btn" data-act="set-save">Enregistrer</button></div>`;
  return `<div class="gate"><h1>Pilote Réseaux</h1><p>Connecte-toi avec ton compte Google autorisé.</p><div id="gbtn"></div>${S.state.error ? `<p class="bad">${esc(S.state.error)}</p>` : ''}</div>`;
}
function view() {
  switch (app.route) {
    case 'accueil': return viewAccueil();
    case 'avalider': return E.viewAvalider();
    case 'planning': return E.viewPlanning();
    case 'publier': return E.viewPublier();
    case 'societes': return viewSocietes();
    case 'acces': return viewAcces();
    case 'reglages': return viewReglages();
    case 'aide': return viewAide();
  }
}
function render() {
  const root = $('#app');
  const needLogin = !S.cfg.ready || (!S.tokenValid() && !S.savedEmail());
  root.innerHTML = needLogin ? gate() : shell(view());
  if (!needLogin) Media.hydrater(root, app).catch(e => console.warn('Médias', e));
  if (S.cfg.ready) { const b = $('#gbtn') || $('#gbtn-inline'); if (b && navigator.onLine) S.renderButton(b).catch(() => {}); }
  if (app.route === 'acces' && isAdmin() && !app.acces && !app._loadingAcces) { app._loadingAcces = true; loadAcces().finally(() => app._loadingAcces = false); }
}
async function refresh() { await loadAll(); if (!$('#modal') && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) render(); }
function go(r) { app.route = r; location.hash = '#/' + r; render(); $('.content')?.classList.add('enter'); window.scrollTo(0, 0); }

/* ============================== Actions ============================== */
const E = createEcrans({ app, esc, toast, copy, canEdit, S, $, $$, refresh: () => refresh(), render: () => render(), go: r => go(r) });
const A = {
  nav: t => go(t.dataset.r),
  theme: () => { setTheme(theme() === 'dark' ? 'light' : 'dark'); render(); },
  'side-toggle': () => { try { localStorage.setItem('pr.side', collapsed() ? '0' : '1'); } catch {} render(); },
  'tile-go': t => { app.ui.filtre = t.dataset.s; app.ui.statut = t.dataset.st; app.ui.focus = null; go('avalider'); },
  sync: async () => { await S.sync(); await refresh(); },
  'set-save': async () => { const u = $('#set-url').value.trim(), c = $('#set-cid').value.trim(); if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(u)) return toast("L'adresse du script doit se terminer par /exec"); if (!/\.apps\.googleusercontent\.com$/.test(c)) return toast("L'identifiant client doit se terminer par .apps.googleusercontent.com"); S.cfg.set(u, c); await S.initAuth().catch(() => {}); toast('Enregistré'); render(); },
  signout: () => { S.signOut(); render(); },
  import: () => { const i = document.createElement('input'); i.type = 'file'; i.multiple = true; i.accept = '.json'; i.onchange = () => A['import-run']([...i.files]); i.click(); },
  'import-run': async files => { try { toast('Import en cours…'); const r = await importerAncienneAppli({ files }); await S.refreshPending(); await refresh(); toast(`Importé : ${r.societes} société(s), ${r.posts} post(s), ${r.videos} vidéo(s) (${r.ignores} déjà présents)`); S.sync().then(refresh); } catch (e) { toast(e.message); } },
  'import-force': () => { if (!confirm("Réimporter en écrasant les sociétés et posts d'origine ? Tes modifications faites depuis seront perdues pour ces éléments.")) return; const i = document.createElement('input'); i.type = 'file'; i.multiple = true; i.accept = '.json'; i.onchange = () => A['import-force-run']([...i.files]); i.click(); },
  'import-force-run': async files => { try { const r = await importerAncienneAppli({ files, force: true }); await refresh(); toast(`Réimporté : ${r.societes} société(s), ${r.posts} post(s)`); S.sync().then(refresh); } catch (e) { toast(e.message); } },
  'clear-cache': async () => { if (!confirm("Vider le cache de cet appareil ? Les modifications non envoyées seraient perdues.")) return; const keep = ['pr.scriptUrl', 'pr.clientId', 'pr.ia']; await new Promise(r => { const q = indexedDB.deleteDatabase('pilote-reseaux'); q.onsuccess = q.onerror = q.onblocked = r; }); Object.keys(localStorage).filter(k => !keep.includes(k)).forEach(k => localStorage.removeItem(k)); location.reload(); },
  /* sociétés */
  'soc-new': () => { app.wiz = { id: newSocieteId(''), isNew: true, step: 0, data: normalizeSociete('new', { nom: '' }) }; renderWiz(); },
  'soc-edit': t => { const s = app.societes.find(x => x.id === t.dataset.id); const { id, ...data } = s; app.wiz = { id, isNew: false, step: 0, data: structuredClone(data) }; renderWiz(); },
  'soc-del': async t => { const s = app.societes.find(x => x.id === t.dataset.id); if (!confirm(`Supprimer « ${s.nom} » ? Ses posts resteront dans la feuille mais ne seront plus affichés.`)) return; await DB.removeDoc('entreprises', s.id); await S.refreshPending(); await refresh(); S.sync().then(refresh); },
  'wiz-close': () => { if (confirm('Fermer sans enregistrer les dernières modifications ?')) { app.wiz = null; renderWiz(); } },
  'wiz-next': () => { collectStep(); if (app.wiz.step === 0 && !app.wiz.data.nom) return toast('Donne un nom à la société'); app.wiz.step++; renderWiz(); },
  'wiz-prev': () => { collectStep(); app.wiz.step--; renderWiz(); },
  'wiz-go': t => { collectStep(); app.wiz.step = Number(t.dataset.i); renderWiz(); },
  'wiz-save': async () => { collectStep(); const w = app.wiz; if (!w.data.nom) { w.step = 0; renderWiz(); return toast('Donne un nom à la société'); } await DB.saveDoc('entreprises', w.id, { ...w.data, majLe: new Date().toISOString() }); app.wiz = null; renderWiz(); await S.refreshPending(); await refresh(); toast('Société enregistrée'); S.sync().then(refresh); },
  logo: t => { const f = t.files[0]; if (!f) return; collectStep(); const img = new Image(); img.onload = () => { let max = 256, url; do { const k = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); url = c.toDataURL('image/png'); max -= 48; } while (url.length > 42000 && max > 48); app.wiz.data.logo = url; renderWiz(); }; img.onerror = () => toast('Image illisible'); img.src = URL.createObjectURL(f); },
  'logo-del': () => { collectStep(); app.wiz.data.logo = ''; renderWiz(); },
  'dos-add': t => { collectStep(); const role = t.dataset.role, inp = $('#newdos-' + role); const nom = inp.value.trim(); if (!nom) return toast('Donne un nom au dossier'); app.wiz.data.dossiers.push({ id: uid('d'), role, nom, indic: '' }); renderWiz(); },
  'dos-del': async t => { collectStep(); const d = app.wiz.data; await FS.unlink(app.wiz.id, t.dataset.id); d.dossiers = d.dossiers.filter(x => x.id !== t.dataset.id); renderWiz(); },
  'dos-link': async t => { try { const n = await FS.link(app.wiz.id, t.dataset.id); toast('Dossier lié : ' + n); renderWiz(); } catch (e) { if (e.name !== 'AbortError') toast(e.message); } },
  'dos-test': async t => { const h = await FS.handleOf(app.wiz.id, t.dataset.id); if (!h) return toast("Choisis d'abord le dossier sur cet ordinateur"); try { const n = await FS.testWrite(h); toast('Test réussi : fichier « ' + n + ' » créé dans le dossier'); } catch (e) { toast('Écriture impossible : ' + e.message); } },
  'dos-voir': async t => viewFolder(t.dataset.id),
  'reg-add': () => { collectStep(); const v = $('#newreg').value.trim(); if (!v) return; app.wiz.data.regles.push({ id: uid('r'), texte: v, actif: true }); renderWiz(); },
  'reg-del': t => { collectStep(); app.wiz.data.regles = app.wiz.data.regles.filter(r => r.id !== t.dataset.id); renderWiz(); },
  'con-add': () => { collectStep(); const nom = $('#con-nom').value.trim(), tel = $('#con-tel').value.trim(); if (!nom || !tel) return toast('Nom et numéro (ou lien) requis'); app.wiz.data.contacts.push({ id: uid('c'), nom, type: $('#con-type').value, tel }); renderWiz(); },
  'con-del': t => { collectStep(); app.wiz.data.contacts = app.wiz.data.contacts.filter(c => c.id !== t.dataset.id); renderWiz(); },
  'ret-del': t => { collectStep(); app.wiz.data.retours.splice(Number(t.dataset.i), 1); renderWiz(); },
  /* accès */
  'acces-load': () => loadAcces(),
  'acces-add': () => { app.acces = [...collectAcces(), { email: '', role: 'edition', societes: '*', note: '' }, ...app.acces.filter(r => r.note === 'Propriétaire')]; render(); },
  'acces-del': t => { const rows = collectAcces(); rows.splice(Number(t.dataset.i), 1); app.acces = rows; render(); },
  'acces-save': async () => { try { const rows = collectAcces(); const bad = rows.find(r => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email)); if (bad) return toast('Adresse invalide : ' + bad.email); await S.api.accesSave(rows); app.acces = null; toast('Accès enregistrés'); loadAcces(); } catch (e) { toast(e.message); } },
  /* réglages */
  'g-add': async () => { const v = $('#g-new').value.trim(); if (!v) return; const r = structuredClone(app.regles); r.globales.push({ id: uid('g'), texte: v, actif: true }); await DB.saveDoc('parametres', 'regles', r); await S.refreshPending(); await refresh(); S.sync(); },
  'g-del': async t => { const r = structuredClone(app.regles); r.globales = r.globales.filter(x => x.id !== t.dataset.id); await DB.saveDoc('parametres', 'regles', r); await refresh(); S.sync(); },
  'g-save': async () => { const r = structuredClone(app.regles); $$('[data-gid]').forEach(c => { const x = r.globales.find(y => y.id === c.dataset.gid); if (x) x.actif = c.checked; }); await DB.saveDoc('parametres', 'regles', r); await refresh(); toast('Règles enregistrées'); S.sync(); },
  'g-vis-save': async () => { const r = structuredClone(app.regles); r.visibilite = $('#g-vis').value; await DB.saveDoc('parametres', 'regles', r); await refresh(); toast('Enregistré'); S.sync(); },
  'arch-lieu': async t => { await DB.saveDoc('parametres', 'app', { ...app.params, archiveStockage: t.value }); await refresh(); toast('Enregistré'); S.sync(); },
  'arch-open': () => { app.arch = { items: app.archItems.slice(), etape: 'confirm', rapport: [], msg: '' }; renderArch(); },
  'arch-close': async () => { app.arch = null; renderArch(); await loadAll(); render(); },
  'arch-run': async () => {
    const a = app.arch; a.etape = 'run'; renderArch();
    try { a.rapport = await Arch.archiver(app, a.items, app.params.archiveStockage, true, m => { a.msg = m; renderArch(); }); } catch (e) { a.rapport = [{ societe: { nom: '?' }, mois: '', ok: false, msg: e.message }]; }
    a.etape = 'fin'; await S.refreshPending(); await loadAll(); renderArch(); S.sync().then(loadAll);
  },
  'ia-save': () => { IA.saveConf({ mode: $('#ia-mode').value, apiKey: $('#ia-key').value.trim(), apiModel: $('#ia-model').value.trim(), ollamaUrl: $('#ia-ourl').value.trim(), ollamaModel: $('#ia-omodel').value.trim() }); toast('IA enregistrée'); },
  'ia-test': async () => { A['ia-save'](); const out = $('#ia-out'); out.textContent = 'Test…'; try { const s = app.societes[0]; const r = await IA.demander(s ? await IA.brief(s, app.regles) + '\n\nRéponds par OK.' : 'Réponds par OK.'); out.textContent = r.aCopier ? "Mode copier-coller : le texte à coller dans ton chat Claude est prêt (copié)." : 'Réponse : ' + r.texte.slice(0, 200); if (r.aCopier) copy(r.aCopier); } catch (e) { out.textContent = 'Échec : ' + e.message; } },
};

function renderArch() {
  const a = app.arch; let m = $('#modal'); if (!a) { m?.remove(); return; }
  if (!m) { m = document.createElement('div'); m.id = 'modal'; document.body.appendChild(m); }
  const lieu = Arch.LIEUX[app.params.archiveStockage] || '';
  const lignes = a.items.map(i => `<li><div><b>${esc(i.societe.nom)}</b> · ${esc(Arch.libelleMois(i.mois))}<div class="muted small">${i.posts.length} post(s) publié(s) → ${esc(i.mois)}_${esc(i.societe.nom.trim().replace(/\s+/g, '-'))}.zip</div></div></li>`).join('');
  const corps = a.etape === 'confirm' ? `<p>Un ZIP par société et par mois sera écrit dans le dossier Archives (<b>${esc(lieu)}</b>), relu pour vérification, et seulement ensuite les posts seront supprimés de l'application et de la feuille Google.</p><ul class="dos">${lignes}</ul>`
    : a.etape === 'run' ? `<p>Archivage en cours, ne ferme pas cette fenêtre…</p><p class="muted">${esc(a.msg)}</p>`
      : `<ul class="dos">${a.rapport.map(r => `<li><div><b>${r.ok ? '✔' : '✖'} ${esc(r.societe.nom)}</b> · ${esc(r.mois ? Arch.libelleMois(r.mois) : '')}<div class="${r.ok ? 'muted' : 'bad'} small">${esc(r.msg)}</div></div></li>`).join('')}</ul>`;
  m.innerHTML = `<div class="dialog"><header><h2>Archiver ${esc(Arch.libelle(a.items))} ?</h2>${a.etape !== 'run' ? '<button class="btn ghost" data-act="arch-close">✕</button>' : ''}</header><div class="body">${corps}</div>
    <footer><span></span>${a.etape === 'confirm' ? '<button class="btn" data-act="arch-run">Lancer l\'archivage</button>' : a.etape === 'fin' ? '<button class="btn" data-act="arch-close">Fermer</button>' : ''}</footer></div>`;
}

async function viewFolder(did) {
  const w = app.wiz, h = await FS.handleOf(w.id, did); if (!h) return toast("Choisis d'abord le dossier sur cet ordinateur");
  try { if (!(await FS.ensurePermission(h))) return toast('Autorisation refusée'); } catch (e) { return toast(e.message); }
  const files = (await FS.listFiles(h, { kinds: ['image', 'video'] })), key = 'pr.sel.' + w.id + '|' + did; const sel = new Set(JSON.parse(localStorage.getItem(key) || '[]'));
  const ov = document.createElement('div'); ov.id = 'viewer'; ov.innerHTML = `<div class="dialog wide"><header><h2>${esc(h.name)} — ${files.length} fichier(s)</h2><button class="btn ghost" id="vclose">✕</button></header><p class="muted small" style="padding:0 16px">Coche les photos à utiliser (mémorisé sur cet ordinateur).</p><div class="thumbs" id="thumbs"></div></div>`;
  document.body.appendChild(ov); $('#vclose', ov).onclick = () => ov.remove();
  const box = $('#thumbs', ov); const io = new IntersectionObserver(es => es.forEach(async e => { if (!e.isIntersecting) return; io.unobserve(e.target); const f = files[e.target.dataset.i]; if (f.kind === 'image') { try { e.target.querySelector('.ph').outerHTML = `<img loading="lazy" src="${URL.createObjectURL(await f.handle.getFile())}">`; } catch {} } else e.target.querySelector('.ph').textContent = '🎬'; }));
  files.forEach((f, i) => { const d = document.createElement('label'); d.className = 'th'; d.dataset.i = i; d.innerHTML = `<div class="ph"></div><input type="checkbox" ${sel.has(f.path) ? 'checked' : ''}><span>${esc(f.name)}</span>`; $('input', d).onchange = ev => { ev.target.checked ? sel.add(f.path) : sel.delete(f.path); localStorage.setItem(key, JSON.stringify([...sel])); }; box.appendChild(d); io.observe(d); });
}

Object.assign(A, E.actions);

document.addEventListener('click', e => { const t = e.target.closest('[data-act]'); if (!t || t.tagName === 'INPUT' && ['file', 'checkbox'].includes(t.type) || t.tagName === 'SELECT') return; const f = A[t.dataset.act]; if (f) { e.preventDefault(); f(t, e); } });
document.addEventListener('change', e => { const t = e.target; if (t.matches('input[type=file][data-act], input[type=checkbox][data-act]')) A[t.dataset.act]?.(t, e); if (t.matches('select[data-chg]')) A[t.dataset.chg]?.(t, e); if (t.classList?.contains('a-all') && t.checked) $$('.a-soc', t.closest('tr')).forEach(c => c.checked = false); if (t.classList?.contains('a-soc') && t.checked) $('.a-all', t.closest('tr')).checked = false; });

/* ================================ Démarrage ================================ */
/** Séance 2 : dossiers « Archives » G:/P: pour chaque société ; plus de suppression automatique côté serveur (l'archivage la remplace). */
async function migrerSeance2() {
  try {
    if (!canEdit()) return;
    let change = (await Arch.ensureArchiveDossiers(app)) > 0;
    if (await Media.ensureDossiersLocaux(app)) change = true;
    const avant = JSON.stringify((await DB.getDoc('parametres', 'regles'))?.data || {}); await ensureParametres(); if (JSON.stringify((await DB.getDoc('parametres', 'regles'))?.data || {}) !== avant) change = true;
    if (isAdmin() && Number(app.params.retentionJours) < 365) { await DB.saveDoc('parametres', 'app', { ...app.params, retentionJours: 365 }); change = true; }
    for (const x of await DB.listDocs('posts')) { const d = x.data; if (['a_creer', 'idee'].includes(d.statut) && d.media?.fichiers?.length) { await DB.saveDoc('posts', x.id, { ...d, statut: 'a_valider', majLe: new Date().toISOString() }); change = true; } }   // v1.3.1 : posts « En production » qui ont déjà leur média
    if (change) { await S.refreshPending(); await loadAll(); render(); S.sync().then(refresh); }
  } catch (e) { console.warn('Migration séance 2', e); }
}

function ripple(e) {
  const b = e.target.closest?.('.btn'); if (!b || b.disabled) return;
  const r = b.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2, x = document.createElement('span');
  x.className = 'rip'; x.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
  b.appendChild(x); setTimeout(() => x.remove(), 520);
}

export async function start() {
  document.addEventListener('pointerdown', ripple, { passive: true });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  const h = location.hash.replace('#/', ''); if (NAV.some(n => n[0] === h)) app.route = h;
  await loadAll(); render();
  await migrerSeance2();
  S.onState(() => { if ($('#modal') || $('#viewer')) return; if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) return; render(); });
  S.onState(async s => { if (s.user && s.user.email !== app.user?.email) { await DB.setMeta('user', s.user); app.user = s.user; } });
  S.setOnLogin(async () => { await loadAll(); render(); S.startAutoSync(refresh); });
  if (S.cfg.ready) { await S.initAuth().catch(() => {}); if (S.tokenValid() || S.savedEmail()) S.startAutoSync(refresh); }
  window.addEventListener('hashchange', () => { const r = location.hash.replace('#/', ''); if (NAV.some(n => n[0] === r) && r !== app.route) { app.route = r; render(); } });
}
