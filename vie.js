// La « vie qui continue » de Lina : événements qui durent plusieurs jours, jours sans envie,
// messages lus sans réponse, doubles messages. Fonctions pures (le hasard est injectable : tests).

const H = require('./humain');

const JOUR = 86400000;
const num = (v, d) => (v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? d : Number(v));
const borne = (x, a, b) => Math.max(a, Math.min(b, x));
const choisir = (liste, r) => liste[Math.floor(r() * liste.length)];
const pct = (cfg, nom, defaut) => borne(num(cfg[nom], defaut), 0, 100) / 100;

function tirage(paires, r) {
  const total = paires.reduce((a, [, p]) => a + p, 0);
  let x = r() * total;
  for (const [v, p] of paires) {
    x -= p;
    if (x < 0) return v;
  }
  return paires[paires.length - 1][0];
}

// Même jour, mais à une heure locale précise (minutes depuis minuit).
function aHeure(ts, cibleMin, fuseau) {
  const t = H.heureLocale(new Date(ts), fuseau);
  return ts + (cibleMin - t.minutes) * 60000;
}

function jourLibelle(ts, fuseau) {
  try {
    return new Intl.DateTimeFormat('fr-FR', { timeZone: fuseau, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(ts));
  } catch (e) {
    return new Date(ts).toLocaleDateString('fr-FR');
  }
}

// Les examens n'ont pas lieu le week-end (vendredi et samedi en Algérie).
function prochainJourCours(ts, cfg) {
  const p = H.parametresVie(cfg);
  let t = ts;
  for (let i = 0; i < 4; i++) {
    if (p.joursCours.includes(H.heureLocale(new Date(t), p.fuseau).jour)) return t;
    t += JOUR;
  }
  return t;
}

// ---------- Événements de vie ----------

const MATIERES = [
  'phonétique anglaise', 'traduction espagnol', 'grammaire allemande',
  'linguistique générale', 'civilisation britannique', 'expression orale en anglais',
];

function creerExamen({ now, cfg, r }) {
  const fuseau = H.parametresVie(cfg).fuseau;
  const matiere = choisir(MATIERES, r);
  const jour = prochainJourCours(aHeure(now + H.entre(3, 8, r) * JOUR, 8 * 60 + 30, fuseau), cfg);
  const quand = jourLibelle(jour, fuseau);
  const ressenti = tirage([['bien', 0.5], ['moyen', 0.32], ['mal', 0.18]], r);
  const note = ressenti === 'bien' ? H.entre(13, 17, r) : ressenti === 'moyen' ? H.entre(10, 13, r) : H.entre(6, 10, r);
  const ressentiTxt = {
    bien: 'ça s\'est plutôt bien passé, tu es soulagée',
    moyen: 'c\'était correct mais tu n\'es pas sûre du résultat',
    mal: 'ça s\'est mal passé, tu es déçue de toi',
  }[ressenti];
  const reaction = note >= 13 ? 'tu es contente' : note >= 10 ? 'ça passe, tu es soulagée' : 'tu es déçue, tu devras peut-être rattraper';
  const phases = [
    { at: now, code: 'annonce', annonce: true, note: `Tu as un examen de ${matiere} le ${quand}. Tu révises et tu stresses un peu.` },
    { at: aHeure(jour - JOUR, 20 * 60, fuseau), code: 'veille', annonce: false, note: `Ton examen de ${matiere} est demain : tu révises tard, tu es nerveuse.` },
    { at: jour, code: 'jour', annonce: false, note: `Tu passes ton examen de ${matiere} ce matin : stressée, tu as peu de temps pour discuter.` },
    { at: aHeure(jour, 12 * 60 + 30, fuseau), code: 'sortie', annonce: true, note: `Tu viens de passer ton examen de ${matiere} : ${ressentiTxt}. Tu attends la note.` },
    { at: aHeure(jour + H.entre(4, 7, r) * JOUR, 18 * 60, fuseau), code: 'resultat', annonce: true, note: `Tu as eu ta note à l'examen de ${matiere} : ${note}/20 (${reaction}).` },
  ].filter((p, i) => i === 0 || p.at > now + 6 * 3600000);
  return { type: 'examen', titre: `examen de ${matiere}`, phases };
}

function creerDispute({ now, r }) {
  const soeur = choisir(['Sarah', 'Inès'], r);
  const cause = choisir([
    'elle a pris un de tes vêtements sans demander',
    'elle a répété à tes parents un truc que tu lui avais confié',
    'une dispute pour la salle de bain et la télé',
    'elle t\'a mal parlé devant tes parents',
  ], r);
  const phases = [
    { at: now, code: 'dispute', annonce: true, note: `Tu viens de te disputer avec ta sœur ${soeur} (${cause}). Tu es encore énervée.` },
    { at: now + H.entre(20, 30, r) * 3600000, code: 'froid', annonce: false, note: `Tu boudes ${soeur} depuis hier : vous ne vous parlez presque pas à la maison.` },
    { at: now + H.entre(48, 80, r) * 3600000, code: 'reconciliee', annonce: true, note: `Tu t'es réconciliée avec ${soeur}, c'est oublié.` },
  ];
  return { type: 'dispute', titre: `dispute avec ${soeur}`, phases };
}

const OBSTACLES = [
  'Ania a pris du retard de son côté',
  'vous n\'êtes pas d\'accord sur un point',
  'vous avez failli perdre un fichier, retrouvé de justesse',
  'il vous manque une idée pour la fin',
];

function creerProjet({ now, cfg, r }) {
  const fuseau = H.parametresVie(cfg).fuseau;
  const matiere = choisir(MATIERES, r);
  const destination = choisir(['Béjaïa', 'Tunis', 'Istanbul', 'Barcelone'], r);
  const variante = choisir([
    {
      titre: `exposé de ${matiere} avec Ania`, jours: [7, 12],
      lancement: `Tu prépares un exposé de ${matiere} avec Ania : vous vous répartissez le travail.`,
      avance: (o) => `L'exposé avec Ania avance, mais ${o}.`,
      final: (ok) => `Vous avez présenté l'exposé avec Ania : ${ok ? 'ça s\'est bien passé' : 'c\'était moyen, vous avez bafouillé'}.`,
    },
    {
      titre: 'surprise d\'anniversaire avec Ania', jours: [6, 10],
      lancement: 'Tu prépares avec Ania une surprise d\'anniversaire pour une amie : cadeau, gâteau, secret à garder.',
      avance: (o) => `La surprise d'anniversaire avance, mais ${o}.`,
      final: (ok) => `La surprise a eu lieu : ${ok ? 'elle a adoré, vous avez bien rigolé' : 'elle s\'en doutait un peu, mais c\'était sympa quand même'}.`,
    },
    {
      titre: `projet de voyage avec Ania (${destination})`, jours: [8, 14],
      lancement: `Tu rêves d'un voyage avec Ania cet été : vous regardez des idées, ${destination} revient souvent.`,
      avance: (o) => `Le projet de voyage à ${destination} avance (budget, dates), mais ${o}.`,
      final: (ok) => `Vous avez fait le point sur le voyage à ${destination} : ${ok ? 'c\'est presque décidé, tu es motivée' : 'c\'est repoussé, trop cher pour l\'instant'}.`,
    },
    {
      titre: 'petit projet photo avec Ania', jours: [5, 9],
      lancement: 'Tu fais un petit projet photo avec Ania : vous prenez des photos de vos sorties pour un album.',
      avance: (o) => `Le projet photo avec Ania avance, mais ${o}.`,
      final: (ok) => `Le projet photo est fini : ${ok ? 'l\'album est beau, tu es fière' : 'tu n\'es pas totalement satisfaite du résultat'}.`,
    },
  ], r);
  const ok = r() < 0.75;
  const fin = aHeure(now + H.entre(variante.jours[0], variante.jours[1], r) * JOUR, 17 * 60, fuseau);
  const milieu = now + Math.round((fin - now) * (0.4 + r() * 0.2));
  const phases = [
    { at: now, code: 'lancement', annonce: true, note: variante.lancement },
    { at: milieu, code: 'avance', annonce: true, note: variante.avance(choisir(OBSTACLES, r)) },
    { at: fin, code: 'final', annonce: true, note: variante.final(ok) },
  ];
  return { type: 'projet', titre: variante.titre, phases };
}

function creerSortie({ now, cfg, r }) {
  const fuseau = H.parametresVie(cfg).fuseau;
  const lieu = choisir(['le cinéma', 'un café en ville', 'une sortie shopping', 'un petit pique-nique'], r);
  const anecdote = choisir([
    'vous avez eu un fou rire pour rien',
    'vous vous êtes un peu perdues en chemin',
    'Ania a renversé son verre',
    'vous avez croisé une ancienne prof',
  ], r);
  const jour = aHeure(now + H.entre(2, 5, r) * JOUR, 15 * 60, fuseau);
  const phases = [
    { at: now, code: 'annonce', annonce: true, note: `Tu as prévu une sortie avec Ania et des copines le ${jourLibelle(jour, fuseau)} (${lieu}).` },
    { at: jour, code: 'jour', annonce: false, note: `Tu es de sortie avec Ania et des copines (${lieu}).` },
    { at: aHeure(jour, 21 * 60 + 30, fuseau), code: 'apres', annonce: true, note: `Tu rentres de ta sortie (${lieu}) : c'était sympa, ${anecdote}.` },
  ];
  return { type: 'sortie', titre: `sortie avec Ania (${lieu})`, phases };
}

function creerRhume({ now, r }) {
  const phases = [
    { at: now, code: 'debut', annonce: true, note: 'Tu es enrhumée depuis ce matin : nez bouché, un peu fatiguée.' },
    { at: now + H.entre(36, 52, r) * 3600000, code: 'mieux', annonce: false, note: 'Ton rhume va mieux, tu es moins fatiguée.' },
  ];
  return { type: 'rhume', titre: 'petit rhume', phases };
}

// poids = fréquence relative ; cooldown = jours minimum avant d'en recréer un du même type.
const CATALOGUE = [
  { type: 'examen', poids: 3, cooldown: 10, creer: creerExamen },
  { type: 'dispute', poids: 2, cooldown: 6, creer: creerDispute },
  { type: 'projet', poids: 3, cooldown: 12, creer: creerProjet },
  { type: 'sortie', poids: 3, cooldown: 3, creer: creerSortie },
  { type: 'rhume', poids: 1, cooldown: 14, creer: creerRhume },
];

function nouvelEtatVie() {
  return { evenements: [], termines: [], cleJour: null, dernierParType: {} };
}

const phaseCourante = (ev, now) => {
  let cur = null;
  for (const p of ev.phases) if (p.at <= now) cur = p;
  return cur;
};

const finEvenement = (ev) => ev.phases[ev.phases.length - 1].at + 1.5 * JOUR;

function evenementsActifs(vie, now) {
  return (vie.evenements || []).filter((ev) => ev.debut <= now && finEvenement(ev) > now);
}

let compteur = 0;

// Met à jour la vie : archive ce qui est fini, tire éventuellement un nouvel événement (une fois par « jour de vie »).
// Renvoie la liste des changements [{ type: 'cree' | 'termine', ev }].
function majVie(vie, now, cfg = {}, r = Math.random) {
  const changes = [];
  if (!vie.evenements) vie.evenements = [];
  if (!vie.termines) vie.termines = [];
  if (!vie.dernierParType) vie.dernierParType = {};

  vie.evenements = vie.evenements.filter((ev) => {
    if (finEvenement(ev) > now) return true;
    vie.termines.push({ id: ev.id, type: ev.type, titre: ev.titre, fin: finEvenement(ev), resume: ev.phases[ev.phases.length - 1].note });
    changes.push({ type: 'termine', ev });
    return false;
  });
  vie.termines = vie.termines.slice(-6);

  if (cfg.evenementsVie === false) return changes;
  const date = new Date(now);
  if (H.etatDeVie(date, cfg).dort) return changes; // on ne tire les événements que quand elle est réveillée
  const j = H.jourDeVie(date, cfg);
  if (vie.cleJour === j.cle) return changes;
  vie.cleJour = j.cle;

  const actifs = evenementsActifs(vie, now);
  const max = borne(Math.round(num(cfg.maxEvenements, 2)), 1, 3);
  const premiere = !vie.evenements.length && !vie.termines.length && !Object.keys(vie.dernierParType).length;
  const p = premiere ? 1 : actifs.length === 0 ? 0.4 : actifs.length < max ? 0.15 : 0;
  if (r() >= p) return changes;

  const possibles = CATALOGUE.filter(
    (c) => !actifs.some((a) => a.type === c.type) && now - (vie.dernierParType[c.type] || 0) >= c.cooldown * JOUR
  );
  if (!possibles.length) return changes;
  const choix = tirage(possibles.map((c) => [c, c.poids]), r);
  const base = choix.creer({ now, cfg, r });
  const ev = {
    id: `${choix.type}-${now}-${++compteur}`,
    type: base.type,
    titre: base.titre,
    debut: now,
    phases: base.phases.map((ph) => ({ ...ph, dit: false, expose: 0 })).sort((a, b) => a.at - b.at),
  };
  vie.evenements.push(ev);
  vie.dernierParType[choix.type] = now;
  changes.push({ type: 'cree', ev });
  return changes;
}

// Bloc ajouté au prompt : ce qui se passe dans sa vie en ce moment.
function blocVie(vie, now, opts = {}) {
  const actifs = evenementsActifs(vie, now);
  const lignes = [];
  for (const ev of actifs) {
    const ph = phaseCourante(ev, now);
    if (!ph) continue;
    const nouveau = ph.annonce && !ph.dit && !opts.silencieux;
    lignes.push(`- ${ph.note}${nouveau ? ' (nouveau, tu ne le lui as pas encore raconté : tu peux lui en parler si ça vient naturellement)' : ''}`);
  }
  const recents = (vie.termines || []).filter((t) => now - t.fin < 3 * JOUR);
  for (const t of recents) lignes.push(`- (terminé récemment) ${t.resume}`);
  if (!lignes.length) return '';
  return [
    '=== TA VIE EN CE MOMENT (de vrais événements de ta vie : reste cohérente et n\'invente rien de plus à leur sujet) ===',
    ...lignes,
    'N\'en parle pas à chaque message : de temps en temps, quand c\'est naturel, sans réciter. S\'il te demande des nouvelles, réponds d\'après ces infos.',
  ].join('\n');
}

// Après une réponse où une nouveauté figurait dans le prompt : au bout de 2 fois, on considère qu'elle l'a racontée.
function marquerExposees(vie, now) {
  let change = false;
  for (const ev of evenementsActifs(vie, now)) {
    const ph = phaseCourante(ev, now);
    if (ph && ph.annonce && !ph.dit) {
      ph.expose = (ph.expose || 0) + 1;
      if (ph.expose >= 2) ph.dit = true;
      change = true;
    }
  }
  return change;
}

// Une nouveauté à annoncer d'elle-même : 10 à 90 minutes après le moment où elle arrive, pas au-delà de 2 jours.
function prochaineNouvelle(vie, now) {
  for (const ev of evenementsActifs(vie, now)) {
    const ph = phaseCourante(ev, now);
    if (!ph || !ph.annonce || ph.dit) continue;
    const delai = (10 + H.graine(ev.id + ph.code)() * 80) * 60000;
    if (now >= ph.at + delai && now - ph.at < 2 * JOUR) return { ev, phase: ph };
  }
  return null;
}

const consigneEvenement = (ev, phase) =>
  `Raconte-lui naturellement, comme à ton copain et en 1 ou 2 phrases, cette nouveauté de ta vie (sans tout dire d'un coup) : ${phase.note}`;

// ---------- Jours sans envie ----------

// Certains jours (≈ 12 %), une période de quelques heures où elle n'a pas envie de parler.
// Tirée à partir de la date : stable même si l'application est relancée.
function humeurSpeciale(date = new Date(), cfg = {}) {
  if (cfg.joursOff === false) return null;
  const j = H.jourDeVie(date, cfg);
  const r = H.graine('off' + j.cle);
  if (r() >= pct(cfg, 'probaJourOff', 12)) return null;
  const type = tirage([['sans_envie', 0.4], ['vexee', 0.3], ['froide', 0.3]], r);
  const debut = j.reveil + H.entre(60, 420, r);
  const fin = Math.min(debut + H.entre(150, 420, r), j.coucher - 90);
  if (fin - debut < 90) return null;
  return { type, cle: j.cle, debut, fin, actif: j.m >= debut && j.m < fin, retour: j.m >= fin && j.m < fin + 90 };
}

const GARDE_FOUS = 'Reste douce et respectueuse : jamais d\'insulte, jamais de chantage affectif, jamais de menace de partir ni de culpabilisation. Ça passera tout seul.';

function blocHumeurSpeciale(hs) {
  if (!hs) return '';
  if (hs.actif) {
    const texte = {
      sans_envie: 'Aujourd\'hui tu n\'as pas trop envie de parler (sans raison précise, ça arrive). Réponses très courtes et plates (« mmh », « ouais », « jsp », « pas trop la forme »), presque pas d\'emojis, pas de surnoms ni d\'élan. S\'il demande, dis simplement que tu as besoin d\'être au calme.',
      vexee: 'Tu es un peu vexée par un petit truc (reste vague : n\'invente ni dispute précise ni reproche grave). Ton sec, réponses courtes, un peu de distance, pas de surnoms. S\'il le remarque, tu peux dire « c\'est rien, ça va passer ».',
      froide: 'Tu es distante et un peu froide, la tête ailleurs (fatigue, stress). Réponses brèves, ton neutre, pas de taquinerie.',
    }[hs.type];
    return `=== HUMEUR PARTICULIÈRE (elle prime sur ton humeur habituelle) ===\n${texte}\n${GARDE_FOUS}`;
  }
  if (hs.retour) {
    return '=== HUMEUR : RETOUR ===\nTu sors d\'une période où tu n\'avais pas envie de parler. Ça va mieux : tu redeviens douce et chaleureuse, tu peux dire en deux mots que tu étais pas d\'humeur, sans en faire un drame.';
  }
  return '';
}

const CONSIGNES = {
  retour: (type) => `Tu sors d'une période où tu étais ${type === 'vexee' ? 'un peu vexée' : type === 'froide' ? 'froide et distante' : 'sans envie de parler'}. Envoie-lui un petit mot pour revenir (tu étais pas d'humeur, ça va mieux), tendre et sans drame.`,
};

// Délai de réponse quand elle n'est pas d'humeur : plus lent, même en pleine discussion.
function latence(etat, cfg, opts, hs, r = Math.random) {
  if (!hs || !hs.actif || etat.dort || cfg.latenceRealiste === false) return H.latence(etat, cfg, opts, r);
  const k = num(cfg.rapidite, 1) > 0 ? num(cfg.rapidite, 1) : 1;
  const x = r();
  if (x < 0.15) return H.latence(etat, cfg, { conversationActive: true }, r);
  if (x < 0.5) return { secondes: H.alea(120, 600, r) * k, mode: 'pas d\'humeur' };
  return { secondes: H.alea(900, 3600, r) * k, mode: 'pas d\'humeur, lent' };
}

// ---------- « Vu » sans réponse ----------

// Elle lit le message (coches bleues) mais répond plus tard. Renvoie { minutes } ou null.
// ctx : { conversationActive, texte, dort, resteAvantCoucher (minutes) }
function decisionVu(cfg, hs, ctx, r = Math.random) {
  let p = pct(cfg, 'vuSansReponse', 6);
  if (p <= 0 || ctx.dort) return null;
  if (hs && hs.actif) p = Math.max(p, hs.type === 'froide' ? 0.25 : 0.35);
  if (ctx.conversationActive) p *= 0.25;
  if (/\?/.test(ctx.texte || '')) p *= 0.4;
  if (ctx.resteAvantCoucher !== undefined && ctx.resteAvantCoucher < 60) return null;
  if (r() >= Math.min(0.5, p)) return null;
  let minutes = H.entre(25, 150, r);
  if (ctx.resteAvantCoucher !== undefined) minutes = Math.min(minutes, Math.max(10, ctx.resteAvantCoucher - 20));
  return { minutes };
}

// ---------- Doubles messages ----------

// Quand elle s'emballe (bonne humeur, grande nouvelle), elle envoie deux messages d'affilée.
function tireEmballement(cfg, ctx, r = Math.random) {
  let p = pct(cfg, 'doubleMessage', 8);
  if (p <= 0 || (ctx.hs && ctx.hs.actif)) return false;
  if (/énergie|excitée|rigolote|projet/.test(ctx.humeur || '') || ctx.nouvelle) p *= 2.5;
  return r() < Math.min(0.5, p);
}

module.exports = {
  CATALOGUE, CONSIGNES, JOUR,
  nouvelEtatVie, phaseCourante, evenementsActifs, majVie, blocVie, marquerExposees,
  prochaineNouvelle, consigneEvenement,
  humeurSpeciale, blocHumeurSpeciale, latence, decisionVu, tireEmballement,
};
