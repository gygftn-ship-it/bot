// Vérifications de la v8.2 : tension sur plusieurs jours, rythme. `node test-tension.js`
// Aucune connexion WhatsApp, aucun appel IA.
process.env.TZ = process.env.TZ || 'Africa/Algiers';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const T = require('./tension');
const P = require('./personnalite');
let ok = 0;
const t = (nom, fn) => { try { fn(); ok++; console.log('  ok  ' + nom); } catch (e) { console.log('ÉCHEC ' + nom + ' : ' + e.message); process.exitCode = 1; } };
const jour = (n) => new Date(Date.UTC(2026, 10, 1 + n)).toISOString().slice(0, 10);
const chaud = { chaleur: 3, reporte: true, curseur: 3, lien: 60, bloque: false };

// ---------- Fil de tension ----------

t('un fil s\'ouvre quand ça a chauffé et qu\'elle a laissé en suspens, pas systématiquement', () => {
  let ouverts = 0;
  for (let i = 0; i < 200; i++) {
    const st = T.nouvelEtat();
    if (T.noter(st, { ...chaud, cle: jour(0), graine: 'g' + i })) ouverts++;
  }
  assert(ouverts > 100 && ouverts < 180, 'ouvertures : ' + ouverts + '/200');
});
t('pas de fil : ambiance tiède, rien en suspens, jour sage, humeur freinée ou lien frais', () => {
  const essaye = (o) => { for (let i = 0; i < 50; i++) if (T.noter(T.nouvelEtat(), { cle: jour(0), graine: 'x' + i, ...chaud, ...o })) return true; return false; };
  assert.strictEqual(essaye({ chaleur: 1 }), false);
  assert.strictEqual(essaye({ chaleur: 2, reporte: false }), false);
  assert.strictEqual(essaye({ curseur: 1 }), false);
  assert.strictEqual(essaye({ bloque: true }), false);
  assert.strictEqual(essaye({ lien: 10 }), false);
});
t('le fil suit : rien le jour même, allusion, attente, relâche, puis il se ferme', () => {
  const st = T.nouvelEtat();
  let n = 0; while (!T.noter(st, { ...chaud, cle: jour(0), graine: 'a' + (n++)})) {}
  assert.strictEqual(T.nomEtape(st, jour(0), {}), null);
  assert.strictEqual(T.nomEtape(st, jour(1), {}), 'allusion');
  assert.strictEqual(T.nomEtape(st, jour(2), {}), 'attente');
  assert.strictEqual(T.nomEtape(st, jour(3), {}), 'relache');
  assert.strictEqual(T.maintenir(st, jour(3), {}), null);
  assert.strictEqual(T.maintenir(st, jour(4), {}), 'fin');
  assert.strictEqual(st.fil, null);
});
t('tensionJoursMax = 2 : allusion puis relâche ; 1 : relâche dès le lendemain', () => {
  const mk = () => { const st = T.nouvelEtat(); let n = 0; while (!T.noter(st, { ...chaud, cle: jour(0), graine: 'b' + (n++) })) {} return st; };
  const a = mk();
  assert.strictEqual(T.nomEtape(a, jour(1), { tensionJoursMax: 2 }), 'allusion');
  assert.strictEqual(T.nomEtape(a, jour(2), { tensionJoursMax: 2 }), 'relache');
  assert.strictEqual(T.nomEtape(mk(), jour(1), { tensionJoursMax: 1 }), 'relache');
});
t('quatre jours de pause entre deux fils, jamais deux fils en même temps', () => {
  const st = T.nouvelEtat();
  let n = 0; while (!T.noter(st, { ...chaud, cle: jour(0), graine: 'c' + (n++) })) {}
  assert.strictEqual(T.noter(st, { ...chaud, cle: jour(1), graine: 'zz' }), false, 'un fil est déjà actif');
  T.fermer(st, jour(3));
  for (let i = 0; i < 30; i++) assert.strictEqual(T.noter(st, { ...chaud, cle: jour(5), graine: 'p' + i }), false, 'trop tôt');
  let reouvert = false; for (let i = 0; i < 30; i++) if (T.noter(st, { ...chaud, cle: jour(7), graine: 'q' + i })) { reouvert = true; break; }
  assert(reouvert, 'après la pause, un nouveau fil est possible');
});
t('le bloc du fil n\'est donné que 3 fois par jour, jamais freiné ni le jour même', () => {
  const st = T.nouvelEtat(); let n = 0; while (!T.noter(st, { ...chaud, cle: jour(0), graine: 'd' + (n++) })) {}
  assert.strictEqual(T.blocFil(st, { cle: jour(0), bloque: false }, {}), '');
  assert(/FIL DE TENSION \(hier/.test(T.blocFil(st, { cle: jour(1), bloque: false }, {})));
  assert.strictEqual(T.blocFil(st, { cle: jour(1), bloque: true }, {}), '');
  for (let i = 0; i < 3; i++) T.apresReponse(st, { cle: jour(1), bloque: false }, {});
  assert.strictEqual(T.blocFil(st, { cle: jour(1), bloque: false }, {}), '');
  assert(T.blocFil(st, { cle: jour(2), bloque: false }, {}).includes('quelques jours'), 'le lendemain, il revient');
});
t('au dernier jour, le fil se referme après la réponse où il a été donné', () => {
  const st = T.nouvelEtat(); let n = 0; while (!T.noter(st, { ...chaud, cle: jour(0), graine: 'e' + (n++) })) {}
  assert(T.blocFil(st, { cle: jour(3), bloque: false }, {}).includes('refermer'));
  T.apresReponse(st, { cle: jour(3), bloque: false }, {});
  assert.strictEqual(T.apresReponse(st, { cle: jour(3), bloque: false }, {}), 'fin');
  assert.strictEqual(st.fil, null);
});
t('message spontané du fil : un seul par jour, entre 15 h et 22 h, jamais le jour même', () => {
  const st = T.nouvelEtat(); let n = 0; while (!T.noter(st, { ...chaud, cle: jour(0), graine: 'f' + (n++) })) {}
  const ctx = (cle, m) => ({ cle, m, reveil: 450, coucher: 1450 });
  assert.strictEqual(T.messageSpontane(st, ctx(jour(0), 1000), {}), null);
  assert.strictEqual(T.messageSpontane(st, ctx(jour(1), 600), {}), null, 'trop tôt');
  let vu = null; for (let m = 900; m <= 1300 && !vu; m += 5) vu = T.messageSpontane(st, ctx(jour(1), m), {});
  assert.strictEqual(vu, 'allusion');
  T.marquerSpontane(st, jour(1));
  for (let m = 900; m <= 1300; m += 5) assert.strictEqual(T.messageSpontane(st, ctx(jour(1), m), {}), null);
  assert(T.consigneSpontanee('attente').length > 20);
});
t('un fil abandonné (bouderie, il va mal) laisse une pause', () => {
  const st = T.nouvelEtat(); let n = 0; while (!T.noter(st, { ...chaud, cle: jour(0), graine: 'h' + (n++) })) {}
  assert.strictEqual(T.abandonner(st, jour(1)), true);
  assert.strictEqual(st.fil, null);
  assert.strictEqual(st.finCle, jour(1));
});
t('« plus tard », « tu verras », « fais-moi languir » sont des mises en suspens', () => {
  assert(T.reporteDansMessage('Pas ce soir… tu verras 😏'));
  assert(T.reporteDansMessage('Tu vas devoir attendre'));
  assert(T.reporteDansMessage('je te laisse imaginer la suite'));
  assert(!T.reporteDansMessage('on mange quoi ce soir ?'));
});

// ---------- Limites ----------

t('son non à lui est respecté dès que ça joue', () => {
  assert(/stop/.test(T.blocLimites(1)) && /arrêtes net/.test(T.blocLimites(2)));
  assert.strictEqual(T.blocLimites(0), '');
});

// ---------- Le rythme ----------

t('rythme : jamais deux fois le même d\'affilée, « bref » au plus une fois sur trois', () => {
  const s = T.nouvelEtat(); T.normaliser(s, jour(0));
  let prec = null; const vus = new Set();
  for (let i = 0; i < 120; i++) {
    const r = T.choisirRythme(s, { cle: jour(0), message: 'message ' + i, chaleur: 3, curseur: 3, bloque: false }, {});
    assert(r, 'un rythme attendu');
    assert.notStrictEqual(r.nom, prec, 'répétition à ' + i);
    const hist = s.rythme.hist.slice(-3);
    if (r.nom === 'bref') assert(!hist.includes('bref'), 'deux brefs trop proches');
    T.noterRythme(s, r.nom, jour(0)); prec = r.nom; vus.add(r.nom);
  }
  assert(vus.size === 4, 'variété : ' + [...vus]);
});
t('rythme : rien quand c\'est tiède, un jour sage, freiné ou coupé', () => {
  const s = T.nouvelEtat(); T.normaliser(s, jour(0));
  const o = { cle: jour(0), message: 'salut', chaleur: 3, curseur: 3, bloque: false };
  assert.strictEqual(T.choisirRythme(s, { ...o, chaleur: 0 }, {}), null);
  assert.strictEqual(T.choisirRythme(s, { ...o, curseur: 1 }, {}), null);
  assert.strictEqual(T.choisirRythme(s, { ...o, bloque: true }, {}), null);
  assert.strictEqual(T.choisirRythme(s, o, { rythmeSensuel: false }), null);
  assert(T.choisirRythme(s, { ...o, chaleur: 0, filActif: true }, {}), 'un fil actif suffit');
});
t('le petit silence reste raisonnable (20 à 55 s) et la forme est garantie', () => {
  const s = T.nouvelEtat(); T.normaliser(s, jour(0));
  for (let i = 0; i < 200; i++) {
    const r = T.choisirRythme(s, { cle: jour(0), message: 'x' + i, chaleur: 3, curseur: 3, bloque: false }, {});
    if (r.nom === 'languir') assert(r.pauseMs >= 20000 && r.pauseMs <= 55000, 'pause ' + r.pauseMs); else assert.strictEqual(r.pauseMs, 0);
    T.noterRythme(s, r.nom, jour(0));
  }
  assert.deepStrictEqual(T.appliquerRythme(['Tu me fais perdre la tête', 'vraiment'], 'bref'), ['Tu me fais perdre la tête']);
  assert(T.appliquerRythme(['a'.repeat(200) + '.'], 'bref')[0].length <= 71);
  assert.strictEqual(T.appliquerRythme(['un', 'deux', 'trois'], 'lent').length, 2);
  assert.deepStrictEqual(T.appliquerRythme(['un', 'deux'], 'normal'), ['un', 'deux']);
  assert.deepStrictEqual(T.appliquerRythme([], 'bref'), []);
});

// ---------- Dans le bot ----------

const { Bot } = require('./bot');
const NUM = '213550123456';
const mkBot = (cfg = {}) => {
  const d = path.join(os.tmpdir(), 'bt-tension-' + process.pid + '-' + Math.random().toString(36).slice(2));
  const b = new Bot({ ...require('./reglages').DEFAUT, cleApi: 'x', numerosAutorises: NUM, ...cfg }, d, () => {});
  b.log = () => {};
  b.seductionFreinee = () => ({ st: null, vie: {}, emo: false, bloque: false });
  b.curseurCoquin = () => 3;
  return b;
};
const hist = (b, msgs) => { b.historiques[NUM] = msgs.map((m) => ({ role: 'user', content: m, t: Date.now() })); };

t('prompt : les limites sont là dès que ça joue, absentes quand c\'est neutre', () => {
  const b = mkBot();
  assert(b.blocTension(NUM, { message: 'tu me manques, j\'ai envie de toi' }).includes('LIMITES'));
  assert.strictEqual(b.blocTension(NUM, { message: 'le prof a rendu les copies à la fac' }), '');
  assert.strictEqual(b.blocTension(NUM, {}), '', 'message spontané : rien');
  assert.strictEqual(mkBot({ tensionActive: false }).blocTension(NUM, { message: 'j\'ai envie de toi' }), '');
  assert.strictEqual(mkBot({ coquin: 0 }).blocTension(NUM, { message: 'j\'ai envie de toi' }), '');
});
t('prompt : un fil ouvert hier revient en allusion ; le prompt complet le contient', () => {
  const b = mkBot();
  const cle = b.cleDuJour();
  const e = b.etatNum(NUM);
  e.tension = T.nouvelEtat();
  e.tension.fil = { cle: P.jourPlus(cle, -1), at: Date.now() - 86400000, montre: { cle: null, n: 0 }, spontane: null };
  const bloc = b.blocTension(NUM, { message: 'salut' });
  assert(bloc.includes('FIL DE TENSION (hier'), bloc);
  assert(b.construirePrompt(NUM, { message: 'salut', question: false }).includes('FIL DE TENSION (hier'));
});
t('prompt : le rythme vient d\'un tirage stable et est noté après la réponse', () => {
  const b = mkBot();
  hist(b, ['tu me manques', 'je pense à toi', 'j\'ai envie de toi']);
  const msg = 'je te veux, là, maintenant';
  const p1 = b.blocTension(NUM, { message: msg });
  const p2 = b.blocTension(NUM, { message: msg });
  assert.strictEqual(p1, p2, 'même message = même tirage');
  assert(!/NON » JOUEUR/.test(p1), 'le non joueur n\'existe plus');
  b.tensionApresReponse(NUM, ['pas si vite… tu vas attendre'], msg);
  const t0 = b.etatNum(NUM).tension;
  assert.strictEqual(t0.refus, undefined);
  assert.strictEqual(b.decisionsTension[NUM], undefined, 'décision consommée');
});
t('après une réponse : un moment chaud laissé en suspens ouvre (parfois) un fil, une seule fois', () => {
  let ouverts = 0;
  for (let i = 0; i < 40; i++) {
    const b = mkBot();
    hist(b, ['tu me manques', 'je pense à toi', 'j\'ai envie de toi ' + i, 'ta peau, ton souffle']);
    b.tensionApresReponse(NUM, ['plus tard… tu verras 😏'], 'ta peau, ton souffle ' + i);
    const fil = b.etatNum(NUM).tension.fil;
    if (fil) { ouverts++; const f0 = fil; b.tensionApresReponse(NUM, ['plus tard'], 'encore'); assert.strictEqual(b.etatNum(NUM).tension.fil, f0, 'pas de second fil'); }
  }
  assert(ouverts > 10 && ouverts < 40, 'fils ouverts : ' + ouverts);
});
t('un fil est abandonné en silence si elle est blessée ou boude', () => {
  const b = mkBot();
  const e = b.etatNum(NUM);
  e.tension = T.nouvelEtat();
  e.tension.fil = { cle: P.jourPlus(b.cleDuJour(), -1), at: Date.now(), montre: { cle: null, n: 0 }, spontane: null };
  b.seductionFreinee = () => ({ st: null, vie: {}, emo: true, bloque: true });
  b.tensionApresReponse(NUM, ['ok'], 'salut');
  assert.strictEqual(e.tension.fil, null);
});
t('réglages : les nouvelles options existent avec des valeurs prudentes', () => {
  const { DEFAUT } = require('./reglages');
  assert.strictEqual(DEFAUT.tensionJoursMax, 3);
  assert.strictEqual(DEFAUT.refusJoueur, undefined); assert.strictEqual(DEFAUT.photosActives, undefined);
  assert(!/Infinity|NaN/.test(JSON.stringify(require('./reglages').chargerConfig('/inexistant.json'))));
});

console.log(process.exitCode ? '\nDes vérifications ont échoué.' : `\nTout est bon (${ok} vérifications).`);
