// IA OPTIONNELLE. Rien n'est envoyé nulle part tant que tu ne choisis pas un mode.
//  - copier : le logiciel prépare le texte complet à coller dans ton chat Claude (abonnement, sans clé)
//  - api    : clé API Claude saisie ici (stockée seulement sur cet ordinateur, jamais dans la feuille Google)
//  - ollama : modèle local gratuit (Ollama installé sur le PC)
import * as DB from './db.js';

export const MODES = { aucun: 'Désactivée', copier: 'Copier-coller dans mon chat Claude', api: 'Clé API Claude', ollama: 'Ollama (local, gratuit)' };
const K = 'pr.ia';
export const conf = () => ({ mode: 'copier', apiKey: '', apiModel: 'claude-sonnet-4-5', ollamaUrl: 'http://localhost:11434', ollamaModel: 'llama3.1', ...JSON.parse(localStorage.getItem(K) || '{}') });
export const saveConf = c => localStorage.setItem(K, JSON.stringify(c));

/** Texte de contexte complet : société + règles + retours (même principe que l'ancienne appli). */
export async function brief(societe, regles) {
  const actives = [...(regles?.globales || []), ...(societe.regles || [])].filter(r => r.actif !== false).map(r => '- ' + r.texte);
  const retours = (societe.retours || []).map(r => '- ' + r.texte);
  return [
    `Entreprise : ${societe.nom}`, `Domaine : ${societe.domaine || '?'}`, `Zone : ${societe.zone || '?'}`, `Cible : ${societe.cible || '?'}`,
    `Ton : ${societe.ton || '?'}`, `Offres et actus : ${societe.offres || 'aucune'}`, `À éviter : ${societe.eviter || 'rien'}`,
    `Réseaux : ${(societe.reseaux || []).join(', ')}`,
    `Consignes permanentes du gérant (à respecter en priorité) :\n${societe.consignes || 'aucune'}`,
    `Règles à respecter absolument :\n${actives.join('\n') || '- aucune'}`,
    retours.length ? `Retours précédents du gérant (ne jamais reproduire ce qui l'a dérangé) :\n${retours.join('\n')}` : '',
    regles?.visibilite ? `Règles de visibilité : ${regles.visibilite}` : '',
  ].filter(Boolean).join('\n');
}

/** Exécute une demande de réécriture selon le mode choisi. Renvoie { texte } ou { aCopier }. */
export async function demander(prompt) {
  const c = conf();
  if (c.mode === 'aucun') throw new Error("L'IA est désactivée (Réglages > IA).");
  if (c.mode === 'copier') return { aCopier: prompt };
  if (c.mode === 'api') {
    if (!c.apiKey) throw new Error("Clé API manquante (Réglages > IA).");
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': c.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: c.apiModel, max_tokens: 2000, messages: [{ role: 'user', content: prompt }] }),
    });
    const j = await r.json(); if (!r.ok) throw new Error(j.error?.message || 'Erreur API');
    return { texte: (j.content || []).map(x => x.text || '').join('') };
  }
  if (c.mode === 'ollama') {
    const r = await fetch(c.ollamaUrl.replace(/\/$/, '') + '/api/generate', { method: 'POST', body: JSON.stringify({ model: c.ollamaModel, prompt, stream: false }) });
    if (!r.ok) throw new Error('Ollama ne répond pas (est-il lancé ? voir Aide).');
    return { texte: (await r.json()).response || '' };
  }
  throw new Error('Mode inconnu');
}
export async function tester() { return demander('Réponds uniquement par le mot : OK'); }
