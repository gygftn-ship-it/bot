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
  const reponse = (status, corps) => ({ ok: status < 300, status, json: async () => corps });
  const ok = (texte) => reponse(200, { candidates: [{ content: { parts: [{ text: texte }] } }] });
  const quota = (sec) =>
    reponse(429, {
      error: {
        message: `You exceeded your current quota.\n* Quota exceeded for metric: generate_content_free_tier_requests, limit: 5\nPlease retry in ${sec}s.`,
        details: [{ retryDelay: `${sec}s` }],
      },
    });
  const nouveau = (cfg, evts = []) =>
    new Bot({ cleApi: 'k', ...cfg }, dossier, (t, p) => evts.push([t, p]));

  // 1. Cas normal
  global.fetch = async () => ok('coucou toi 😘');
  assert.strictEqual(await nouveau({ modele: 'gemini-3.5-flash-lite' }).testerIA('salut'), 'coucou toi 😘');

  // 2. Modèle introuvable -> un modèle de secours est utilisé et retenu
  let evts = [];
  global.fetch = async (url) =>
    String(url).includes('vieux-modele')
      ? reponse(404, { error: { message: 'models/vieux-modele is not found for API version v1beta' } })
      : ok('ok');
  let bot = nouveau({ modele: 'vieux-modele' }, evts);
  assert.strictEqual(await bot.testerIA('salut'), 'ok');
  assert.strictEqual(bot.config.modele, 'gemini-3.5-flash-lite');
  assert.ok(evts.some(([t, p]) => t === 'modele' && p === 'gemini-3.5-flash-lite'));

  // 3. Limite atteinte sur le modèle principal -> secours, sans changer le réglage
  evts = [];
  global.fetch = async (url) => (String(url).includes('gemini-3.8-flash') ? quota(46) : ok('via secours'));
  bot = nouveau({ modele: 'gemini-3.8-flash' }, evts);
  assert.strictEqual(await bot.testerIA('salut'), 'via secours');
  assert.strictEqual(bot.config.modele, 'gemini-3.8-flash');
  assert.ok(bot.bloques['gemini-3.8-flash'] > Date.now());
  assert.ok(!evts.some(([t]) => t === 'modele'));

  // 4. Aucun modèle connu ne marche -> choix dans la liste de la clé
  global.fetch = async (url) => {
    if (String(url).includes('/models?pageSize')) {
      return reponse(200, { models: [{ name: 'models/gemini-9-flash', supportedGenerationMethods: ['generateContent'] }] });
    }
    return String(url).includes('gemini-9-flash')
      ? ok('depuis la liste')
      : reponse(404, { error: { message: 'model is not found' } });
  };
  bot = nouveau({ modele: 'a' });
  assert.strictEqual(await bot.testerIA('salut'), 'depuis la liste');
  assert.strictEqual(bot.config.modele, 'gemini-9-flash');

  // 5. Clé invalide -> message clair, sans essayer d'autres modèles
  let appels = 0;
  global.fetch = async () => { appels++; return reponse(400, { error: { message: 'API key not valid. Please pass a valid API key.' } }); };
  await assert.rejects(() => nouveau({ cleApi: 'mauvaise' }).testerIA('salut'), /Clé API refusée/);
  assert.strictEqual(appels, 1);

  // 6. Réponse bloquée / vide
  global.fetch = async () => reponse(200, { candidates: [{ finishReason: 'SAFETY' }] });
  await assert.rejects(() => nouveau({}).testerIA('salut'), /SAFETY/);

  // 7. Tous les modèles saturés -> erreur lisible
  global.fetch = async () => quota(46);
  await assert.rejects(() => nouveau({}).testerIA('salut'), /Aucun modèle n'a pu répondre/);

  console.log('TOUS LES TESTS PASSENT');
})().catch((e) => { console.error(e); process.exit(1); });
