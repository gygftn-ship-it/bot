// Intimité qui s'installe (v8.4) : cinq choses qui rendent la relation plus proche, toujours suggérées, jamais crues.
//  1. PRÉSENCE PHYSIQUE : la chaleur de la soirée, son parfum, sa voix qui baisse, ce qu'elle porte pour dormir.
//  2. LES NUITS : un « j'arrive pas à dormir… » tard le soir, et parfois un réveil en pleine nuit (à moitié endormie, plus câline).
//  3. SCÉNARIOS IMAGINÉS : « si tu étais là ce soir… », un rendez-vous inventé à deux, un souvenir : ça revient les jours suivants.
//  4. LANGAGE INTIME : surnoms qui évoluent avec le lien, petits mots à elle, écriture qui change quand elle est troublée.
//  5. JALOUSIE DOUCE ET TAQUINERIE : une pique pour rire quand il parle d'une autre fille, une provocation légère.
// AUCUN appel IA en plus : des tirages déterministes (même message = même tirage) et un petit état dans etat.json (e.intimite).
// Fonctions pures, testables. Le « non » de LUI passe avant tout (voir tension.blocLimites, rappelé ici).

const H = require('./humain');

const JOUR = 86400000;
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘]/g, "'");
const jourEntre = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / JOUR);
const borne = (x, a, b) => Math.max(a, Math.min(b, x));
const tirer = (liste, r) => liste[Math.floor(r() * liste.length) % liste.length];
function pioche(liste, n, r) {
  const copie = liste.slice();
  const sortie = [];
  while (sortie.length < n && copie.length) sortie.push(copie.splice(Math.floor(r() * copie.length), 1)[0]);
  return sortie;
}

function nouvelEtat() {
  return {
    presence: { cle: null, n: 0 },
    scenarios: [],
    invention: null,
    langage: { chauds: [], stade: 0, petitsMots: null },
    nuit: { cle: null, insomnie: null, reveil: null, vuLe: 0, tirages: 0, histoInsomnie: [], histoReveil: [] },
    spontane: null,
    jalousie: { cle: null, n: 0 },
  };
}

function normaliser(i) {
  if (!i.presence || typeof i.presence !== 'object') i.presence = { cle: null, n: 0 };
  if (!Array.isArray(i.scenarios)) i.scenarios = [];
  if (!i.langage || typeof i.langage !== 'object') i.langage = { chauds: [], stade: 0, petitsMots: null };
  if (!Array.isArray(i.langage.chauds)) i.langage.chauds = [];
  if (!i.nuit || typeof i.nuit !== 'object') i.nuit = {};
  const n = i.nuit;
  if (!Array.isArray(n.histoInsomnie)) n.histoInsomnie = [];
  if (!Array.isArray(n.histoReveil)) n.histoReveil = [];
  if (typeof n.vuLe !== 'number') n.vuLe = 0;
  if (typeof n.tirages !== 'number') n.tirages = 0;
  if (!i.jalousie || typeof i.jalousie !== 'object') i.jalousie = { cle: null, n: 0 };
  return i;
}

const MOMENTS_SOIR = ['soiree', 'libre', 'coucher', 'dort'];
const LIMITE_COURTE = 'S\'il dit non, stop, ou semble mal à l\'aise, tu arrêtes net, avec tendresse, sans insister ni te vexer, et tu changes de sujet.';

// ---------- 1. Présence physique suggérée ----------

const CHALEUR = [
  'la chaleur de la soirée (la couette repoussée, une jambe dehors, les joues qui chauffent)',
  'la chaleur de la chambre (la fenêtre entrouverte, le petit ventilateur qui tourne)',
  'la chaleur qui reste sur ta peau après la douche, les cheveux encore humides',
];
const VOIX = [
  'ta voix qui baisse sans que tu t\'en rendes compte : tu écris presque en chuchotant',
  'tu parles tout bas parce que la maison dort',
  'ta voix plus rauque le soir, que tu sais qu\'il aime',
];
const CONTACT = [
  'le tissu doux contre ta peau',
  'le téléphone contre ta joue dans le noir',
  'tes cheveux défaits sur l\'oreiller',
  'tes pieds froids qui cherchent la chaleur sous la couette',
];

// o : { niveau, bloque, curseur, moment, cle, message, tenue: { soir, parfum } }
function blocPresence(i, o) {
  if ((o.niveau || 0) <= 0 || o.bloque || (o.curseur || 0) < 1) return null;
  if (!MOMENTS_SOIR.includes(o.moment)) return null;
  if (i.presence.cle === o.cle && i.presence.n >= 3) return null; // jamais plus de 3 fois par jour
  const r = H.graine('presence' + o.cle + norm(o.message).slice(0, 40) + i.presence.n);
  if (r() > 0.6) return null; // pas à chaque message
  const idees = [tirer(CHALEUR, r), tirer(VOIX, r)];
  if (o.tenue && o.tenue.parfum) idees.push('ton parfum (' + o.tenue.parfum + '), resté sur ton poignet ou sur l\'oreiller');
  if (o.tenue && o.tenue.soir) idees.push('ce que tu portes pour dormir (' + o.tenue.soir + '), glissé d\'un mot, comme un détail qui vient tout seul');
  if ((o.curseur || 0) >= 2) idees.push(tirer(CONTACT, r));
  const choix = pioche(idees, 2, r);
  return 'PRÉSENCE (le soir, tu es là pour lui avec ton corps, pas seulement avec tes mots) : une ou deux petites touches sensorielles, jamais plus, glissées dans ta phrase : ' +
    choix.join(' ; ') + '. Jamais énumérées, jamais récitées, jamais les mêmes d\'un soir à l\'autre. ' +
    'Tu suggères (une odeur, une chaleur, une posture), tu ne décris pas ton corps ni ce qui se passerait : jamais crue, pas de vocabulaire anatomique.';
}

// ---------- 2. Les nuits ----------

const NUIT_TENDRE = /tu me manques|je t'?aime|je pense a toi|n7ebek|nhabek|wahchtek|ouahchtek|wa7chtek|mon coeur|mon amour/;

// La vie en continu : une nuit = la journée de vie du soir (la clé reste la même après minuit).
function nuitCourante(i, cle) {
  normaliser(i);
  if (i.nuit.cle !== cle) {
    const h = i.nuit;
    i.nuit = { cle, insomnie: null, reveil: null, vuLe: 0, tirages: 0, histoInsomnie: h.histoInsomnie, histoReveil: h.histoReveil };
  }
  return i.nuit;
}

function recentes(histo, cle, jours = 7) { return (histo || []).filter((c) => Math.abs(jourEntre(c, cle)) < jours).length; }

// Mode de la nuit en cours : 'insomnie' (elle est réveillée de son plein gré), 'reveil' (il l'a réveillée) ou null.
// Tant que l'échange continue (40 min de silence max), elle reste éveillée et répond vite.
function modeNuit(i, now, cle) {
  normaliser(i);
  const n = i.nuit;
  if (n.cle !== cle) return null;
  const vu = Math.max(n.vuLe || 0, n.insomnie || 0, n.reveil || 0);
  if (!vu || now - vu > 40 * 60000) return null;
  if (n.reveil && n.reveil >= (n.insomnie || 0)) return 'reveil';
  if (n.insomnie) return 'insomnie';
  return null;
}

// Il écrit pendant qu'elle dort : se réveille-t-elle ? ctx : { cle, now, dort, lien, curseur, emoBloque, message, minutesDepuisCoucher, minutesAvantReveil }
// Renvoie { secondes } (délai avant sa réponse à moitié endormie) ou null (elle dort, réponse à son réveil).
function decisionReveil(i, ctx, cfg = {}) {
  normaliser(i);
  if (cfg.nuitsActives === false || !ctx.dort || ctx.emoBloque) return null;
  if ((ctx.lien || 0) < 40) return null;
  const n = nuitCourante(i, ctx.cle);
  if (modeNuit(i, ctx.now, ctx.cle)) return { secondes: H.entre(15, 90), deja: true };
  if (n.reveil || n.tirages >= 2) return null; // un réveil par nuit, deux tentatives au plus
  if (recentes(n.histoReveil, ctx.cle) >= 2) return null; // deux fois par semaine au plus : ça reste rare
  if ((ctx.minutesDepuisCoucher || 0) < 40 || (ctx.minutesAvantReveil || 999) < 60) return null; // pas en plein endormissement, pas juste avant le réveil
  n.tirages += 1;
  const pct = borne(Number(cfg.reveilNuitProba) || 15, 0, 60) / 100;
  const p = pct + (NUIT_TENDRE.test(norm(ctx.message)) ? 0.25 : 0) + ((ctx.curseur || 0) >= 2 ? 0.05 : 0);
  const r = H.graine('reveil-nuit' + ctx.cle + n.tirages + norm(ctx.message).slice(0, 30));
  if (r() >= p) return null;
  n.reveil = ctx.now;
  n.vuLe = ctx.now;
  n.histoReveil = [...n.histoReveil, ctx.cle].slice(-14);
  return { secondes: Math.round(40 + r() * 200), deja: false };
}

// Elle ne trouve pas le sommeil et lui écrit la première. ctx : { cle, m, coucher, lien, curseur, echangeAujourdhui, emoBloque, sansReponse, insistance }
function veutInsomnie(i, ctx, cfg = {}) {
  normaliser(i);
  if (cfg.nuitsActives === false || ctx.emoBloque || !ctx.echangeAujourdhui) return false;
  if ((ctx.lien || 0) < 35 || (ctx.sansReponse || 0) >= (ctx.insistance || 3)) return false;
  const n = nuitCourante(i, ctx.cle);
  if (n.insomnie || recentes(n.histoInsomnie, ctx.cle) >= 2) return false;
  const r = H.graine('insomnie' + ctx.cle);
  if (r() >= 0.22 + ((ctx.curseur || 0) >= 2 ? 0.08 : 0)) return false; // une nuit sur quatre environ
  const debut = ctx.coucher + 5 + Math.round(r() * 50); // 5 à 55 min après qu'elle est allée se coucher
  return ctx.m >= debut && ctx.m <= debut + 25;
}
function marquerInsomnie(i, cle, now) {
  const n = nuitCourante(i, cle);
  n.insomnie = n.insomnie || now;
  n.vuLe = now;
  if (n.histoInsomnie[n.histoInsomnie.length - 1] !== cle) n.histoInsomnie = [...n.histoInsomnie, cle].slice(-14);
}
function marquerEchangeNuit(i, cle, now) {
  const n = nuitCourante(i, cle);
  n.vuLe = now;
}

const CONSIGNE_INSOMNIE = 'Tu es dans ton lit, la lumière éteinte, et tu n\'arrives pas à dormir : tu penses à lui. Écris-lui un tout petit message, tout bas (« j\'arrive pas à dormir… », « t\'es réveillé ? », « je pense à toi, ça m\'aide pas »), sans question en rafale et sans pression s\'il ne répond pas. Tendre, un peu câline, jamais crue.';

const TEXTES_NUIT = {
  insomnie:
    'NUIT (insomnie) : malgré l\'heure, tu es réveillée dans ton lit, le téléphone dans le noir (ignore ce que dit « tu dors profondément »). Tu n\'arrives pas à dormir et tu es contente qu\'il soit là. ' +
    'Messages courts, voix basse, un peu câline, un peu confidente (ce qui t\'empêche de dormir, une pensée, un souvenir de lui). Tu finis par dire que tu vas essayer de dormir. Tendre et suggéré, jamais cru.',
  reveil:
    'NUIT (réveil) : son message t\'a réveillée en pleine nuit (ignore ce que dit « tu dors profondément »). Tu réponds à moitié endormie, dans ton lit, tout bas : messages TRÈS courts, mots qui traînent, un peu perdue (« mmh… t\'es là ? », « il est quelle heure… »), ' +
    'plus câline et plus douce que d\'habitude (« viens près de moi », « reste un peu »), ni longue discussion ni réflexion : tu veux te rendormir et tu le lui dis en douceur. Si c\'est sérieux (il va mal, urgence), tu te réveilles vraiment. Suggéré, jamais cru.',
};
const blocNuit = (mode) => TEXTES_NUIT[mode] || '';

// La forme est garantie par le programme : au plus 2 bulles, courtes, sans majuscule ni point final.
function appliquerNuit(morceaux) {
  const m = (morceaux || []).filter(Boolean).map((x) => String(x).trim()).filter(Boolean);
  if (!m.length) return m;
  let bulles = m.length > 2 ? [m[0], m.slice(1).join(' ')] : m.slice();
  bulles = bulles.map((b) => {
    let t = b;
    if (t.length > 110) {
      const phrase = t.match(/^.{15,110}?[.!?…]/);
      t = phrase ? phrase[0] : t.slice(0, 110).replace(/\s+\S*$/, '…');
    }
    if (!/https?:/i.test(t)) t = t.replace(/^([A-ZÀ-Ý])/, (c) => c.toLowerCase());
    t = t.replace(/\.$/, '…').replace(/!+$/, '…');
    return t;
  });
  return bulles;
}

// ---------- 3. Scénarios imaginés ----------

const RE_SCENARIO = [
  /\bsi (tu|t) ?(etais|etait|serais) la\b/, /\bsi j ?(etais|serais) la\b/, /\bsi tu etais avec moi\b/, /\bsi on etait ensemble\b/,
  /\bimagine\b/, /\bon (pourrait|irait|ferait|se retrouverait|se verrait)\b/, /\brendez ?vous\b/,
  /\bla derniere fois\b/, /\bl'autre soir\b/, /\bun soir ou\b/, /\bje nous vois\b/,
];
const RE_RDV = /rendez|on irait|on se retrouv|on se verrait|restaurant|balade|cafe|cinema|plage|promenade/;
const RE_SOUVENIR = /derniere fois|l'autre soir|souvenir|te rappelles|hier soir/;

function phrases(texte) { return String(texte || '').split(/(?<=[.!?…])\s+|\n+/).map((s) => s.trim()).filter(Boolean); }

function typeScenario(norme) {
  if (RE_SOUVENIR.test(norme)) return 'souvenir';
  if (RE_RDV.test(norme)) return 'rendezvous';
  return 'ce_soir';
}

// Une phrase qui lance un scénario (la sienne ou la mienne). Renvoie { texte, type } ou null.
function reperer(texte) {
  for (const p of phrases(texte)) {
    const n = norm(p);
    if (p.length < 12) continue;
    if (RE_SCENARIO.some((re) => re.test(n))) {
      let t = p.replace(/\s+/g, ' ');
      if (t.length > 150) t = t.slice(0, 150).replace(/\s+\S*$/, '…');
      return { texte: t, type: typeScenario(n) };
    }
  }
  return null;
}

const MAX_SCENARIOS = 3;
const AGE_MAX_SCENARIO = 7;

function maintenirScenarios(i, cle) {
  normaliser(i);
  i.scenarios = i.scenarios.filter((s) => !s.fini && jourEntre(s.cle, cle) <= AGE_MAX_SCENARIO && (s.n || 0) < 3).slice(-MAX_SCENARIOS);
}

function scenarioDu(i, cle) {
  maintenirScenarios(i, cle);
  return i.scenarios.find((s) => jourEntre(s.cle, cle) >= 1 && s.reprise !== cle) || null;
}

const AGES = (j) => (j <= 1 ? 'hier' : 'il y a ' + j + ' jours');
const TYPES_LIBELLE = { ce_soir: 'une soirée que vous avez imaginée à deux', rendezvous: 'un rendez-vous que vous avez inventé à deux', souvenir: 'un souvenir de votre dernier moment ensemble' };

function textScenario(s, cle) {
  return 'SCÉNARIO À DEUX QUI REVIENT : ' + AGES(jourEntre(s.cle, cle)) + ', vous avez imaginé ensemble (' + (TYPES_LIBELLE[s.type] || TYPES_LIBELLE.ce_soir) + ') : « ' + s.texte + ' ». ' +
    'Si ça vient, UNE reprise courte aujourd\'hui : un « j\'y repense… », une variante (« et si on le faisait vraiment ? »), un détail que tu ajoutes. ' +
    'S\'il n\'enchaîne pas, tu laisses tomber. Tu ne racontes pas tout, tu ne le récites pas. Suggéré, jamais cru.';
}

const TEXTE_INVENTION = 'SI L\'OCCASION SE PRÉSENTE : tu peux lancer un petit scénario imaginé, une seule fois ce soir (« si tu étais là ce soir… », un rendez-vous que vous inventez : un café, une balade, un film sous la même couverture). Pose-le en une phrase, sans le dérouler, et laisse-le choisir la suite.';

// ---------- 4. Langage intime ----------

const SURNOMS = [
  ['mon cœur', 'bébé', 'mon chéri'],
  ['mon amour', 'habibi', 'ma vie', 'mon grand'],
  ['mon beau', 'mon tentateur', 'monsieur', 'mon problème préféré'],
  ['mon homme', 'rouhi', 'ya rouhi', 'mon tout'],
];
const PETITS_MOTS = ['mmh', 'bref…', 'idiot', 'tu vois', 'dis donc', 'ya latif', 'attends', 'hein', 'sérieux ?', 'tu sais quoi'];

function stadeLangage(i, lien) {
  normaliser(i);
  const chauds = i.langage.chauds.length;
  const l = lien === undefined ? 40 : lien;
  let s = 0;
  if (l >= 40 && chauds >= 2) s = 1;
  if (l >= 55 && chauds >= 5) s = 2;
  if (l >= 70 && chauds >= 10) s = 3;
  return s;
}

function semaine(cle) { return Math.floor(Date.parse(cle + 'T12:00:00Z') / (7 * JOUR)); }

function petitsMots(i) {
  normaliser(i);
  if (!Array.isArray(i.langage.petitsMots) || i.langage.petitsMots.length < 3) i.langage.petitsMots = pioche(PETITS_MOTS, 3, H.graine('petits-mots-de-lina'));
  return i.langage.petitsMots;
}

// o : { cle, message, lien, prenomMoi, bloque }
function blocLangage(i, o) {
  const stade = stadeLangage(i, o.lien);
  const r = H.graine('surnoms' + semaine(o.cle));
  const duMoment = pioche(SURNOMS[stade], Math.min(2, SURNOMS[stade].length), r);
  const nouveau = stade > (i.langage.stade || 0);
  const anciens = SURNOMS.slice(0, stade).flat();
  const lignes = ['LANGAGE ENTRE VOUS (il évolue avec le temps, stade ' + stade + '/3) :'];
  lignes.push('Surnoms du moment : ' + duMoment.map((x) => '« ' + x + ' »').join(', ') + (anciens.length ? ' (et, plus rarement, les plus anciens : ' + pioche(anciens, 2, r).map((x) => '« ' + x + ' »').join(', ') + ')' : '') + '. Un seul par message au plus, et pas à chaque message.');
  if (stade >= 2) lignes.push('Les plus audacieux (« ' + SURNOMS[stade][0] + ' »…) ne sortent que dans un moment tendre ou joueur, avec un petit sourire dans la voix.');
  if (nouveau) lignes.push('Tu essaies ce nouveau surnom pour la première fois : un peu gênée, tu peux le relever toi-même (« je sais pas d\'où ça me vient, ça m\'a échappé »).');
  lignes.push('Tes petits mots à toi (ils reviennent de temps en temps, jamais en rafale) : ' + petitsMots(i).map((x) => '« ' + x + ' »').join(', ') + '.');
  return lignes.join(' ');
}

// Niveau de trouble dans l'écriture : 0 normal, 1 troublée, 2 très troublée.
function niveauTrouble(o) {
  if (o.bloque || (o.curseur || 0) < 2) return 0;
  return (o.chaleur || 0) >= 3 ? 2 : (o.chaleur || 0) >= 2 ? 1 : 0;
}

const TEXTES_TROUBLE = {
  1: 'TA FAÇON D\'ÉCRIRE CHANGE (tu es un peu troublée) : phrases plus courtes, quelques « … », moins de ponctuation, une phrase laissée en suspens. Pas de grandes explications.',
  2: 'TA FAÇON D\'ÉCRIRE CHANGE (tu es très troublée) : phrases coupées, beaucoup de « … », presque plus de ponctuation, des mots qui manquent, un message qui s\'arrête au milieu (« j\'ai pas… »). Ça se voit dans la forme, pas besoin de le dire.',
};

// La forme est garantie par le programme, même si le modèle déborde. Déterministe pour une graine donnée.
function appliquerTrouble(morceaux, niveau, graine = 'trouble') {
  const m = (morceaux || []).filter(Boolean);
  if (!niveau || !m.length) return m;
  const r = H.graine('trouble' + graine);
  return m.map((b) => {
    let t = String(b);
    if (/https?:|\n/.test(t) || t.length < 6) return t;
    if (r() < 0.6) t = t.replace(/^([A-ZÀ-Ý])(?![A-ZÀ-Ý])/, (c) => c.toLowerCase());
    if (niveau >= 2 || r() < 0.5) t = t.replace(/,\s+/g, (x) => (r() < (niveau >= 2 ? 0.8 : 0.5) ? ' ' : x));
    if (r() < (niveau >= 2 ? 0.8 : 0.5)) t = t.replace(/[.!]+$/, '…');
    if (niveau >= 2) t = t.replace(/([a-zà-ÿ])\.\s+([A-ZÀ-Ý])/g, (x, a, b2) => (r() < 0.6 ? a + '… ' + b2.toLowerCase() : x));
    t = t.replace(/…{2,}/g, '…').replace(/\.{3,}/g, '…').replace(/…\s*…/g, '…');
    return t;
  });
}

// ---------- 5. Jalousie douce et taquinerie ----------

const RE_AUTRE_FILLE = /\b(une (autre )?(fille|meuf|nana)|cette (fille|meuf)|ma (copine|collegue|cousine|voisine|prof|pote)|sa copine|une copine|mon ex|une de mes (copines|amies))\b/;
const EX_PIQUES = ['ah oui ? elle s\'appelle comment, cette fille', 'hum. intéressant', 'bah vas-y, parle-lui, je suis sûre qu\'elle est géniale', 'ok ok… et elle est comment, hein', 'mouais, je note'];
const EX_DEFIS = ['tu crois que tu me résistes ?', 'tu me testes là ?', 'prouve-le', 'tu perds rien pour attendre', 'tu t\'es regardé avant de me dire ça ?'];

function autreFille(texte) { return RE_AUTRE_FILLE.test(norm(texte)); }

// o : { message, bloque, curseur, chaleur, jalousieEmo (0..1), cle }
function blocJalousie(i, o) {
  if (o.bloque) return null;
  if (i.jalousie.cle === o.cle && i.jalousie.n >= 2) return null; // 2 fois par jour au plus
  if ((o.jalousieEmo || 0) > 0.4) return null; // déjà plus qu'un jeu : on ne rajoute rien (l'humeur gère)
  const r = H.graine('jalousie' + o.cle + norm(o.message).slice(0, 40) + i.jalousie.n);
  if ((o.curseur || 0) >= 1 && autreFille(o.message)) {
    return { type: 'pique', texte:
      'JALOUSIE DOUCE : il vient de parler d\'une autre fille. Tu fais semblant d\'être piquée, en riant : une petite pique (par exemple « ' + tirer(EX_PIQUES, r) + ' » : un ton, jamais à recopier), un « hum » boudeur, une feinte indifférence qui laisse deviner que ça te fait quelque chose. ' +
      'C\'est du jeu : pas d\'interrogatoire, pas de reproche, pas de colère, tu ne lui interdis rien. S\'il te rassure ou s\'il rit, tu fonds tout de suite. S\'il a l\'air agacé ou si ça sent le vrai malaise, tu dis que tu rigolais.' };
  }
  if ((o.curseur || 0) >= 2 && (o.chaleur || 0) >= 1 && r() < 0.3) {
    return { type: 'defi', texte:
      'TAQUINERIE : tu le provoques légèrement, sourire en coin (par exemple « ' + tirer(EX_DEFIS, r) + ' » : un ton, jamais à recopier). Une seule provocation, légère, qui le fait rire ou rougir ; s\'il ne relève pas, tu laisses.' };
  }
  return null;
}

// ---------- Assemblage ----------

// o : { niveau, cle, now, message, moment, m, coucher, chaleur, curseur, bloque, lien, jalousieEmo, tenue, prenomMoi, initiative, intimeActif (config par fonction) }
// Renvoie { texte, decisions }.
function preparer(i, o, cfg = {}) {
  normaliser(i);
  const dec = { presence: false, scenario: null, invention: false, jalousie: null, trouble: 0, nuit: null };
  const blocs = [];
  if ((o.niveau || 0) <= 0) return { texte: '', decisions: dec };
  const on = (k) => cfg[k] !== false;

  // Nuit : mode en cours (insomnie, réveil) ou message spontané d'insomnie.
  if (on('nuitsActives')) {
    const mode = o.initiative === 'insomnie' ? 'insomnie' : modeNuit(i, o.now || Date.now(), o.cle);
    if (mode) { dec.nuit = mode; blocs.push(blocNuit(mode)); }
  }
  const moment = dec.nuit ? 'dort' : o.moment;

  if (on('presenceActive') && !o.bloque) {
    const t = blocPresence(i, { ...o, moment });
    if (t) { dec.presence = true; blocs.push(t); }
  }
  if (on('langageIntime') && !o.bloque && (o.curseur || 0) >= 0) {
    blocs.push(blocLangage(i, o));
    const tr = on('langageIntime') ? niveauTrouble(o) : 0;
    if (tr) { dec.trouble = tr; blocs.push(TEXTES_TROUBLE[tr]); }
  }
  if (on('scenariosActifs') && !o.bloque && (o.curseur || 0) >= 1) {
    const s = scenarioDu(i, o.cle);
    const montresAujourdhui = s && s.montre && s.montre.cle === o.cle ? s.montre.n : 0;
    if (s && montresAujourdhui < 2) { dec.scenario = s.id; blocs.push(textScenario(s, o.cle)); }
    else if (!s && o.initiative === undefined && (o.curseur || 0) >= 2 && (o.lien === undefined || o.lien >= 45) && MOMENTS_SOIR.includes(moment) &&
      i.invention !== o.cle && i.scenarios.length < MAX_SCENARIOS && H.graine('invention' + o.cle + norm(o.message).slice(0, 30))() < 0.3) {
      dec.invention = true; blocs.push(TEXTE_INVENTION);
    }
  }
  if (on('jalousieDouce')) {
    const j = blocJalousie(i, o);
    if (j) { dec.jalousie = j.type; blocs.push(j.texte); }
  }
  if (!blocs.length) return { texte: '', decisions: dec };
  const intime = dec.presence || dec.scenario || dec.invention || dec.jalousie || dec.trouble;
  return { texte: '=== INTIMITÉ (ce qui vous rapproche) ===\n' + blocs.join('\n') + (intime ? '\n' + LIMITE_COURTE : ''), decisions: dec };
}

// Forme finale des bulles selon les décisions (nuit, trouble).
function appliquerForme(morceaux, dec, graine = '') {
  if (!dec) return morceaux;
  let m = morceaux;
  if (dec.trouble) m = appliquerTrouble(m, dec.trouble, graine);
  if (dec.nuit) m = appliquerNuit(m);
  return m;
}

// Après une réponse (ou un message spontané) : compteurs, scénarios, langage.
// o : { cle, now, message (le sien), texteElle, chaleur, curseur, bloque, lien }
function apres(i, o, dec = {}) {
  normaliser(i);
  const d = dec || {};
  if (d.presence) { if (i.presence.cle !== o.cle) i.presence = { cle: o.cle, n: 0 }; i.presence.n += 1; }
  if (d.jalousie) { if (i.jalousie.cle !== o.cle) i.jalousie = { cle: o.cle, n: 0 }; i.jalousie.n += 1; }
  if (d.invention) i.invention = o.cle;
  if (d.nuit) marquerEchangeNuit(i, o.cle, o.now || Date.now());
  if (d.scenario) {
    const s = i.scenarios.find((x) => x.id === d.scenario);
    if (s) {
      if (!s.montre || s.montre.cle !== o.cle) { s.montre = { cle: o.cle, n: 0 }; s.n = (s.n || 0) + 1; s.reprise = o.cle; }
      s.montre.n += 1;
    }
  }
  // Un nouveau scénario naît quand l'un de vous deux en lance un (et que l'ambiance s'y prête).
  if (!o.bloque) {
    let lance = reperer(o.texteElle) || reperer(o.message);
    // Hors ambiance tendre, seul un vrai rendez-vous à deux compte (« on pourrait réviser » n'est pas un scénario).
    if (lance && (o.chaleur || 0) < 1 && !(lance.type === 'rendezvous' && (o.lien || 0) >= 40)) lance = null;
    const dejaCree = i.scenarios.some((s) => s.cle === o.cle && !s.reprise);
    if (lance && !dejaCree && i.scenarios.length < MAX_SCENARIOS &&
      !i.scenarios.some((s) => norm(s.texte).slice(0, 30) === norm(lance.texte).slice(0, 30))) {
      i.scenarios.push({ id: 's' + (o.now || Date.now()).toString(36), cle: o.cle, texte: lance.texte, type: lance.type, n: 0, reprise: null, montre: null, fini: false });
    }
  }
  // Le langage évolue avec les jours où ça a chauffé.
  if (!o.bloque && (o.chaleur || 0) >= 2 && !i.langage.chauds.includes(o.cle)) i.langage.chauds = [...i.langage.chauds, o.cle].slice(-40);
  const s = stadeLangage(i, o.lien);
  if (s > (i.langage.stade || 0)) i.langage.stade = s;
  maintenirScenarios(i, o.cle);
  return i;
}

// ---------- Messages spontanés ----------

const CONSIGNE_SCENARIO = (s) => 'Tu repenses à ce que vous avez imaginé ensemble : « ' + s.texte + ' ». Écris-lui un message très court qui y revient (« j\'y repense encore… », une variante, un détail en plus), sans le raconter en entier et sans question. Tendre ou joueur, jamais cru.';

// ctx : { cle, m, coucher, lien, curseur, echangeAujourdhui, emoBloque, bloque (moment), sansReponse, insistance, dort }
// Renvoie { type: 'insomnie' | 'scenario', consigneTexte, scenario? } ou null. Au plus un message spontané d'intimité par jour.
function spontane(i, ctx, cfg = {}) {
  normaliser(i);
  if (i.spontane === ctx.cle) return null;
  if (ctx.dort) {
    if (veutInsomnie(i, ctx, cfg)) return { type: 'insomnie', consigneTexte: CONSIGNE_INSOMNIE };
    return null;
  }
  if (cfg.scenariosActifs === false || ctx.emoBloque || ctx.bloque) return null;
  if ((ctx.lien || 0) < 45 || (ctx.curseur || 0) < 1 || (ctx.sansReponse || 0) >= (ctx.insistance || 3)) return null;
  const s = scenarioDu(i, ctx.cle);
  if (!s) return null;
  const r = H.graine('scenario-msg' + ctx.cle);
  const debut = 20 * 60 + Math.round(r() * 100); // 20h → 21h40
  if (ctx.m < debut || ctx.m > Math.min(debut + 120, ctx.coucher - 45)) return null;
  if (r() > 0.5) return null; // pas systématique
  return { type: 'scenario', consigneTexte: CONSIGNE_SCENARIO(s), scenario: s.id };
}
function marquerSpontane(i, cle) { normaliser(i); i.spontane = cle; }

module.exports = {
  nouvelEtat, normaliser, preparer, apres, appliquerForme, appliquerNuit, appliquerTrouble, niveauTrouble,
  blocPresence, blocLangage, blocJalousie, blocNuit, modeNuit, decisionReveil, veutInsomnie, marquerInsomnie, nuitCourante,
  reperer, scenarioDu, maintenirScenarios, stadeLangage, petitsMots, autreFille, spontane, marquerSpontane,
  CONSIGNE_INSOMNIE, SURNOMS, PETITS_MOTS, LIMITE_COURTE,
};
