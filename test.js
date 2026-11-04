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

// ---- v3.2 : calendrier, Ramadan, journée vécue, souvenirs ----
{
  const C = require('./calendrier');
  const J = require('./journee');
  const S = require('./souvenirs');
  const Hh = require('./humain');
  const midi = (iso) => new Date(iso + 'T11:00:00Z');

  // calendrier hégirien (Ramadan 1447 : du 18 février au 19 mars 2026 selon Umm al-Qura)
  assert.strictEqual(C.hegire(midi('2026-02-18'), {}).mois, 9);
  assert.strictEqual(C.hegire(midi('2026-02-17'), {}).mois, 8);
  assert.strictEqual(C.hegire(midi('2026-02-18'), { decalageHegire: 1 }).mois, 8); // un jour de retard sur l'Arabie
  assert.strictEqual(C.estRamadan(midi('2026-03-01'), {}), true);
  assert.strictEqual(C.estRamadan(midi('2026-03-01'), { ramadanAuto: false }), false);
  assert.strictEqual(C.estRamadan(midi('2026-11-04'), {}), false);

  // coucher du soleil à Tizi Ouzou : tôt en décembre, tard en juin
  const dec = C.coucherSoleil(midi('2026-12-21'), {});
  const juin = C.coucherSoleil(midi('2026-06-21'), {});
  assert.ok(dec > 17 * 60 + 15 && dec < 17 * 60 + 50, 'coucher de soleil en décembre : ' + dec);
  assert.ok(juin > 19 * 60 + 45 && juin < 20 * 60 + 25, 'coucher de soleil en juin : ' + juin);

  // jours spéciaux
  const codes = (iso, cfg = {}) => C.joursSpeciaux(midi(iso), cfg).map((x) => x.code);
  assert.ok(codes('2026-09-04').includes('anniv_moi'));
  assert.ok(codes('2026-09-01').includes('anniv_moi_proche'));
  assert.ok(!codes('2026-09-04', { anniversaireMoi: '' }).includes('anniv_moi'));
  assert.ok(codes('2026-09-04', { anniversaireMoi: '4-9' }).includes('anniv_moi'));
  assert.ok(codes('2026-12-22').includes('anniv_elle'));
  assert.ok(codes('2026-01-12').includes('yennayer'));
  assert.ok(codes('2026-02-18').includes('ramadan_debut'));
  assert.ok(codes('2026-03-20').includes('aid_fitr'));
  assert.ok(codes('2026-05-27').includes('aid_adha'));
  assert.ok(codes('2026-11-06').includes('vendredi'));
  assert.deepStrictEqual(codes('2026-09-04', { calendrierActif: false }), []);
  assert.strictEqual(C.joursSpeciaux(midi('2026-02-18'), {}).find((x) => x.code === 'ramadan_debut').voeux, true);
  assert.strictEqual(C.parseJJMM('31/02') !== null, true); // seule la forme est vérifiée
  assert.strictEqual(C.parseJJMM('hello'), null);
  // pas de bouderie le jour de son anniversaire
  assert.strictEqual(V.humeurSpeciale(midi('2026-09-04'), { probaJourOff: 100 }), null);

  // Ramadan : réveil plus tardif, pas de déjeuner, iftar au coucher du soleil
  assert.strictEqual(Hh.parametresVie({}, midi('2026-03-01')).reveil, Hh.parametresVie({}, midi('2026-11-04')).reveil + 60);
  assert.strictEqual(Hh.etatDeVie(new Date('2026-03-01T12:00:00Z'), {}).code, 'jeune');
  assert.strictEqual(Hh.etatDeVie(new Date('2026-03-01T17:45:00Z'), {}).code, 'iftar');
  assert.strictEqual(Hh.etatDeVie(new Date('2026-11-04T12:00:00Z'), {}).code, 'repas');
  assert.strictEqual(Hh.etatDeVie(new Date('2026-03-01T00:30:00Z'), {}).dort, false); // 1h30 : elle veille pendant le Ramadan
  assert.strictEqual(Hh.etatDeVie(new Date('2026-11-04T00:30:00Z'), {}).dort, true);
  assert.strictEqual(Hh.etatDeVie(new Date('2026-03-01T12:00:00Z'), { ramadanAuto: false }).code, 'repas');

  // météo et journée : stables pour une même date, jamais de fait « dans le futur »
  const m1 = J.meteoDuJour(new Date('2026-11-04T10:00:00Z'), {});
  assert.deepStrictEqual(m1, J.meteoDuJour(new Date('2026-11-04T20:00:00Z'), {}));
  assert.ok(m1.texte.includes('Tizi Ouzou') && Number.isFinite(m1.temp));
  assert.ok(J.meteoDuJour(new Date('2026-11-04T10:00:00Z'), { ville: 'Béjaïa' }).texte.includes('Béjaïa'));
  const tot = J.faitsDuJour(new Date('2026-11-04T07:30:00Z'), {});
  const tard = J.faitsDuJour(new Date('2026-11-04T21:00:00Z'), {});
  assert.ok(tot.length <= tard.length && tard.length >= 2);
  tot.forEach((f) => assert.ok(tard.some((g) => g.at === f.at && g.texte === f.texte), 'les faits du matin restent les mêmes le soir'));
  assert.ok(tard.some((f) => /déjeuner/.test(f.texte)));
  assert.ok(!J.faitsDuJour(new Date('2026-03-01T21:00:00Z'), {}).some((f) => /déjeuner/.test(f.texte))); // Ramadan : pas de déjeuner
  assert.deepStrictEqual(J.faitsDuJour(new Date('2026-11-04T21:00:00Z'), { faitsJournee: false }), []);
  assert.ok(J.blocJournee(new Date('2026-11-04T21:00:00Z'), {}).includes('TA JOURNÉE'));
  assert.strictEqual(J.blocJournee(new Date('2026-11-04T21:00:00Z'), { faitsJournee: false, meteoActive: false }), '');

  // rappels datés
  const sep = S.separerMemoire("- il aime le café\n- il veut des rappels\n###RAPPELS###\n- 2026-11-06 | entretien chez Djezzy\n2026-13-45 | date impossible\nblabla");
  assert.strictEqual(sep.faits, '- il aime le café\n- il veut des rappels');
  assert.deepStrictEqual(sep.rappels, [{ date: '2026-11-06', texte: 'entretien chez Djezzy' }]);
  assert.deepStrictEqual(S.separerMemoire('- des faits, rappels').rappels, []);
  assert.strictEqual(S.annonceProbable("j'ai un exam demain"), true);
  assert.strictEqual(S.annonceProbable('salut ça va'), false);
  const fus = S.fusionnerRappels([{ date: '2026-11-06', texte: 'entretien Djezzy', suivi: true }], [{ date: '2026-11-06', texte: "Entretien d'embauche chez Djezzy" }, { date: '2026-11-09', texte: 'voyage à Alger' }], '2026-11-04');
  assert.strictEqual(fus.length, 2);
  assert.strictEqual(fus[0].suivi, true); // le suivi déjà fait est conservé
  assert.deepStrictEqual(S.fusionnerRappels([{ date: '2026-10-01', texte: 'vieux truc' }], [], '2026-11-04'), []); // trop ancien
  assert.deepStrictEqual(S.rappelsDus(fus, '2026-11-06').map((d) => d.type), ['jour']);
  assert.deepStrictEqual(S.rappelsDus(fus, '2026-11-07').map((d) => d.type), []); // déjà suivi
  assert.deepStrictEqual(S.rappelsDus(fus, '2026-11-10').map((d) => d.type), ['suivi']);
  assert.ok(S.blocRappels(fus, '2026-11-04').includes('dans 2 jours'));
  assert.ok(S.consigneRappel({ type: 'suivi', rappel: fus[1] }, 'Ahmed').includes('comment ça s'));

  // anti-répétition et longueur en miroir
  const histRepet = [];
  ['mdr trop bien 😂', 'mdr ouais 😂 et toi ?', 'mdr non 😂 et lui ?', 'mdr ok 😂 toi ?', 'mdr oui ? 😂'].forEach((x) => histRepet.push({ role: 'user', content: 'a' }, { role: 'model', content: x }));
  const conseils = S.analyserRepetitions(histRepet).join(' | ');
  assert.ok(conseils.includes('😂') && conseils.includes('question') && /mdr/.test(conseils), conseils);
  assert.deepStrictEqual(S.analyserRepetitions([{ role: 'model', content: 'salut' }]), []);
  assert.strictEqual(S.blocRepetitions([]), '');
  assert.strictEqual(S.longueurAdaptee('ok', 180), 40);
  assert.strictEqual(S.longueurAdaptee('ça va et toi ?', 180), 80);
  assert.strictEqual(S.longueurAdaptee('x'.repeat(300), 180), 180);
  assert.strictEqual(S.longueurAdaptee('x'.repeat(300), 100), 100);

  // dans le bot : blocs du prompt, vœux, rappels
  const dossierV32 = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-v32-'));
  const bV = new Bot({ cleApi: 'k', prenomMoi: 'Ahmed', longueurMax: 120 }, dossierV32, () => {});
  assert.ok(bV.construirePrompt('x').includes('TA JOURNÉE'));
  assert.ok(!new Bot({ cleApi: 'k', faitsJournee: false, meteoActive: false }, dossierV32, () => {}).construirePrompt('x').includes('TA JOURNÉE'));
  assert.ok(bV.blocCalendrier(midi('2026-09-04')).includes("anniversaire d'Ahmed") || bV.blocCalendrier(midi('2026-09-04')).includes('anniversaire de Ahmed'));
  assert.strictEqual(new Bot({ cleApi: 'k', calendrierActif: false }, dossierV32, () => {}).blocCalendrier(midi('2026-09-04')), '');
  bV.historiques.x = histRepet;
  assert.ok(bV.construirePrompt('x').includes('ÉVITE DE TE RÉPÉTER'));
  assert.ok(!new Bot({ cleApi: 'k', antiRepetition: false }, dossierV32, () => {}).construirePrompt('x').includes('ÉVITE DE TE RÉPÉTER'));
  bV.memoires.x = { faits: '- il aime le café', rappels: [{ date: '2026-11-06', texte: 'entretien chez Djezzy' }] };
  assert.ok(bV.construirePrompt('x').includes('- il aime le café'));
  assert.ok(bV.reglesDeForme({ longueur: 60 }).includes('60 caractères'));
  assert.ok(bV.reglesDeForme({}).includes('120 caractères'));
  assert.ok(bV.reglesDeForme({}).includes('proche ou à un professionnel'));
  assert.ok(bV.preparerReponse('x'.repeat(300), { longueur: 60 }).join('').length <= 60);
  const troisBulles = 'a'.repeat(50) + '.\n\n' + 'b'.repeat(50) + '.\n\n' + 'c'.repeat(50) + '.';
  assert.strictEqual(bV.preparerReponse(troisBulles, { longue: true }).length, 3); // message qui compte : jusqu'à 3 bulles, plus longues
  assert.strictEqual(bV.preparerReponse(troisBulles, {}).length, 2);

  // vœu d'anniversaire : à son réveil, une seule fois, jamais avant le réveil
  const e1 = bV.itemCalendrier('x', new Date('2026-09-04T11:00:00Z'));
  assert.ok(e1 && e1.type === 'fete' && e1.priorite === true && e1.longue === true);
  assert.ok(e1.consigneTexte.includes('anniversaire'));
  e1.marquer();
  assert.strictEqual(bV.itemCalendrier('x', new Date('2026-09-04T11:00:00Z')), null);
  assert.strictEqual(bV.itemCalendrier('y', new Date('2026-09-04T05:00:00Z')), null); // 6h : elle dort encore
  assert.strictEqual(bV.itemCalendrier('z', new Date('2026-11-04T11:00:00Z')), null);

  // rappel : mot d'encouragement le jour J, puis des nouvelles ; chacun une seule fois
  const r1 = bV.itemRappel('x', new Date('2026-11-06T13:00:00Z'));
  assert.ok(r1 && r1.type === 'rappel' && r1.consigneTexte.includes('encouragement'));
  r1.marquer();
  assert.strictEqual(bV.itemRappel('x', new Date('2026-11-06T13:00:00Z')), null);
  const r2 = bV.itemRappel('x', new Date('2026-11-07T17:00:00Z'));
  assert.ok(r2 && r2.consigneTexte.includes('comment ça s'));
  r2.marquer();
  assert.strictEqual(bV.itemRappel('x', new Date('2026-11-07T17:00:00Z')), null);
  assert.strictEqual(new Bot({ cleApi: 'k', rappelsSuivi: false }, dossierV32, () => {}).itemRappel('x', new Date('2026-11-06T13:00:00Z')), null);
}

// ---- indicateur « écrit… » : l'identifiant passé à WhatsApp Web doit être un objet avec toJid ----
const testEcriture = (async () => {
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

// ---- v3.2 : la mise à jour de la mémoire récupère aussi les rappels datés ----
(async () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-mem-'));
  const b = new Bot({ cleApi: 'k', memoireTous: 2 }, dossier, () => {});
  const demain = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  let consigne = '';
  b.appelerIA = async (system) => { consigne = system; return `- il aime le café\n###RAPPELS###\n- ${demain} | entretien chez Djezzy`; };
  await b.majMemoire('x', true);
  assert.ok(consigne.includes('###RAPPELS###') && consigne.includes('AAAA-MM-JJ'));
  assert.strictEqual(b.memoires.x.faits, '- il aime le café');
  assert.deepStrictEqual(b.memoires.x.rappels, [{ date: demain, texte: 'entretien chez Djezzy' }]);
  // sans le suivi des rappels : la consigne ne le demande pas, et le marqueur éventuel est retiré de la mémoire
  const b2 = new Bot({ cleApi: 'k', rappelsSuivi: false }, dossier, () => {});
  b2.appelerIA = async (system) => { consigne = system; return `- il aime le thé\n###RAPPELS###\n- ${demain} | truc`; };
  await b2.majMemoire('y', true);
  assert.ok(!consigne.includes('###RAPPELS###'));
  assert.strictEqual(b2.memoires.y.faits, '- il aime le thé');
  assert.strictEqual(b2.memoires.y.rappels, undefined);
})().catch((e) => { console.error(e); process.exit(1); });

// ---- réactions emoji : l'envoi doit être vérifié, jamais « réussi » en silence ----
(async () => {
  await testEcriture; // les deux tests se servent de window : l'un après l'autre
  const { PAGE_REACTION, normaliserEmoji } = require('./bot');
  assert.strictEqual(normaliserEmoji('\u2764'), '\u2764\uFE0F');
  assert.strictEqual(normaliserEmoji('\u2764\uFE0F'), '\u2764\uFE0F');
  assert.strictEqual(normaliserEmoji('👍'), '👍');
  const envoyes = [];
  const msgA = { id: 'A' };
  const store = (extra = {}) => ({ Msg: { get: (id) => (id === 'A' ? msgA : null) }, sendReactionToMsg: async (m, e) => { envoyes.push([m, e]); }, ...extra });
  // chemin normal
  global.window = { require: () => null, Store: store() };
  assert.strictEqual(await PAGE_REACTION('A', '❤️'), 'Store.sendReactionToMsg');
  assert.deepStrictEqual(envoyes[0], [msgA, '❤️']);
  // message retrouvé par getMessagesById
  global.window = { require: () => null, Store: store({ Msg: { get: () => null, getMessagesById: async () => ({ messages: [msgA] }) } }) };
  await PAGE_REACTION('A', '👍');
  assert.strictEqual(envoyes[1][0], msgA);
  // fonction fournie par un module WhatsApp
  global.window = { require: (n) => (n === 'WAWebSendReactionMsgAction' ? { sendReactionToMsg: async (m, e) => { envoyes.push([m, e]); } } : null), Store: { Msg: { get: () => msgA } } };
  assert.strictEqual(await PAGE_REACTION('A', '😂'), 'WAWebSendReactionMsgAction');
  assert.strictEqual(envoyes.length, 3);
  // message introuvable : erreur claire (avant : échec silencieux)
  global.window = { require: () => null, Store: store() };
  await assert.rejects(() => PAGE_REACTION('Z', '❤️'), /message introuvable/);
  // fonction introuvable
  global.window = { require: () => null, Store: { Msg: { get: () => msgA } } };
  await assert.rejects(() => PAGE_REACTION('A', '❤️'), /sendReactionToMsg introuvable/);
  // mode test : rien n'est envoyé
  global.window = { require: () => null, Store: store() };
  assert.strictEqual(await PAGE_REACTION('', 'test'), 'Store.sendReactionToMsg');
  assert.strictEqual(envoyes.length, 3);
  delete global.window;

  // le bot : chemin vérifié, puis secours par la bibliothèque, puis échec annoncé
  const logs = [];
  const bR = new Bot({ cleApi: 'k' }, fs.mkdtempSync(path.join(os.tmpdir(), 'bot-react-')), (t, m) => { if (t === 'log') logs.push(m); });
  let appelsLib = 0;
  const message = { id: { _serialized: 'A' }, react: async () => { appelsLib += 1; } };
  bR.client = { pupPage: { evaluate: async () => 'Store.sendReactionToMsg' } };
  assert.strictEqual(await bR.reagir(message, '❤'), 'page');
  assert.strictEqual(appelsLib, 0);
  assert.ok(logs.some((l) => /Réaction envoyée : ❤️ \(Store\.sendReactionToMsg\)/.test(l)));
  bR.client = { pupPage: { evaluate: async () => { throw new Error('message introuvable dans WhatsApp Web (A)'); } } };
  assert.strictEqual(await bR.reagir(message, '👍'), 'bibliotheque');
  assert.strictEqual(appelsLib, 1);
  assert.ok(logs.some((l) => /aucune confirmation possible/.test(l) && /message introuvable/.test(l)));
  const msgCasse = { id: { _serialized: 'A' }, react: async () => { throw new Error('boom'); } };
  assert.strictEqual(await bR.reagir(msgCasse, '👍'), false);
  assert.ok(logs.some((l) => /Réaction 👍 impossible/.test(l) && /boom/.test(l)));
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
      pupPage: { evaluate: async (fn, id, etat) => { actions.push((fn === require('./bot').PAGE_REACTION ? 'réaction:' : 'etat:') + etat); return 'faux'; } },
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

  // 9p. Elle peut répondre à un message précis (même ancien) grâce à [CITE:n]
  {
    assert.deepStrictEqual(H.extraireCitation('[CITE:2] oui bien sûr'), { texte: 'oui bien sûr', n: 2 });
    assert.strictEqual(H.extraireCitation('salut').n, null);
    const prompts = [];
    global.fetch = async (url, opts) => { prompts.push(JSON.parse(opts.body).systemInstruction.parts[0].text); return ok('[CITE:1] oui je viens'); };
    f = monter({ citations: true });
    const m1 = f.message('chat', 'tu viens samedi ?');
    const m2 = f.message('chat', 'et sinon ça va ?');
    await f.b.surMessage(m1);
    await f.b.surMessage(m2);
    await f.terminer();
    assert.ok(prompts[0].includes('RÉPONDRE À UN MESSAGE PRÉCIS') && prompts[0].includes('1. tu viens samedi ?'));
    assert.ok(f.actions.includes('send:oui je viens (cité)'), f.actions.join(' | '));
    // Numéro invalide : on ignore la balise, sans citer ni planter
    global.fetch = async () => ok('[CITE:9] ok');
    f = monter({ citations: true });
    await f.b.surMessage(f.message('chat', 'a'));
    await f.b.surMessage(f.message('chat', 'b'));
    await f.terminer();
    assert.ok(f.actions.some((a) => a.startsWith('send:ok')) && !f.actions.some((a) => a.includes('[CITE')));
    // Désactivé : aucun bloc dans le prompt
    prompts.length = 0;
    global.fetch = async (url, opts) => { prompts.push(JSON.parse(opts.body).systemInstruction.parts[0].text); return ok('ok'); };
    f = monter({ citations: false });
    await f.b.surMessage(f.message('chat', 'a'));
    await f.b.surMessage(f.message('chat', 'b'));
    await f.terminer();
    assert.ok(!prompts[0].includes('RÉPONDRE À UN MESSAGE PRÉCIS'));
  }

  // 9q. Panne de l'IA : le message n'est pas perdu (nouvel essai) ; doublon WhatsApp ignoré
  {
    let n = 0;
    global.fetch = async () => { n++; if (n === 1) throw new Error('réseau coupé'); return ok('ah te voilà'); };
    f = monter({ echelleTemps: 0.001 });
    await f.b.surMessage(f.message('chat', 'coucou toi'));
    for (let i = 0; i < 600 && !f.actions.some((a) => a.startsWith('send:')); i++) await new Promise((r) => setTimeout(r, 10));
    await f.b.file['213555'];
    assert.ok(f.actions.includes('send:ah te voilà'), f.actions.join(' | '));
    assert.strictEqual(n, 2, 'un premier échec puis un succès');
    // même message signalé deux fois : une seule prise en compte
    global.fetch = async () => ok('ok');
    f = monter();
    const dbl = f.message('chat', 'hello');
    await f.b.surMessage(dbl);
    await f.b.surMessage(dbl);
    assert.strictEqual(f.b.pending['213555'].textes.length, 1);
    await f.terminer();
  }

  // 9r. Curiosité : elle pose des questions, varie les sujets, et peut être coupée
  {
    const Q = require('./curiosite');
    assert.strictEqual(Q.choisirQuestion(0, { message: 'salut' }, () => 0), null);
    assert.deepStrictEqual(Q.choisirQuestion(100, { message: 'j\'ai passé une très longue journée au travail, trop de monde partout' }, () => 0), { mode: 'suite' });
    const sujet = Q.choisirQuestion(100, { message: 'ok', themesRecents: Q.THEMES.slice(1) }, (() => { const v = [0.1, 0.9, 0]; let i = 0; return () => v[i++ % 3]; })());
    assert.strictEqual(sujet.mode, 'sujet');
    assert.strictEqual(sujet.theme, Q.THEMES[0], 'ne reprend pas un sujet récent');
    // Elle vient de poser une question : la probabilité est divisée par deux
    assert.strictEqual(Q.choisirQuestion(60, { message: 'ok', derniereFinitParQuestion: true }, () => 0.4), null);
    assert.ok(Q.choisirQuestion(60, { message: 'ok', derniereFinitParQuestion: false }, () => 0.4));
    assert.strictEqual(Q.serieSansQuestion([{ role: 'model', content: 'tu fais quoi ?' }, { role: 'model', content: 'mdr' }, { role: 'model', content: 'ok' }]), 2);
    // Dans le prompt
    const prompts = [];
    global.fetch = async (url, opts) => { prompts.push(JSON.parse(opts.body).systemInstruction.parts[0].text); return ok('mdr dis-moi, tu fais quoi ce week-end ?'); };
    f = monter({ curiosite: 100 });
    await f.b.surMessage(f.message('chat', 'salut ça va'));
    await f.terminer();
    assert.ok(prompts[0].includes('UNE QUESTION À POSER CETTE FOIS'));
    assert.ok(!prompts[0].includes('moins d\'une réponse sur trois'));
    // À 0 : l'ancienne règle (questions rares) revient
    prompts.length = 0;
    f = monter({ curiosite: 0 });
    await f.b.surMessage(f.message('chat', 'salut ça va'));
    await f.terminer();
    assert.ok(!prompts[0].includes('UNE QUESTION À POSER') && prompts[0].includes('moins d\'une réponse sur trois'));
    // Messages spontanés : le type « question » apparaît seulement si la curiosité est réglée
    const types = new Set();
    for (let i = 0; i < 30; i++) H.planDuJour(new Date('2026-11-04T09:00:00Z'), { ...algerCfg, initiativeParJour: 3, curiosite: 100 }, H.graine('q' + i)).forEach((x) => types.add(x.type));
    assert.ok(types.has('question'));
    assert.ok(H.CONSIGNES.question);
  }

  // 9s. Naturel : moins « IA », plus oral
  {
    const N = require('./naturel');
    assert.strictEqual(N.humaniserBulle('Bien sûr ! Je ne sais pas pourquoi cela ne marche pas. N\'hésite pas à me dire.'), 'Je sais pas pourquoi ça marche pas');
    assert.strictEqual(N.humaniserBulle('Ce n\'est pas grave — tu n\'as rien fait.'), 'C\'est pas grave, t\'as rien fait');
    assert.strictEqual(N.humaniserBulle('Je ne mange que du pain.'), 'Je ne mange que du pain', 'ne… que reste intact');
    assert.strictEqual(N.humaniserBulle('Bien sûr !'), 'Bien sûr !', 'jamais de bulle vide');
    assert.strictEqual(N.humaniserBulle('Je suis là pour toi.'), 'Je suis là pour toi', 'le soutien sincère est gardé');
    assert.strictEqual(N.humaniserBulle('Je ne sais pas', { oral: false }), 'Je ne sais pas');
    // Intégré à la réponse, et désactivable
    global.fetch = async () => ok('Bien sûr ! Je ne sais pas.');
    f = monter({ citations: false, curiosite: 0 });
    await f.b.surMessage(f.message('chat', 'tu sais ?'));
    await f.terminer();
    assert.ok(f.actions.includes('send:Je sais pas'), f.actions.join(' | '));
    f = monter({ citations: false, curiosite: 0, langageOral: false });
    await f.b.surMessage(f.message('chat', 'tu sais ?'));
    await f.terminer();
    assert.ok(f.actions.includes('send:Bien sûr ! Je ne sais pas.'), f.actions.join(' | '));
  }

  // 9t. Mémoire à deux étages : faits + souvenirs datés, réinjectés dans le prompt
  {
    const M = require('./memoire');
    const sep = M.separerEpisodes('Lui :\n- aime le café\n###SOUVENIRS###\n2026-10-30 | il a raté son entretien chez Djezzy\n2026-11-02 | il a fêté l\'anniversaire de sa sœur\n###RAPPELS###\n2026-11-10 | examen');
    assert.strictEqual(sep.episodes.length, 2);
    assert.ok(sep.texte.includes('###RAPPELS###') && !sep.texte.includes('SOUVENIRS'));
    // fusion : pas de doublon, tri par date
    const fus = M.fusionnerEpisodes([{ date: '2026-10-30', texte: 'il a raté son entretien chez Djezzy' }], [{ date: '2026-10-30', texte: 'entretien chez Djezzy raté' }, { date: '2026-11-02', texte: 'sa sœur fête son anniversaire' }]);
    assert.strictEqual(fus.length, 2);
    assert.strictEqual(M.libelleAge(M.ageEnJours('2026-10-30', '2026-11-04')), 'il y a 5 jours');
    const eps = [{ date: '2026-10-01', texte: 'il adore le football' }, { date: '2026-10-30', texte: 'il a raté son entretien' }, { date: '2026-11-03', texte: 'il a mangé au restaurant' }];
    const sel = M.choisirEpisodes(eps, 'ce match de football hier', 3);
    assert.ok(sel.some((e) => e.texte.includes('football')) && sel.some((e) => e.texte.includes('restaurant')));
    assert.ok(M.episodePourSouvenir(eps, '2026-11-04', Date.now(), () => 0).date <= '2026-10-30');
    assert.strictEqual(M.episodePourSouvenir([{ date: '2026-11-03', texte: 'x y z' }], '2026-11-04'), null, 'trop récent');
    assert.strictEqual(M.episodePourSouvenir([{ date: '2026-10-20', texte: 'x y z', repris: Date.now() }], '2026-11-04'), null, 'déjà repris');
    // La mise à jour de la mémoire range les souvenirs ; le prompt les réutilise
    const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-ep-'));
    const b = new Bot({ cleApi: 'k' }, dossier, () => {});
    const auj = b.cleDuJour();
    b.appelerIA = async () => `Lui :\n- aime le café\n###SOUVENIRS###\n${auj} | il m'a raconté son entretien raté\n###RAPPELS###`;
    await b.majMemoire('x', true);
    assert.strictEqual(b.memoires.x.faits, 'Lui :\n- aime le café');
    assert.deepStrictEqual(b.memoires.x.episodes, [{ date: auj, texte: 'il m\'a raconté son entretien raté' }]);
    assert.ok(b.construirePrompt('x', { message: 'salut' }).includes('SOUVENIRS DE VOS DISCUSSIONS'));
    assert.ok(b.construirePrompt('x', { message: 'salut' }).includes('aujourd\'hui : il m\'a raconté son entretien raté'));
    // Message spontané « souvenir » : sans souvenir assez ancien, elle ne dit rien
    b.memoires.x.episodes = [{ date: '2026-10-10', texte: 'il passait un examen de maths' }];
    let consigne = '';
    b.appelerIA = async (system, msgs) => { consigne = msgs[msgs.length - 1].content; return 'alors ton exam de maths ?'; };
    b.cleDuJour = () => '2026-11-04';
    b.etat.numeros = { x: { id: 'x@c.us' } };
    b.client = { sendMessage: async () => {} };
    b.obtenirChat = async () => null; b.ouvrirDiscussion = async () => {}; b.quitterDiscussion = async () => {}; b.envoyerBulles = async () => {};
    await b.envoyerInitiative('x', { type: 'souvenir', at: 0, fait: false });
    assert.ok(consigne.includes('examen de maths') && consigne.includes('il y a 4 semaines'), consigne);
    assert.ok(b.memoires.x.episodes[0].repris, 'marqué comme repris');
    consigne = '';
    await b.envoyerInitiative('x', { type: 'souvenir', at: 0, fait: false });
    assert.strictEqual(consigne, '', 'pas deux fois le même souvenir');
    // Plan du jour : le type « souvenir » n'apparaît que si le réglage est actif
    const types = new Set();
    for (let i = 0; i < 30; i++) H.planDuJour(new Date('2026-11-04T09:00:00Z'), { ...algerCfg, initiativeParJour: 3, parlerSouvenirs: true }, H.graine('s' + i)).forEach((x) => types.add(x.type));
    assert.ok(types.has('souvenir'));
  }

  // 9u. Une vraie vie : année universitaire, fils de vie qui durent, mémoire de ce qu'elle a raconté
  {
    const A = require('./annee');
    const W = require('./monde');
    assert.strictEqual(A.periodeUniv('2026-11-04').code, 'cours');
    assert.strictEqual(A.periodeUniv('2026-08-10').code, 'ete');
    assert.strictEqual(A.periodeUniv('2027-01-10').code, 'partiels');
    assert.strictEqual(A.periodeUniv('2026-09-20').code, 'rentree');
    assert.ok(A.blocPeriode('2026-08-10').includes('grandes vacances') && A.blocPeriode('2026-11-04') === '');
    // Pas de cours en été : le dimanche d'août est un jour libre ; en novembre, c'est un jour de cours
    const aout = new Date('2026-08-09T10:00:00Z');
    const nov = new Date('2026-11-08T10:00:00Z');
    assert.strictEqual(H.etatDeVie(aout, algerCfg).cours, false);
    assert.strictEqual(H.etatDeVie(nov, algerCfg).cours, true);
    assert.strictEqual(H.etatDeVie(aout, { ...algerCfg, calendrierUniv: false }).cours, true, 'réglage coupé : comme avant');
    assert.ok(/plage|vacances/.test(H.etatDeVie(new Date('2026-08-09T14:00:00Z'), algerCfg).libelle));
    // Événements : jamais d'examen ni d'exposé en été ; plage et mariages possibles ; pas de plage hors été
    const vusEte = new Set();
    const vusCours = new Set();
    for (let i = 0; i < 400; i++) {
      const rnd = H.graine('ev' + i);
      const vie = V.nouvelEtatVie();
      const base = Date.parse('2026-08-12T09:00:00Z') + i * 86400000 * 0; // même jour, tirages différents
      V.majVie(vie, base, algerCfg, rnd);
      vie.evenements.forEach((e) => vusEte.add(e.type + (e.titre.startsWith('exposé') ? '-expose' : '')));
      const vie2 = V.nouvelEtatVie();
      V.majVie(vie2, Date.parse('2026-11-04T09:00:00Z'), algerCfg, H.graine('ec' + i));
      vie2.evenements.forEach((e) => vusCours.add(e.type));
    }
    assert.ok(!vusEte.has('examen') && !vusEte.has('projet-expose'), [...vusEte].join(','));
    assert.ok(vusEte.has('plage') || vusEte.has('mariage'), [...vusEte].join(','));
    assert.ok(!vusCours.has('plage'), 'pas de plage en novembre');
    // Monde : stable pour une date, différent quelques semaines plus tard, désactivable
    assert.strictEqual(W.blocMonde('2026-11-04', {}), W.blocMonde('2026-11-04', {}));
    assert.notStrictEqual(W.fils('2026-11-04', {}).join('|'), W.fils('2026-12-20', {}).join('|'));
    assert.ok(W.blocMonde('2026-11-04', {}).includes('TON MONDE EN CE MOMENT'));
    assert.strictEqual(W.blocMonde('2026-11-04', { mondeVivant: false }), '');
    assert.strictEqual(W.rituel('2026-11-06').includes('couscous'), true, 'vendredi');
    assert.strictEqual(W.jourSemaine('2026-11-04'), 3, 'mercredi');
    // Le prompt contient période et monde
    const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-monde-'));
    const b = new Bot({ cleApi: 'k' }, dossier, () => {});
    b.cleDuJour = () => '2026-08-10';
    const prompt = b.construirePrompt('x', { message: 'salut' });
    assert.ok(prompt.includes('grandes vacances') && prompt.includes('TON MONDE EN CE MOMENT'));
    const off = new Bot({ cleApi: 'k', calendrierUniv: false, mondeVivant: false }, dossier, () => {});
    off.cleDuJour = () => '2026-08-10';
    const promptOff = off.construirePrompt('x', { message: 'salut' });
    assert.ok(!promptOff.includes('grandes vacances') && !promptOff.includes('TON MONDE EN CE MOMENT'));
    // Mémoire de sa propre vie : sections SOUVENIRS puis ELLE puis RAPPELS séparées sans mélange
    const M = require('./memoire');
    const brut = 'Lui :\n- aime le café\n###SOUVENIRS###\n2026-11-03 | il a raté son entretien\n###ELLE###\n2026-11-03 | j\'ai mangé du poisson chez ma grand-mère\n###RAPPELS###\n2026-11-10 | examen';
    const s1 = M.separerEpisodes(brut);
    const s2 = M.separerEpisodes(s1.texte, 'ELLE');
    assert.deepStrictEqual(s1.episodes, [{ date: '2026-11-03', texte: 'il a raté son entretien' }]);
    assert.deepStrictEqual(s2.episodes, [{ date: '2026-11-03', texte: 'j\'ai mangé du poisson chez ma grand-mère' }]);
    assert.ok(s2.texte.includes('###RAPPELS###') && !s2.texte.includes('poisson'));
    const b3 = new Bot({ cleApi: 'k' }, dossier, () => {});
    const auj = b3.cleDuJour();
    b3.appelerIA = async () => `Lui :\n- aime le café\n###SOUVENIRS###\n###ELLE###\n${auj} | j'ai vu ma tante samedi\n###RAPPELS###`;
    await b3.majMemoire('x', true);
    assert.deepStrictEqual(b3.memoires.x.elle, [{ date: auj, texte: 'j\'ai vu ma tante samedi' }]);
    assert.strictEqual(b3.memoires.x.faits, 'Lui :\n- aime le café');
    assert.ok(b3.construirePrompt('x', { message: 'coucou' }).includes('CE QUE TU AS DÉJÀ RACONTÉ SUR TA VIE'));
    // Sans suivi des rappels, la consigne de la mémoire ne parle pas de ###RAPPELS###
    assert.ok(!M.consigneElle('2026-11-04', false).includes('RAPPELS') && M.consigneElle('2026-11-04', true).includes('RAPPELS'));
    // Messages spontanés « fil » seulement si le réglage est actif
    const types = new Set();
    for (let k = 0; k < 30; k++) H.planDuJour(new Date('2026-11-04T09:00:00Z'), { ...algerCfg, initiativeParJour: 3, mondeVivant: true }, H.graine('f' + k)).forEach((x) => types.add(x.type));
    assert.ok(types.has('fil') && H.CONSIGNES.fil);
  }

  console.log('TOUS LES TESTS PASSENT');
})().catch((e) => { console.error(e); process.exit(1); });
