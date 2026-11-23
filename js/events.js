// Calendrier des temps forts (fêtes, journées mondiales, dates commerciales) + événements personnalisés.
// Les dates mobiles (Pâques, Black Friday…) sont calculées pour n'importe quelle année.
export const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const monday = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };

const MOIS_CAMP = { 1: [['Dry January', 'sante']], 3: [['Mars bleu', 'sante']], 6: [['Mois des fiertés', 'fete']], 9: [['Septembre en or', 'sante']], 10: [['Octobre rose', 'sante']], 11: [['Movember', 'sante'], ['Mois sans tabac', 'sante']] };
const FIXES = [['01-01', "Jour de l'an", 'ferie'], ['01-06', 'Épiphanie (galette)', 'fete'], ['02-02', 'Chandeleur', 'fete'], ['02-04', 'Journée mondiale contre le cancer', 'sante'], ['02-14', 'Saint-Valentin', 'commerce'], ['03-05', "Journée mondiale de l'efficacité énergétique", 'info'], ['03-08', 'Journée internationale des droits des femmes', 'info'], ['03-20', 'Arrivée du printemps', 'info'], ['04-01', "Poisson d'avril", 'fete'], ['04-07', 'Journée mondiale de la santé', 'sante'], ['04-22', 'Jour de la Terre', 'info'], ['05-01', 'Fête du travail', 'ferie'], ['05-08', 'Victoire 1945', 'ferie'], ['05-31', 'Journée mondiale sans tabac', 'sante'], ['06-05', "Journée mondiale de l'environnement", 'info'], ['06-14', 'Journée mondiale des donneurs de sang', 'sante'], ['06-21', "Fête de la musique, début de l'été", 'fete'], ['06-23', 'Journée olympique', 'sante'], ['07-14', 'Fête nationale', 'ferie'], ['08-15', 'Assomption', 'ferie'], ['09-01', 'Rentrée scolaire (début septembre)', 'commerce'], ['09-21', 'Journée mondiale Alzheimer', 'sante'], ['09-29', 'Journée mondiale du cœur', 'sante'], ['10-10', 'Journée mondiale de la santé mentale', 'sante'], ['10-31', 'Halloween', 'fete'], ['11-01', 'Toussaint', 'ferie'], ['11-11', 'Armistice 1918', 'ferie'], ['12-04', 'Sainte-Barbe (pompiers)', 'fete'], ['12-05', 'Journée mondiale du bénévolat', 'info'], ['12-06', 'Saint-Nicolas', 'fete'], ['12-21', "Arrivée de l'hiver", 'info'], ['12-24', 'Réveillon de Noël', 'commerce'], ['12-25', 'Noël', 'ferie'], ['12-31', 'Saint-Sylvestre', 'fete']];

function easter(y) { const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), n = h + l - 7 * m + 114; return new Date(y, Math.floor(n / 31) - 1, (n % 31) + 1); }
const nth = (y, m, wd, n) => { const d = new Date(y, m - 1, 1); return new Date(y, m - 1, 1 + (wd - d.getDay() + 7) % 7 + 7 * (n - 1)); };
const lastWd = (y, m, wd) => { const d = new Date(y, m, 0); return new Date(y, m - 1, d.getDate() - (d.getDay() - wd + 7) % 7); };

const cache = {};
function yearEvents(y) {
  if (cache[y]) return cache[y];
  const L = [];
  const add = (d, nom, type, fin, note) => L.push({ date: typeof d === 'string' ? d : iso(d), fin: fin ? (typeof fin === 'string' ? fin : iso(fin)) : null, nom, type, note: note || '' });
  for (const [m, arr] of Object.entries(MOIS_CAMP)) for (const [n, t] of arr) add(new Date(y, m - 1, 1), n, t, new Date(y, Number(m), 0), 'Tout le mois');
  for (const [md, n, t] of FIXES) add(y + '-' + md, n, t);
  const E = easter(y);
  add(addDays(E, -47), 'Mardi gras', 'fete'); add(E, 'Pâques', 'fete'); add(addDays(E, 1), 'Lundi de Pâques', 'ferie'); add(addDays(E, 39), 'Ascension', 'ferie'); add(addDays(E, 50), 'Lundi de Pentecôte', 'ferie');
  let fm = lastWd(y, 5, 0); if (iso(fm) === iso(addDays(E, 49))) fm = nth(y, 6, 0, 1);
  add(fm, 'Fête des mères', 'commerce'); add(nth(y, 6, 0, 3), 'Fête des pères', 'commerce'); add(nth(y, 3, 0, 1), 'Fête des grands-mères', 'commerce');
  const bf = addDays(nth(y, 11, 4, 4), 1); add(bf, 'Black Friday', 'commerce'); add(addDays(bf, 3), 'Cyber Monday', 'commerce');
  add(nth(y, 11, 4, 3), 'Beaujolais nouveau', 'fete');
  add(lastWd(y, 3, 0), "Passage à l'heure d'été", 'info'); add(lastWd(y, 10, 0), "Passage à l'heure d'hiver", 'info');
  const sh = nth(y, 1, 3, 2); add(sh, "Soldes d'hiver", 'commerce', addDays(sh, 27), 'Date nationale, à vérifier');
  let se = lastWd(y, 6, 3); if (se.getDate() > 28) se = addDays(se, -7); add(se, "Soldes d'été", 'commerce', addDays(se, 27), 'Date nationale, à vérifier');
  const jp = nth(y, 9, 6, 3); add(jp, 'Journées européennes du patrimoine', 'fete', addDays(jp, 1));
  const tt = nth(y, 12, 5, 1); add(tt, 'Téléthon', 'sante', addDays(tt, 1), 'Date à confirmer');
  return cache[y] = L;
}

/** Temps forts entre deux dates (AAAA-MM-JJ), événements personnalisés inclus. biz = 'all' ou id de société. */
export function eventsIn(a, b, perso = [], biz = 'all') {
  const y = Number(a.slice(0, 4));
  const mine = perso.filter(e => !e.entrepriseId || e.entrepriseId === 'all' || biz === 'all' || e.entrepriseId === biz).map(e => ({ ...e, fin: e.fin || null, type: 'perso', custom: true }));
  return [...yearEvents(y - 1), ...yearEvents(y), ...yearEvents(y + 1), ...mine].filter(e => e.date <= b && (e.fin || e.date) >= a).sort((x, z) => x.date.localeCompare(z.date));
}
