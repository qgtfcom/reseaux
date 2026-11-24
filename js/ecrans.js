// Écrans de la séance 2 : À valider, Planning (avec temps forts) et Publier (avec WhatsApp).
import * as DB from './db.js';
import * as IA from './ia.js';
import { NETS, STATUTS, JOURS, uid } from './model.js';
import { iso, addDays, monday, eventsIn } from './events.js';
import * as FS from './fs.js';
import * as M from './media.js';
import { ic } from './icons.js';

const urlOk = u => typeof u === 'string' && /^(https?:|data:|blob:)/i.test(u);
const QUICK = ['Plus court', 'Plus percutant', 'Plus pro', 'Ajouter la promo', "Moins d'emojis"];

export function createEcrans(c) {
  const { app, esc, toast, copy, canEdit, S, $, $$ } = c;
  const ui = app.ui = { filtre: 'all', statut: 'a_valider', capNet: {}, editing: null, focus: null, semaine: monday(new Date()), ev: null };

  const soc = id => app.societes.find(s => s.id === id);
  const fmtJour = d => d ? new Date(d + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
  const fmtCourt = d => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  const tri = (a, b) => (String(a.date) + (a.heure || '')).localeCompare(String(b.date) + (b.heure || ''));
  const visibles = () => app.posts.filter(p => soc(p.entrepriseId) && (ui.filtre === 'all' || p.entrepriseId === ui.filtre));
  const initiales = n => String(n || '?').replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const netsDe = p => (p.reseaux || []).filter(n => NETS[n]);
  const netOf = p => { const l = netsDe(p), x = ui.capNet[p.id]; return l.includes(x) ? x : (l.includes('instagram') ? 'instagram' : l[0] || 'instagram'); };
  const legende = (p, n) => { const h = n === 'linkedin' ? (p.hashtags || '').split(/\s+/).filter(Boolean).slice(0, 4).join(' ') : p.hashtags; return (p.textes?.[n] || '') + (h && n !== 'whatsapp' ? '\n\n' + h : ''); };
  const filtreHtml = () => `<select data-chg="filtre" aria-label="Société affichée"><option value="all">Toutes les sociétés</option>${app.societes.map(s => `<option value="${esc(s.id)}" ${ui.filtre === s.id ? 'selected' : ''}>${esc(s.nom)}</option>`).join('')}</select>`;
  const reseaux = p => `<span class="nets">${netsDe(p).map(n => `<span class="net" style="--n:${NETS[n].c}">${NETS[n].l}</span>`).join('')}</span>`;
  const pill = p => `<span class="pill s-${esc(p.statut)}">${esc(STATUTS[p.statut] || p.statut)}</span>`;

  async function savePost(id, patch) {
    const p = app.posts.find(x => x.id === id); if (!p) return;
    const { id: _i, ...data } = p;
    if (patch.media?.fichiers?.length && ['a_creer', 'idee'].includes(p.statut)) patch = { ...patch, statut: 'a_valider' };   // média rattaché → le post est prêt à valider
    await DB.saveDoc('posts', id, { ...data, ...patch, majLe: new Date().toISOString() });
    await S.refreshPending(); await c.refresh(); S.sync().then(c.refresh);
  }

  /* ============================== À VALIDER ============================== */
  const aMedia = p => !!(p.media?.fichiers?.length);
  const estPasse = p => p.statut !== 'publie' && !!p.date && p.date < iso(new Date());
  function mediaLocal(p) {
    const m = p.media, f = m.fichiers, kind = m.kind || 'image', s = f.filter(x => x.role === 'story'), sl = f.filter(x => x.role === 'slide'), vi = f.filter(x => x.type === 'video');
    const cible = kind === 'video' ? [(vi[0] || f[0]).nom] : kind === 'carousel' ? sl.map(x => x.nom) : [(f.find(x => x.type === 'image' && x.role === 'principal') || f[0]).nom];
    const info = [vi.length ? (vi.length > 1 ? vi.length + ' vidéos' : '1 vidéo') : '', sl.length ? sl.length + ' images de carrousel' : '', s.length ? s.length + ' Stories' : ''].filter(Boolean).join(' · ');
    return `<div class="media" data-lm="${esc(JSON.stringify({ s: p.entrepriseId, k: kind, n: cible }))}">${urlOk(m.poster) ? `<img src="${esc(m.poster)}" alt="${esc(p.titre)}">` : '<div class="wait"><strong>Aperçu indisponible</strong></div>'}</div><div class="carnote">${esc(info)} · fichiers sur le PC</div>`;
  }
  function media(p) {
    if (aMedia(p)) return mediaLocal(p);
    const m = p.media || {}, slides = (m.slides || []).filter(urlOk), u = [m.url, slides[0]].find(urlOk);
    if (m.kind === 'carousel' && slides.length > 1) return `<div class="media car">${slides.map((s, i) => `<img src="${esc(s)}" alt="${esc(p.titre)} – image ${i + 1}" loading="lazy">`).join('')}</div><div class="carnote">${slides.length} images · fais glisser</div>`;
    if (!u) return `<div class="media"><div class="wait"><strong>Média à produire</strong><span>${esc(p.visuel || '')}</span></div></div>`;
    if (m.kind === 'video' || /\.(mp4|mov|webm)(\?|$)/i.test(u)) return `<div class="media v"><video src="${esc(u)}" controls playsinline preload="metadata"${urlOk(m.poster) ? ` poster="${esc(m.poster)}"` : ''}></video></div>`;
    return `<div class="media"><img src="${esc(u)}" alt="${esc(p.titre)}" loading="lazy"></div>`;
  }
  function apercu(p) {
    const s = soc(p.entrepriseId), n = netOf(p), nets = netsDe(p);
    return `<div class="phone"><div class="ph"><span class="ava" style="--c:${esc(s?.couleur || '#2f54eb')}">${esc(initiales(s?.nom))}</span><div><b>${esc(s?.nom)}</b><small>${esc(NETS[n]?.l)} · ${esc(fmtJour(p.date))} ${esc(p.heure || '')}</small></div></div>
      ${media(p)}
      ${nets.length > 1 ? `<div class="capnets">${nets.map(x => `<button data-act="av-net" data-id="${esc(p.id)}" data-n="${x}" aria-pressed="${x === n}">${NETS[x].l}</button>`).join('')}</div>` : ''}
      <div class="cap">${esc(legende(p, n)) || '<span class="muted">Pas de texte pour ce réseau.</span>'}</div></div>`;
  }
  function carte(p) {
    const n = netOf(p), ed = ui.editing === p.id, id = esc(p.id);
    const boutons = !canEdit() ? '' : p.statut === 'a_valider'
      ? `<div class="actions"><button class="btn big ok" data-act="av-valider" data-id="${id}">${ic('check',18)} Valider</button><button class="btn ghost" data-act="av-edit" data-id="${id}">${ic('pencil',16)} Modifier / refaire</button></div>`
      : p.statut === 'pret' ? `<div class="actions"><button class="btn ghost" data-act="av-annuler" data-id="${id}">Annuler la validation</button><button class="btn ghost" data-act="av-edit" data-id="${id}">${ic('pencil',16)} Modifier / refaire</button></div>`
        : p.statut === 'publie' ? '' : `<div class="actions"><button class="btn ghost" data-act="av-edit" data-id="${id}">${ic('pencil',16)} Modifier / refaire</button></div>`;
    const bmedia = canEdit() && p.statut !== 'publie' ? `<div class="actions"><button class="btn ghost" data-act="med-open" data-id="${id}">${ic('clip',16)} ${aMedia(p) ? 'Changer le média' : 'Rattacher un média'}</button>${aMedia(p) ? `<button class="btn ghost danger" data-act="med-retirer" data-id="${id}">Retirer</button>` : ''}</div>` : '';
    const passe = estPasse(p), sc = soc(p.entrepriseId);
    const bsuppr = canEdit() && p.statut !== 'publie' ? `<div class="actions one"><button class="btn ghost danger" data-act="av-suppr" data-id="${id}">${ic('trash',16)} Supprimer ce post${aMedia(p) ? ' et sa vidéo' : ''}</button></div>` : '';
    return `<article class="review ${passe ? 'passe' : ''}" id="r-${id}" style="--sc:${esc(sc?.couleur || '#2f54eb')}"><div class="band"></div>${apercu(p)}
      <div class="sideact"><div class="meta">${pill(p)}${passe ? `<span class="pill late">${ic('clock',14)} Date passée</span>` : ''}<span class="muted small">${esc(soc(p.entrepriseId)?.nom)} · ${esc(fmtJour(p.date))} à ${esc(p.heure || '?')}</span>${reseaux(p)}</div>
      <h3>${esc(p.titre)}</h3>
      ${p.statut === 'a_refaire' && p.demande ? `<div class="why"><b>Ta demande :</b> ${esc(p.demande)}</div>` : ''}
      ${boutons}${bmedia}${bsuppr}
      ${ed && canEdit() ? `<div class="editbox">
        <label>Texte ${esc(NETS[n]?.l)}<textarea id="cap-${id}" rows="6">${esc(p.textes?.[n] || '')}</textarea></label>
        <div class="two"><label>Date<input type="date" id="dt-${id}" value="${esc(p.date)}"></label><label>Heure<input type="time" id="hr-${id}" value="${esc(p.heure)}"></label></div>
        <div class="row"><button class="btn" data-act="av-save" data-id="${id}">Enregistrer mes changements</button></div>
        <label>Ce qui ne va pas<textarea id="dem-${id}" rows="3" placeholder="Ex. texte plus court, ton plus fun, autre photo, mettre la promo en avant…"></textarea></label>
        <div class="quick">${QUICK.map(q => `<button class="btn sm ghost" data-act="av-quick" data-id="${id}" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
        <div class="row"><button class="btn ghost" data-act="av-ia" data-id="${id}">Réécrire le texte avec Claude</button><button class="btn ghost" data-act="av-refaire" data-id="${id}">À refaire (mémoriser)</button></div>
        <div class="row"><button class="btn" data-act="av-fab" data-id="${id}">${ic('send',16)} Refaire la vidéo ou le visuel : copier la demande pour Claude</button></div>
        <p class="muted small">Le logiciel ne fabrique pas les vidéos lui-même. « Copier la demande » met le post en « À refaire », garde ta demande en mémoire et copie un message complet (post, fichiers actuels, règles, ce qui ne va pas). Colle-le dans la conversation Claude de fabrication, celle qui est reliée à ton PC : Claude refait le média et le range sous le même nom, et il se rattache seul.</p></div>` : ''}</div></article>`;
  }
  function viewAvalider() {
    const base = visibles(), nb = s => base.filter(p => p.statut === s).length, nbPasse = base.filter(estPasse).length;
    const tuiles = [['a_valider', 'circle-check', 'À valider', nb('a_valider'), 'blue'], ['a_refaire', 'redo', 'À refaire', nb('a_refaire'), 'red'], ['pret', 'thumb', 'Validés', nb('pret'), 'green'], ['passe', 'clock', 'Dates passées', nbPasse, 'orange'], ['tous', 'layers', 'Tous', base.filter(p => p.statut !== 'publie').length, 'grey']]
      .map(([k, icn, l, n, c]) => `<button class="tile t-${c} ${ui.statut === k && !ui.focus ? 'on' : ''}" data-act="av-statut" data-s="${k}"><span class="ti">${ic(icn,20)}</span><span class="tn">${n}</span><span class="tl">${l}</span></button>`).join('');
    const liste = base.filter(p => ui.focus ? p.id === ui.focus : ui.statut === 'passe' ? estPasse(p) : (ui.statut === 'tous' ? p.statut !== 'publie' : p.statut === ui.statut)).sort(tri);
    const vide = { a_valider: 'Rien à valider pour le moment.', passe: 'Aucun post en retard.' }[ui.statut] || 'Aucun post dans cette liste.';
    const nettoyer = !ui.focus && ui.statut === 'passe' && liste.length && canEdit() ? `<div class="banner warn">${ic('clock',18)} ${liste.length} post(s) ont une date déjà passée sans avoir été publiés. <button class="btn sm ghost danger" data-act="av-suppr-passes">${ic('trash',16)} Tout supprimer</button> <span class="muted small">(les fichiers restent dans tes dossiers)</span></div>` : '';
    return `<div class="row between"><h1>À valider</h1><div class="row">${canEdit() && FS.supported() && base.some(p => !aMedia(p) && p.statut !== 'publie') ? `<button class="btn ghost" data-act="med-auto">${ic('clip',16)} Rattacher automatiquement les médias (${base.filter(p => !aMedia(p) && p.statut !== 'publie').length})</button>` : ''}${filtreHtml()}</div></div>
      ${ui.focus ? `<p><button class="btn ghost" data-act="av-retour">${ic('back',16)} Retour à la liste</button></p>` : `<div class="tiles">${tuiles}</div>`}
      ${nettoyer}${liste.map(carte).join('') || `<section class="card vide"><span class="vi">${ic('inbox',28)}</span><b>${vide}</b></section>`}`;
  }

  /* ============================== PLANNING ============================== */
  function chipEv(e, avecDate) {
    const t = esc(e.nom) + (avecDate && !e.fin ? ' · ' + esc(fmtCourt(new Date(e.date + 'T12:00'))) : '');
    return e.custom ? `<button class="ev perso" data-act="ev-edit" data-id="${esc(e.id)}">${t}</button>` : `<span class="ev ${esc(e.type)}" title="${esc(e.note)}">${t}</span>`;
  }
  function viewPlanning() {
    const lundi = ui.semaine, a = iso(lundi), b = iso(addDays(lundi, 6)), aujourdhui = iso(new Date()), base = visibles();
    const evs = eventsIn(a, b, app.events || [], ui.filtre);
    const jours = JOURS.map((j, i) => {
      const d = addDays(lundi, i), k = iso(d), ps = base.filter(p => p.date === k).sort(tri), es = evs.filter(e => e.date <= k && (e.fin || e.date) >= k);
      return `<div class="day ${k === aujourdhui ? 'today' : ''}"><header><b>${j}</b><span class="muted small">${esc(fmtCourt(d))}</span></header>
        ${es.map(e => chipEv(e, false)).join('')}
        ${ps.map(p => `<button class="postchip" style="--c:${esc(soc(p.entrepriseId)?.couleur || '#999')}" data-act="pl-open" data-id="${esc(p.id)}"><span class="t">${esc(p.titre)}</span><span class="muted small">${esc(p.heure || '')} · ${esc(soc(p.entrepriseId)?.nom)}</span>${pill(p)}${reseaux(p)}</button>`).join('') || '<span class="muted small">—</span>'}</div>`;
    }).join('');
    const bilan = {}; base.filter(p => p.date >= a && p.date <= b).forEach(p => bilan[p.statut] = (bilan[p.statut] || 0) + 1);
    const suite = eventsIn(iso(addDays(lundi, 7)), iso(addDays(lundi, 34)), app.events || [], ui.filtre).filter(e => e.date > b);
    const auj = new Date();
    return `<div class="row between"><h1>Planning</h1>${filtreHtml()}</div>
      <div class="row between"><div class="row"><button class="btn ghost" data-act="pl-prev">←</button><button class="btn ghost" data-act="pl-today">Aujourd'hui</button><button class="btn ghost" data-act="pl-next">→</button></div>
      <b>Semaine du ${esc(fmtCourt(lundi))} au ${esc(fmtCourt(addDays(lundi, 6)))}</b><span class="muted small">${Object.entries(bilan).map(([k, v]) => v + ' ' + (STATUTS[k] || k).toLowerCase()).join(' · ') || 'Aucun post cette semaine'}</span></div>
      <div class="week">${jours}</div>
      <section class="card"><div class="row between"><h2>Temps forts</h2>${canEdit() ? '<button class="btn" data-act="ev-add">+ Ajouter un événement</button>' : ''}</div>
        <p class="eyebrow">Cette semaine</p><div class="evs">${evs.map(e => chipEv(e, true)).join('') || '<span class="muted small">Aucun temps fort cette semaine.</span>'}</div>
        <p class="eyebrow">À préparer, 4 semaines suivantes</p>${suite.length ? `<ul class="up">${suite.map(e => { const n = Math.round((new Date(e.date + 'T12:00') - auj) / 864e5); return `<li><span class="mono">${esc(fmtCourt(new Date(e.date + 'T12:00')))}</span>${chipEv(e, false)}<span class="muted small">${n > 0 ? 'dans ' + n + ' j' : ''}${e.fin ? ' · jusqu\'au ' + esc(fmtCourt(new Date(e.fin + 'T12:00'))) : ''}</span></li>`; }).join('')}</ul>` : '<p class="muted small">Rien de prévu.</p>'}</section>`;
  }
  function renderEv() {
    const e = ui.ev; let m = $('#modal'); if (!e) { m?.remove(); return; }
    if (!m) { m = document.createElement('div'); m.id = 'modal'; document.body.appendChild(m); }
    m.innerHTML = `<div class="dialog"><header><h2>${e.id ? 'Événement' : 'Nouvel événement'}</h2><button class="btn ghost" data-act="ev-close">✕</button></header>
      <form class="body" onsubmit="return false"><label>Nom<input id="ev-nom" value="${esc(e.nom)}" placeholder="Salon de l'habitat, marché de Noël, anniversaire de l'entreprise…"></label>
      <div class="two"><label>Date de début<input type="date" id="ev-date" value="${esc(e.date)}"></label><label>Date de fin (facultatif)<input type="date" id="ev-fin" value="${esc(e.fin || '')}"></label></div>
      <label>Société concernée<select id="ev-biz"><option value="all">Toutes</option>${app.societes.map(s => `<option value="${esc(s.id)}" ${s.id === e.entrepriseId ? 'selected' : ''}>${esc(s.nom)}</option>`).join('')}</select></label>
      <label>Note<input id="ev-note" value="${esc(e.note || '')}"></label></form>
      <footer>${e.id ? '<button class="btn ghost danger" data-act="ev-del">Supprimer</button>' : '<span></span>'}<button class="btn" data-act="ev-save">Enregistrer</button></footer></div>`;
  }

  /* ============================== PUBLIER ============================== */
  const chiffres = t => { let d = String(t || '').replace(/[^\d+]/g, ''); if (d.startsWith('+')) d = d.slice(1); else if (d.startsWith('00')) d = d.slice(2); else if (d.startsWith('0')) d = '33' + d.slice(1); return d.replace(/\D/g, ''); };
  function lignePost(p, s) {
    const id = esc(p.id), faits = p.faits || {}, m = p.media || {}, u = aMedia(p) || [m.url, (m.slides || [])[0]].find(urlOk);
    const lignes = netsDe(p).filter(n => n !== 'whatsapp').map(n => `<div class="pubnet"><span class="net" style="--n:${NETS[n].c}">${NETS[n].l}</span>
      <button class="btn sm ghost" data-act="pub-copy" data-id="${id}" data-n="${n}">Copier le texte</button>${u ? `<button class="btn sm ghost" data-act="pub-dl" data-id="${id}" data-n="${n}">Télécharger le visuel</button>` : ''}
      <button class="btn sm" data-act="pub-open" data-id="${id}" data-n="${n}">Publier sur ${esc(NETS[n].l)} ↗</button>
      ${canEdit() ? `<label class="chk"><input type="checkbox" data-act="pub-fait" data-id="${id}" data-n="${n}" ${faits[n] ? 'checked' : ''}> Fait</label>` : ''}</div>`).join('');
    const stories = (m.fichiers || []).some(x => x.role === 'story') ? `<div class="pubnet"><span class="net" style="--n:#666">Stories</span><button class="btn sm ghost" data-act="pub-dl" data-id="${id}" data-n="story">Télécharger les Stories</button></div>` : '';
    const wa = netsDe(p).includes('whatsapp') ? `<div class="pubnet"><span class="net" style="--n:${NETS.whatsapp.c}">WhatsApp</span>
      ${(s.contacts || []).length ? `<select id="wa-${id}">${s.contacts.map(k => `<option value="${esc(k.id)}">${esc(k.nom)}${k.type === 'groupe' ? ' (groupe)' : ''}</option>`).join('')}</select><button class="btn sm" data-act="pub-wa" data-id="${id}">Envoyer sur WhatsApp ↗</button>` : '<span class="muted small">Aucun contact : ajoute-en dans Sociétés › Modifier › Règles &amp; contacts.</span>'}
      ${canEdit() ? `<label class="chk"><input type="checkbox" data-act="pub-fait" data-id="${id}" data-n="whatsapp" ${faits.whatsapp ? 'checked' : ''}> Fait</label>` : ''}</div>` : '';
    return `<div class="pubpost"><div class="row between"><div><b>${esc(p.titre)}</b><div class="muted small">${esc(fmtJour(p.date))} à ${esc(p.heure || '?')}</div></div>${pill(p)}</div>${lignes}${stories}${wa}</div>`;
  }
  function viewPublier() {
    const base = visibles().filter(p => ['pret', 'programme'].includes(p.statut)).sort(tri);
    const blocs = app.societes.filter(s => ui.filtre === 'all' || s.id === ui.filtre).map(s => {
      const ps = base.filter(p => p.entrepriseId === s.id); if (!ps.length) return '';
      const modeles = [['Message d\'accueil', s.waAccueil], ['Message d\'absence', s.waAbsence], ['Réponses rapides', s.waRapides]].filter(x => x[1]);
      return `<section class="card" style="border-top:5px solid ${esc(s.couleur)}"><h2>${esc(s.nom)}</h2>${ps.map(p => lignePost(p, s)).join('')}
        ${modeles.length ? `<details><summary class="muted small">Messages WhatsApp Business de la société</summary><div class="row">${modeles.map(([l, t], i) => `<button class="btn sm ghost" data-act="pub-modele" data-s="${esc(s.id)}" data-i="${i}">Copier : ${l}</button>`).join('')}</div></details>` : ''}</section>`;
    }).join('');
    return `<div class="row between"><h1>Publier</h1>${filtreHtml()}</div>
      <p class="muted">Ici : les posts <b>validés</b>. Pour chaque réseau : copie le texte, télécharge le visuel, ouvre la page de publication, puis coche « Fait ». Quand tous les réseaux sont faits, le post passe en « Publié ».</p>
      ${blocs || '<section class="card"><p>Aucun post validé à publier. Valide-en dans « À valider ».</p></section>'}`;
  }

  /* ============================== ACTIONS ============================== */
  const P = id => app.posts.find(x => x.id === id);
  const actions = {
    filtre: t => { ui.filtre = t.value; ui.focus = null; c.render(); },
    'av-statut': t => { ui.statut = t.dataset.s; ui.focus = null; ui.editing = null; c.render(); },
    'av-retour': () => { ui.focus = null; ui.editing = null; c.render(); },
    'av-net': t => { ui.capNet[t.dataset.id] = t.dataset.n; c.render(); },
    'av-edit': t => { ui.editing = ui.editing === t.dataset.id ? null : t.dataset.id; c.render(); },
    'av-valider': async t => { await savePost(t.dataset.id, { statut: 'pret', valideLe: new Date().toISOString() }); toast('Validé : il apparaît dans « Publier »'); },
    'av-suppr': async t => {
      const p = P(t.dataset.id); if (!p) return;
      if (!confirm(`Supprimer le post « ${p.titre} » ?${aMedia(p) ? '\n\nLa vidéo / les images rattachées sont retirées du post ; les fichiers restent dans tes dossiers.' : ''}`)) return;
      await DB.removeDoc('posts', p.id); await S.refreshPending(); ui.editing = null; ui.focus = null; await c.refresh(); toast('Post supprimé'); S.sync().then(c.refresh);
    },
    'av-suppr-passes': async () => {
      const l = visibles().filter(estPasse); if (!l.length) return;
      if (!confirm(`Supprimer ces ${l.length} post(s) dont la date est passée ?\n\n${l.slice(0, 12).map(p => '• ' + p.titre).join('\n')}${l.length > 12 ? '\n…' : ''}\n\nLes fichiers restent dans tes dossiers.`)) return;
      for (const p of l) await DB.removeDoc('posts', p.id);
      await S.refreshPending(); await c.refresh(); toast(l.length + ' post(s) supprimé(s)'); S.sync().then(c.refresh);
    },
    'av-annuler': t => savePost(t.dataset.id, { statut: 'a_valider', valideLe: '' }),
    'av-save': async t => {
      const id = t.dataset.id, p = P(id), n = netOf(p);
      await savePost(id, { textes: { ...(p.textes || {}), [n]: $('#cap-' + id).value }, date: $('#dt-' + id).value || p.date, heure: $('#hr-' + id).value || p.heure });
      ui.editing = null; c.render(); toast('Modifications enregistrées');
    },
    'av-quick': t => { const ta = $('#dem-' + t.dataset.id); ta.value = (ta.value.trim() + ' ' + t.dataset.q + '.').trim(); },
    'av-fab': async t => {
      const id = t.dataset.id, p = P(id), s = soc(p.entrepriseId), dem = ($('#dem-' + id)?.value || '').trim();
      if (!dem) return toast('Écris d\'abord ce qui ne va pas dans la vidéo ou le visuel');
      const fich = (p.media?.fichiers || []).map(f => '- ' + f.nom).join('\n') || '- (aucun média rattaché)';
      const msg = `DEMANDE DE FABRICATION (Pilote Réseaux)\nRefais le média de ce post et range-le dans le dossier de la société sur mon PC, sous le même nom de fichier pour qu'il se rattache seul (nom : Société - AAAA-MM-JJ - Titre - Réseau.ext).\n\nSociété : ${s?.nom}\nPost : ${p.titre}\nDate : ${p.date} à ${p.heure || '?'}\nRéseaux : ${(p.reseaux || []).join(', ')}\nFichiers actuels :\n${fich}\n\nCe qui ne va pas / ce que je veux : ${dem}\n\n` + (await IA.brief(s, app.regles));
      const { id: sid, ...sd } = s;
      await DB.saveDoc('entreprises', sid, { ...sd, retours: [...(s.retours || []), { date: iso(new Date()), type: 'refaire', texte: `${p.titre} : ${dem}` }].slice(-60), majLe: new Date().toISOString() });
      await savePost(id, { statut: 'a_refaire', demande: dem }); await copy(msg); ui.editing = null; c.render();
      toast('Demande copiée : colle-la dans la conversation Claude de fabrication (reliée à ton PC).', 7000);
    },
    'av-refaire': async t => {
      const id = t.dataset.id, p = P(id), dem = ($('#dem-' + id).value || '').trim();
      if (!dem) return toast('Écris d\'abord ce qui ne va pas');
      const s = soc(p.entrepriseId), { id: sid, ...sd } = s;
      await DB.saveDoc('entreprises', sid, { ...sd, retours: [...(s.retours || []), { date: iso(new Date()), type: 'refaire', texte: `${p.titre} : ${dem}` }].slice(-60), majLe: new Date().toISOString() });
      await savePost(id, { statut: 'a_refaire', demande: dem }); ui.editing = null; c.render(); toast('Demande enregistrée : le post passe en « À refaire »');
    },
    'av-ia': async t => {
      const id = t.dataset.id, p = P(id), s = soc(p.entrepriseId), n = netOf(p), dem = ($('#dem-' + id)?.value || '').trim();
      try {
        const prompt = (await IA.brief(s, app.regles)) + `\n\nRéécris le texte ${NETS[n].l} de ce post.\nTitre : ${p.titre}\nTexte actuel :\n${p.textes?.[n] || ''}\nDemande : ${dem || 'améliorer le texte'}\nRéponds uniquement par le nouveau texte.`;
        const r = await IA.demander(prompt);
        if (r.aCopier) { await copy(r.aCopier); toast('Consignes copiées : colle-les dans ton chat Claude, puis colle sa réponse dans le texte.', 6000); }
        else { await savePost(id, { textes: { ...(p.textes || {}), [n]: r.texte.trim() } }); toast('Texte réécrit'); }
      } catch (e) { toast(e.message); }
    },
    /* planning */
    'pl-prev': () => { ui.semaine = addDays(ui.semaine, -7); c.render(); },
    'pl-next': () => { ui.semaine = addDays(ui.semaine, 7); c.render(); },
    'pl-today': () => { ui.semaine = monday(new Date()); c.render(); },
    'pl-open': t => { ui.focus = t.dataset.id; ui.editing = null; c.go('avalider'); },
    'ev-add': () => { ui.ev = { id: '', nom: '', date: iso(ui.semaine), fin: '', entrepriseId: ui.filtre, note: '' }; renderEv(); },
    'ev-edit': t => { const e = (app.events || []).find(x => x.id === t.dataset.id); if (!e) return; ui.ev = { fin: '', note: '', ...e }; renderEv(); },
    'ev-close': () => { ui.ev = null; renderEv(); },
    'ev-save': async () => {
      const g = k => $('#ev-' + k).value.trim(), e = ui.ev;
      if (!g('nom') || !g('date')) return toast('Le nom et la date sont nécessaires');
      await DB.saveDoc('evenements', e.id || uid('ev'), { nom: g('nom'), date: g('date'), fin: g('fin') > g('date') ? g('fin') : '', entrepriseId: g('biz'), note: g('note') });
      ui.ev = null; renderEv(); await S.refreshPending(); await c.refresh(); toast('Événement enregistré'); S.sync().then(c.refresh);
    },
    'ev-del': async () => { if (!confirm('Supprimer cet événement ?')) return; await DB.removeDoc('evenements', ui.ev.id); ui.ev = null; renderEv(); await S.refreshPending(); await c.refresh(); S.sync().then(c.refresh); },
    /* publier */
    'pub-copy': t => copy(legende(P(t.dataset.id), t.dataset.n)),
    'pub-open': async t => { const n = t.dataset.n; await copy(legende(P(t.dataset.id), n)); window.open(NETS[n].publier, '_blank', 'noopener'); toast('Texte copié : colle-le dans la page qui s\'ouvre'); },
    'pub-dl': async t => {
      const p = P(t.dataset.id), m = p.media || {};
      if (aMedia(p)) {
        const s = soc(p.entrepriseId), liste = M.fichiersPour(m, t.dataset.n); let n = 0;
        for (const f of liste) { const u = await M.urlLocale(s, f.nom).catch(() => null); if (!u) continue; const a = document.createElement('a'); a.href = u; a.download = f.nom; document.body.appendChild(a); a.click(); a.remove(); n++; await new Promise(r => setTimeout(r, 300)); }
        return toast(n ? n + ' fichier(s) téléchargé(s)' : 'Fichier introuvable sur cet appareil : ouvre le logiciel sur le PC (' + (liste[0]?.nom || 'média') + ')', 5000);
      }
      const u = [m.url, (m.slides || [])[0]].find(urlOk); if (u) window.open(u, '_blank', 'noopener');
    },
    'pub-fait': async t => {
      const p = P(t.dataset.id), faits = { ...(p.faits || {}), [t.dataset.n]: t.checked }, tous = netsDe(p).every(n => faits[n]);
      await savePost(p.id, tous ? { faits, statut: 'publie', publieLe: new Date().toISOString() } : { faits, statut: p.statut === 'publie' ? 'pret' : p.statut, publieLe: p.statut === 'publie' ? '' : p.publieLe });
      if (tous) toast('Publié partout : le post passe en « Publié »');
    },
    'pub-wa': async t => {
      const p = P(t.dataset.id), s = soc(p.entrepriseId), k = (s.contacts || []).find(x => x.id === $('#wa-' + p.id)?.value), txt = legende(p, 'whatsapp') || legende(p, netsDe(p)[0] || 'facebook');
      if (!k) return toast('Choisis un contact');
      if (k.type === 'groupe' || /^https?:/i.test(k.tel)) { await copy(txt); if (/^https?:/i.test(k.tel)) window.open(k.tel, '_blank', 'noopener'); return toast('Texte copié : colle-le dans le groupe'); }
      const num = chiffres(k.tel); if (num.length < 9) return toast('Numéro invalide pour ' + k.nom);
      if (navigator.share && matchMedia('(pointer:coarse)').matches) { try { await navigator.share({ text: txt }); return; } catch (e) { if (e.name === 'AbortError') return; } }
      window.open(`https://wa.me/${num}?text=${encodeURIComponent(txt)}`, '_blank', 'noopener');
    },
    /* médias */
    'med-open': async t => {
      const p = P(t.dataset.id), s = soc(p.entrepriseId);
      try { const r = await M.indexer(s, { geste: true, force: true }); const prop = M.proposer(p, r.files).map(x => x.nom), deja = (p.media?.fichiers || []).map(x => x.nom);
        ui.med = { id: p.id, files: r.files, lies: r.lies, propose: prop, sel: new Set(deja.length ? deja : prop) }; ui.med.propose = [...new Set([...prop, ...deja])]; renderMed(); } catch (e) { toast('Dossier inaccessible : ' + e.message); }
    },
    'med-toggle': t => { const d = ui.med; t.checked ? d.sel.add(t.dataset.nom) : d.sel.delete(t.dataset.nom); const n = $('#modal footer .muted'); if (n) n.textContent = d.sel.size + ' fichier(s) choisi(s)'; },
    'med-close': () => { ui.med = null; renderMed(); },
    'med-save': async () => {
      const d = ui.med, p = P(d.id), s = soc(p.entrepriseId), sel = d.files.filter(f => d.sel.has(f.name)).map(f => infoFichier(f));
      if (!sel.length) return toast('Coche au moins un fichier');
      d.attente = 'Fabrication de la miniature…'; renderMed();
      try { const m = await rattacher(p, s, sel); ui.med = null; renderMed(); c.render(); toast(`Média rattaché (${m.kind === 'video' ? 'vidéo' : m.kind === 'carousel' ? 'carrousel' : 'image'}, miniature ${Math.round(m.posterOctets / 1024)} Ko)`); }
      catch (e) { d.attente = ''; renderMed(); toast('Échec : ' + e.message, 6000); }
    },
    'med-retirer': async t => { if (!confirm('Retirer le média de ce post ? Les fichiers ne sont pas supprimés.')) return; await savePost(t.dataset.id, { media: {} }); toast('Média retiré'); },
    'med-auto': async () => {
      const cibles = visibles().filter(p => !aMedia(p) && p.statut !== 'publie'); let ok = 0, sans = 0, err = 0;
      toast('Recherche des médias…', 60000);
      for (const sc of app.societes.filter(x => cibles.some(p => p.entrepriseId === x.id))) {
        let r; try { r = await M.indexer(sc, { geste: true, force: true }); } catch { continue; }
        for (const p of cibles.filter(x => x.entrepriseId === sc.id)) {
          const prop = M.proposer(p, r.files); if (!prop.length) { sans++; continue; }
          try { await rattacher(p, sc, prop); ok++; } catch (e) { err++; }
        }
      }
      toast(`${ok} post(s) rattaché(s)${sans ? ', ' + sans + ' sans fichier correspondant' : ''}${err ? ', ' + err + ' en échec' : ''}`, 7000);
    },
    'med-autoriser': async () => { for (const sc of app.societes) { try { await M.indexer(sc, { geste: true, force: true }); } catch {} } c.render(); },
    'pub-modele': t => { const s = soc(t.dataset.s); copy([s.waAccueil, s.waAbsence, s.waRapides].filter(Boolean)[Number(t.dataset.i)]); },
  };
  /* ============================== MÉDIAS ============================== */
  const infoFichier = (f, d) => f.p || { nom: f.name, type: f.kind, role: 'principal', reseau: '', n: 0 };
  const etiquette = f => [f.type === 'video' ? 'vidéo' : 'image', f.role === 'story' ? 'Story ' + (f.n || '') : f.role === 'slide' ? 'carrousel ' + (f.n || '') : '', f.reseau ? NETS[f.reseau]?.l : ''].filter(Boolean).join(' · ');
  function renderMed() {
    const d = ui.med; let m = $('#modal'); if (!d) { m?.remove(); return; }
    if (!m) { m = document.createElement('div'); m.id = 'modal'; document.body.appendChild(m); }
    const p = P(d.id), prop = new Set(d.propose), ligne = f => `<li><label class="chk"><input type="checkbox" data-act="med-toggle" data-nom="${esc(f.name)}" ${d.sel.has(f.name) ? 'checked' : ''}> <span><b>${esc(f.name)}</b><span class="muted small"> — ${esc(etiquette(infoFichier(f)))} · ${esc(f.dossier)}</span></span></label></li>`;
    const a = d.propose.map(n => d.files.find(f => f.name === n)).filter(Boolean), b = d.files.filter(f => !prop.has(f.name)).sort((x, y) => y.name.localeCompare(x.name)).slice(0, 150);
    const corps = d.attente ? `<p>${esc(d.attente)}</p>` : !d.lies ? '<p>Aucun dossier d\'enregistrement n\'est choisi sur cet ordinateur. Va dans <b>Sociétés › Modifier › Dossiers</b> et clique « Choisir le dossier ».</p>'
      : `<p class="muted small">Le logiciel retrouve les fichiers d'après leur nom (« Société - AAAA-MM-JJ - Titre - Réseau »). Coche ceux de ce post : ils ne sont ni copiés ni modifiés.</p>
         <h3>Proposés pour « ${esc(p?.titre)} » (${a.length})</h3><ul class="dos">${a.map(ligne).join('') || '<li class="muted">Aucun fichier ne correspond au titre et à la date.</li>'}</ul>
         <h3>Autres fichiers (${d.files.length - a.length})</h3><ul class="dos">${b.map(ligne).join('') || '<li class="muted">—</li>'}</ul>`;
    m.innerHTML = `<div class="dialog wide"><header><h2>Média du post</h2>${d.attente ? '' : '<button class="btn ghost" data-act="med-close">✕</button>'}</header><div class="body">${corps}</div>
      <footer><span class="muted small">${d.sel.size} fichier(s) choisi(s)</span>${d.attente ? '' : '<button class="btn" data-act="med-save">Rattacher</button>'}</footer></div>`;
  }
  async function rattacher(p, s, sel) {
    const media = await M.construireMedia(s, sel);
    await savePost(p.id, { media });
    return media;
  }
  return { viewAvalider, viewPlanning, viewPublier, actions, renderMed };
}
