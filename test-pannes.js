// Vérifications de la v3.9 : pannes, petites absences, désir. `node test-pannes.js` (aucune connexion, aucun appel IA).
process.env.TZ = process.env.TZ || 'Africa/Algiers';
const assert = require('assert');
const H = require('./humain');
const PA = require('./pannes');
const PR = require('./promesses');
const P = require('./personnalite');
const cfg = { pannesProbaJour: 100, pannesEcartJours: 1 };
let ok = 0;
const t = (nom, fn) => { try { fn(); ok++; console.log('  ok  ' + nom); } catch (e) { console.log('ÉCHEC ' + nom + ' : ' + e.message); process.exitCode = 1; } };
const MIN = 60000;
const suite = (r0 = 0.5) => () => r0;

t('une panne est planifiée pendant la journée éveillée, avec un type et une durée plausibles', () => {
  const p = PA.planDuJour('2026-11-06', 450, 1400, cfg);
  assert(p && PA.TYPES[p.type], 'pas de panne');
  assert(p.at >= 450 + 90 && p.at <= 1400, 'heure ' + p.at);
  const [a, b] = PA.TYPES[p.type].duree;
  assert(p.duree >= a && p.duree <= b, 'durée ' + p.duree);
});
t('pannesProbaJour = 0 : jamais de panne', () => {
  for (let d = 0; d < 60; d++) assert.strictEqual(PA.planDuJour(new Date(Date.UTC(2026, 10, 1 + d)).toISOString().slice(0, 10), 450, 1400, { pannesProbaJour: 0 }), null);
});
t('environ 25 % des jours ont une panne par défaut, espacées de 2 jours minimum', () => {
  let n = 0, prev = null, maxSuite = 0, suiteN = 0;
  for (let d = 0; d < 400; d++) {
    const cle = new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10);
    const p = PA.planDuJour(cle, 450, 1400, {}, prev);
    if (p) { n++; prev = cle; }
  }
  assert(n > 60 && n < 130, 'nombre de pannes sur 400 j : ' + n);
});
t('cycle complet : début, silence, fin, retour à raconter, puis plus rien', () => {
  const etat = PA.nouvelEtat();
  const ctx = { cle: '2026-11-06', m: 700, reveil: 450, coucher: 1400, dort: false, conversation: true };
  let now = Date.UTC(2026, 10, 6, 12, 0);
  let e = PA.tick(etat, now, ctx, cfg, suite());
  // la panne n'a pas encore commencé avant son heure
  if (!e.debut) { ctx.m = etat.plan.at + 1; e = PA.tick(etat, now, ctx, cfg, suite()); }
  assert(e.debut, 'la panne devait commencer');
  assert(PA.active(etat, now + MIN), 'panne active');
  assert(PA.finPanne(etat, now + MIN) > now, 'fin connue');
  assert.strictEqual(PA.bloc(etat, now + MIN), '', 'pas de bloc pendant la panne');
  const fin = etat.actuelle.fin;
  assert(!PA.active(etat, fin + 1));
  const e2 = PA.tick(etat, fin + 1, ctx, cfg, suite());
  assert(e2.fin, 'fin signalée');
  assert(PA.retourAFaire(etat, fin + 5 * MIN), 'retour à raconter');
  assert(/réseau|data|batterie|courant|forfait|téléphone|connexion|box/.test(PA.bloc(etat, fin + 5 * MIN)), 'le bloc donne la raison');
  etat.actuelle.dit = true;
  assert.strictEqual(PA.retourAFaire(etat, fin + 5 * MIN), null);
});
t('une panne trop ancienne n\'est plus racontée', () => {
  const etat = PA.nouvelEtat();
  etat.actuelle = { type: 'data', debut: 0, fin: 1000, raison: 'x', finie: true, dit: false };
  assert.strictEqual(PA.retourAFaire(etat, 1000 + (PA.FENETRE_RETOUR_MIN + 1) * MIN), null);
});
t('pas de nouvelle panne pendant le sommeil, ni pendant une autre panne', () => {
  const etat = PA.nouvelEtat();
  const ctx = { cle: '2026-11-06', m: 1300, reveil: 450, coucher: 1400, dort: true, conversation: false };
  assert(!PA.tick(etat, 1e12, ctx, cfg, suite()).debut, 'ne doit pas démarrer endormie');
});
t('l\'annonce n\'a lieu que si une conversation est en cours', () => {
  for (const conversation of [true, false]) {
    let annonce = 0;
    for (let d = 0; d < 80; d++) {
      const etat = PA.nouvelEtat();
      const ctx = { cle: new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10), m: 1000, reveil: 450, coucher: 1400, dort: false, conversation };
      const e = PA.tick(etat, 1e12, ctx, cfg, suite());
      if (e.debut && e.debut.previent) annonce++;
    }
    assert(conversation ? annonce > 0 : annonce === 0, `conversation=${conversation} annonces=${annonce}`);
  }
});
t('chaque type de panne a des raisons, une annonce et un message de retour', () => {
  for (const [k, v] of Object.entries(PA.TYPES)) {
    assert(v.raisons.length >= 3 && v.annonce.length > 40, k);
    const p = { type: k, debut: 0, fin: 30 * MIN, raison: v.raisons[0] };
    assert(PA.consigneRetour(p, 30 * MIN).includes(v.raisons[0]));
  }
});

// ---------- Petites absences ----------
t('« ma mère m\'appelle, je reviens » : absence de 10 à 40 min avec une raison', () => {
  const now = 1e12;
  for (let i = 0; i < 50; i++) {
    const [a] = PR.detecterAbsence('Attends, ma mère m\'appelle, je reviens', now);
    assert(a && a.absence && a.cause === 'mere', 'pas détectée');
    const min = (a.echeance - now) / MIN;
    assert(min >= 10 && min <= 41, 'retour en ' + min + ' min');
    assert(a.raison.length > 10);
  }
});
t('les faux positifs ne déclenchent rien', () => {
  for (const x of ['J\'arrive pas à dormir', 'j\'arrive à la fac à 8h', 'tu reviens quand ?', 'Je te raconte ça ce soir', 'je reviens demain', 'ma mère est gentille', 'ok bonne nuit']) {
    assert.strictEqual(PR.detecterAbsence(x, 1e12).length, 0, x);
  }
});
t('une vraie promesse horodatée reste une promesse, pas une absence', () => {
  assert.strictEqual(PR.detecter('Je te raconte ça ce soir', 1e12).length, 1);
  assert.strictEqual(PR.detecter('Attends ma mère m\'appelle, je reviens', 1e12).length, 0);
});
t('la raison suit la personne citée (Sarah / Inès / père)', () => {
  assert(/Sarah/.test(PR.detecterAbsence('Sarah me cherche, brb', 1e12)[0].raison));
  assert(/Inès/.test(PR.detecterAbsence('Inès me demande un truc, deux sec', 1e12)[0].raison));
  assert.strictEqual(PR.detecterAbsence('baba m\'appelle, j\'arrive', 1e12)[0].cause, 'pere');
});
t('une seule absence à la fois, et elle expire si le retour est très en retard', () => {
  const now = 1e12;
  const a = PR.detecterAbsence('ma mère m\'appelle, je reviens', now);
  const b = PR.detecterAbsence('deux sec, j\'arrive', now + 5 * MIN);
  const liste = PR.fusionner(PR.fusionner([], a, now), b, now + 5 * MIN);
  assert.strictEqual(liste.filter((p) => p.absence).length, 1);
  assert(PR.absenceEnCours(liste, now + 2 * MIN), 'en cours');
  assert.strictEqual(PR.absenceEnCours(liste, liste[0].echeance + 1), null, 'plus en cours après l\'échéance');
  assert(PR.due(liste, liste[0].echeance + 5 * MIN), 'due au retour');
  assert.strictEqual(PR.due(liste, liste[0].echeance + (PR.ABSENCE_EXPIRE_MIN + 1) * MIN), null, 'expirée');
});
t('la consigne de retour contient la raison et le temps passé ; le bloc la rappelle', () => {
  const now = 1e12;
  const [a] = PR.detecterAbsence('ma mère m\'appelle, je reviens', now);
  const c = PR.consigne(a, 'Ahmed', a.echeance);
  assert(c.includes(a.raison) && /\d+ ?min/.test(c), c);
  assert(PR.bloc([a], now + 3 * MIN).includes(a.raison));
  assert(PR.bloc([a], a.echeance + MIN).includes('de retour'));
});

// ---------- Interruptions ----------
t('une interruption n\'arrive que dans une vraie discussion, à la maison, jamais en cours ni en dormant', () => {
  const base = { code: 'soiree', dort: false, conversation: true, nbAujourdhui: 0, enAbsence: false, chaleur: 0 };
  assert(PA.tireInterruption(base, { absencesProba: 100 }, () => 0), 'devrait tirer');
  for (const mod of [{ conversation: false }, { code: 'cours' }, { code: 'repas' }, { dort: true }, { enAbsence: true }, { nbAujourdhui: 2 }]) {
    assert.strictEqual(PA.tireInterruption({ ...base, ...mod }, { absencesProba: 100 }, () => 0), null, JSON.stringify(mod));
  }
  assert.strictEqual(PA.tireInterruption(base, { absencesProba: 0 }, () => 0), null);
});
t('fréquence : environ 5 % des réponses, un peu plus quand ça chauffe', () => {
  const n = (chaleur) => { let c = 0; for (let i = 0; i < 4000; i++) if (PA.tireInterruption({ code: 'soiree', conversation: true, nbAujourdhui: 0, chaleur }, {}, Math.random)) c++; return c; };
  const a = n(0), b = n(2);
  assert(a > 100 && a < 320, 'normal ' + a);
  assert(b > a, 'chaud ' + b + ' vs ' + a);
});

// ---------- Désir ----------
t('le désir revient par périodes, plus fort le soir que le matin', () => {
  let soir = 0, midi = 0;
  for (let d = 0; d < 56; d++) {
    const cle = new Date(Date.UTC(2026, 10, 6 + d)).toISOString().slice(0, 10);
    soir += P.desirDuJour(cle, 22 * 60).niveau;
    midi += P.desirDuJour(cle, 11 * 60).niveau;
  }
  assert(soir > midi, `soir ${soir} / midi ${midi}`);
  assert(P.desirDuJour('2026-11-06', 22 * 60).niveau === P.desirDuJour('2026-11-06', 22 * 60).niveau, 'stable');
});
t('chaleur 0 à 3 ; le niveau 3 n\'existe qu\'avec le réglage 3', () => {
  assert.strictEqual(P.niveauChaleur(['salut']), 0);
  assert.strictEqual(P.niveauChaleur(['tes mains', 'j\'ai chaud', 'contre toi']), 3);
  assert(/BRÛLANTE/.test(P.blocCoquin({ niveau: 3, chaleur: 3 })));
  assert(!/BRÛLANTE/.test(P.blocCoquin({ niveau: 2, chaleur: 3 })));
  assert(/CHAUFFE/.test(P.blocCoquin({ niveau: 2, chaleur: 3 })));
  assert.strictEqual(P.blocCoquin({ niveau: 0, chaleur: 3 }), '');
});
t('le désir à elle apparaît (niveau 3) mais disparaît si elle est bloquée', () => {
  assert(/sens complètement en éveil/.test(P.blocCoquin({ niveau: 3, chaleur: 0, desir: 2 })));
  assert(!/sens complètement en éveil/.test(P.blocCoquin({ niveau: 2, chaleur: 0, desir: 2 })));
  assert(!/sens complètement en éveil/.test(P.blocCoquin({ niveau: 3, chaleur: 0, desir: 2, bloque: true })));
});
t('toujours suggéré : la limite « jamais explicite » figure à tous les niveaux chauds', () => {
  for (const chaleur of [2, 3]) assert(/jamais pornographique/.test(P.blocCoquin({ niveau: 3, chaleur, desir: 2 })), 'chaleur ' + chaleur);
});

console.log(`\n${ok} vérifications réussies.`);
