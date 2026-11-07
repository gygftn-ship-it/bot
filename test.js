// Vérifications rapides : `node test.js`. Aucune connexion WhatsApp ni appel à l'IA.
process.env.TZ = process.env.TZ || 'Africa/Algiers';
const assert = require('assert');
const H = require('./humain');
const E = require('./emotions');
const P = require('./personnalite');
const VS = require('./viesociale');
const SP = require('./spontane');
const PR = require('./promesses');
// La config perso (donnees/config.json) n'est pas obligatoire pour tester : on retombe sur les réglages par défaut.
let cfg;
try { cfg = require('./donnees/config.json'); } catch (e) { cfg = require('./reglages').DEFAUT; }
let ok = 0;
const t = (nom, fn) => { try { fn(); ok++; console.log('  ok  ' + nom); } catch (e) { console.log('ÉCHEC ' + nom + ' : ' + e.message); process.exitCode = 1; } };

t('le coucher varie d\'un jour à l\'autre', () => {
  const heures = new Set();
  for (let d = 0; d < 14; d++) {
    const base = Date.UTC(2026, 10, 5 + d);
    let prev = null;
    for (let k = 0; k < 1440; k += 5) {
      const e = H.etatDeVie(new Date(base + k * 60000), cfg);
      if (prev === false && e.dort) { heures.add(e.t.minutes); break; }
      prev = e.dort;
    }
  }
  assert(heures.size >= 5, 'trop peu de variété : ' + heures.size);
});
t('jamais éveillée plus de 22 h d\'affilée ni endormie plus de 13 h', () => {
  let etat = null, debut = 0, max = { eveil: 0, sommeil: 0 };
  const base = Date.UTC(2026, 10, 5);
  for (let k = 0; k < 14 * 1440; k += 10) {
    const e = H.etatDeVie(new Date(base + k * 60000), cfg);
    if (e.dort !== etat) { if (etat !== null) max[etat ? 'sommeil' : 'eveil'] = Math.max(max[etat ? 'sommeil' : 'eveil'], k - debut); etat = e.dort; debut = k; }
  }
  assert(max.eveil <= 22 * 60, 'éveil ' + max.eveil / 60 + ' h');
  assert(max.sommeil <= 13 * 60, 'sommeil ' + max.sommeil / 60 + ' h');
});
t('le manque monte avec le silence éveillé puis retombe quand il revient', () => {
  const T0 = 1.8e12, st = E.nouvelEtat(T0);
  E.evoluer(st, T0 + 9 * 3600e3, { dernierUser: T0, dort: false, silenceEveilleH: 9 });
  assert(st.e.manque > 0.5);
  E.reagirMessage(st, 'salut', T0 + 9 * 3600e3 + 1, { dernierUser: T0, dort: false, silenceEveilleH: 9 });
  assert(st.e.manque < 0.3);
});
t('un mot dur blesse, des excuses apaisent sans tout effacer', () => {
  const st = E.nouvelEtat(1.8e12);
  E.reagirMessage(st, 'ferme la', 1.8e12 + 1, {});
  const apres = st.e.blessure;
  E.reagirMessage(st, 'pardon', 1.8e12 + 2, {});
  assert(apres > 0.3 && st.e.blessure < apres && st.e.blessure > 0);
});
t('au plus un emoji, et la plupart des messages n\'en ont pas', () => {
  let avec = 0;
  for (let i = 0; i < 1000; i++) {
    const m = P.limiterEmojis(['mdr 😂😂', 'trop bien ❤️🔥'], 20);
    const n = (m.join('').match(/\p{Extended_Pictographic}/gu) || []).length;
    assert(n <= 1); if (n) avec++;
  }
  assert(avec > 120 && avec < 290, 'proportion ' + avec / 10 + ' %');
});
t('la chaleur monte seulement si l\'ambiance s\'y prête', () => {
  assert.strictEqual(P.niveauChaleur(['salut', 'ça va ?']), 0);
  assert.strictEqual(P.niveauChaleur(['t\'es belle 😘', 'j\'ai envie de toi ce soir']), 3);
  assert(!/L'AMBIANCE CHAUFFE/.test(P.blocCoquin({ niveau: 2, chaleur: 0 })));
  assert(!/L'AMBIANCE CHAUFFE/.test(P.blocCoquin({ niveau: 1, chaleur: 2 })));
  assert(/pas maintenant/.test(P.blocCoquin({ niveau: 2, chaleur: 2, bloque: true })));
});
t('le plan du jour ne répète pas le même type de message', () => {
  for (let i = 0; i < 200; i++) {
    const types = H.planDuJour(new Date(Date.UTC(2026, 10, 5 + (i % 30))), cfg).map((x) => x.type).filter((x) => !['bonjour', 'bonne_nuit'].includes(x));
    assert(new Set(types).size === types.length, 'doublon : ' + types);
  }
});
t('fac, famille, cœur produisent du texte', () => {
  const d = new Date('2026-11-08T10:00:00+01:00');
  assert(VS.blocFac(d, cfg).includes('emploi du temps'));
  assert(VS.blocFamille(d, cfg).includes('FAMILLE'));
  assert(VS.blocCoeur(d, cfg, { lien: 50 }).includes('SENTIMENTALE'));
});
// ---------- Envie d'écrire (probabiliste), promesses, vécu, côté coquin ----------
const EMO0 = { joie: 0.35, tendresse: 0.4, manque: 0.05, tristesse: 0.05, irritation: 0.03, inquietude: 0.05, blessure: 0 };
const ctxBase = (o = {}) => ({
  m: 1000, reveil: 450, coucher: 1470, silenceMin: 200, ecartMin: 75, dispo: 0.8, dort: false, e: EMO0,
  vecu: { stress: 0, soulagement: 0, envie: 0, sujet: null }, fatigue: 0, douleur: null,
  nbAujourdhui: 0, plafond: 4, sansReponse: 0, insistance: 3, derniersTypes: [],
  veutBonjour: false, veutBonneNuit: false, echangeAujourdhui: true, nuitDite: false, nouvelleVie: false, ...o,
});
const graineTest = (n) => { let s = n; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
function simulerJour(o, seed) {
  const r = graineTest(seed);
  let silence = 600, nb = 0, sans = 0, types = [], bonjours = 0, nuits = 0;
  const heures = [];
  for (let m = 450; m <= 1470; m++) {
    const h = (m % 1440) / 60;
    const dispo = (h >= 8.5 && h < 11.5) || (h >= 13.5 && h < 15.5) ? 0.3 : 0.8;
    const d = SP.decider(ctxBase({ m, silenceMin: silence, dispo, nbAujourdhui: nb, sansReponse: sans, insistance: 99, derniersTypes: types.slice(-3),
      veutBonjour: true, veutBonneNuit: true, echangeAujourdhui: bonjours + nb > 0, nuitDite: nuits > 0, ...o }), { curiosite: 45 }, r);
    silence++;
    if (!d) continue;
    silence = 0; sans++; heures.push(m);
    if (d.type === 'bonjour') bonjours++;
    else if (d.type === 'bonne_nuit') nuits++;
    else { nb++; types.push(d.type); }
  }
  return { nb, bonjours, nuits, heures };
}
t('envie d\'écrire : rien si elle dort, trop tôt après le dernier échange ou plafond atteint', () => {
  assert.strictEqual(SP.probabilite(ctxBase({ dort: true })), 0);
  assert.strictEqual(SP.probabilite(ctxBase({ silenceMin: 30 })), 0);
  assert.strictEqual(SP.probabilite(ctxBase({ nbAujourdhui: 4 })), 0);
  assert.strictEqual(SP.probabilite(ctxBase({ sansReponse: 3 })), 0);
  assert(SP.probabilite(ctxBase()) > 0);
});
t('envie d\'écrire : le silence, le manque et la soirée la font monter ; la fatigue et la blessure la font baisser', () => {
  const p = (o) => SP.probabilite(ctxBase(o));
  assert(p({ silenceMin: 300 }) > p({ silenceMin: 90 }));
  assert(p({ e: { ...EMO0, manque: 0.8 } }) > p());
  assert(p({ m: 1200 }) > p({ m: 600 }));
  assert(p({ fatigue: 0.8 }) < p());
  assert(p({ e: { ...EMO0, blessure: 0.7 } }) < p());
  assert(p({ vecu: { stress: 0.35, soulagement: 0.6, envie: 0.7, sujet: 'x' } }) > p());
  assert(SP.probabilite(ctxBase({ silenceMin: 1e5, e: { ...EMO0, manque: 1 } })) <= 0.12);
});
t('envie d\'écrire : jamais plus que le plafond, mais pas deux jours identiques', () => {
  const jours = [];
  for (let i = 1; i <= 120; i++) jours.push(simulerJour({}, i));
  assert(jours.every((j) => j.nb <= 4), 'plafond dépassé');
  assert(jours.every((j) => j.bonjours <= 1 && j.nuits <= 1), 'bonjour/bonne nuit en double');
  const moyenne = jours.reduce((a, j) => a + j.nb, 0) / jours.length;
  assert(moyenne > 1.5 && moyenne < 4, 'moyenne ' + moyenne);
  assert(new Set(jours.map((j) => j.heures.join(','))).size > 100, 'journées trop semblables');
  const fatigue = [];
  for (let i = 1; i <= 120; i++) fatigue.push(simulerJour({ fatigue: 0.8 }, i));
  assert(fatigue.reduce((a, j) => a + j.nb, 0) < jours.reduce((a, j) => a + j.nb, 0) * 0.7, 'la fatigue ne la rend pas plus discrète');
});
t('envie d\'écrire : le plafond du jour baisse si elle est épuisée, jamais à zéro si le réglage est > 0', () => {
  assert.strictEqual(SP.plafondDuJour(0), 0);
  assert.strictEqual(SP.plafondDuJour(4, 0), 4);
  assert(SP.plafondDuJour(4, 1) >= 1 && SP.plafondDuJour(4, 1) < 4);
  assert.strictEqual(SP.plafondDuJour(4, 0, { blessure: 0.5 }), 1);
});
t('choix du type : pas de blague si elle est triste, plus de « manque/pensée » si elle est tendre, l\'événement frais passe en premier', () => {
  assert(!('blague' in SP.poidsTypes(ctxBase({ e: { ...EMO0, tristesse: 0.6 } }))) || SP.poidsTypes(ctxBase({ e: { ...EMO0, tristesse: 0.6 } })).blague === 0);
  assert(SP.poidsTypes(ctxBase({ e: { ...EMO0, tendresse: 0.9 } })).pensee > SP.poidsTypes(ctxBase()).pensee);
  assert(SP.poidsTypes(ctxBase({ nouvelleVie: true })).evenement >= 5);
  assert(SP.poidsTypes(ctxBase({ derniersTypes: ['pensee'] })).pensee < SP.poidsTypes(ctxBase()).pensee);
  assert.strictEqual(typeof SP.choisirType(ctxBase(), { curiosite: 45 }, graineTest(3)), 'string');
});
t('le vécu : après l\'exposé elle a envie d\'en parler, avant elle stresse ; la fatigue vient de l\'heure, de la douleur, du rhume', () => {
  const T0 = Date.UTC(2026, 10, 7, 12);
  let cleExpose = null;
  for (let d = 0; d < 21 && !cleExpose; d++) {
    const cle = new Date(T0 + d * 86400000).toISOString().slice(0, 10);
    const ex = VS.etatExpose(cle, 16 * 60);
    if (ex && ex.phase === 'apres') cleExpose = cle;
  }
  assert(cleExpose, 'aucun jour d\'exposé trouvé en 21 jours');
  const apres = SP.vecuExpose(cleExpose, 16 * 60);
  assert(apres.envie > 0.5 && /exposé/.test(apres.sujet));
  assert.strictEqual(SP.vecuExpose(cleExpose, 10 * 60).envie, 0);
  assert(SP.fatigue({ m: 1450, reveil: 450, coucher: 1470 }) > SP.fatigue({ m: 900, reveil: 450, coucher: 1470 }));
  assert(SP.fatigue({ m: 900, reveil: 450, coucher: 1470, douleur: { intensite: 'forte' } }) >= 0.35);
  assert(SP.fatigue({ m: 900, reveil: 450, coucher: 1470, humeur: 'un peu fatiguée', vecu: { fatigue: 0.5 } }) >= 0.8);
  const vie = { evenements: [{ id: 'r1', type: 'rhume', titre: 'rhume', debut: T0, phases: [{ at: T0, code: 'debut', annonce: true, note: 'Tu es enrhumée', dit: false }, { at: T0 + 40 * 3600000, code: 'mieux', annonce: false, note: 'mieux' }] }], termines: [] };
  assert(SP.vecuDesEvenements(vie, T0 + 3600000).fatigue >= 0.5);
});
t('fatiguée, elle fait court et le dit dans son message ; stressée ou avec envie de parler, ça se sent', () => {
  assert(SP.longueurFatigue(180, 0.8) <= 70 && SP.longueurFatigue(180, 0.5) <= 110 && SP.longueurFatigue(180, 0.1) === 180);
  assert(/TRÈS court/.test(SP.nuance(ctxBase({ fatigue: 0.8 }))));
  assert(/exposé/.test(SP.nuance(ctxBase({ vecu: { stress: 0.35, soulagement: 0.6, envie: 0.7, sujet: 'Ton exposé de Traduction vient de passer' } }))));
  assert.strictEqual(SP.nuance(ctxBase()), '');
  assert.strictEqual(SP.blocVecu(ctxBase()), '');
  assert(SP.blocVecu(ctxBase({ fatigue: 0.7 })).includes('CE QUE TU VIS'));
});

const NOW_P = new Date('2026-11-06T14:00:00+01:00').getTime();
const detP = (txt, r = () => 0.5) => PR.detecter(txt, NOW_P, { fuseau: 'Africa/Algiers', r });
t('promesses : « je te raconte ça ce soir », « je t\'écris après le cours » sont notées avec une échéance', () => {
  const a = detP('Attends je te raconte ça ce soir');
  assert.strictEqual(a.length, 1);
  assert(a[0].echeance > NOW_P + 5 * 3600000 && a[0].echeance < NOW_P + 8 * 3600000);
  const b = detP('je t\'écris après le cours');
  assert(b.length === 1 && b[0].echeance > NOW_P + 60 * 60000 && b[0].echeance < NOW_P + 150 * 60000);
  assert(detP('je te rappelle dans 20 minutes')[0].echeance < NOW_P + 45 * 60000);
  assert(detP('on en reparle demain')[0].echeance > NOW_P + 20 * 3600000);
});
t('promesses : pas de fausse alerte (question, pas de moment, simple tendresse)', () => {
  assert.strictEqual(detP('Tu me racontes ça ce soir ?').length, 0);
  assert.strictEqual(detP('je te raconte').length, 0);
  assert.strictEqual(detP('je t\'aime ce soir').length, 0);
  assert.strictEqual(detP('mdr trop bien').length, 0);
});
t('promesses : dues à l\'échéance, excuse si retard ou oubli, doublons fusionnés, balise [TENUE] retirée', () => {
  const p = detP('je te raconte ça ce soir')[0];
  const liste = PR.fusionner([], [p], NOW_P);
  assert.strictEqual(PR.fusionner(liste, [{ ...p }], NOW_P).length, 1, 'doublon');
  assert.strictEqual(PR.due(liste, NOW_P), null);
  assert(PR.due(liste, p.echeance + 60000));
  const aTemps = PR.consigne({ ...p, oubli: false }, 'Ahmed', p.echeance + 10 * 60000);
  assert(!/zappé/.test(aTemps) && /tiens ta promesse/.test(aTemps));
  const enRetard = PR.consigne({ ...p, oubli: false }, 'Ahmed', p.echeance + 3 * 3600000);
  assert(/zappé/.test(enRetard) && /Excuse-toi/.test(enRetard));
  assert(/zappé/.test(PR.consigne({ ...p, oubli: true }, 'Ahmed', p.echeance + 5 * 60000)));
  assert.strictEqual(PR.due(liste, p.echeance + 31 * 3600000), null, 'trop ancien');
  assert(PR.bloc(liste, NOW_P).includes('[TENUE]'));
  const x = PR.extraireTenue('voilà alors… [TENUE]');
  assert(x.tenue && !/TENUE/.test(x.texte));
  assert.strictEqual(PR.marquerTenues(liste, p.echeance), 1);
  assert.strictEqual(PR.due(liste, p.echeance + 1), null);
});
t('promesses : environ une sur dix est oubliée pour de vrai', () => {
  const r = graineTest(11);
  let oublis = 0;
  for (let i = 0; i < 1000; i++) if (PR.detecter('je te raconte ça ce soir', NOW_P, { fuseau: 'Africa/Algiers', r })[0].oubli) oublis++;
  assert(oublis > 60 && oublis < 150, 'oublis : ' + oublis);
});
t('côté coquin : plus d\'émotion quand ça chauffe, toujours suggéré (jamais explicite), rien si ce n\'est pas le moment', () => {
  const chaud = P.blocCoquin({ niveau: 2, chaleur: 2 });
  assert(/ton corps parle/.test(chaud) && /VIVES pour de vrai/.test(chaud));
  assert(/jamais pornographique/.test(chaud) && /suggérée/.test(chaud));
  assert(/ma mère passe|chez tes parents/.test(chaud));
  assert(!/AMBIANCE CHAUFFE/.test(P.blocCoquin({ niveau: 2, chaleur: 1 })));
  assert.strictEqual(P.blocCoquin({ niveau: 0, chaleur: 2 }), '');
  assert(/pas maintenant/.test(P.blocCoquin({ niveau: 2, chaleur: 2, bloque: true })));
});
t('curseur du jour : stable dans la journée, varie, plafonne la chaleur', () => {
  assert.strictEqual(P.curseurDuJour('2026-11-10').palier, P.curseurDuJour('2026-11-10').palier);
  assert(/sage et tendre/.test(P.blocCoquin({ niveau: 3, chaleur: 3, desir: 2, curseur: 0 })));
  assert(!/AMBIANCE EST BRÛLANTE|AMBIANCE CHAUFFE/.test(P.blocCoquin({ niveau: 3, chaleur: 3, desir: 2, curseur: 1 })));
  assert(/AMBIANCE CHAUFFE/.test(P.blocCoquin({ niveau: 3, chaleur: 3, curseur: 2 })) && !/BRÛLANTE/.test(P.blocCoquin({ niveau: 3, chaleur: 3, curseur: 2 })));
  assert(/AMBIANCE EST BRÛLANTE/.test(P.blocCoquin({ niveau: 3, chaleur: 3, curseur: 3 })));
});
t('curseur du jour : pas lassant (creux, repos après les jours chauds, jamais deux jours brûlants de suite ni plus de trois jours chauds)', () => {
  const jours = [];
  for (let i = 0; i < 730; i++) jours.push(P.curseurDuJour(P.jourPlus('2026-01-01', i)));
  const pal = jours.map((x) => x.palier);
  assert.strictEqual(new Set(pal).size, 4);
  for (let i = 1; i < pal.length; i++) assert(!(pal[i] === 3 && pal[i - 1] === 3), 'deux jours brûlants de suite : jour ' + i);
  for (let i = 3; i < pal.length; i++) assert(!(pal[i] >= 2 && pal[i - 1] >= 2 && pal[i - 2] >= 2 && pal[i - 3] >= 2), 'quatre jours chauds de suite : jour ' + i);
  const sages = pal.filter((x) => x === 0).length / pal.length;
  assert(sages > 0.15 && sages < 0.4, 'part de jours sages : ' + sages);
  let serie = 0, max = 0;
  for (const x of pal) { serie = x === 0 ? serie + 1 : 0; max = Math.max(max, serie); }
  assert(max >= 4, 'il faut de vrais creux de plusieurs jours : ' + max);
  assert(jours.some((x) => x.creux));
});
t('curseur du jour : les émotions comptent (maussade = elle baisse, épanouie = elle monte, creux = rien)', () => {
  const E2 = require('./emotions');
  let testees = 0;
  for (let i = 0; i < 200; i++) {
    const cle = P.jourPlus('2026-03-01', i);
    const base = P.curseurDuJour(cle);
    const triste = E2.nouvelEtat(); triste.e.tristesse = 0.5;
    const ravie = E2.nouvelEtat(); ravie.e.joie = 0.8; ravie.e.tendresse = 0.7;
    const a = P.curseurDuJour(cle, triste).palier, b = P.curseurDuJour(cle, ravie).palier;
    assert(a <= base.palier && b >= base.palier);
    if (base.creux) assert(a === 0 && b === 0);
    else if (base.palier > 0 && base.palier < base.plafond) { assert(a === base.palier - 1 && b === base.palier + 1); testees++; }
  }
  assert(testees > 10);
  const frais = E2.nouvelEtat(); frais.lien = 10;
  for (let i = 0; i < 100; i++) assert(P.curseurDuJour(P.jourPlus('2026-06-01', i), frais).palier <= 2);
});
t('les exemples coquins changent d\'un jour à l\'autre (pas de refrain)', () => {
  const textes = new Set();
  for (let i = 0; i < 20; i++) textes.add(P.blocCoquin({ niveau: 3, chaleur: 3, curseur: 3, cle: P.jourPlus('2026-05-01', i), alea: 'salut' }));
  assert(textes.size >= 15, 'variété : ' + textes.size);
});
t('mémoire sélective : un petit carnet reste entier, un gros carnet est filtré selon la conversation', () => {
  const M2 = require('./memoire');
  const petit = 'Lui :\n- s\'appelle Ahmed\nGoûts :\n- aime le café';
  assert.strictEqual(M2.choisirFaits(petit, 'salut', 1800).texte, petit);
  const lignes = ['Lui :', '- étudie le français à Oran', '- vit chez ses parents', 'Famille et proches :'];
  for (let i = 0; i < 40; i++) lignes.push('- détail de famille numéro ' + i + ' sans rapport avec le sujet du jour pour faire du volume');
  lignes.push('- son frère Karim passe son permis de conduire en décembre', 'Goûts :', '- aime le rap et le café noir', 'Sujets en suspens :', '- attend la réponse de son dossier');
  const gros = lignes.join('\n');
  const r = M2.choisirFaits(gros, 'alors ton frère, il a eu son permis ?', 1800);
  assert(r.texte.length < gros.length / 1.5 && r.texte.length <= 2300, 'taille : ' + r.texte.length + '/' + gros.length);
  assert(/Karim/.test(r.texte), 'la ligne liée au sujet doit être là');
  assert(/étudie le français/.test(r.texte) && /dossier/.test(r.texte), 'les rubriques essentielles restent');
  assert(/n'est pas chargé/.test(r.texte) && r.gardees < r.total);
  assert(!/numéro 17 /.test(r.texte));
  const el = []; for (let i = 0; i < 30; i++) el.push({ date: '2026-10-' + String(i % 28 + 1).padStart(2, '0'), texte: i === 3 ? 'a mangé un couscous chez sa grand-mère' : 'raconté un truc banal ' + i });
  const ch = M2.choisirElle(el, 'tu as mangé quoi chez ta grand-mère ?');
  assert(ch.length <= 16 && ch.some((e) => /couscous/.test(e.texte)) && ch.slice(-1)[0] === el[29]);
});
t('le mode « plan » (ancien système) reste disponible et le nouveau mode est celui par défaut', () => {
  const { DEFAUT } = require('./reglages');
  assert.strictEqual(DEFAUT.initiativeMode, 'probabiliste');
  assert(DEFAUT.promessesActives && DEFAUT.vecuActif);
  assert(H.planDuJour(new Date(Date.UTC(2026, 10, 6)), cfg).length > 0);
});

// ---------- Suites de la relation (suites.js) ----------
const SU = require('./suites');
const FUSEAU = 'Africa/Algiers';
const T1 = Date.UTC(2026, 10, 10, 20, 0); // un mardi soir (heure d'Alger = UTC+1)
t('lendemain : seul « ça chauffe » est retenu, le mot doux n\'apparaît que le jour d\'après et deux fois au plus', () => {
  const s = {};
  assert.strictEqual(SU.noterChaleur(s, 1, '2026-11-10', T1), false);
  assert.strictEqual(SU.noterChaleur(s, 2, '2026-11-10', T1), true);
  assert.strictEqual(SU.blocLendemain(s, '2026-11-10'), '', 'rien le soir même');
  assert(/LE LENDEMAIN/.test(SU.blocLendemain(s, '2026-11-11')) && /pudique/.test(SU.blocLendemain(s, '2026-11-11')));
  assert(SU.lendemainActif(s, '2026-11-12'), 'encore possible deux jours après (appli éteinte)');
  assert(!SU.lendemainActif(s, '2026-11-14'), 'plus au bout de 3 jours');
  SU.marquerLendemain(s); assert(SU.lendemainActif(s, '2026-11-11'));
  SU.marquerLendemain(s); assert(!SU.lendemainActif(s, '2026-11-11'), 'après deux réponses, on n\'y revient plus');
  assert(!/explicite|détail/.test(SU.CONSIGNE_LENDEMAIN.replace(/aucun détail, rien d'explicite/, '')), 'le mot doux reste pudique');
});
t('habitudes : neutre au début, puis elle écrit plus aux heures où il est là et où il répond', () => {
  const s = {};
  assert.strictEqual(SU.facteurHabitude(s, 21), 1);
  const J = 86400000, H13 = Date.UTC(2026, 10, 10, 12, 0); // 13 h à Alger
  for (let j = 0; j < 20; j++) { // chronologique : 13 h, 13 h 20 (une seule présence par quart d'heure… ici deux), puis 21 h
    SU.noterMessageLui(s, H13 + j * J, FUSEAU);
    SU.noterMessageLui(s, H13 + j * J + 5 * 60000, FUSEAU); // trop proche : compté une seule fois
    SU.noterMessageLui(s, H13 + j * J + 8 * 3600e3, FUSEAU);
  }
  assert.strictEqual(s.hab.total, 40, 'une présence par quart d\'heure : ' + s.hab.total);
  assert(SU.facteurHabitude(s, 21) > 1.1, 'soir : ' + SU.facteurHabitude(s, 21));
  assert(SU.facteurHabitude(s, 4) < 0.8, 'nuit : ' + SU.facteurHabitude(s, 4));
  // elle lui écrit à 13 h (jamais de réponse) et à 21 h (il répond toujours, vite)
  for (let j = 20; j < 32; j++) {
    SU.noterInitiative(s, H13 + j * J, FUSEAU);
    SU.noterInitiative(s, H13 + j * J + 8 * 3600e3 + 5 * 60000, FUSEAU);
    SU.noterMessageLui(s, H13 + j * J + 8 * 3600e3 + 9 * 60000, FUSEAU);
  }
  assert(s.hab.rapide[21] >= 11 && s.hab.rep[13] === 0);
  assert(SU.facteurHabitude(s, 21) > SU.facteurHabitude(s, 13) + 0.2, `soir ${SU.facteurHabitude(s, 21)} / 13 h ${SU.facteurHabitude(s, 13)}`);
  for (let h = 0; h < 24; h++) { const f = SU.facteurHabitude(s, h); assert(f >= 0.4 && f <= 1.6); }
  const sp = { m: 1260, reveil: 450, coucher: 1470, silenceMin: 300, ecartMin: 75, dispo: 0.8, dort: false, e: {}, fatigue: 0, nbAujourdhui: 0, plafond: 4, sansReponse: 0, insistance: 3 };
  assert(SP.probabilite({ ...sp, habitude: 1.5 }) > SP.probabilite({ ...sp, habitude: 0.5 }));
});
const ctxB = (o = {}) => ({ s: { derniere: 0 }, now: T1, cle: '2026-11-10', m: 780, reveil: 450, coucher: 1470, lien: 70, e: {}, stress: 0, fatigue: 0.1, conversationActive: true, recents: ['salut'], ...o });
t('bouderie : rare, jamais le matin tôt / avant de dormir / s\'il va mal / quand elle est blessée, et espacée', () => {
  const cfgB = { bouderieProbaJour: 100, bouderieEcartJours: 8 };
  const always = () => 0.01;
  assert(SU.peutDeclencher(ctxB(), cfgB, always), 'cas normal');
  assert(!SU.peutDeclencher(ctxB(), { ...cfgB, disputesAvecLui: false }, always));
  assert(!SU.peutDeclencher(ctxB({ lien: 40 }), cfgB, always), 'lien trop faible');
  assert(!SU.peutDeclencher(ctxB({ m: 500 }), cfgB, always), 'trop tôt');
  assert(!SU.peutDeclencher(ctxB({ m: 1300 }), cfgB, always), 'trop près du coucher');
  assert(!SU.peutDeclencher(ctxB({ conversationActive: false }), cfgB, always));
  assert(!SU.peutDeclencher(ctxB({ special: true }), cfgB, always));
  assert(!SU.peutDeclencher(ctxB({ e: { blessure: 0.3 } }), cfgB, always));
  assert(!SU.peutDeclencher(ctxB({ recents: ['je suis crevé', 'bof'] }), cfgB, always), 'il n\'est pas bien');
  assert(!SU.peutDeclencher(ctxB({ recents: ['j\'ai exam demain'] }), cfgB, always));
  assert(!SU.peutDeclencher(ctxB({ s: { derniere: T1 - 3 * 86400000 } }), cfgB, always), 'moins de 8 jours après la précédente');
  assert(!SU.peutDeclencher(ctxB({ s: { derniere: 0, bouderie: { phase: 'froide' } } }), cfgB, always), 'déjà en cours');
  assert(!SU.peutDeclencher(ctxB(), { ...cfgB, bouderieProbaJour: 0 }, always));
  // fréquence réelle : 365 jours, 10 % de jours, au plus une tous les 8 jours
  let n = 0, derniere = 0;
  for (let d = 0; d < 365; d++) {
    const now = Date.UTC(2026, 0, 1) + d * 86400000;
    const cle = new Date(now).toISOString().slice(0, 10);
    const s = { derniere };
    for (let k = 0; k < 20; k++) if (SU.peutDeclencher(ctxB({ s, now, cle }), { bouderieProbaJour: 10, bouderieEcartJours: 8 })) { n++; derniere = now; break; }
  }
  assert(n >= 12 && n <= 45, 'bouderies sur un an : ' + n);
});
t('bouderie : durée bornée, excuse → elle se radoucit, il va mal → elle laisse tomber tout de suite, puis fin sans rancune', () => {
  const s = {};
  const b = SU.demarrer(s, SU.CAUSES[0], T1, 780, 1470);
  assert(b.finMax - T1 <= 4 * 3600e3 && b.finMax - T1 >= 30 * 60e3);
  const tard = SU.demarrer({}, SU.CAUSES[1], T1, 1300, 1470); // démarrée tard : réglée 75 min avant le coucher
  assert(tard.finMax - T1 <= (1470 - 1300 - 75) * 60e3 + 1);
  const bl = SU.blocBouderie(s, T1 + 20 * 60e3);
  assert(/TU BOUDES UN PEU/.test(bl) && /chantage affectif/.test(bl) && /culpabilisation/.test(bl) && /menace/.test(bl) && /aucun silence punitif/.test(bl));
  assert.strictEqual(SU.recevoir(s, 'ok', T1 + 5 * 60e3), null);
  assert.strictEqual(SU.recevoir(s, 'désolé, je voulais pas te vexer', T1 + 3 * 60e3), null, 'elle ne pardonne pas à la seconde');
  assert.strictEqual(SU.recevoir(s, 'qu\'est-ce qui se passe ?', T1 + 12 * 60e3), 'apaise');
  assert.strictEqual(s.bouderie.phase, 'radoucie');
  const rec = SU.blocBouderie(s, T1 + 15 * 60e3);
  assert(/RÉCONCILIATION/.test(rec) && /JAMAIS le sujet/.test(rec));
  assert.strictEqual(SU.apresReponse(s, T1 + 16 * 60e3), 'fin');
  assert.strictEqual(s.bouderie, null);
  assert.strictEqual(s.derniere, T1 + 16 * 60e3);
  // il va mal
  const s2 = {}; SU.demarrer(s2, SU.CAUSES[2], T1, 780, 1470);
  assert.strictEqual(SU.recevoir(s2, 'je suis malade là', T1 + 60e3), 'inquiet');
  assert(/S'ARRÊTE/.test(SU.blocBouderie(s2, T1 + 2 * 60e3)) && !/TU BOUDES/.test(SU.blocBouderie(s2, T1 + 2 * 60e3)));
  // il ne dit rien : au bout de la durée maximale elle se radoucit seule, et une bouderie oubliée disparaît
  const s3 = {}; const b3 = SU.demarrer(s3, SU.CAUSES[3], T1, 780, 1470);
  assert.strictEqual(SU.normaliser(s3, T1 + 60e3), null);
  assert.strictEqual(SU.normaliser(s3, b3.finMax + 1), 'radoucie');
  assert(/RÉCONCILIATION/.test(SU.blocBouderie(s3, b3.finMax + 2)) && /SU|MIN|moment/.test(SU.consigneReconciliation(s3.bouderie)));
  assert.strictEqual(SU.normaliser(s3, b3.finMax + 13 * 3600e3), 'abandon');
  assert.strictEqual(s3.bouderie, null);
  // toutes les causes sont un malentendu de son côté (jamais un vrai tort de lui)
  for (const c of SU.CAUSES) assert(/peut-être|imaginé|cru|impression|comprise|à moitié|mal pris/.test(c), c);
});
t('bouderie : les émotions suivent (blessée au début, tendre à la réconciliation)', () => {
  const st = E.nouvelEtat(T1);
  SU.ajusterEmotions(st, 'debut');
  assert(st.e.blessure >= 0.4 && st.e.irritation >= 0.2);
  assert(/blessée/.test(E.bloc(st, T1)));
  const tendre = st.e.tendresse;
  SU.ajusterEmotions(st, 'apaise');
  assert(st.e.blessure <= 0.05 && st.e.irritation <= 0.03 && st.e.tendresse > tendre);
});
t('cohérence : ce qu\'elle raconte est noté tout de suite (sans doublon, 36 h), pas ses envies ni ses questions', () => {
  const s = {};
  const dits = SU.capterAffirmations('Mdrr j\'ai mangé chez ma grand-mère ce midi. J\'ai trop envie de te voir. Tu fais quoi ? Ma sœur est rentrée tard hier.');
  assert.deepStrictEqual(dits, ["J'ai mangé chez ma grand-mère ce midi.", 'Ma sœur est rentrée tard hier.']);
  SU.noterDits(s, ['J\'ai mangé chez ma grand-mère.', 'Ma mère a fait du couscous.'], T1);
  SU.noterDits(s, ['j\'ai mangé chez ma grand-mère'], T1 + 1000);
  assert.strictEqual(s.dits.length, 2, 'doublon ignoré');
  const bl = SU.blocDits(s, T1 + 2 * 3600e3);
  assert(/ne te contredis pas/.test(bl) && /grand-mère/.test(bl) && /il y a 2 h/.test(bl), bl);
  assert.strictEqual(SU.blocDits(s, T1 + 40 * 3600e3), '', 'périmé après 36 h');
  for (let i = 0; i < 30; i++) SU.noterDits(s, ['Ma tante a appelé pour la ' + i + 'e fois.'], T1 + 3 * 3600e3 + i);
  assert(s.dits.length <= 14);
});
t('cigarette avec lui : un détail rare, noté pour ne pas en reparler en boucle ni se contredire', () => {
  const s = {};
  assert(/fumes parfois une cigarette avec Ahmed/.test(SU.blocFume(s, T1, 'Ahmed')) && /rarement/.test(SU.blocFume(s, T1, 'Ahmed')));
  assert(!/déjà parlé/.test(SU.blocFume(s, T1, 'Ahmed')));
  SU.noterDits(s, ['Je viens de fumer une cigarette sur le balcon'], T1);
  assert(s.fume && s.fume.n === 1);
  assert(/déjà parlé il y a 3 h/.test(SU.blocFume(s, T1 + 3 * 3600e3, 'Ahmed')) && /n'y reviens pas/.test(SU.blocFume(s, T1 + 3 * 3600e3, 'Ahmed')));
  assert(!/déjà parlé/.test(SU.blocFume(s, T1 + 30 * 3600e3, 'Ahmed')), 'le lendemain, plus de restriction');
});
t('suites : tout est réglable, activé par défaut, et le prompt complet reste vide si rien à dire', () => {
  const { DEFAUT } = require('./reglages');
  for (const k of ['suitesActives', 'lendemainIntime', 'habitudesActives', 'disputesAvecLui', 'coherenceImmediate']) assert.strictEqual(DEFAUT[k], true, k);
  assert.strictEqual(DEFAUT.bouderieEcartJours, 8);
  assert.strictEqual(SU.bloc(null, {}), '');
  const b = SU.bloc({}, { now: T1, cle: '2026-11-10', moi: 'Ahmed', actifs: { bouderie: false, lendemain: false, dits: false } });
  assert.strictEqual(b, '');
});
t('bot.js se charge', () => { require('./bot'); });

// ---------- Compréhension du contexte ----------
const CX = require('./contexte');
t('citation : l\'étiquette dit de qui est le message cité et est retirée pour les calculs', () => {
  const e = CX.etiquetteCitation({ deMoi: true, corps: 'tu viens demain ?', type: 'chat' });
  assert(/ton message/.test(e) && /tu viens demain/.test(e));
  const e2 = CX.etiquetteCitation({ deMoi: false, corps: '', type: 'ptt' });
  assert(/un de ses messages/.test(e2) && /\[vocal\]/.test(e2));
  assert.strictEqual(CX.etiquetteCitation({ deMoi: true, corps: '', type: 'chat' }), '');
  assert.strictEqual(CX.sansCitation(e + 'oui'), 'oui');
  assert.strictEqual(CX.sansCitation(CX.etiquetteTransfert() + 'regarde ça'), 'regarde ça');
  assert(!/[\[\]].*[\[\]].*[\[\]]/.test(CX.etiquetteCitation({ deMoi: true, corps: 'a [b] c', type: 'chat' })), 'crochets du texte cité neutralisés');
});
t('repères de temps : seulement après un long silence, sans toucher à l\'historique stocké', () => {
  const T = Date.UTC(2026, 10, 5, 10, 0);
  const hist = [
    { role: 'user', content: 'salut', t: T },
    { role: 'model', content: 'coucou', t: T + 60000 },
    { role: 'user', content: 'ça va ?', t: T + 5 * 60000 },
    { role: 'model', content: 'oui et toi', t: T + 6 * 60000 },
  ];
  const sortie = CX.annoterHistorique(hist, { role: 'user', content: 'je suis rentré', t: T + 5 * 3600000 });
  assert(!/⏱/.test(sortie[2].content), 'pas de repère pour 4 minutes');
  assert(/⏱ 5 h plus tard|⏱ 4,9 h plus tard|⏱ 4,8 h plus tard/.test(sortie[4].content), sortie[4].content);
  assert.strictEqual(hist[2].content, 'ça va ?');
  assert.strictEqual(CX.annoterHistorique([{ role: 'user', content: 'x' }, { role: 'user', content: 'y' }], null).length, 2, 'sans horodatage : rien ne casse');
});
t('les repères recopiés par l\'IA sont retirés', () => {
  assert.strictEqual(CX.retirerMarqueurs('[⏱ 3 h plus tard — jeudi 22:14] coucou'), 'coucou');
  assert.strictEqual(CX.retirerMarqueurs('salut\n\n[⏱ 2 min] ça va'), 'salut\n\nça va');
  assert.strictEqual(CX.retirerMarqueurs('[en réponse à ton message : « x »] oui'), 'oui');
});
t('message trop court pour se comprendre seul', () => {
  for (const m of ['oui', 'pourquoi ?', 'lequel', 'et toi', 'c\'est quoi ça', 'jsp trop']) assert(CX.estElliptique(m), m);
  for (const m of ['j\'ai passé une journée de fou aujourd\'hui avec mes amis', '[photo] un chat sur un canapé']) assert(!CX.estElliptique(m), m);
});
t('demande de précision reconnue (ne doit pas être supprimée comme une question en trop)', () => {
  for (const m of ['tu veux dire quoi ?', 'c\'est quoi ça ?', 'wesh tu parles de qui ?']) assert(CX.estPrecision(m), m);
  for (const m of ['et toi t\'as fait quoi aujourd\'hui avec ta famille et tes amis hier soir ?', 'trop bien']) assert(!CX.estPrecision(m), m);
});
t('bloc contexte : dernier message d\'elle, message court, citation', () => {
  const hist = [
    { role: 'user', content: 'salut', t: 1 },
    { role: 'model', content: 'tu fais quoi ce week-end ?', t: Date.now() - 600000 },
  ];
  const b = CX.blocContexte({ historique: hist, message: 'rien de spécial', prenomMoi: 'Sam' });
  assert(/Ton dernier message à Sam/.test(b) && /tu fais quoi ce week-end/.test(b));
  assert(/très court/.test(b), 'message court signalé');
  assert(/arabizi/.test(b) && /tu veux dire quoi/.test(b));
  const c = CX.blocContexte({ historique: hist, message: '[en réponse à ton message : « x »] oui carrément je viens' });
  assert(/PRÉCIS/.test(c));
  const d = CX.blocContexte({ historique: hist, message: 'je viens de finir un long exposé sur la biologie cellulaire' });
  assert(!/très court/.test(d));
});
t('l\'historique de [RIEN] et de réaction n\'est pas pris pour son dernier message', () => {
  const m = CX.dernierMessageDeElle([{ role: 'model', content: 'vrai message' }, { role: 'user', content: 'x' }, { role: 'model', content: '[RIEN]' }, { role: 'model', content: '[REACT:❤️]' }]);
  assert.strictEqual(m.content, 'vrai message');
});


// ---------- v6.1 : émotions plus fines, élan, nouveaux gestes spontanés ----------
t('négation : « je t\'aime pas » ne rend pas tendre, « je t\'aime » oui (et ça gêne un peu)', () => {
  const a = E.nouvelEtat(1.8e12), b = E.nouvelEtat(1.8e12);
  E.reagirMessage(a, 'je t\'aime pas', 1.8e12 + 1, {});
  E.reagirMessage(b, 'je t\'aime', 1.8e12 + 1, {});
  assert(a.e.tendresse <= E.PARAM.tendresse.base + 1e-9 && b.e.tendresse > 0.5 && b.e.gene > 0);
});
t('un plan annulé déçoit, une série de « ok » secs aussi', () => {
  const a = E.nouvelEtat(1.8e12);
  E.reagirMessage(a, 'désolé j\'peux pas ce soir', 1.8e12 + 1, {});
  assert(a.e.deception >= 0.2);
  const b = E.nouvelEtat(1.8e12);
  for (const m of ['ok', 'hm', 'ok']) E.reagirMessage(b, m, 1.8e12 + 1, {});
  assert(b.e.deception > 0.1 && b.raisons.some((x) => /sèch/.test(x.texte)));
  E.reagirMessage(b, 'en fait j\'ai passé une super journée, je te raconte tout ça', 1.8e12 + 2, {});
  assert.strictEqual(b.secs, 0, 'un vrai message remet le compteur à zéro');
});
t('l\'excitation vient d\'une bonne nouvelle ou de « !!! », pas d\'une insulte en majuscules', () => {
  const a = E.nouvelEtat(1.8e12), b = E.nouvelEtat(1.8e12);
  E.reagirMessage(a, 'J\'AI REUSSI !!! trop content', 1.8e12 + 1, {});
  E.reagirMessage(b, 'FERME LA !!!', 1.8e12 + 1, {});
  assert(a.e.excitation > 0.3 && b.e.excitation <= E.PARAM.excitation.base + 1e-9);
});
t('les émotions se voient : mélange, expression, délai plus long si blessée', () => {
  const st = E.nouvelEtat(1.8e12);
  st.e.tendresse = 0.6; st.e.blessure = 0.4;
  assert(/partagée/.test(E.melange(st)));
  assert(/distantes/.test(E.expression(st)));
  const calme = E.modulation(E.nouvelEtat(1.8e12)).delai;
  assert(E.modulation(st).delai > calme);
  const heureuse = E.nouvelEtat(1.8e12); heureuse.e.excitation = 0.7;
  assert(E.modulation(heureuse).delai < calme);
});
t('élan : jamais quand il se confie, quand elle est blessée ou épuisée ; plus souvent quand ça s\'essouffle', () => {
  const EL = require('./elan');
  const e0 = { joie: 0.35, tendresse: 0.4, tristesse: 0.05, irritation: 0.03, inquietude: 0.05, blessure: 0 };
  assert.strictEqual(EL.probabilite({ derniers: ['je suis crevé, ça va pas'], e: e0, fatigue: 0 }), 0);
  assert.strictEqual(EL.probabilite({ derniers: ['ok', 'oui'], e: { ...e0, blessure: 0.5 }, fatigue: 0 }), 0);
  assert.strictEqual(EL.probabilite({ derniers: ['ok', 'oui'], e: e0, fatigue: 0.8 }), 0);
  assert.strictEqual(EL.probabilite({ derniers: ['ok', 'oui'], e: e0, fatigue: 0, minutesDepuisElan: 5 }), 0);
  assert(EL.probabilite({ derniers: ['ok', 'oui'], e: e0, fatigue: 0 }) > EL.probabilite({ derniers: ['j\'ai fini les cours, on a vu plein de choses aujourd\'hui'], e: e0, fatigue: 0 }));
  assert.strictEqual(EL.choisir({ derniers: ['ok', 'oui'], e: e0, fatigue: 0 }, () => 0.99), null);
  const type = EL.choisir({ derniers: ['ok', 'oui'], e: e0, fatigue: 0 }, () => 0.01);
  assert(type && EL.bloc(type).includes('TON ÉLAN'));
});
t('initiative : soutien après un mauvais moment, réconciliation après une froideur, et aucune des deux sans raison', () => {
  const base = { m: 1000, reveil: 450, coucher: 1470, silenceMin: 300, ecartMin: 90, dispo: 0.8, dort: false, fatigue: 0.1, nbAujourdhui: 0, plafond: 4, sansReponse: 0, insistance: 3, e: { joie: 0.35, tendresse: 0.4, blessure: 0, irritation: 0.03 } };
  assert.strictEqual(SP.poidsTypes(base, cfg).soutien, undefined);
  assert.strictEqual(SP.poidsTypes(base, cfg).reconciliation, undefined);
  assert(SP.poidsTypes({ ...base, aSoutenir: true }, cfg).soutien > 5);
  assert(SP.poidsTypes({ ...base, reconcilier: true }, cfg).reconciliation > 5);
  assert(SP.HORS_PLAFOND.includes('soutien') && SP.HORS_PLAFOND.includes('reconciliation'));
  const triste = { ...base, e: { ...base.e, tristesse: 0.6 } };
  assert.strictEqual(SP.poidsTypes(triste, cfg).proposition, undefined, 'triste, elle ne propose pas de sortie');
  for (const type of ['proposition', 'partage', 'soutien', 'reconciliation']) assert(H.CONSIGNES[type], 'consigne manquante : ' + type);
});


t('allure : charme permanent, tenue stable dans la journée, coupé si réglage 0 ou si elle est bloquée', () => {
  const a = P.blocCharme({ niveau: 3, cle: '2026-11-06', curseur: 2 });
  assert(/ALLURE/.test(a) && /jamais de la vulgarité/.test(a));
  assert.strictEqual(P.blocCharme({ niveau: 3, cle: '2026-11-06', curseur: 2 }), a, 'même jour : même tenue');
  assert.notStrictEqual(JSON.stringify(P.tenueDuJour('2026-11-06')), JSON.stringify(P.tenueDuJour('2026-11-09')) + 'x');
  assert.strictEqual(P.blocCharme({ niveau: 0, cle: 'x' }), '');
  assert.strictEqual(P.blocCharme({ niveau: 3, cle: 'x', bloque: true }), '');
  assert(P.blocPersonnalite('salut', '2026-11-06', { niveau: 3, curseur: 1 }).includes('ALLURE'));
});

// ---------- v8.1 : emojis d'amour et crédibilité ----------
const CR = require('./credibilite');
const nbEmojis = (s) => (String(s).match(/\p{Extended_Pictographic}/gu) || []).length;

t('emojis d\'amour : jusqu\'à 2, doux seulement, et plus souvent que dans le reste', () => {
  const m = P.limiterEmojis(['tu me manques ❤️🥰😘😂'], 20, () => 0, { amour: true });
  assert.strictEqual(m[0], 'tu me manques ❤️🥰', 'max 2, et le 😂 est retiré');
  assert.strictEqual(nbEmojis(P.limiterEmojis(['mdr 😂😂'], 20, () => 0, { amour: true }).join('')), 0, 'aucun emoji doux fourni : on n\'en invente pas');
  let amour = 0, ordinaire = 0;
  for (let i = 0; i < 1000; i++) {
    if (nbEmojis(P.limiterEmojis(['je t\'aime ❤️🥰'], 20, Math.random, { amour: true }).join('')) > 0) amour++;
    if (nbEmojis(P.limiterEmojis(['je t\'aime ❤️🥰'], 20).join('')) > 0) ordinaire++;
  }
  assert(amour > 620 && amour < 780, 'amour ' + amour / 10 + ' %');
  assert(ordinaire < 290 && amour > ordinaire * 2, 'ordinaire ' + ordinaire / 10 + ' %');
});

t('messages d\'amour : détectés, mais pas le reste', () => {
  for (const s of ['je t\'aime', 'tu me manques bébé', 'Je t’adore', 'tu es trop mignon', 'mon cœur ❤️', 'fais de beaux rêves']) assert(CR.estTendre(s), s);
  for (const s of ['j\'ai cours à 8h', 'mdr t\'as vu le match', 'je suis fatiguée', 'tu fais quoi ?', 'ça manque de sel']) assert(!CR.estTendre(s), s);
});

t('emojis : message d\'amour (le sien ou le tien) autorisé, ailleurs strict, et jamais si elle est froide', () => {
  const { Bot } = require('./bot');
  const b = Object.create(Bot.prototype);
  b.config = { longueurMax: 200, bullesMax: 2, emojiProba: 0, emojiAmourProba: 100, emojiAmourMax: 2, langageOral: false };
  assert.strictEqual(b.preparerReponse('tu me manques aussi ❤️🥰').join(' '), 'tu me manques aussi ❤️🥰', 'sa réponse est tendre');
  assert(CR.estTendre('ok ❤️') && !CR.estTendre('ok ❤️', false), 'un ❤️ seul : tendre chez lui, pas chez elle');
  assert.strictEqual(nbEmojis(b.preparerReponse('j\'ai cours demain 😂❤️').join(' ')), 0, 'message ordinaire : emojis retirés (proba 0)');
  assert.strictEqual(b.preparerReponse('toi aussi ❤️', { amour: true }).join(' '), 'toi aussi ❤️', 'il a écrit un message d\'amour');
  assert.strictEqual(nbEmojis(b.preparerReponse('toi aussi ❤️', { amour: true, froid: true }).join(' ')), 0, 'froide ou blessée : aucun emoji tendre');
  b.config.emojiAmour = false;
  assert.strictEqual(nbEmojis(b.preparerReponse('je t\'aime ❤️🥰').join(' ')), 0, 'réglage coupé : ancien comportement');
});

t('le prompt dit clairement quand les emojis sont permis', () => {
  const { Bot } = require('./bot');
  const b = Object.create(Bot.prototype);
  b.config = { longueurMax: 180, bullesMax: 2 };
  const oui = b.reglesDeForme({ amour: true }), non = b.reglesDeForme({});
  assert(oui.includes('plus de droit aux emojis') && oui.includes('jamais de 😂'));
  assert(non.includes('réservés aux vrais messages d\'amour') && !non.includes('plus de droit'));
});

t('config : l\'ancien prompt enregistré reçoit la règle d\'emojis, un prompt perso reste intact', () => {
  const fs = require('fs'), os = require('os'), path = require('path');
  const { chargerConfig } = require('./reglages');
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-cfg-'));
  const f = path.join(d, 'c.json');
  fs.writeFileSync(f, JSON.stringify({ versionConfig: 7, cleApi: 'k', promptPerso: 'Intro.\nPeu d\'emojis : la plupart de tes messages n\'en ont aucun. Varie.' }));
  const c = chargerConfig(f);
  assert(c.promptPerso.includes('messages d\'amour') && c.promptPerso.startsWith('Intro.') && c.promptPerso.endsWith('Varie.'));
  assert.strictEqual(c.cleApi, 'k'); assert.strictEqual(c.versionConfig, 8);
  fs.writeFileSync(f, JSON.stringify({ versionConfig: 7, promptPerso: 'Mon prompt à moi.' }));
  assert.strictEqual(chargerConfig(f).promptPerso, 'Mon prompt à moi.');
  fs.rmSync(d, { recursive: true, force: true });
});

t('crédibilité : phrases d\'assistant repérées, sauf si on lui demande sérieusement si elle est une IA', () => {
  assert(CR.ticAssistant(['Bien sûr ! Voici quelques idées pour toi']));
  assert(CR.ticAssistant(['mdr', 'En tant qu\'IA, je ne peux pas']));
  assert(CR.ticAssistant(['n\'hésite pas à me dire si tu as besoin']));
  assert(!CR.ticAssistant(['mdr non je suis pas une IA, t\'es bête']));
  assert(!CR.ticAssistant(['j\'ai cours toute la journée, je suis morte']));
  assert(!CR.ticAssistant(['je suis une IA, oui, je te le dis honnêtement'], 'sérieusement, t\'es une IA ?'), 'la vérité demandée sérieusement n\'est pas bloquée');
  assert.deepStrictEqual(CR.retirerTics(['Bien sûr ! t\'inquiète, j\'arrive']), ['t\'inquiète, j\'arrive']);
  assert.deepStrictEqual(CR.retirerTics(['En tant qu\'IA, je ne peux pas.']), []);
});

t('crédibilité : pas de mise en scène (*sourit*, (elle rit)) mais les vraies fautes corrigées restent', () => {
  assert.strictEqual(CR.retirerDidascalies('*sourit* mdr (elle rit) ok [rougit] bon'), 'mdr ok bon');
  assert.strictEqual(CR.retirerDidascalies('*pas'), '*pas');
  assert.strictEqual(CR.retirerDidascalies('trop bien (enfin je crois)'), 'trop bien (enfin je crois)');
});

t('crédibilité : un message presque identique à un récent est repéré, pas les messages courts', () => {
  const avant = ['je suis trop fatiguée là franchement', 'cours toute la journée'];
  assert(CR.repetition(['je suis trop fatiguée là franchement !'], avant));
  assert(CR.repetition(['franchement je suis trop fatiguée là'], avant));
  assert(!CR.repetition(['mdr non toi t\'as fait quoi ?'], avant));
  assert(!CR.repetition(['mdr'], ['mdr']), 'trop court pour compter');
  const h = [{ role: 'user', content: 'a' }, { role: 'model', content: 'salut\n\nça va et toi ?' }, { role: 'model', content: '[REACT:❤️]' }, { role: 'model', content: '[RIEN]' }];
  assert.deepStrictEqual(CR.derniersMessagesElle(h), ['salut', 'ça va et toi ?']);
});

// ---------- v8.1 : histoire, entourage et émotions ----------
const HI = require('./histoire');

t('histoire : fixe pour une date, complète (4 étapes par histoire, émotions connues)', () => {
  const E2 = require('./emotions');
  assert.strictEqual(HI.blocEntourage('2026-11-07', {}, {}), HI.blocEntourage('2026-11-07', {}, {}));
  for (const [id, arcs] of Object.entries(HI.ARCS)) for (const a of arcs) {
    assert.strictEqual(a.beats.length, 4, id + ' / ' + a.titre);
    assert(E2.PARAM[a.emotion[0]], 'émotion inconnue : ' + a.emotion[0]);
    assert(a.emotion[1] > 0 && a.emotion[1] <= 0.6);
  }
});

t('histoire : les histoires avancent dans l\'ordre et ne se répètent pas deux fois de suite', () => {
  for (const id of ['sarah', 'ines', 'ania', 'parents', 'amel']) {
    let vu = [], prev = null, titres = [];
    for (let d = 0; d < 36 * 4; d++) {
      const cle = new Date(Date.UTC(2026, 5, 1 + d, 12)).toISOString().slice(0, 10);
      const h = HI.histoireDe(id, cle);
      if (prev && prev.titre === h.titre) assert(h.etape >= prev.etape, `${id} recule : ${prev.etape} -> ${h.etape}`);
      if (!titres.length || titres[titres.length - 1] !== h.titre) titres.push(h.titre);
      prev = h; vu.push(h.etape);
    }
    assert(new Set(vu).size === 4, id + ' : toutes les étapes sont jouées');
    for (let i = 1; i < titres.length; i++) assert.notStrictEqual(titres[i], titres[i - 1], id + ' répète la même histoire');
    assert(new Set(titres).size >= 2, id + ' : plusieurs histoires différentes');
  }
});

t('histoire : les olives au village en saison (novembre-décembre), pas en été', () => {
  assert.strictEqual(HI.saisonOlives('2026-11-07'), 6);
  assert.strictEqual(HI.saisonOlives('2026-06-15'), null);
  assert.strictEqual(HI.saisonOlives('2027-01-05'), 65 >= 56 ? null : 65);
  assert.strictEqual(HI.histoireDe('village', '2026-11-07').titre, 'la récolte des olives');
  assert.strictEqual(HI.histoireDe('village', '2026-11-20').etape, 1);
  assert.strictEqual(HI.histoireDe('village', '2026-11-30').etape, 2);
  for (let d = 0; d < 120; d++) {
    const cle = new Date(Date.UTC(2026, 2, 1 + d, 12)).toISOString().slice(0, 10);
    assert.notStrictEqual(HI.histoireDe('village', cle).titre, 'la récolte des olives', cle);
  }
});

t('histoire : deux proches au premier plan, plus celui dont il parle', () => {
  assert.strictEqual(HI.auPremierPlan('2026-11-07').length, 2);
  assert(HI.auPremierPlan('2026-11-07', 'comment va Inès ?').includes('ines'));
  assert(HI.auPremierPlan('2026-11-07', 'et ta grand-mère ?').includes('village'));
  assert(HI.auPremierPlan('2026-11-07', 'sarah, ania, inès, amel et papa').length <= 3);
  const f = HI.emotionDeFond('2026-11-07');
  assert(f && f.nom && f.valeur > 0);
});

t('histoire : les souvenirs intimes dépendent de la confiance, la chronologie est claire', () => {
  const bas = HI.blocHistoire('2026-11-07', { message: 'lilya canada amie d\'enfance', lien: 10 }, {});
  const haut = HI.blocHistoire('2026-11-07', { message: 'lilya canada amie d\'enfance', lien: 60 }, {});
  assert(!bas.includes('Canada') && haut.includes('Canada'), 'Lilya seulement avec la confiance');
  assert(bas.includes('Hocine') && bas.includes('Sarah') && bas.includes('Nna Tassadit') && bas.includes('Amel') && bas.includes('Ania'), 'les proches sont toujours là');
  assert(!bas.includes('poèmes'), 'le secret du carnet demande de la confiance');
  const e = HI.blocEntourage('2026-11-07', {}, {});
  assert(e.includes('en ce moment :') && e.includes('Respecte la chronologie'));
  assert.strictEqual(HI.blocHistoire('2026-11-07', {}, { histoireActive: false }), '');
  assert.strictEqual(HI.blocEntourage('2026-11-07', {}, { entourageVivant: false }), '');
});

t('histoire : reconnaît quand il s\'intéresse à elle', () => {
  for (const s of ['raconte moi ton enfance', 'comment va ta famille ?', 'parle moi de toi', 'et tes parents ?', 'tes peurs c\'est quoi', 'comment va Inès ?']) assert(HI.questionSurElle(s), s);
  for (const s of ['salut ça va', 'j\'ai cours demain', 'tu fais quoi ce soir', 'mdr trop bien']) assert(!HI.questionSurElle(s), s);
});

t('émotions : émue, nostalgique, stressée — et ce qui les déclenche', () => {
  const T0 = 1.8e12;
  let st = E.nouvelEtat(T0);
  E.reagirMessage(st, 'je suis là pour toi, tu peux tout me dire', T0 + 1, {});
  assert(st.e.emue >= 0.35, 'émue : ' + st.e.emue);
  assert(E.bloc(st, T0 + 2).includes('émue'));
  assert(E.expression(st).includes('ça me touche'));
  st = E.nouvelEtat(T0);
  E.reagirMessage(st, 'comment va ta famille ? raconte moi ton enfance', T0 + 1, {});
  assert(st.e.nostalgie >= 0.14 && st.e.emue > 0.05);
  st = E.nouvelEtat(T0);
  E.reagirMessage(st, 'un jour on voyagera ensemble', T0 + 1, {});
  assert(st.e.excitation > 0.15 && st.e.emue > 0.1);
  st = E.nouvelEtat(T0);
  E.reagirMessage(st, 'tu m\'avais raconté pour ton grand-père, j\'y ai repensé', T0 + 1, {});
  assert(st.e.emue >= 0.18);
  st = E.nouvelEtat(T0);
  E.reagirMessage(st, 'salut ça va ?', T0 + 1, {});
  assert(st.e.emue < 0.05 && st.e.nostalgie < 0.1, 'un message banal ne l\'émeut pas');
  E.ajouter(st, 'stress', 0.6);
  assert(E.bloc(st, T0 + 2).includes('stressée'));
  const vieux = E.nouvelEtat(T0); delete vieux.e.emue; delete vieux.e.stress; // ancien fichier d'état sans les nouvelles émotions
  E.evoluer(vieux, T0 + 3600000, {}); E.reagirMessage(vieux, 'je suis là pour toi', T0 + 7200000, {});
  assert(vieux.e.emue > 0.2, 'les anciens états sont compatibles');
});

t('émotions : la toile de fond du jour (entourage) ne s\'ajoute qu\'une fois par jour', () => {
  const st = E.nouvelEtat(1.8e12);
  const f = { nom: 'inquietude', valeur: 0.35, histoire: 'x' };
  assert.strictEqual(E.appliquerFond(st, '2026-11-07', f), true);
  const v = st.e.inquietude;
  assert(v >= 0.3);
  assert.strictEqual(E.appliquerFond(st, '2026-11-07', f), false);
  assert.strictEqual(st.e.inquietude, v);
  assert.strictEqual(E.appliquerFond(st, '2026-11-08', f), true, 'le lendemain, nouvelle toile de fond');
});

t('prompt : histoire, entourage et consigne « il parle d\'elle » sont bien assemblés', () => {
  const { Bot } = require('./bot');
  const d = require('os').tmpdir() + '/bt-prompt-' + process.pid;
  const mk = (cfg) => { const b = new Bot({ ...require('./reglages').DEFAUT, cleApi: 'x', numerosAutorises: '213550123456', ...cfg }, d, () => {}); b.log = () => {}; return b; };
  const p = mk({}).construirePrompt('213550123456', { message: 'raconte moi ta famille', parleDeSoi: true, question: false });
  assert(p.includes('TON HISTOIRE ET TES PROCHES') && p.includes('CE QUI SE PASSE DANS TON ENTOURAGE') && p.includes('question sur toi, ta famille'));
  const q = mk({}).construirePrompt('213550123456', { message: 'salut', question: false });
  assert(!q.includes('question sur toi, ta famille'));
  const s = mk({ histoireActive: false, entourageVivant: false }).construirePrompt('213550123456', { message: 'salut', question: false });
  assert(!s.includes('TON HISTOIRE ET TES PROCHES') && !s.includes('CE QUI SE PASSE DANS TON ENTOURAGE'));
  require('fs').rmSync(d, { recursive: true, force: true });
});

console.log(process.exitCode ? '\nDes vérifications ont échoué.' : `\nTout est bon (${ok} vérifications).`);

t('sauvegarde atomique : un fichier corrompu est relu depuis la copie de secours', () => {
  const fs = require('fs');
  const { Bot } = require('./bot');
  const d = require('os').tmpdir() + '/bot-test-' + process.pid;
  const b = Object.create(Bot.prototype);
  b.dossier = d; b.log = () => {};
  const f = d + '/m.json';
  b.ecrireJson(f, { a: 1 }); b.ecrireJson(f, { a: 2 });
  fs.writeFileSync(f, '{"a":2,');
  assert.deepStrictEqual(b.lireJson(f, {}), { a: 1 });
  assert.deepStrictEqual(b.lireJson(d + '/absent.json', { v: 0 }), { v: 0 });
  fs.rmSync(d, { recursive: true, force: true });
});

t('style SMS : abréviations et contractions, avec un aléa maîtrisé', () => {
  const N = require('./naturel');
  assert.strictEqual(N.styleSms('Je ne sais pas, tu es trop gentil', { r: () => 0 }), 'jsp, t\'es troppp gentil');
  assert.strictEqual(N.styleSms('Ahmed, tu es là ?', { r: () => 0 }), 'Ahmed, t\'es là ?', 'un prénom garde sa majuscule');
  assert.strictEqual(N.styleSms('Je sais pas, tu es sûr ?', { r: () => 0.99 }), 'Je sais pas, tu es sûr ?', 'aléa haut : rien ne change');
  assert.strictEqual(N.styleSms('Je ne sais pas', { r: () => 0, proba: 0 }), 'Je ne sais pas', 'intensité 0 : rien ne change');
  assert.strictEqual(N.styleSms('regarde https://exemple.com tu es là', { r: () => 0 }), 'regarde https://exemple.com tu es là', 'les liens ne sont pas touchés');
  const longue = 'Je ne sais pas pourquoi mais tu es vraiment quelqu\'un de bien et beaucoup de gens le pensent maintenant, vraiment, je te le dis parce que c\'est vrai.';
  assert(!/jsp|bcp|qqn|mnt/.test(N.styleSms(longue, { r: () => 0 })), 'pas d\'abréviation dans un long message');
});
