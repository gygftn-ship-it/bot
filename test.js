// Tests rapides de la logique (aucun accès réseau, aucun navigateur).
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  normaliserNumeros, dedoublonnerNumeros, estAutorise, meilleurModele, decouperReponse, dansHoraires,
  nettoyerTexte, limiterReponse, dureeFrappe, dureeLecture,
} = require('./utils');
const { Bot } = require('./bot');
const H = require('./humain');
const { fusionnerRoles } = require('./fournisseurs');

// ---- utils ----
assert.deepStrictEqual(normaliserNumeros('+33 6 12 34 56 78, 0699887766'), ['33612345678', '0699887766']);
assert.deepStrictEqual(dedoublonnerNumeros(['0555123456', '213555123456', '213555123456']), ['213555123456']);
assert.deepStrictEqual(dedoublonnerNumeros(['213555123456', '213666777888']), ['213555123456', '213666777888']);
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


// ---- forme des réponses ----
assert.strictEqual(nettoyerTexte('**Salut** toi !'), 'Salut toi !');
assert.strictEqual(nettoyerTexte('"coucou"'), 'coucou');
assert.strictEqual(nettoyerTexte('- un\n- deux'), 'un\ndeux');
assert.deepStrictEqual(limiterReponse(['Phrase une ici. Phrase deux ici. Phrase trois ici.'], 40), ['Phrase une ici. Phrase deux ici.']);
assert.strictEqual(limiterReponse(['a'.repeat(100)], 50)[0].length, 50);
assert.deepStrictEqual(limiterReponse(['salut toi', 'ça va ?', 'et sinon quoi de neuf avec ta journée'], 40), ['salut toi', 'ça va ?']);
assert.ok(dureeFrappe('mdr oui 😂', 250, () => 0.5) >= 1500);
assert.ok(dureeFrappe('x'.repeat(500), 250, () => 0.5) <= 20000);
assert.ok(dureeLecture('x'.repeat(2000), 40, () => 0.5) <= 8000);
assert.ok(dureeLecture('ok', 40, () => 0.5) >= 800);

const botForme = new Bot({ cleApi: 'k', longueurMax: 120 }, require('os').tmpdir(), () => {});
assert.deepStrictEqual(botForme.preparerReponse('[RIEN]'), []);
assert.deepStrictEqual(botForme.preparerReponse('  [rien] '), []);
assert.deepStrictEqual(botForme.preparerReponse('**Salut** toi\n\nça va ?'), ['Salut toi', 'ça va ?']);
assert.deepStrictEqual(botForme.preparerReponse('a\n\nb\n\nc'), ['a', 'b']);
const long = 'Je te raconte ma journée. '.repeat(30);
assert.ok(botForme.preparerReponse(long).join('').length <= 120);
assert.ok(botForme.construirePrompt().includes('FORME DES MESSAGES'));
assert.ok(botForme.construirePrompt().includes('120 caractères'));
assert.ok(require('./lina').PROMPT_LINA.includes('Tu t\'appelles Lina.'));


// ---- comportement humain (fonctions pures) ----
// Alger = UTC+1 toute l'année. Le 4 novembre 2026 est un mercredi (jour de cours).
const algerCfg = { fuseau: 'Africa/Algiers', heureReveil: 7.5, heureCoucher: 0.5 };
assert.strictEqual(H.etatDeVie(new Date('2026-11-04T02:00:00Z'), algerCfg).dort, true); // 03h00
assert.strictEqual(H.etatDeVie(new Date('2026-11-04T09:00:00Z'), algerCfg).code, 'cours'); // 10h00
assert.strictEqual(H.etatDeVie(new Date('2026-11-04T11:30:00Z'), algerCfg).code, 'repas'); // 12h30
assert.strictEqual(H.etatDeVie(new Date('2026-11-04T20:00:00Z'), algerCfg).code, 'soiree'); // 21h00
assert.strictEqual(H.etatDeVie(new Date('2026-11-04T23:20:00Z'), algerCfg).code, 'coucher'); // 00h20
assert.strictEqual(H.etatDeVie(new Date('2026-11-06T09:00:00Z'), algerCfg).code, 'matin'); // vendredi 10h00 : pas cours
const nuit = H.etatDeVie(new Date('2026-11-04T02:00:00Z'), algerCfg); // 03h00 -> réveil à 07h30 = 270 min
assert.strictEqual(nuit.reveilDans, 270);
assert.ok(H.etatDeVie(new Date('2026-11-04T09:00:00Z'), algerCfg).dispo <= 0.4);
assert.ok(H.heureLocale(new Date('2026-11-04T23:30:00Z'), 'Africa/Algiers').h === 0);
assert.strictEqual(H.humeur(new Date('2026-11-04T09:00:00Z'), algerCfg), H.humeur(new Date('2026-11-04T09:30:00Z'), algerCfg));
// Latences
let lat = H.latence(nuit, { latenceRealiste: true }, {}, () => 0.5);
assert.strictEqual(lat.mode, 'reveil');
assert.ok(lat.secondes >= 270 * 60);
lat = H.latence({ dort: false, dispo: 0.25 }, {}, {}, () => 0.99);
assert.strictEqual(lat.mode, 'lent');
assert.ok(lat.secondes >= 480);
lat = H.latence({ dort: false, dispo: 0.25 }, { delaiMin: 3, delaiMax: 25 }, { conversationActive: true }, () => 0.99);
assert.strictEqual(lat.mode, 'rapide');
assert.ok(lat.secondes >= 3 && lat.secondes <= 25);
lat = H.latence(nuit, { latenceRealiste: false, delaiMin: 1, delaiMax: 2 }, {}, () => 0.5);
assert.ok(lat.secondes >= 1 && lat.secondes <= 2);
assert.strictEqual(H.formatDuree(45), '45 s');
assert.strictEqual(H.formatDuree(600), '10 min');
assert.strictEqual(H.formatDuree(7500), '2 h 05');
// Frappe, fautes, réactions
const planLong = H.planFrappe('x'.repeat(200), 250, dureeFrappe, () => 0.99);
assert.strictEqual(planLong.filter((e) => e.pause).length, 2);
assert.ok(planLong.filter((e) => e.tape).reduce((a, e) => a + e.tape, 0) <= 20000);
assert.strictEqual(H.planFrappe('ok', 250, dureeFrappe, () => 0.99).length, 1);
const faute = H.ajouterFaute('bonjour toi', () => 0);
assert.deepStrictEqual(faute, { texte: 'bnojour toi', correction: '*bonjour' });
assert.strictEqual(H.ajouterFaute('ok oui', () => 0), null);
assert.deepStrictEqual(H.extraireReaction('[REACT:❤️]'), { texte: '', emoji: '❤️' });
assert.deepStrictEqual(H.extraireReaction('mdr [react: 👍] ok'), { texte: 'mdr  ok', emoji: '👍' });
assert.strictEqual(H.extraireReaction('salut').emoji, null);
// Plan des messages spontanés
const plan = H.planDuJour(new Date('2026-11-04T09:00:00Z'), { ...algerCfg, initiativeParJour: 3 }, H.graine('test'));
assert.ok(plan.length >= 1);
assert.deepStrictEqual(plan.map((i) => i.at), plan.map((i) => i.at).sort((a, b) => a - b));
assert.ok(plan.every((i) => H.CONSIGNES[i.type] && i.fait === false));
assert.ok(H.planDuJour(new Date('2026-11-04T09:00:00Z'), { ...algerCfg, initiativeParJour: 0 }, () => 0.5).every((i) => ['bonjour', 'bonne_nuit'].includes(i.type)));
const jdv = H.jourDeVie(new Date('2026-11-04T23:20:00Z'), algerCfg); // 00h20 jeudi = encore la journée de mercredi
assert.strictEqual(jdv.cle, '2026-11-04');
assert.ok(jdv.m > 1400);
// Fusion des rôles (exigée par les API)
assert.deepStrictEqual(
  fusionnerRoles([{ role: 'model', content: 'x' }, { role: 'user', content: 'a' }, { role: 'model', content: 'b' }, { role: 'model', content: 'c' }, { role: 'user', content: 'd' }]),
  [{ role: 'user', content: '(début de la conversation)', media: undefined }, { role: 'assistant', content: 'x', media: undefined }, { role: 'user', content: 'a', media: undefined }, { role: 'assistant', content: 'b\n\nc', media: undefined }, { role: 'user', content: 'd', media: undefined }]
);
// Le prompt contient la situation, la mémoire et la règle de réaction
assert.ok(botForme.construirePrompt().includes('SITUATION ACTUELLE'));
assert.ok(botForme.construirePrompt().includes('[REACT:'));
botForme.memoires.x = { faits: '- il aime le café' };
assert.ok(botForme.construirePrompt('x').includes('il aime le café'));
assert.ok(!require('./lina').PROMPT_LINA.includes('virtuelle'));


// ---- vie qui continue (événements, jours sans envie, « vu », doubles messages) ----
const V = require('./vie');
{
  const JOUR = V.JOUR;
  const cfgV = { fuseau: 'Africa/Algiers', heureReveil: 7.5, heureCoucher: 0.5 };
  const t0 = new Date('2026-11-04T09:00:00Z').getTime(); // mercredi 10h à Alger, réveillée

  // Premier lancement : un événement est créé tout de suite ; pas de second tirage le même jour.
  const vie = V.nouvelEtatVie();
  let ch = V.majVie(vie, t0, cfgV, () => 0.5);
  assert.strictEqual(ch.length, 1);
  assert.strictEqual(ch[0].type, 'cree');
  assert.strictEqual(vie.evenements.length, 1);
  assert.strictEqual(V.majVie(vie, t0 + 3600000, cfgV, () => 0).length, 0);
  // Endormie : rien n'est tiré
  const nuitVie = V.nouvelEtatVie();
  assert.strictEqual(V.majVie(nuitVie, new Date('2026-11-04T02:00:00Z').getTime(), cfgV, () => 0).length, 0);
  assert.strictEqual(V.majVie(V.nouvelEtatVie(), t0, { ...cfgV, evenementsVie: false }, () => 0).length, 0);

  // Chaque type d'événement : phases triées, la première commence maintenant, notes non vides, durée raisonnable
  for (const c of V.CATALOGUE) {
    for (const r of [() => 0, () => 0.5, () => 0.99, H.graine('x')]) {
      const ev = c.creer({ now: t0, cfg: cfgV, r });
      assert.strictEqual(ev.type, c.type);
      assert.ok(ev.titre && ev.phases.length >= 2, c.type);
      assert.strictEqual(ev.phases[0].at, t0);
      assert.ok(ev.phases.every((p, i) => p.note && (i === 0 || p.at >= ev.phases[i - 1].at)), c.type + ' phases triées');
      assert.ok(ev.phases[ev.phases.length - 1].at - t0 < 16 * JOUR, c.type + ' trop long');
    }
  }

  // L'examen n'a jamais lieu un vendredi ni un samedi (Alger)
  for (let i = 0; i < 40; i++) {
    const ev = V.CATALOGUE.find((c) => c.type === 'examen').creer({ now: t0 + i * JOUR, cfg: cfgV, r: H.graine('exam' + i) });
    const jourExam = ev.phases.find((p) => p.code === 'jour').at;
    assert.ok([0, 1, 2, 3, 4].includes(H.heureLocale(new Date(jourExam), 'Africa/Algiers').jour));
  }

  // Cycle de vie d'un examen : annonce -> bloc de prompt -> nouveauté racontée -> archivé
  const v2 = { evenements: [], termines: [], cleJour: 'x', dernierParType: {} };
  const ex = V.CATALOGUE.find((c) => c.type === 'examen').creer({ now: t0, cfg: cfgV, r: () => 0.5 });
  v2.evenements.push({ id: 'ex1', type: 'examen', titre: ex.titre, debut: t0, phases: ex.phases.map((p) => ({ ...p, dit: false, expose: 0 })) });
  const bloc = V.blocVie(v2, t0 + 1000);
  assert.ok(bloc.includes('TA VIE EN CE MOMENT') && bloc.includes('examen') && bloc.includes('pas encore raconté'));
  assert.strictEqual(V.prochaineNouvelle(v2, t0 + 1000), null); // trop tôt : 10 à 90 min d'attente
  const n = V.prochaineNouvelle(v2, t0 + 100 * 60000);
  assert.ok(n && n.phase.code === 'annonce');
  assert.strictEqual(V.marquerExposees(v2, t0 + 100 * 60000), true);
  assert.ok(V.blocVie(v2, t0 + 100 * 60000).includes('pas encore raconté'));
  V.marquerExposees(v2, t0 + 100 * 60000);
  assert.ok(!V.blocVie(v2, t0 + 100 * 60000).includes('pas encore raconté')); // dit après 2 expositions
  assert.strictEqual(V.prochaineNouvelle(v2, t0 + 100 * 60000), null);
  // Plus tard, le résultat devient la nouvelle phase à raconter
  const tRes = ex.phases[ex.phases.length - 1].at + 3600000;
  const nr = V.prochaineNouvelle(v2, tRes);
  assert.ok(nr && nr.phase.code === 'resultat' && /\/20/.test(nr.phase.note));
  assert.ok(V.consigneEvenement(nr.ev, nr.phase).includes('/20'));
  // Après la fin : archivé, encore mentionné quelques jours, puis oublié
  const tFin = ex.phases[ex.phases.length - 1].at + 2 * JOUR;
  ch = V.majVie(v2, tFin, { ...cfgV, evenementsVie: false }, () => 0);
  assert.deepStrictEqual(ch.map((c) => c.type), ['termine']);
  assert.strictEqual(v2.evenements.length, 0);
  assert.ok(V.blocVie(v2, tFin).includes('terminé récemment'));
  assert.strictEqual(V.blocVie(v2, tFin + 10 * JOUR), '');

  // Pas deux événements du même type en même temps, 3 au maximum, et ça finit par en arriver
  const v3 = V.nouvelEtatVie();
  let maxActifs = 0;
  const types = new Set();
  const rr = H.graine('simulation');
  for (let i = 0; i < 60; i++) {
    const now = t0 + i * JOUR;
    V.majVie(v3, now, { ...cfgV, maxEvenements: 2 }, rr);
    const actifs = V.evenementsActifs(v3, now);
    maxActifs = Math.max(maxActifs, actifs.length);
    assert.strictEqual(new Set(actifs.map((a) => a.type)).size, actifs.length);
    actifs.forEach((a) => types.add(a.type));
  }
  assert.ok(maxActifs >= 1 && maxActifs <= 2, 'actifs max : ' + maxActifs);
  assert.ok(types.size >= 3, 'variété : ' + [...types]);

  // Jours sans envie : stables, ni trop rares ni trop fréquents, toujours dans la journée éveillée
  let off = 0;
  for (let i = 0; i < 400; i++) {
    const d = new Date(t0 + i * JOUR);
    const hs = V.humeurSpeciale(d, cfgV);
    assert.deepStrictEqual(hs, V.humeurSpeciale(d, cfgV));
    if (hs) {
      off++;
      const j = H.jourDeVie(d, cfgV);
      assert.ok(hs.debut >= j.reveil + 60 && hs.fin <= j.coucher - 90 && hs.fin - hs.debut >= 90);
      assert.ok(['sans_envie', 'vexee', 'froide'].includes(hs.type));
    }
  }
  assert.ok(off > 15 && off < 90, 'jours sans envie sur 400 : ' + off);
  assert.strictEqual(V.humeurSpeciale(new Date(t0), { ...cfgV, joursOff: false }), null);
  assert.strictEqual(V.humeurSpeciale(new Date(t0), { ...cfgV, probaJourOff: 0 }), null);
  assert.ok(V.humeurSpeciale(new Date(t0), { ...cfgV, probaJourOff: 100 }) !== null);
  // Fenêtre : avant / pendant / retour
  const jOff = H.jourDeVie(new Date(t0), cfgV);
  const hsAlways = V.humeurSpeciale(new Date(t0), { ...cfgV, probaJourOff: 100 });
  const dateA = (m) => new Date(t0 + (m - jOff.m) * 60000);
  assert.strictEqual(V.humeurSpeciale(dateA(hsAlways.debut + 5), { ...cfgV, probaJourOff: 100 }).actif, true);
  assert.strictEqual(V.humeurSpeciale(dateA(hsAlways.fin + 5), { ...cfgV, probaJourOff: 100 }).retour, true);
  assert.ok(V.blocHumeurSpeciale({ type: 'vexee', actif: true }).includes('chantage affectif'));
  assert.ok(V.blocHumeurSpeciale({ type: 'froide', retour: true }).includes('RETOUR'));
  assert.strictEqual(V.blocHumeurSpeciale(null), '');
  // Elle répond plus lentement quand elle n'a pas envie, même en pleine discussion
  const eveillee = { dort: false, dispo: 1 };
  assert.strictEqual(V.latence(eveillee, {}, { conversationActive: true }, { actif: true }, () => 0.9).mode, 'pas d\'humeur, lent');
  assert.ok(V.latence(eveillee, {}, { conversationActive: true }, { actif: true }, () => 0.9).secondes >= 900);
  assert.strictEqual(V.latence(eveillee, {}, { conversationActive: true }, null, () => 0.9).mode, 'rapide');

  // « Vu » sans réponse
  assert.strictEqual(V.decisionVu({ vuSansReponse: 0 }, null, { texte: 'coucou' }, () => 0), null);
  assert.ok(V.decisionVu({}, null, { texte: 'coucou' }, () => 0).minutes >= 25);
  assert.strictEqual(V.decisionVu({}, null, { texte: 'coucou' }, () => 0.9), null);
  assert.strictEqual(V.decisionVu({}, null, { texte: 'coucou', dort: true }, () => 0), null);
  assert.strictEqual(V.decisionVu({}, null, { texte: 'coucou', resteAvantCoucher: 30 }, () => 0), null); // pas juste avant de dormir
  assert.ok(V.decisionVu({}, null, { texte: 'coucou', resteAvantCoucher: 90 }, () => 0).minutes <= 70);
  assert.strictEqual(V.decisionVu({}, null, { texte: 'coucou' }, () => 0.1), null); // 6 % seulement
  assert.ok(V.decisionVu({}, { actif: true, type: 'vexee' }, { texte: 'coucou' }, () => 0.1)); // 35 % quand elle est vexée
  assert.strictEqual(V.decisionVu({}, { actif: true, type: 'vexee' }, { texte: 'coucou', conversationActive: true }, () => 0.2), null); // rare en pleine discussion

  // Doubles messages
  assert.strictEqual(V.tireEmballement({ doubleMessage: 0 }, { humeur: 'excitée' }, () => 0), false);
  assert.strictEqual(V.tireEmballement({}, { humeur: 'calme' }, () => 0.5), false);
  assert.strictEqual(V.tireEmballement({}, { humeur: 'de très bonne humeur, pleine d\'énergie' }, () => 0.15), true); // 8 % x 2,5 = 20 %
  assert.strictEqual(V.tireEmballement({}, { humeur: 'calme', hs: { actif: true } }, () => 0), false); // jamais quand elle n'a pas envie
}

// ---- indicateur « écrit… » : l'identifiant passé à WhatsApp Web doit être un objet avec toJid ----
(async () => {
  const { PAGE_ETAT_ECRITURE } = require('./bot');
  const vus = [];
  const widOk = { toJid: () => 'x@c.us' };
  global.window = { require: () => null, Store: { Chat: { get: () => ({ id: widOk }) }, ChatState: { sendChatStateComposing: async (w) => { vus.push(w); } } } };
  assert.strictEqual(await PAGE_ETAT_ECRITURE('213555@c.us', 'typing'), 'Store.ChatState.sendChatStateComposing');
  assert.strictEqual(vus[0], widOk);
  // Sans Store.Chat : repli sur la fabrique d'identifiants du module WhatsApp
  global.window = { require: (n) => (n === 'WAWebWidFactory' ? { createWid: () => widOk } : null), Store: { ChatState: { sendChatStateComposing: async (w) => { vus.push(w); } } } };
  await PAGE_ETAT_ECRITURE('213555@c.us', 'typing');
  assert.strictEqual(vus[1], widOk);
  // Mode « test » : rien n'est envoyé
  await PAGE_ETAT_ECRITURE('0@c.us', 'test');
  assert.strictEqual(vus.length, 2);
  delete global.window;
})().catch((e) => { console.error(e); process.exit(1); });

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


  // 8. Autres fournisseurs
  let derniereRequete = null;
  global.fetch = async (url, opts) => { derniereRequete = { url: String(url), opts }; return reponse(200, { content: [{ type: 'text', text: 'salut claude' }] }); };
  assert.strictEqual(await nouveau({ fournisseur: 'anthropic' }).testerIA('salut'), 'salut claude');
  assert.ok(derniereRequete.url.startsWith('https://api.anthropic.com/v1/messages'));
  assert.strictEqual(derniereRequete.opts.headers['x-api-key'], 'k');
  assert.strictEqual(JSON.parse(derniereRequete.opts.body).model, 'claude-haiku-5-5');
  global.fetch = async (url, opts) => { derniereRequete = { url: String(url), opts }; return reponse(200, { choices: [{ message: { content: 'salut gpt' } }] }); };
  assert.strictEqual(await nouveau({ fournisseur: 'openai', modeleAutre: 'm', baseUrl: 'https://x.test/v1/' }).testerIA('salut'), 'salut gpt');
  assert.strictEqual(derniereRequete.url, 'https://x.test/v1/chat/completions');
  await assert.rejects(() => nouveau({ fournisseur: 'openai' }).testerIA('salut'), /nom du modèle/);

  // 9. Simulation complète d'une conversation avec un faux WhatsApp
  const configFlux = {
    cleApi: 'k', numerosAutorises: '213555', attenteFin: 0, latenceRealiste: false, delaiMin: 0, delaiMax: 0,
    echelleTemps: 0.001, fautesFrappe: 0, memoireLongue: false, initiativeActive: false, longueurMax: 200,
    vuSansReponse: 0, doubleMessage: 0, joursOff: false, evenementsVie: false,
  };
  const monter = (cfg = {}) => {
    const actions = [];
    const chat = {
      id: { _serialized: '213555@c.us' },
      sendSeen: async () => { actions.push('seen'); },
      sendMessage: async (t, o) => { actions.push('send:' + t + (o && o.quotedMessageId ? ' (cité)' : '')); },
      sendStateTyping: async () => { actions.push('typing-lib'); },
      clearState: async () => {},
    };
    const b = new Bot({ ...configFlux, ...cfg }, fs.mkdtempSync(path.join(os.tmpdir(), 'bot-flux-')), () => {});
    b.numeros = ['213555'];
    b.client = {
      pupPage: { evaluate: async (fn, id, etat) => { actions.push('etat:' + etat); return 'faux'; } },
      sendPresenceAvailable: async () => { actions.push('en ligne'); },
      sendPresenceUnavailable: async () => { actions.push('hors ligne'); },
      getChatById: async () => chat,
      getNumberId: async () => ({ _serialized: '213555@c.us' }),
    };
    const message = (type, body, extra = {}) => ({
      fromMe: false, isStatus: false, from: '213555@c.us', type, body, id: { _serialized: 'm' + Math.random() },
      getContact: async () => ({ number: '213555' }), getChat: async () => chat,
      react: async (e) => { actions.push('réaction:' + e); }, ...extra,
    });
    const terminer = async () => {
      for (let i = 0; i < 200 && !b.file['213555']; i++) await new Promise((r) => setTimeout(r, 10));
      await b.file['213555'];
    };
    return { b, actions, message, terminer };
  };

  // 9a. Elle lit, « écrit… », puis envoie, dans cet ordre
  global.fetch = async () => ok('salut toi 😘');
  let f = monter();
  await f.b.surMessage(f.message('chat', 'coucou'));
  await f.terminer();
  const iVu = f.actions.indexOf('seen');
  const iEcrit = f.actions.indexOf('etat:typing');
  const iEnvoi = f.actions.indexOf('send:salut toi 😘');
  assert.ok(iVu >= 0 && iEcrit > iVu && iEnvoi > iEcrit, 'ordre vu -> écrit -> envoi : ' + f.actions.join(' | '));
  assert.ok(f.actions.includes('hors ligne'));
  assert.strictEqual(f.b.historiques['213555'].length, 2);

  // 9b. Si l'appel « page » échoue, la bibliothèque prend le relais
  f = monter();
  f.b.client.pupPage.evaluate = async () => { throw new Error('introuvable'); };
  await f.b.surMessage(f.message('chat', 'coucou'));
  await f.terminer();
  assert.ok(f.actions.includes('typing-lib') && f.actions.includes('send:salut toi 😘'));

  // 9c. Réaction emoji seule, sans texte
  global.fetch = async () => ok('[REACT:❤️]');
  f = monter();
  await f.b.surMessage(f.message('chat', 'je t\'aime'));
  await f.terminer();
  assert.ok(f.actions.includes('réaction:❤️'));
  assert.ok(!f.actions.some((a) => a.startsWith('send:')));
  assert.strictEqual(f.b.historiques['213555'][1].content, '[REACT:❤️]');

  // 9d. Rien à répondre
  global.fetch = async () => ok('[RIEN]');
  f = monter();
  await f.b.surMessage(f.message('chat', 'ok'));
  await f.terminer();
  assert.ok(!f.actions.some((a) => a.startsWith('send:')));

  // 9e. Note vocale : transcrite puis mémorisée
  let corps = [];
  global.fetch = async (url, opts) => {
    const b = JSON.parse(opts.body);
    corps.push(b);
    const audio = JSON.stringify(b).includes('inlineData');
    return ok(audio ? 'tu me manques' : 'toi aussi');
  };
  f = monter();
  await f.b.surMessage(f.message('ptt', '', { downloadMedia: async () => ({ mimetype: 'audio/ogg; codecs=opus', data: 'AAAA' }) }));
  await f.terminer();
  assert.ok(corps[0].contents[0].parts[0].inlineData.mimeType === 'audio/ogg');
  assert.ok(f.b.historiques['213555'][0].content.startsWith('[vocal] tu me manques'));
  assert.ok(f.actions.includes('send:toi aussi'));

  // 9f. Faute de frappe corrigée juste après
  global.fetch = async () => ok('je rentre bientôt');
  f = monter({ fautesFrappe: 100 });
  await f.b.surMessage(f.message('chat', 'tu fais quoi'));
  await f.terminer();
  const envois = f.actions.filter((a) => a.startsWith('send:'));
  assert.strictEqual(envois.length, 2);
  assert.ok(envois[1].startsWith('send:*'));
  assert.strictEqual(f.b.historiques['213555'][1].content, 'je rentre bientôt'); // la mémoire garde le texte juste

  // 9g. Message spontané
  global.fetch = async () => ok('bonne nuit mon cœur 🌙');
  f = monter();
  await f.b.envoyerInitiative('213555', { type: 'bonne_nuit' });
  assert.ok(f.actions.includes('send:bonne nuit mon cœur 🌙'));
  assert.strictEqual(f.b.etatNum('213555').sansReponse, 1);
  assert.strictEqual(f.b.historiques['213555'].length, 1); // le message spontané est bien mémorisé

  // 9h. Message reçu hors numéros autorisés : ignoré
  f = monter();
  await f.b.surMessage(f.message('chat', 'salut', { from: '999@c.us', getContact: async () => ({ number: '999' }) }));
  assert.ok(!f.b.pending['999']);


  // 9i. Les nouvelles règles de forme : doubles messages
  {
    const reglesNormales = botForme.reglesDeForme();
    const reglesEmballee = botForme.reglesDeForme({ emballee: true });
    assert.ok(!reglesNormales.includes('Là tu t\'emballes'));
    assert.ok(reglesEmballee.includes('Là tu t\'emballes') && reglesEmballee.includes('192 caractères'));
    assert.deepStrictEqual(botForme.preparerReponse('a\n\nb\n\nc', { emballee: true }), ['a', 'b']);
    assert.deepStrictEqual(new Bot({ cleApi: 'k', bullesMax: 1 }, os.tmpdir(), () => {}).preparerReponse('a\n\nb', { emballee: true }), ['a', 'b']);
  }

  // 9j. Elle s'emballe : deux messages d'affilée, le second tapé vite
  {
    const vrai = V.tireEmballement;
    V.tireEmballement = () => true;
    let prompts = [];
    global.fetch = async (url, opts) => { prompts.push(JSON.parse(opts.body).systemInstruction.parts[0].text); return ok('attends !!\n\nj\'ai trop de trucs à te dire'); };
    f = monter();
    await f.b.surMessage(f.message('chat', 'alors ?'));
    await f.terminer();
    V.tireEmballement = vrai;
    const env = f.actions.filter((a) => a.startsWith('send:'));
    assert.deepStrictEqual(env, ['send:attends !!', 'send:j\'ai trop de trucs à te dire']);
    assert.ok(prompts[0].includes('Là tu t\'emballes'));
  }

  // 9k. « Vu » sans réponse : lu, pas de réponse, puis réponse plus tard avec la mention du retard
  {
    const vrai = V.decisionVu;
    let n = 0;
    V.decisionVu = () => (n++ === 0 ? { minutes: 30 } : null);
    let prompts = [];
    global.fetch = async (url, opts) => { prompts.push(JSON.parse(opts.body).systemInstruction.parts[0].text); return ok('ah pardon j\'avais oublié 😭'); };
    f = monter();
    await f.b.surMessage(f.message('chat', 'tu fais quoi ?'));
    await f.terminer();
    assert.ok(f.actions.includes('seen'), 'le message est lu');
    assert.ok(!f.actions.some((a) => a.startsWith('send:')), 'mais sans réponse tout de suite');
    assert.ok(f.actions.includes('hors ligne'));
    const p = f.b.pending['213555'];
    assert.strictEqual(p.textes.length, 1);
    assert.strictEqual(p.dejaVu, true);
    assert.strictEqual(f.b.etat.attente['213555'].vu, true);
    assert.strictEqual(prompts.length, 0, 'aucun appel IA pendant le « vu »');
    // 30 min x échelle 0.001 = 1,8 s plus tard, elle répond (et ne ghoste pas une deuxième fois)
    for (let i = 0; i < 400 && !f.actions.some((a) => a.startsWith('send:')); i++) await new Promise((r) => setTimeout(r, 10));
    await f.b.file['213555'];
    V.decisionVu = vrai;
    assert.ok(f.actions.includes('send:ah pardon j\'avais oublié 😭'));
    assert.ok(prompts[0].includes('lu son message sans y répondre'));
    assert.strictEqual(f.b.pending['213555'].dejaVu, false);
    assert.strictEqual(f.b.etat.attente['213555'], undefined);
  }

  // 9l. Message lu puis relance de sa part pendant le « vu » : elle répond vite aux deux, sans ghoster à nouveau
  {
    const vrai = V.decisionVu;
    V.decisionVu = () => ({ minutes: 120 });
    global.fetch = async () => ok('mdr je suis là');
    f = monter({ citations: false });
    await f.b.surMessage(f.message('chat', 'tu fais quoi ?'));
    // il relance pendant qu'elle « lit »
    await new Promise((r) => setTimeout(r, 30));
    await f.b.surMessage(f.message('chat', 'allô ??'));
    await f.terminer();
    for (let i = 0; i < 400 && !f.actions.some((a) => a.startsWith('send:')); i++) await new Promise((r) => setTimeout(r, 10));
    await f.b.file['213555'];
    V.decisionVu = vrai;
    assert.ok(f.actions.includes('send:mdr je suis là'), f.actions.join(' | '));
    assert.ok(f.b.historiques['213555'][0].content.includes('tu fais quoi ?') && f.b.historiques['213555'][0].content.includes('allô ??'));
  }

  // 9m. Les événements de sa vie entrent dans le prompt, sans parasiter les tests ci-dessus
  {
    const prompts = [];
    global.fetch = async (url, opts) => { prompts.push(JSON.parse(opts.body).systemInstruction.parts[0].text); return ok('oui j\'ai mon exam lundi'); };
    f = monter({ evenementsVie: true });
    const now = Date.now();
    f.b.etat.vie = {
      evenements: [{ id: 'ex-test', type: 'examen', titre: 'examen de test', debut: now - 1000, phases: [
        { at: now - 1000, code: 'annonce', annonce: true, note: 'Tu as un examen de TESTMATIERE lundi.', dit: false, expose: 0 },
      ] }],
      termines: [], cleJour: null, dernierParType: { examen: now },
    };
    await f.b.surMessage(f.message('chat', 'tu as un truc cette semaine ?'));
    await f.terminer();
    assert.ok(prompts[0].includes('TA VIE EN CE MOMENT') && prompts[0].includes('TESTMATIERE'));
    assert.strictEqual(f.b.etat.vie.evenements[0].phases[0].expose, 1); // une exposition de comptée
    // Désactivé : le bloc disparaît
    prompts.length = 0;
    f = monter({ evenementsVie: false });
    f.b.etat.vie = { evenements: [{ id: 'x', type: 'examen', titre: 't', debut: now - 1000, phases: [{ at: now - 1000, code: 'annonce', annonce: true, note: 'TESTMATIERE', dit: false, expose: 0 }] }], termines: [], cleJour: null, dernierParType: {} };
    await f.b.surMessage(f.message('chat', 'coucou'));
    await f.terminer();
    assert.ok(!prompts[0].includes('TESTMATIERE'));
  }

  // 9n. Elle annonce d'elle-même une nouveauté (« j'ai eu mon exam ! ») une seule fois ; mot de retour après un jour sans envie
  {
    const prompts = [];
    global.fetch = async (url, opts) => { prompts.push(JSON.parse(opts.body)); return ok('j\'ai eu mon exam !! 😭'); };
    f = monter({ evenementsVie: true });
    const now = Date.now();
    const phase = { at: now - 2 * 3600000, code: 'resultat', annonce: true, note: 'Tu as eu ta note : 15/20.', dit: false, expose: 0 };
    f.b.etat.vie = { evenements: [{ id: 'ex-news', type: 'examen', titre: 'examen', debut: now - 5 * V.JOUR, phases: [phase] }], termines: [], cleJour: null, dernierParType: { examen: now } };
    assert.strictEqual(await f.b.tickSpeciaux('213555', null), true);
    assert.ok(f.actions.includes('send:j\'ai eu mon exam !! 😭'));
    assert.ok(JSON.stringify(prompts[0].contents).includes('15/20'));
    assert.strictEqual(phase.dit, true);
    assert.strictEqual(await f.b.tickSpeciaux('213555', null), false); // pas deux fois
    // En pleine discussion : elle n'interrompt pas
    f = monter({ evenementsVie: true });
    f.b.etat.vie = { evenements: [{ id: 'ex-news2', type: 'examen', titre: 'examen', debut: now - 5 * V.JOUR, phases: [{ ...phase, dit: false }] }], termines: [], cleJour: null, dernierParType: { examen: now } };
    f.b.etatNum('213555').dernierUser = Date.now() - 60000;
    assert.strictEqual(await f.b.tickSpeciaux('213555', null), false);
    // Retour après une période sans envie : un seul petit mot
    global.fetch = async (url, opts) => { prompts.push(JSON.parse(opts.body)); return ok('coucou, désolée j\'étais pas d\'humeur ❤️'); };
    f = monter({ evenementsVie: false });
    const hsRetour = { type: 'froide', cle: '2026-11-04', retour: true, actif: false };
    assert.strictEqual(await f.b.tickSpeciaux('213555', hsRetour), true);
    assert.ok(f.actions.includes('send:coucou, désolée j\'étais pas d\'humeur ❤️'));
    assert.strictEqual(await f.b.tickSpeciaux('213555', hsRetour), false);
  }

  // 9o. Pas d'humeur : le prompt le dit, et aucun message spontané n'est envoyé pendant ce temps
  {
    const prompts = [];
    global.fetch = async (url, opts) => { prompts.push(JSON.parse(opts.body).systemInstruction.parts[0].text); return ok('mmh'); };
    const vraie = V.humeurSpeciale;
    V.humeurSpeciale = () => ({ type: 'sans_envie', cle: 'k', debut: 0, fin: 1e9, actif: true, retour: false });
    f = monter();
    await f.b.surMessage(f.message('chat', 'ça va ?'));
    await f.terminer();
    assert.ok(prompts[0].includes('HUMEUR PARTICULIÈRE') && prompts[0].includes('pas trop envie de parler'));
    // Le bloc « vie » ne pousse pas à raconter une nouveauté pendant ce temps
    f = monter({ evenementsVie: true, initiativeActive: true });
    f.b.etat.vie = { evenements: [{ id: 'n', type: 'examen', titre: 'e', debut: Date.now() - 1000, phases: [{ at: Date.now() - 1000, code: 'annonce', annonce: true, note: 'NOUVELLE', dit: false, expose: 0 }] }], termines: [], cleJour: null, dernierParType: {} };
    assert.ok(!f.b.blocVie().includes('pas encore raconté'));
    await f.b.tickInitiative();
    assert.ok(!f.actions.some((a) => a.startsWith('send:')));
    V.humeurSpeciale = vraie;
  }

  console.log('TOUS LES TESTS PASSENT');
})().catch((e) => { console.error(e); process.exit(1); });
