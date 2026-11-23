// Connexion Google (jeton d'identité) + synchronisation avec la passerelle Apps Script.
import * as DB from './db.js';

const LS = { url: 'pr.scriptUrl', cid: 'pr.clientId', tok: 'pr.token', tokExp: 'pr.tokenExp', email: 'pr.email' };
export const cfg = {
  get url() { return localStorage.getItem(LS.url) || window.PR_CONFIG?.scriptUrl || ''; },
  get clientId() { return localStorage.getItem(LS.cid) || window.PR_CONFIG?.clientId || ''; },
  set(url, cid) { localStorage.setItem(LS.url, url.trim()); localStorage.setItem(LS.cid, cid.trim()); },
  get ready() { return !!(this.url && this.clientId); },
};

export const state = { user: null, online: navigator.onLine, syncing: false, lastSync: null, error: '', pending: 0, listeners: new Set() };
const emit = () => state.listeners.forEach(f => { try { f(state); } catch (e) { console.error(e); } });
export const onState = f => { state.listeners.add(f); return () => state.listeners.delete(f); };

/* ---------- Connexion Google (Google Identity Services) ---------- */
let gisReady = null;
function loadGis() {
  if (gisReady) return gisReady;
  gisReady = new Promise((res, rej) => {
    if (window.google?.accounts?.id) return res();
    const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = res; s.onerror = () => { gisReady = null; rej(new Error('Impossible de charger la connexion Google (hors connexion ?)')); };
    document.head.appendChild(s);
  });
  return gisReady;
}
const jwtExp = t => { try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp * 1000; } catch { return 0; } };
export const tokenValid = () => { const t = localStorage.getItem(LS.tok); return !!t && jwtExp(t) > Date.now() + 60000; };
export const savedEmail = () => localStorage.getItem(LS.email) || '';

let waiter = null, onLoginCb = null;
export const setOnLogin = f => { onLoginCb = f; };
function onCredential(resp) {
  const t = resp.credential;
  localStorage.setItem(LS.tok, t); localStorage.setItem(LS.tokExp, String(jwtExp(t)));
  try { const p = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); localStorage.setItem(LS.email, p.email || ''); } catch {}
  if (waiter) { waiter.res(t); waiter = null; } else if (onLoginCb) onLoginCb();
}
export async function initAuth() {
  if (!cfg.clientId) return;
  await loadGis();
  google.accounts.id.initialize({ client_id: cfg.clientId, callback: onCredential, auto_select: true, cancel_on_tap_outside: false, use_fedcm_for_prompt: true });
}
/** Affiche le bouton « Se connecter avec Google » dans un élément. */
export async function renderButton(el) {
  await initAuth();
  google.accounts.id.renderButton(el, { theme: 'filled_black', size: 'large', text: 'signin_with', shape: 'pill', locale: 'fr' });
}
/** Renouvelle silencieusement le jeton (1 h) quand c'est possible. */
async function freshToken() {
  if (tokenValid()) return localStorage.getItem(LS.tok);
  if (!navigator.onLine) throw Object.assign(new Error('Hors connexion'), { code: 'offline' });
  await initAuth();
  return new Promise((res, rej) => {
    waiter = { res, rej };
    google.accounts.id.prompt(n => { if ((n.isNotDisplayed?.() || n.isSkippedMoment?.()) && waiter) { waiter = null; rej(Object.assign(new Error('Reconnexion Google nécessaire'), { code: 'auth' })); } });
    setTimeout(() => { if (waiter) { waiter = null; rej(Object.assign(new Error('Reconnexion Google nécessaire'), { code: 'auth' })); } }, 8000);
  });
}
export function signOut() {
  ['tok', 'tokExp', 'email'].forEach(k => localStorage.removeItem(LS[k]));
  try { google.accounts.id.disableAutoSelect(); } catch {}
  state.user = null; emit();
}

/* ---------- Appels à la passerelle ---------- */
async function call(action, payload = {}) {
  if (!cfg.url) throw Object.assign(new Error("Adresse du script non renseignée"), { code: 'config' });
  const token = await freshToken();
  const r = await fetch(cfg.url, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, token, ...payload }) });
  if (!r.ok) throw new Error('Passerelle injoignable (' + r.status + ')');
  const j = await r.json();
  if (!j.ok) { const e = new Error(j.message || j.error); e.code = j.error; throw e; }
  return j;
}
export const api = {
  ping: () => call('ping'),
  accesList: () => call('acces_list'),
  accesSave: rows => call('acces_save', { rows }),
  purge: days => call('purge', { days }),
};

/* ---------- Synchronisation ---------- */
let timer = null;
export async function sync({ quiet = false } = {}) {
  if (state.syncing) return;
  if (!cfg.ready) { state.error = 'Configuration à terminer (adresse du script + identifiant Google).'; emit(); return; }
  if (!navigator.onLine) { state.online = false; emit(); return; }
  state.syncing = true; state.error = ''; emit();
  try {
    // 1) envoyer les modifications faites hors connexion
    const out = await DB.outbox();
    if (out.length) {
      const r = await call('push', { changes: out.map(({ k, ...x }) => x) });
      const done = new Set([...r.accepted.map(a => a.c + '/' + a.id), ...r.rejected.map(a => a.c + '/' + a.id), ...r.conflicts.map(a => a.c + '/' + a.id)]);
      await DB.clearOutbox([...done]);
      if (r.conflicts.length) await DB.applyRemote(r.conflicts);   // le serveur avait plus récent : on prend sa version
      if (r.rejected.length) state.error = r.rejected.length + ' modification(s) refusée(s) (droits insuffisants).';
    }
    // 2) récupérer ce qui a changé ailleurs
    const since = await DB.getMeta('since', '');
    const p = await call('pull', { since });
    await DB.applyRemote(p.docs);
    await DB.setMeta('since', p.serverTime);
    state.user = p.user; state.lastSync = new Date();
    state.pending = (await DB.outbox()).length;
    state.online = true;
  } catch (e) {
    state.error = e.code === 'offline' ? '' : (e.message || String(e));
    if (e.code === 'forbidden') state.user = null;
    state.pending = (await DB.outbox()).length;
  } finally { state.syncing = false; emit(); }
}
let started = false;
export function startAutoSync(onChange) {
  if (started) { sync().then(() => onChange && onChange()); return; }
  started = true;
  const run = () => sync().then(() => onChange && onChange());
  window.addEventListener('online', () => { state.online = true; emit(); run(); });
  window.addEventListener('offline', () => { state.online = false; emit(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) run(); });
  clearInterval(timer); timer = setInterval(run, 120000);
  run();
}
export async function refreshPending() { state.pending = (await DB.outbox()).length; emit(); }
