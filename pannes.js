// Les petits ennuis de la vraie vie en Algérie : le réseau qui saute, plus de data ni de crédit, le téléphone à plat,
// la coupure de courant. Ils expliquent un silence sans qu'elle ait à inventer d'excuse : pendant la panne elle
// ne lit pas et n'écrit pas ; à la fin elle dit ce qui s'est passé, en une phrase.
// Même principe que le reste : fonctions pures (le hasard est injectable), aucun appel IA en plus.
//
// Contient aussi le tirage des « interruptions » (« attends, ma mère m'appelle, je reviens ») : le retour est géré
// par promesses.js (petites absences).

const H = require('./humain');

const MIN = 60000;
const num = (v, d) => (v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? d : Number(v));
const borne = (x, a, b) => Math.max(a, Math.min(b, x));
const choisir = (liste, r = Math.random) => liste[Math.floor(r() * liste.length)];
const FENETRE_RETOUR_MIN = 60; // au-delà, plus la peine de parler de la panne

const TYPES = {
  connexion: {
    poids: 4, duree: [15, 80], previent: 0.25,
    raisons: [
      'le réseau a complètement sauté chez toi, même la 4G ne passait plus',
      'la connexion était pourrie : le wifi n\'arrêtait pas de couper',
      'la box a planté, il a fallu la redémarrer plusieurs fois',
      'le réseau était HS dans tout le quartier',
    ],
    annonce: 'Ta connexion rame de plus en plus et tu sens qu\'elle va sauter : préviens-le en une phrase que ça coupe (« ça rame », « je crois que le réseau va sauter »), sans promettre d\'heure de retour.',
  },
  data: {
    poids: 3, duree: [20, 110], previent: 0.5,
    raisons: [
      'tu n\'avais plus de data, il a fallu attendre de recharger',
      'plus de crédit ni de data : tu as dû aller recharger',
      'ton forfait était fini et tu as dû te débrouiller avec le wifi de la maison, qui ne marche presque pas',
      'ta data était finie : tu as demandé à ta sœur de te partager sa connexion, sans succès tout de suite',
    ],
    annonce: 'Il te reste presque plus de data (ou de crédit) : préviens-le en une phrase que tu risques de disparaître un moment (« j\'ai presque plus de data », « mon forfait va finir »), sans promettre d\'heure de retour.',
  },
  batterie: {
    poids: 3, duree: [25, 140], previent: 0.6,
    raisons: [
      'ton téléphone s\'était éteint, plus de batterie, et tu cherchais ton chargeur',
      'batterie à plat : ton chargeur ne marchait plus et tu as dû en emprunter un',
      'ton téléphone est mort, tu l\'as laissé charger un moment avant de pouvoir t\'en servir',
      'plus de batterie, et la prise de ta chambre ne marche pas : tu as dû charger ailleurs dans la maison',
    ],
    annonce: 'Ton téléphone est presque à plat (2 ou 3 %) et tu n\'as pas ton chargeur sous la main : préviens-le en une phrase que tu vas disparaître un moment (« j\'ai 3 % », « je vais mourir, je vais charger »), sans promettre d\'heure de retour.',
  },
  courant: {
    poids: 3, duree: [20, 120], previent: 0.5,
    raisons: [
      'il y a eu une coupure d\'électricité : plus de wifi, plus de lumière, tu as dû économiser ta batterie',
      'coupure de courant dans le quartier, la box était éteinte et la 4G passait à peine',
      'une coupure de courant, et ton téléphone était presque à plat : tu l\'as éteint pour le garder',
    ],
    annonce: 'Le courant vient de sauter chez toi : plus de lumière, plus de wifi, et la 4G est faible. Dis-le-lui en une phrase (« coupure de courant », « ça a sauté chez nous »), en précisant que tu risques de disparaître un moment.',
  },
};

function tirage(paires, r) {
  const total = paires.reduce((a, [, p]) => a + p, 0);
  let x = r() * total;
  for (const [v, p] of paires) {
    x -= p;
    if (x < 0) return v;
  }
  return paires[paires.length - 1][0];
}

function ecartJours(cleA, cleB) {
  if (!cleA || !cleB) return 1e5;
  return Math.abs(new Date(cleA + 'T12:00:00Z') - new Date(cleB + 'T12:00:00Z')) / 86400000;
}

// ---------- Planification : une panne possible par jour, tirée de la date (stable) ----------

// reveil / coucher : minutes dans le « jour de vie ». Renvoie null (pas de panne ce jour-là) ou { type, at, duree }.
function planDuJour(cle, reveil, coucher, cfg = {}, derniereCle = null) {
  const proba = borne(num(cfg.pannesProbaJour, 25), 0, 100) / 100;
  if (proba <= 0) return null;
  if (ecartJours(cle, derniereCle) < Math.max(1, num(cfg.pannesEcartJours, 2))) return null;
  const r = H.graine('panne' + cle);
  if (r() >= proba) return null;
  const type = tirage(Object.entries(TYPES).map(([k, v]) => [k, v.poids]), r);
  const [a, b] = TYPES[type].duree;
  const fenetre = Math.max(60, coucher - reveil - 240);
  return { type, at: reveil + 90 + Math.floor(r() * fenetre), duree: H.entre(a, b, r), previent: r() < TYPES[type].previent };
}

function nouvelEtat() {
  return { cle: null, plan: null, derniereCle: null, actuelle: null };
}

// À appeler à chaque passage (chaque minute). ctx : { cle, m, reveil, coucher, dort, conversation (bool : ils se parlent en ce moment) }.
// Renvoie { debut: panne|null, fin: panne|null }.
function tick(etat, now, ctx, cfg = {}, r = Math.random) {
  const sortie = { debut: null, fin: null };
  const a = etat.actuelle;
  if (a && !a.finie && now >= a.fin) {
    a.finie = true;
    sortie.fin = a;
  }
  if (etat.cle !== ctx.cle) {
    etat.cle = ctx.cle;
    etat.plan = planDuJour(ctx.cle, ctx.reveil, ctx.coucher, cfg, etat.derniereCle);
  }
  const plan = etat.plan;
  if (!plan || plan.lance || ctx.dort || ctx.m < plan.at) return sortie;
  if (etat.actuelle && !etat.actuelle.finie) return sortie; // une à la fois
  plan.lance = true;
  if (ctx.m - plan.at > 120) return sortie; // application lancée tard : on ne rattrape pas
  const t = TYPES[plan.type];
  etat.derniereCle = ctx.cle;
  etat.actuelle = {
    type: plan.type, cle: ctx.cle, debut: now, fin: now + plan.duree * MIN,
    raison: choisir(t.raisons, r), prevenue: false, previent: !!(plan.previent && ctx.conversation), dit: false, finie: false,
  };
  sortie.debut = etat.actuelle;
  return sortie;
}

// La panne en cours (null s'il n'y en a pas).
function active(etat, now = Date.now()) {
  const a = etat && etat.actuelle;
  return a && now >= a.debut && now < a.fin ? a : null;
}

// Une panne finie dont elle n'a pas encore parlé, et assez récente pour qu'en parler reste naturel.
function retourAFaire(etat, now = Date.now()) {
  const a = etat && etat.actuelle;
  if (!a || !a.finie || a.dit || now < a.fin) return null;
  return now - a.fin < FENETRE_RETOUR_MIN * MIN ? a : null;
}

// Heure (ms) avant laquelle elle ne répondra pas à cause d'une panne ; 0 s'il n'y en a pas.
function finPanne(etat, now = Date.now()) {
  const a = active(etat, now);
  return a ? a.fin : 0;
}

function consigneAnnonce(panne) {
  return TYPES[panne.type].annonce;
}

function consigneRetour(panne, now = Date.now()) {
  const duree = H.formatDuree(Math.max(60, Math.round((now - panne.debut) / 1000)));
  return `Tu retrouves enfin ton téléphone ou ta connexion après ${duree} : ${panne.raison}. ` +
    'Écris-lui un petit message de retour d\'une phrase (« me revoilà », « pff, j\'étais sans réseau »), naturel, sans te perdre en excuses.';
}

// Bloc du prompt (réponse écrite juste après une panne).
function bloc(etat, now = Date.now()) {
  const a = retourAFaire(etat, now);
  if (!a) return '';
  const duree = H.formatDuree(Math.max(60, Math.round((a.fin - a.debut) / 1000)));
  return [
    '=== CE QUI T\'EST ARRIVÉ (silence involontaire) ===',
    `Tu viens de passer ${duree} sans pouvoir répondre : ${a.raison}.`,
    'Dis-le au début de ta réponse, en une phrase courte et naturelle (« pardon, j\'avais plus de réseau », « mon téléphone était mort »), sans t\'excuser lourdement ni le reprocher à personne, puis réponds à ce qu\'il dit. ' +
      'Si ce n\'est pas lié à son message (il dit juste « salut »), un mot suffit. Ne parle jamais de bug, de programme ni de technique cachée : c\'est la vraie vie, comme pour tout le monde.',
  ].join('\n');
}

// ---------- Interruptions : « attends, ma mère m'appelle, je reviens » ----------

const CAUSES_INTERRUPTION = [
  [55, 'ta mère t\'appelle depuis une autre pièce (écris par exemple « attends, ma mère m\'appelle, je reviens »)'],
  [14, 'une de tes sœurs (Sarah ou Inès) frappe à la porte ou te réclame quelque chose'],
  [10, 'ton père t\'appelle pour un petit service'],
  [8, 'ta grand-mère ou une tante vient d\'arriver et tu dois aller dire bonjour'],
  [13, 'on sonne à la porte ou ta mère a besoin de toi tout de suite, tu dois lâcher ton téléphone'],
];

const CODES_MAISON = ['reveil', 'matin', 'libre', 'soiree', 'preparatifs', 'jeune'];

// Faut-il interrompre CETTE réponse ? ctx : { code, dort, conversation, nbAujourdhui, enAbsence, chaleur }.
// Renvoie null ou { consigne }.
function tireInterruption(ctx, cfg = {}, r = Math.random) {
  const proba = borne(num(cfg.absencesProba, 5), 0, 100) / 100;
  if (proba <= 0 || ctx.dort || ctx.enAbsence) return null;
  if (!ctx.conversation) return null; // il faut une vraie discussion en cours pour être interrompue
  if (!CODES_MAISON.includes(ctx.code)) return null; // pas en cours, pas à table
  if ((ctx.nbAujourdhui || 0) >= Math.max(0, num(cfg.absencesParJour, 2))) return null;
  // Quand l'ambiance chauffe, une interruption fait très vrai (elle vit chez ses parents) : un peu plus fréquent.
  const p = proba * (ctx.chaleur >= 2 ? 2.5 : 1);
  if (r() >= p) return null;
  const cause = tirage(CAUSES_INTERRUPTION.map(([w, t]) => [t, w]), r);
  return {
    consigne: `À LA FIN de ce message, tu es interrompue : ${cause}. Réponds d'abord normalement à ce qu'il dit, puis annonce en quelques mots que tu dois y aller et que tu reviens. ` +
      'N\'écris rien après cette annonce, et ne dis pas combien de temps ça prendra : tu n\'en sais rien.',
  };
}

function blocInterruption(interruption) {
  if (!interruption) return '';
  return ['=== INTERRUPTION (prévue pour ce message) ===', interruption.consigne].join('\n');
}

module.exports = {
  TYPES, FENETRE_RETOUR_MIN,
  planDuJour, nouvelEtat, tick, active, retourAFaire, finPanne,
  consigneAnnonce, consigneRetour, bloc,
  tireInterruption, blocInterruption,
};
