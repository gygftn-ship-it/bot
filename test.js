// Tests rapides de la logique (aucun accès réseau, aucun navigateur).
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { normaliserNumeros, estAutorise, meilleurModele, decouperReponse, dansHoraires } = require('./utils');
const { Bot } = require('./bot');

// ---- utils ----
assert.deepStrictEqual(normaliserNumeros('+33 6 12 34 56 78, 0699887766'), ['33612345678', '0699887766']);
assert.strictEqual(estAutorise('33612345678', ['33612345678']), true);
assert.strictEqual(estAutorise('33612345678', ['0612345678']), true);
assert.strictEqual(estAutorise('33700000000', ['0612345678']), false);
assert.strictEqual(estAutorise('', ['33612345678']), false);
assert.strictEqual(
  meilleurModele(['gemini-2.5-pro', 'gemini-3.8-flash', 'gemini-3.8-flash-lite', 'gemini-3.1-pro-preview', 'gemini-flash-latest']),
  'gemini-3.8-flash'
);
assert.deepStrictEqual(decouperReponse('a\n\nb\n\n\nc\n\nd'), ['a', 'b', 'c']);
assert.strictEqual(dansHoraires({ horairesActifs: false }), true);
assert.strictEqual(dansHoraires({ horairesActifs: true, heureDebut: 8, heureFin: 23 }, new Date(2026, 0, 1, 12)), true);
assert.strictEqual(dansHoraires({ horairesActifs: true, heureDebut: 8, heureFin: 23 }, new Date(2026, 0, 1, 3)), false);
assert.strictEqual(dansHoraires({ horairesActifs: true, heureDebut: 22, heureFin: 6 }, new Date(2026, 0, 1, 2)), true);

// ---- appels Gemini simulés ----
(async () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-test-'));
  const evenements = [];
  const reponse = (status, corps) => ({ ok: status < 300, status, json: async () => corps });

  // 1. Cas normal
  global.fetch = async () => reponse(200, { candidates: [{ content: { parts: [{ text: 'coucou toi 😘' }] } }] });
  let bot = new Bot({ cleApi: 'k', modele: 'gemini-3.8-flash', prenomElle: 'Léa', prenomMoi: 'Sam' }, dossier, () => {});
  assert.strictEqual(await bot.testerIA('salut'), 'coucou toi 😘');

  // 2. Modèle introuvable -> bascule automatique
  global.fetch = async (url) => {
    if (String(url).includes('/models?pageSize')) {
      return reponse(200, {
        models: [
          { name: 'models/vieux-modele', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-3.8-flash-tts', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-embedding-001', supportedGenerationMethods: ['embedContent'] },
        ],
      });
    }
    if (String(url).includes('vieux-modele')) return reponse(404, { error: { message: 'models/vieux-modele is not found for API version v1beta' } });
    return reponse(200, { candidates: [{ content: { parts: [{ text: 'ok' }] } }] });
  };
  bot = new Bot({ cleApi: 'k', modele: 'vieux-modele' }, dossier, (t, p) => evenements.push([t, p]));
  assert.strictEqual(await bot.testerIA('salut'), 'ok');
  assert.strictEqual(bot.config.modele, 'gemini-3.8-flash');
  assert.ok(evenements.some(([t, p]) => t === 'modele' && p === 'gemini-3.8-flash'));

  // 3. Clé invalide -> message clair
  global.fetch = async () => reponse(400, { error: { message: 'API key not valid. Please pass a valid API key.' } });
  bot = new Bot({ cleApi: 'mauvaise', modele: 'gemini-3.8-flash' }, dossier, () => {});
  await assert.rejects(() => bot.testerIA('salut'), /Clé API refusée/);

  // 4. Réponse bloquée / vide
  global.fetch = async () => reponse(200, { candidates: [{ finishReason: 'SAFETY' }] });
  bot = new Bot({ cleApi: 'k', modele: 'gemini-3.8-flash' }, dossier, () => {});
  await assert.rejects(() => bot.testerIA('salut'), /SAFETY/);

  console.log('TOUS LES TESTS PASSENT');
})().catch((e) => { console.error(e); process.exit(1); });
