// Vérifications de la v8.4 : intimité qui s'installe. `node test-intimite.js`
// Aucune connexion WhatsApp, aucun appel IA.
process.env.TZ = process.env.TZ || 'Africa/Algiers';
const assert = require('assert');
const IN = require('./intimite');
let ok = 0;
const attente = [];
const t = (nom, fn) => { try { const r = fn(); if (r && r.then) attente.push(r.then(() => { ok++; console.log('  ok  ' + nom); }, (e) => { console.log('ÉCHEC ' + nom + ' : ' + e.message); process.exitCode = 1; })); else { ok++; console.log('  ok  ' + nom); } } catch (e) { console.log('ÉCHEC ' + nom + ' : ' + e.message); process.exitCode = 1; } };
const jour = (n) => new Date(Date.UTC(2026, 10, 1 + n)).toISOString().slice(0, 10);
const base = { niveau: 3, cle: jour(0), now: Date.parse('2026-11-01T21:00:00Z'), message: 'coucou', moment: 'soiree', m: 1300, coucher: 1470, chaleur: 0, curseur: 2, bloque: false, lien: 60, tenue: { soir: 'pyjama en satin noir', parfum: 'vanille et ambre' }, prenomMoi: 'Ahmed' };
const CRU = /\b(sexe|bite|queue|chatte|seins|nu(e|es)?\b|nue|penetr|p[eé]n[eé]tr|orgasm|g[eé]mir)/i;

// ---------- 1. Présence ----------

t('présence : seulement le soir, jamais si bloquée ou si le jour est sage, 3 fois par jour au plus', () => {
  const i = IN.nouvelEtat();
  const essaye = (o) => { for (let k = 0; k < 40; k++) if (IN.blocPresence(i, { ...base, message: 'm' + k, ...o })) return true; return false; };
  assert.strictEqual(essaye({ moment: 'cours' }), false);
  assert.strictEqual(essaye({ moment: 'matin' }), false);
  assert.strictEqual(essaye({ bloque: true }), false);
  assert.strictEqual(essaye({ curseur: 0 }), false);
  assert.strictEqual(essaye({ niveau: 0 }), false);
  assert.strictEqual(essaye({}), true);
  i.presence = { cle: jour(0), n: 3 };
  assert.strictEqual(essaye({}), false);
});
t('présence : suggérée (une odeur, une chaleur), jamais de vocabulaire cru, jamais récitée', () => {
  const i = IN.nouvelEtat();
  let vus = 0;
  for (let k = 0; k < 60; k++) {
    const b = IN.blocPresence(i, { ...base, message: 'x' + k });
    if (!b) continue;
    vus++;
    assert(!CRU.test(b), 'cru : ' + b);
    assert(/jamais crue/.test(b));
  }
  assert(vus > 15 && vus < 50, 'pas à chaque message : ' + vus + '/60');
});

// ---------- 2. Les nuits ----------

const nuit = { cle: jour(0), now: base.now, dort: true, lien: 60, curseur: 2, emoBloque: false, message: 'coucou', minutesDepuisCoucher: 120, minutesAvantReveil: 300 };
t('réveil de nuit : rare, jamais si lien frais, humeur freinée, juste après le coucher ou juste avant le réveil', () => {
  const taux = (ctx) => { let n = 0; const { prefixe = 'msg ', ...reste } = ctx; for (let k = 0; k < 300; k++) { const i = IN.nouvelEtat(); if (IN.decisionReveil(i, { ...nuit, cle: jour(k % 5), message: prefixe + k, ...reste })) n++; } return n; };
  const normal = taux({});
  assert(normal > 15 && normal < 120, 'réveils : ' + normal + '/300');
  assert.strictEqual(taux({ lien: 20 }), 0);
  assert.strictEqual(taux({ emoBloque: true }), 0);
  assert.strictEqual(taux({ minutesDepuisCoucher: 10 }), 0);
  assert.strictEqual(taux({ minutesAvantReveil: 30 }), 0);
  assert.strictEqual(taux({ dort: false }), 0);
  assert(taux({ prefixe: 'tu me manques ' }) > normal, 'un message tendre la réveille plus souvent');
});
t('réveil de nuit : un par nuit, deux par semaine au plus, puis elle reste éveillée tant que ça dure', () => {
  const i = IN.nouvelEtat();
  let d = null, k = 0;
  while (!d && k < 400) d = IN.decisionReveil(i, { ...nuit, message: 'tu me manques ' + (k++) });
  assert(d && d.secondes >= 40 && d.secondes <= 240, 'délai 40 à 240 s : ' + (d && d.secondes));
  assert.strictEqual(IN.modeNuit(i, nuit.now + 5 * 60000, nuit.cle), 'reveil');
  assert.strictEqual(IN.decisionReveil(i, { ...nuit, now: nuit.now + 5 * 60000, message: 'encore' }).deja, true);
  assert.strictEqual(IN.modeNuit(i, nuit.now + 50 * 60000, nuit.cle), null, 'rendormie après 40 min de silence');
  const j = IN.nouvelEtat();
  j.nuit.histoReveil = [jour(-1), jour(-3)];
  for (let n = 0; n < 100; n++) assert.strictEqual(IN.decisionReveil(j, { ...nuit, message: 'z' + n }), null, 'déjà deux cette semaine');
});
t('insomnie : environ une nuit sur quatre, 5 à 55 min après le coucher, jamais sans échange dans la journée', () => {
  const ctx = { cle: jour(0), coucher: 1470, lien: 60, curseur: 2, echangeAujourdhui: true, emoBloque: false, sansReponse: 0, insistance: 3 };
  let nuits = 0;
  for (let k = 0; k < 200; k++) {
    const c = { ...ctx, cle: jour(k) };
    const i = IN.nouvelEtat();
    let vu = false;
    for (let m = c.coucher - 10; m < c.coucher + 120; m++) if (IN.veutInsomnie(i, { ...c, m })) { vu = true; assert(m >= c.coucher + 5 && m <= c.coucher + 80, 'fenêtre : ' + (m - c.coucher)); }
    if (vu) nuits++;
  }
  assert(nuits > 30 && nuits < 90, 'nuits : ' + nuits + '/200');
  const i = IN.nouvelEtat();
  for (let m = 1400; m < 1600; m++) assert.strictEqual(IN.veutInsomnie(i, { ...ctx, m, echangeAujourdhui: false }), false);
});
t('insomnie : pas deux fois la même nuit, deux par semaine au plus, mode « insomnie » ensuite', () => {
  const i = IN.nouvelEtat();
  IN.marquerInsomnie(i, jour(0), nuit.now);
  IN.marquerInsomnie(i, jour(0), nuit.now + 1000);
  assert.strictEqual(i.nuit.histoInsomnie.length, 1, 'une nuit = une entrée');
  assert.strictEqual(IN.modeNuit(i, nuit.now + 10 * 60000, jour(0)), 'insomnie');
  const j = IN.nouvelEtat();
  j.nuit.histoInsomnie = [jour(-1), jour(-2)];
  for (let m = 1400; m < 1700; m++) assert.strictEqual(IN.veutInsomnie(j, { cle: jour(0), m, coucher: 1470, lien: 60, curseur: 2, echangeAujourdhui: true }), false);
});
t('nuit : le prompt passe outre « tu dors », la forme est garantie (2 bulles courtes, pas de majuscule ni de point)', () => {
  const i = IN.nouvelEtat();
  IN.marquerInsomnie(i, jour(0), base.now);
  const r = IN.preparer(i, { ...base, moment: 'dort', now: base.now + 60000 }, {});
  assert.strictEqual(r.decisions.nuit, 'insomnie');
  assert(/ignore ce que dit/.test(r.texte));
  const m = IN.appliquerNuit(['Mmh. Je dormais presque.', 'Il est quelle heure ?', 'Viens près de moi, je suis bien là. Reste un peu, tu veux bien ? Je te promets que je dors après.']);
  assert(m.length <= 2 && m.every((x) => x.length <= 112));
  assert(/^[a-zà-ÿ]/.test(m[0]) && !/\.$/.test(m[0]));
});
t('nuits coupées par le réglage : aucun bloc, aucun réveil', () => {
  const i = IN.nouvelEtat();
  IN.marquerInsomnie(i, jour(0), base.now);
  assert.strictEqual(IN.preparer(i, { ...base, moment: 'dort', now: base.now + 1000 }, { nuitsActives: false }).decisions.nuit, null);
  assert.strictEqual(IN.decisionReveil(IN.nouvelEtat(), { ...nuit, message: 'tu me manques' }, { nuitsActives: false }), null);
});

// ---------- 3. Scénarios imaginés ----------

t('scénario : repéré dans sa phrase ou dans la sienne, classé, tronqué', () => {
  const a = IN.reperer('Mmh. Si tu étais là ce soir, je me blottirais contre toi sans rien dire.');
  assert(a && a.type === 'ce_soir' && /Si tu étais là/.test(a.texte));
  assert.strictEqual(IN.reperer('On pourrait aller au café samedi, juste nous deux.').type, 'rendezvous');
  assert.strictEqual(IN.reperer('Je repense à la dernière fois, tu m\'as vraiment fait rire.').type, 'souvenir');
  assert.strictEqual(IN.reperer('J\'ai cours demain à huit heures.'), null);
  assert(IN.reperer('Imagine ' + 'très '.repeat(60) + 'loin.').texte.length <= 152);
});
t('scénario : noté seulement si l\'ambiance s\'y prête, puis revient les jours suivants, 3 fois au plus', () => {
  const i = IN.nouvelEtat();
  const tour = (cle, o) => IN.apres(i, { cle, now: Date.parse(cle + 'T20:00:00Z'), message: '', texteElle: '', chaleur: 0, curseur: 2, bloque: false, lien: 60, ...o }, o && o.dec);
  tour(jour(0), { texteElle: 'On pourrait réviser ensemble demain.', chaleur: 0 });
  assert.strictEqual(i.scenarios.length, 0, '« réviser » n\'est pas un scénario');
  tour(jour(0), { texteElle: 'Si tu étais là ce soir, je te dirais tout bas ce que je pense.', chaleur: 2 });
  assert.strictEqual(i.scenarios.length, 1);
  assert.strictEqual(IN.scenarioDu(i, jour(0)), null, 'rien le jour même');
  for (let n = 1; n <= 3; n++) {
    const s = IN.scenarioDu(i, jour(n));
    assert(s, 'reprise ' + n);
    const r = IN.preparer(i, { ...base, cle: jour(n) }, {});
    assert.strictEqual(r.decisions.scenario, s.id);
    assert(/SCÉNARIO À DEUX/.test(r.texte) && /Si tu étais là ce soir/.test(r.texte));
    IN.apres(i, { cle: jour(n), now: Date.parse(jour(n) + 'T21:00:00Z'), message: '', texteElle: '', chaleur: 0, curseur: 2, bloque: false, lien: 60 }, r.decisions);
  }
  assert.strictEqual(IN.scenarioDu(i, jour(4)), null, 'après 3 reprises, il est refermé');
  assert.strictEqual(i.scenarios.length, 0);
});
t('scénario : une fois montré aujourd\'hui, pas plus de 2 fois ; jamais freiné ; oublié après 7 jours', () => {
  const i = IN.nouvelEtat();
  i.scenarios = [{ id: 's1', cle: jour(0), texte: 'Si tu étais là ce soir…', type: 'ce_soir', n: 0, reprise: null, montre: null, fini: false }];
  const r1 = IN.preparer(i, { ...base, cle: jour(1) }, {});
  IN.apres(i, { cle: jour(1), now: base.now, message: '', texteElle: '', chaleur: 0, curseur: 2, bloque: false, lien: 60 }, r1.decisions);
  assert.strictEqual(IN.scenarioDu(i, jour(1)), null, 'une reprise par jour');
  assert(!/SCÉNARIO À DEUX/.test(IN.preparer(i, { ...base, cle: jour(2), bloque: true }, {}).texte));
  i.scenarios[0].reprise = null;
  assert.strictEqual(IN.scenarioDu(i, jour(9)), null);
});
t('scénario spontané : le soir seulement, au plus un message d\'intimité par jour', () => {
  const i = IN.nouvelEtat();
  i.scenarios = [{ id: 's1', cle: jour(0), texte: 'Un café samedi, juste nous deux.', type: 'rendezvous', n: 0, reprise: null, montre: null, fini: false }];
  const ctx = { cle: jour(1), coucher: 1470, lien: 60, curseur: 2, sansReponse: 0, insistance: 3, dort: false, emoBloque: false, bloque: false };
  let vu = 0, hors = 0;
  for (let k = 0; k < 40; k++) {
    const c = { ...ctx, cle: jour(1 + (k % 6)) };
    const j = IN.nouvelEtat(); j.scenarios = [{ ...i.scenarios[0], cle: jour(0) }];
    for (let m = 600; m < 1470; m += 5) { const d = IN.spontane(j, { ...c, m }); if (d) { vu++; if (m < 1200 || m > 1400) hors++; assert.strictEqual(d.type, 'scenario'); break; } }
  }
  assert(vu > 5, 'il arrive : ' + vu);
  assert.strictEqual(hors, 0, 'jamais hors de la soirée');
  IN.marquerSpontane(i, jour(1));
  for (let m = 1200; m < 1400; m++) assert.strictEqual(IN.spontane(i, { ...ctx, m }), null);
});

// ---------- 4. Langage intime ----------

t('langage : les surnoms deviennent plus audacieux avec le lien et les jours qui ont chauffé', () => {
  const i = IN.nouvelEtat();
  assert.strictEqual(IN.stadeLangage(i, 80), 0, 'sans jour chaud, stade 0 même avec un lien fort');
  const chaud = (n) => { for (let k = 0; k < n; k++) IN.apres(i, { cle: jour(k), now: 1, message: '', texteElle: '', chaleur: 2, curseur: 2, bloque: false, lien: 80 }, {}); };
  chaud(2); assert.strictEqual(IN.stadeLangage(i, 80), 1);
  chaud(5); assert.strictEqual(IN.stadeLangage(i, 80), 2);
  chaud(10); assert.strictEqual(IN.stadeLangage(i, 80), 3);
  assert.strictEqual(IN.stadeLangage(i, 45), 1, 'un lien moins fort retient les surnoms');
});
t('langage : surnoms stables sur une semaine, petits mots à elle toujours les mêmes, nouveau surnom signalé une fois', () => {
  const i = IN.nouvelEtat();
  const a = IN.blocLangage(i, { ...base, cle: jour(0), lien: 60 });
  const b = IN.blocLangage(i, { ...base, cle: jour(1), lien: 60 });
  assert.strictEqual(a.split('Surnoms du moment')[1].split('.')[0], b.split('Surnoms du moment')[1].split('.')[0]);
  const mots1 = IN.petitsMots(IN.nouvelEtat()).join('|');
  assert.strictEqual(mots1, IN.petitsMots(IN.nouvelEtat()).join('|'), 'toujours les mêmes d\'un état à l\'autre');
  const j = IN.nouvelEtat();
  for (let k = 0; k < 6; k++) IN.apres(j, { cle: jour(k), now: 1, message: '', texteElle: '', chaleur: 2, curseur: 2, bloque: false, lien: 70 }, {});
  const s = IN.stadeLangage(j, 70);
  assert(s >= 2);
  j.langage.stade = s - 1;
  assert(/pour la première fois/.test(IN.blocLangage(j, { ...base, cle: jour(7), lien: 70 })));
  IN.apres(j, { cle: jour(7), now: 1, message: '', texteElle: '', chaleur: 0, curseur: 2, bloque: false, lien: 70 }, {});
  assert(!/pour la première fois/.test(IN.blocLangage(j, { ...base, cle: jour(7), lien: 70 })));
});
t('trouble : seulement quand l\'ambiance chauffe et que le jour s\'y prête', () => {
  assert.strictEqual(IN.niveauTrouble({ curseur: 2, chaleur: 0 }), 0);
  assert.strictEqual(IN.niveauTrouble({ curseur: 2, chaleur: 2 }), 1);
  assert.strictEqual(IN.niveauTrouble({ curseur: 3, chaleur: 3 }), 2);
  assert.strictEqual(IN.niveauTrouble({ curseur: 1, chaleur: 3 }), 0);
  assert.strictEqual(IN.niveauTrouble({ curseur: 3, chaleur: 3, bloque: true }), 0);
});
t('trouble : la forme change (phrases coupées, « … », moins de ponctuation), sans casser les liens ni les emojis', () => {
  const src = ['Tu sais, je ne sais pas pourquoi je te dis ça, mais tu me fais de l\'effet.', 'Arrête. Je rougis.', 'https://exemple.com/a, regarde'];
  let change = 0;
  for (let k = 0; k < 30; k++) {
    const m = IN.appliquerTrouble(src, 2, 'g' + k);
    assert.strictEqual(m.length, 3);
    assert.strictEqual(m[2], src[2], 'lien intact');
    if (m[0] !== src[0]) change++;
    assert(!/…{2,}/.test(m.join(' ')), 'pas de « …… »');
  }
  assert(change >= 25, 'toujours visible : ' + change + '/30');
  assert.deepStrictEqual(IN.appliquerTrouble(src, 0, 'x'), src);
  assert.deepStrictEqual(IN.appliquerTrouble(['❤️'], 2, 'x'), ['❤️']);
  assert.deepStrictEqual(IN.appliquerTrouble(IN.appliquerTrouble(src, 1, 'a'), 1, 'a').length, 3);
});

// ---------- 5. Jalousie douce ----------

t('jalousie : une pique quand il parle d\'une autre fille, légère, jamais un interrogatoire', () => {
  const i = IN.nouvelEtat();
  const j = IN.blocJalousie(i, { ...base, message: 'J\'ai croisé une fille de ma fac, elle est marrante' });
  assert(j && j.type === 'pique');
  assert(/pas d'interrogatoire/.test(j.texte) && /pas de reproche/.test(j.texte) && /tu ne lui interdis rien/.test(j.texte));
  assert(/tu dis que tu rigolais/.test(j.texte), 'elle désamorce s\'il est agacé');
  assert(IN.autreFille('ma collègue m\'a invité') && IN.autreFille('mon ex m\'a écrit') && !IN.autreFille('je mange avec mes parents'));
});
t('jalousie : rien si bloquée, rien si elle est déjà vraiment jalouse (l\'humeur gère), 2 fois par jour au plus', () => {
  const i = IN.nouvelEtat();
  const m = { ...base, message: 'une fille de ma classe m\'a demandé mon numéro' };
  assert.strictEqual(IN.blocJalousie(i, { ...m, bloque: true }), null);
  assert.strictEqual(IN.blocJalousie(i, { ...m, jalousieEmo: 0.6 }), null);
  assert.strictEqual(IN.blocJalousie(i, { ...m, curseur: 0 }), null);
  i.jalousie = { cle: jour(0), n: 2 };
  assert.strictEqual(IN.blocJalousie(i, m), null);
  i.jalousie = { cle: jour(-1), n: 2 };
  assert(IN.blocJalousie(i, m), 'le lendemain, c\'est permis');
});
t('taquinerie : une provocation légère, parfois, seulement si ça flirte déjà', () => {
  const i = IN.nouvelEtat();
  let vu = 0;
  for (let k = 0; k < 100; k++) { const d = IN.blocJalousie(i, { ...base, chaleur: 1, message: 'blague ' + k }); if (d) { vu++; assert.strictEqual(d.type, 'defi'); } }
  assert(vu > 10 && vu < 55, 'provocations : ' + vu + '/100');
  for (let k = 0; k < 40; k++) assert.strictEqual(IN.blocJalousie(i, { ...base, chaleur: 0, message: 'salut ' + k }), null);
});

// ---------- Assemblage et limites ----------

t('le bloc complet rappelle la limite (son « non » à lui) dès qu\'une touche intime est active', () => {
  const i = IN.nouvelEtat();
  const r = IN.preparer(i, { ...base, message: 'une fille de ma classe m\'a écrit', chaleur: 2 }, {});
  assert(r.decisions.jalousie === 'pique');
  assert(/mal à l'aise/.test(r.texte) && /arrêtes net/.test(r.texte));
  assert(!CRU.test(r.texte), 'rien de cru dans le prompt');
});
t('bloquée (humeur, moment) : ni présence, ni scénario, ni jalousie, ni trouble, ni surnoms audacieux', () => {
  const i = IN.nouvelEtat();
  i.scenarios = [{ id: 's1', cle: jour(-1), texte: 'Si tu étais là…', type: 'ce_soir', n: 0, reprise: null, montre: null, fini: false }];
  const r = IN.preparer(i, { ...base, bloque: true, chaleur: 3, message: 'une fille m\'a écrit' }, {});
  assert.strictEqual(r.texte, '');
  assert.deepStrictEqual(r.decisions, { presence: false, scenario: null, invention: false, jalousie: null, trouble: 0, nuit: null });
});
t('tout coupé par les réglages : aucun bloc ; coquin = 0 : aucun bloc', () => {
  const i = IN.nouvelEtat();
  const off = { presenceActive: false, nuitsActives: false, scenariosActifs: false, langageIntime: false, jalousieDouce: false };
  assert.strictEqual(IN.preparer(i, { ...base, chaleur: 3, message: 'une fille de ma fac' }, off).texte, '');
  assert.strictEqual(IN.preparer(i, { ...base, niveau: 0, chaleur: 3, message: 'une fille de ma fac' }, {}).texte, '');
});
t('un ancien état.json (sans e.intimite, champs manquants) est remis en forme sans erreur', () => {
  const i = IN.normaliser({ nuit: { histoReveil: 'x' }, scenarios: null, langage: { chauds: 'y' } });
  assert(Array.isArray(i.scenarios) && Array.isArray(i.langage.chauds) && Array.isArray(i.nuit.histoReveil));
  assert.doesNotThrow(() => IN.preparer(i, base, {}));
  assert.doesNotThrow(() => IN.apres(i, { cle: jour(0), now: 1, message: 'salut', texteElle: 'coucou', chaleur: 0, curseur: 1, bloque: false, lien: 50 }, {}));
});
t('un scénario lancé n\'est pas écrit deux fois le même jour', () => {
  const i = IN.nouvelEtat();
  const o = { cle: jour(0), now: 1, message: '', texteElle: 'Si tu étais là ce soir, je te dirais tout bas ce que je pense.', chaleur: 2, curseur: 2, bloque: false, lien: 60 };
  IN.apres(i, o, {});
  IN.apres(i, { ...o, texteElle: 'Imagine qu\'on se retrouve sous la même couverture ce soir.' }, {});
  assert.strictEqual(i.scenarios.length, 1);
  IN.apres(i, { ...o, cle: jour(1), texteElle: 'Si tu étais là ce soir, je te dirais tout bas ce que je pense.' }, {});
  assert.strictEqual(i.scenarios.length, 1, 'même scénario : pas de doublon');
});

// ---------- Dans le bot ----------

const fs = require('fs');
const os = require('os');
const path = require('path');
const { Bot } = require('./bot');
const NUM = '213550123456';
const mkBot = (cfg = {}, ctx = {}) => {
  const d = path.join(os.tmpdir(), 'bt-intimite-' + process.pid + '-' + Math.random().toString(36).slice(2));
  const b = new Bot({ ...require('./reglages').DEFAUT, cleApi: 'x', numerosAutorises: NUM, ...cfg }, d, () => {});
  b.log = () => {};
  b.seductionFreinee = () => ({ st: null, vie: { code: 'soiree', dort: false }, emo: false, bloque: false });
  b.curseurCoquin = () => 3;
  const brut = b.contexteIntimite.bind(b);
  b.contexteIntimite = (n, ex) => ({ ...brut(n, ex), cle: jour(2), m: 1650, coucher: 1470, lien: 70, curseur: 3, emoBloque: false, bloque: false, moment: 'soiree', ...ctx });
  return b;
};

t('bot : la jalousie douce arrive dans le prompt complet quand il parle d\'une autre fille', () => {
  const b = mkBot();
  const bloc = b.blocIntimite(NUM, { message: 'une fille de ma fac m\'a demandé mon numéro' });
  assert(/JALOUSIE DOUCE/.test(bloc) && /INTIMITÉ/.test(bloc), bloc);
  assert(/JALOUSIE DOUCE/.test(b.construirePrompt(NUM, { message: 'une fille de ma fac m\'a demandé mon numéro', question: false })));
});
t('bot : rien sans message (spontané ordinaire), rien si coupé ou coquin = 0', () => {
  assert.strictEqual(mkBot().blocIntimite(NUM, {}), '');
  assert.strictEqual(mkBot({ intimiteActive: false }).blocIntimite(NUM, { message: 'une fille de ma fac' }), '');
  assert.strictEqual(mkBot({ coquin: 0 }).blocIntimite(NUM, { message: 'une fille de ma fac' }), '');
});
t('bot : un message de nuit la réveille parfois (réponse vite, mode nuit), jamais sans la nuit, jamais si coupé', () => {
  const b = mkBot();
  const dort = { dort: true, code: 'dort', reveilDans: 300 };
  assert.strictEqual(b.latenceNuit(NUM, { dort: false, code: 'soiree' }, 'tu me manques'), null);
  assert.strictEqual(mkBot({ nuitsActives: false }).latenceNuit(NUM, dort, 'tu me manques'), null);
  let lat = null, k = 0;
  while (!lat && k < 400) { b.intimiteNum(NUM).nuit.tirages = 0; lat = b.latenceNuit(NUM, dort, 'tu me manques ' + (k++)); }
  assert(lat && lat.secondes >= 15 && lat.secondes <= 240, JSON.stringify(lat));
  const bloc = b.blocIntimite(NUM, { message: 'tu me manques' });
  assert(/NUIT \(réveil\)/.test(bloc), bloc);
  assert(/ignore ce que dit/.test(bloc));
  const suite = b.latenceNuit(NUM, dort, 'tu dors ?');
  assert(suite && suite.secondes <= 90, 'elle reste éveillée et répond vite');
});
t('bot : après sa réponse, un scénario lancé est noté, sauvegardé, et revient le lendemain dans le prompt', () => {
  const b = mkBot({}, { chaleur: 2 });
  b.intimiteApresReponse(NUM, ['Si tu étais là ce soir, je me blottirais contre toi sans rien dire.'], 'tu me manques');
  const i = b.intimiteNum(NUM);
  assert.strictEqual(i.scenarios.length, 1);
  const sur = JSON.parse(fs.readFileSync(b.fichierEtat, 'utf8'));
  assert.strictEqual(sur.numeros[NUM].intimite.scenarios.length, 1, 'sauvegardé dans etat.json');
  const demain = mkBot({}, { cle: jour(3) });
  demain.etat = b.etat;
  const bloc = demain.blocIntimite(NUM, { message: 'salut' });
  assert(/SCÉNARIO À DEUX/.test(bloc) && /Si tu étais là ce soir/.test(bloc), bloc);
});
t('bot : la forme est garantie sur la réponse (trouble, nuit) et jamais sur un message neutre', () => {
  const b = mkBot({}, { chaleur: 3 });
  b.blocIntimite(NUM, { message: 'viens là' });
  const dec = b.decisionsIntimite[NUM];
  assert.strictEqual(dec.trouble, 2);
  const m = IN.appliquerForme(['Tu sais, je ne sais pas quoi te dire, vraiment.'], dec, 'viens là');
  assert.notStrictEqual(m[0], 'Tu sais, je ne sais pas quoi te dire, vraiment.');
  const neutre = mkBot({}, { chaleur: 0 });
  neutre.blocIntimite(NUM, { message: 'je révise' });
  assert.deepStrictEqual(IN.appliquerForme(['Ça va, je révise aussi.'], neutre.decisionsIntimite[NUM], 'x'), ['Ça va, je révise aussi.']);
});
t('bot : un message spontané d\'insomnie est envoyé une fois, noté, et la nuit passe en mode « insomnie »', async () => {
  const b = mkBot();
  const envoyes = [];
  b.envoyerGarde = async (numero, item) => { envoyes.push(item); return true; };
  b.indisponible = () => false;
  const vrai = IN.spontane;
  IN.spontane = (i, ctx) => (i.spontane === ctx.cle ? null : { type: 'insomnie', consigneTexte: IN.CONSIGNE_INSOMNIE });
  try {
    assert.strictEqual(await b.tickIntimite(NUM, true), true);
    assert.strictEqual(envoyes.length, 1);
    assert.strictEqual(envoyes[0].type, 'insomnie');
    assert(/n'arrives pas à dormir/.test(envoyes[0].consigneTexte));
    assert.strictEqual(await b.tickIntimite(NUM, true), false, 'une seule fois');
  } finally { IN.spontane = vrai; }
});

Promise.all(attente).then(() => console.log('\n' + ok + ' vérifications réussies.' + (process.exitCode ? ' (il y a des échecs)' : '')));
