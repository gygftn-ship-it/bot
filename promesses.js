// Ce que Lina promet : « je te raconte ça ce soir », « je t'écris après le cours »…
// Le programme repère la promesse dans SES messages (par motifs de texte, sans appel à l'IA en plus),
// la range avec une échéance, puis elle la tient — ou s'excuse de l'avoir oubliée, comme une vraie personne.
// Même esprit que souvenirs.js (ce que LUI annonce), mais pour ce qu'ELLE a promis. Fonctions pures, testables.

const H = require('./humain');

const MIN = 60000;
const MAX_PROMESSES = 6;
const OUBLI_PROBA = 0.1; // une fois sur dix, elle oublie vraiment et ne s'en souvient que plus tard
const RETARD_EXCUSE_MIN = 75; // au-delà, elle s'excuse
const EXPIRE_H = 30; // une promesse vieille de plus de 30 h est abandonnée en silence

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘]/g, "'");

// « je te raconte… », « je t'écris… », « on en reparle… », « je reviens… » : une phrase qui engage Lina.
const VERBES = '(?:raconte|ecris|dis|reparle|rappelle|appelle|envoie|montre|renvoie|reponds|explique|ferai signe|fais signe|tiens au courant|en parle|' +
  'raconterai|ecrirai|dirai|appellerai|rappellerai|montrerai|enverrai|repondrai|expliquerai|passerai un coup de fil)';
const PROMESSE = new RegExp(
  `\\bje (?:te|t')\\s*(?:le |la |les |l'|en |y )?${VERBES}\\b` +
  `|\\bje (?:te |t')?reviens\\b|\\bon (?:en |se )?(?:reparle|parle|rappelle|capte)\\b|\\bon s'appelle\\b|\\bje te tiens au courant\\b`
);

// ---------- Petites absences : « ma mère m'appelle, je reviens » ----------
// Une absence est une promesse particulière : elle revient 10 à 40 minutes plus tard et dit POURQUOI (une raison
// concrète, tirée au moment du départ pour que tout reste cohérent). Même liste (etat.promesses) que le reste.

const ABSENCE_MIN = [10, 40]; // retour dans cet intervalle (minutes)
const ABSENCE_EXPIRE_MIN = 120; // si le retour n'a pas eu lieu 2 h après l'heure prévue, on laisse tomber

// Une marque de retour : « je reviens », « j'arrive », « deux sec », « brb »…  (« j'arrive pas à dormir » n'en est pas une)
const RETOUR = /\b(?:je reviens|je reviens vite|reviens (?:dans|tout de suite|vite)|j'arrive(?!\s+(?:pas|plus|a|de|toujours|jamais|vraiment|meme|enfin))|deux sec|2 ?sec|une sec|1 ?sec|une minute|une min|2 ?min|deux minutes|un instant|un petit instant|brb|tout de suite)\b/;
// Quelqu'un l'appelle ou la réclame (même sans « je reviens », elle s'en va).
const APPEL = /\b(?:m'appelle|me appelle|m'appellent|me demande|me cherche|me reclame|me crie|m'attend|a besoin de moi|veut que je|on sonne|on frappe|quelqu'un sonne|quelqu'un frappe)\b/;

const CAUSES = [
  { id: 'mere', re: /\b(?:ma mere|yemma|maman|ma maman|mama)\b/, raisons: [
    'elle voulait que tu l\'aides à la cuisine (éplucher, remuer, goûter)',
    'elle t\'a demandé de descendre ou de monter quelque chose',
    'elle cherchait son téléphone ou ses lunettes, et c\'était évidemment à toi de les retrouver',
    'elle voulait que tu plies le linge avec elle',
    'elle voulait te parler d\'une visite prévue ou d\'un repas de famille',
    'elle t\'a envoyée chercher du pain ou un truc à l\'épicerie d\'à côté',
    'elle voulait que tu goûtes la sauce et dises si elle manquait de sel',
  ] },
  { id: 'pere', re: /\b(?:mon pere|baba|papa)\b/, raisons: [
    'il voulait que tu l\'aides avec son téléphone (un truc sur WhatsApp qu\'il ne comprenait pas)',
    'il t\'a demandé de lui préparer un café, puis de lui chercher un document',
    'il voulait te parler de quelque chose pour la fac ou pour la maison',
  ] },
  { id: 'soeur', re: /\b(?:ma soeur|sarah|ines)\b/, raisons: [
    '{nom} voulait de l\'aide pour un devoir',
    '{nom} te cherchait pour te montrer un truc ou se plaindre de l\'autre',
    '{nom} voulait emprunter quelque chose et ça a duré plus longtemps que prévu',
  ] },
  { id: 'famille', re: /\b(?:ma grand-?mere|jda|mamie|ma tante|tata|mon oncle)\b/, raisons: [
    'elle est passée à l\'improviste : il a fallu s\'asseoir avec elle, un thé, des nouvelles de tout le monde',
    'une visite de la famille : tu as dû aller dire bonjour et rester un peu',
  ] },
  { id: 'porte', re: /\b(?:on sonne|quelqu'un sonne|on frappe|quelqu'un frappe|la porte)\b/, raisons: [
    'c\'était une voisine qui venait emprunter quelque chose, et elle est restée discuter',
    'une visite imprévue à la maison : tu as dû accueillir tout le monde',
  ] },
  { id: 'neutre', re: null, raisons: [
    'un truc à faire à la maison qui s\'est éternisé',
    'tu as dû aider pour quelque chose à la maison (ménage, repas)',
    'tu as été happée par un truc de famille, rien de grave',
  ] },
];

function causeDe(phraseNorm) {
  for (const c of CAUSES) if (c.re && c.re.test(phraseNorm)) return c;
  return CAUSES[CAUSES.length - 1];
}

// « dans 10 min » : délai court annoncé (en minutes), sinon null.
function delaiCourtMin(phraseNorm) {
  const m = phraseNorm.match(/\bdans (\d{1,2}|un|une|deux|trois|cinq) ?(?:petites? )?(?:min|minutes?|quart d'heure)\b/);
  if (!m) return null;
  if (/quart/.test(m[0])) return 15;
  const mots = { un: 1, une: 1, deux: 2, trois: 3, cinq: 5 };
  return /^\d+$/.test(m[1]) ? Number(m[1]) : mots[m[1]];
}

// La phrase annonce-t-elle une petite absence (et pas une promesse pour plus tard) ?
function estAbsence(phraseNorm) {
  if (/\?\s*$/.test(phraseNorm) && /\b(tu|vous)\b/.test(phraseNorm)) return false;
  if (!(RETOUR.test(phraseNorm) || APPEL.test(phraseNorm))) return false;
  const court = delaiCourtMin(phraseNorm);
  const ancre = MOTIFS_TEMPS.some(({ re }) => re.test(phraseNorm));
  return !ancre || (court !== null && court <= 45);
}

// Les petites absences annoncées dans un texte qu'elle vient d'envoyer (une seule à la fois).
// opts : { r } (hasard injectable). Renvoie [{ texte, at, echeance, absence: true, cause, raison, oubli: false, fait: false }].
function detecterAbsence(texte, now = Date.now(), opts = {}) {
  const r = opts.r || Math.random;
  for (const phrase of decouperPhrases(texte)) {
    const n = norm(phrase);
    if (!estAbsence(n)) continue;
    const cause = causeDe(n);
    const court = delaiCourtMin(n);
    const minutes = court !== null && court > 10 ? court + H.entre(2, 8, r) : H.entre(ABSENCE_MIN[0], ABSENCE_MIN[1], r);
    let raison = cause.raisons[Math.floor(r() * cause.raisons.length)];
    if (cause.id === 'soeur') raison = raison.replace('{nom}', /\bsarah\b/.test(n) ? 'Sarah' : /\bines\b/.test(n) ? 'Inès' : (r() < 0.5 ? 'Sarah' : 'Inès'));
    return [{ texte: phrase.slice(0, 140), at: now, echeance: now + minutes * MIN, absence: true, cause: cause.id, raison, oubli: false, fait: false }];
  }
  return [];
}

// L'absence en cours (annoncée, pas encore revenue), ou null : pendant ce temps elle ne lit pas et n'écrit pas.
function absenceEnCours(promesses, now = Date.now()) {
  return (promesses || []).find((p) => p.absence && !p.fait && p.echeance > now) || null;
}

// Où elle place la promesse dans le temps (du plus précis au plus vague).
const MOTIFS_TEMPS = [
  { re: /\bdans (\d{1,2}|un|une|deux|trois|quelques) ?(?:petites? )?(min|minutes?|h|heures?|quart d'heure)\b/, calcul: (m) => {
    const mots = { un: 1, une: 1, deux: 2, trois: 3, quelques: 10 };
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : mots[m[1]];
    if (/quart/.test(m[2])) return { delta: 15 };
    return { delta: /^h|heure/.test(m[2]) ? n * 60 : n };
  } },
  { re: /\bdemain soir\b/, calcul: () => ({ cible: 20 * 60 + 30, jours: 1 }) },
  { re: /\bdemain matin\b/, calcul: () => ({ cible: 10 * 60, jours: 1 }) },
  { re: /\bdemain\b/, calcul: () => ({ cible: 18 * 60, jours: 1 }) },
  { re: /\bce soir\b/, calcul: () => ({ cible: 20 * 60 + 30, jours: 0 }) },
  { re: /\b(?:ce midi|a midi)\b/, calcul: () => ({ cible: 12 * 60 + 30, jours: 0 }) },
  { re: /\bapres (?:le |la |les |mon |ma |mes |l')?(?:cours|td|repas|manger|diner|dejeuner|douche|priere|expose|examen|exam|devoirs?|revisions?|sport|danse|famille|avoir)/, calcul: () => ({ delta: 100 }) },
  { re: /\b(?:quand je (?:rentre|finis|sors|reviens|suis (?:rentree|libre|dispo))|en rentrant)\b/, calcul: () => ({ delta: 120 }) },
  { re: /\btout a l'heure\b/, calcul: () => ({ delta: 120 }) },
  { re: /\bplus tard\b/, calcul: () => ({ delta: 180 }) },
  { re: /\bdans la soiree\b/, calcul: () => ({ cible: 20 * 60, jours: 0 }) },
  { re: /\bapres\b/, calcul: () => ({ delta: 100 }) },
];

function decouperPhrases(texte) {
  return String(texte || '').split(/(?<=[.!?…])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}

// Échéance (en ms) d'une phrase, ou null si aucune indication de moment.
function echeanceDe(phraseNorm, now, fuseau, r = Math.random) {
  for (const { re, calcul } of MOTIFS_TEMPS) {
    const m = phraseNorm.match(re);
    if (!m) continue;
    const c = calcul(m);
    let minutes;
    if (c.delta !== undefined) {
      minutes = c.delta;
    } else {
      const maintenant = H.heureLocale(new Date(now), fuseau).minutes;
      minutes = c.cible - maintenant + c.jours * 1440;
      if (minutes < 30) minutes = c.jours === 0 ? 45 : 60; // « ce soir » dit à 21 h : elle écrit dans la foulée, pas dans le passé
    }
    return now + Math.round((minutes + H.entre(0, 20, r)) * MIN);
  }
  return null;
}

// Les promesses contenues dans un texte qu'elle vient d'envoyer.
// opts : { fuseau, r }. Renvoie [{ texte, at, echeance, oubli, fait: false }].
function detecter(texte, now = Date.now(), opts = {}) {
  const r = opts.r || Math.random;
  const trouvees = [];
  for (const phrase of decouperPhrases(texte)) {
    const n = norm(phrase);
    if (!PROMESSE.test(n)) continue;
    if (estAbsence(n)) continue; // petite absence : gérée par detecterAbsence (avec sa raison)
    if (/\?\s*$/.test(n) && /\b(tu|vous)\b/.test(n)) continue; // une question (« tu me racontes ça ce soir ? ») n'est pas une promesse
    let echeance = echeanceDe(n, now, opts.fuseau, r);
    if (echeance === null) continue; // pas de moment annoncé : trop vague pour en faire une promesse à tenir
    const oubli = r() < OUBLI_PROBA;
    if (oubli) echeance += H.entre(60, 240, r) * MIN;
    trouvees.push({ texte: phrase.slice(0, 140), at: now, echeance, oubli, fait: false });
  }
  return trouvees.slice(0, 2);
}

// Ajoute les nouvelles promesses sans doublon, oublie ce qui est fini ou trop ancien.
function fusionner(anciennes, nouvelles, now = Date.now()) {
  const gardees = (anciennes || []).filter((p) => !p.fait && now - p.echeance < (p.absence ? ABSENCE_EXPIRE_MIN * MIN : EXPIRE_H * 3600000));
  for (const n of nouvelles || []) {
    if (n.absence && gardees.some((o) => o.absence && !o.fait)) continue; // une seule absence à la fois
    const cle = norm(n.texte).replace(/[^a-z0-9 ]/g, '').trim();
    const doublon = gardees.some((o) => {
      const k = norm(o.texte).replace(/[^a-z0-9 ]/g, '').trim();
      return k === cle || (Math.abs(o.at - n.at) < 20 * MIN && Math.abs(o.echeance - n.echeance) < 45 * MIN);
    });
    if (!doublon) gardees.push(n);
  }
  return gardees.sort((a, b) => a.echeance - b.echeance).slice(0, MAX_PROMESSES);
}

// La première promesse à tenir maintenant (échue et pas encore faite).
function due(promesses, now = Date.now()) {
  return (promesses || []).find((p) => !p.fait && p.echeance <= now && now - p.echeance < (p.absence ? ABSENCE_EXPIRE_MIN * MIN : EXPIRE_H * 3600000)) || null;
}

function retardMinutes(p, now = Date.now()) {
  return Math.max(0, Math.round((now - p.echeance) / MIN));
}

// Consigne du message spontané qui tient (ou s'excuse de ne pas avoir tenu) la promesse.
function consigne(p, moi = 'lui', now = Date.now()) {
  const retard = retardMinutes(p, now);
  if (p.absence) {
    const parti = H.formatDuree(Math.max(60, Math.round((now - p.at) / 1000)));
    return `Tu t'étais absentée en lui écrivant : « ${p.texte} ». Tu reviens après ${parti}. Ce qui s'est passé : ${p.raison}. ` +
      'Dis-le-lui en une phrase courte, comme quelqu\'un qui revient sur WhatsApp (« me revoilà », « pardon, j\'étais partie… »), sans réciter la raison mot pour mot, puis reprends la discussion là où vous l\'aviez laissée. ' +
      'Si la conversation a avancé sans toi ou contredit cette raison, adapte-toi. Si tu es déjà revenue depuis dans la conversation, réponds [RIEN].';
  }
  const base = `Tu avais écrit à ${moi} : « ${p.texte} ».`;
  const suite = ' Appuie-toi sur TA JOURNÉE et TA VIE EN CE MOMENT, et sur ce que la conversation laisse entendre ; n\'invente rien de précis qui les contredirait. Si tu l\'as déjà fait depuis dans la conversation, réponds [RIEN].';
  if (retard > RETARD_EXCUSE_MIN || p.oubli) {
    return `${base} Tu l'avais complètement zappé et tu t'en souviens seulement maintenant (${H.formatDuree(retard * 60)} de retard). ` +
      'Excuse-toi simplement en quelques mots (« ah pardon j\'avais zappé », « excuse-moi, ça m\'est sorti de la tête »), sans fausse raison détaillée ni dramatisation, puis tiens ta promesse tout de suite.' + suite;
  }
  return `${base} C'est le moment : tiens ta promesse maintenant, comme quelqu'un qui n'a pas oublié (écris ce que tu avais dit que tu écrirais, ou raconte ce que tu avais dit que tu raconterais).` + suite;
}

// Bloc du prompt : ses promesses en cours. Utile si c'est LUI qui y revient (« alors, tu me racontes ? »).
function bloc(promesses, now = Date.now()) {
  const lignes = [];
  for (const p of promesses || []) {
    if (p.fait || now - p.echeance > EXPIRE_H * 3600000) continue;
    const reste = Math.round((p.echeance - now) / MIN);
    if (p.absence) {
      lignes.push(reste > 0
        ? `- Tu t'es absentée (« ${p.texte} ») : tu n'es pas encore revenue. S'il t'écrit maintenant, c'est que tu reviens : dis ce qui t'a retenue (${p.raison}).`
        : `- Tu t'étais absentée (« ${p.texte} ») et tu es de retour : dis en une phrase ce qui t'a retenue (${p.raison}).`);
      continue;
    }
    const quand = reste > 90 ? `pour dans environ ${Math.round(reste / 60)} h`
      : reste > 5 ? `pour dans environ ${reste} min`
      : reste >= -5 ? 'c\'est maintenant'
      : `déjà en retard de ${H.formatDuree(-reste * 60)}`;
    lignes.push(`- « ${p.texte} » (${quand})`);
  }
  if (!lignes.length) return '';
  return [
    '=== CE QUE TU AS PROMIS (c\'est toi qui l\'as dit : tu tiens parole, ou tu t\'excuses) ===',
    ...lignes,
    'S\'il y revient, tiens ta promesse maintenant ou, si c\'est vraiment pas le moment, dis-lui quand. Si elle est en retard, excuse-toi en une phrase. Quand tu la tiens dans ta réponse, termine ton message par la balise [TENUE] (invisible pour lui).',
    'Ne promets pas à la légère : n\'annonce un moment précis (« ce soir », « après le cours ») que si tu comptes vraiment le faire.',
  ].join('\n');
}

// [TENUE] : l'IA indique qu'elle vient de tenir sa promesse dans la conversation.
function extraireTenue(texte) {
  let tenue = false;
  const sans = String(texte || '').replace(/\[TENUE\]/gi, () => { tenue = true; return ''; });
  return { texte: sans.trim(), tenue };
}

// Marque comme faites les promesses échues (ou presque) quand elle vient de les tenir dans une réponse.
function marquerTenues(promesses, now = Date.now()) {
  let n = 0;
  for (const p of promesses || []) {
    if (!p.fait && p.echeance - now < 90 * MIN) { p.fait = true; n++; }
  }
  return n;
}

module.exports = {
  PROMESSE, RETARD_EXCUSE_MIN, OUBLI_PROBA,
  ABSENCE_MIN, ABSENCE_EXPIRE_MIN, estAbsence, detecterAbsence, absenceEnCours, causeDe,
  detecter, fusionner, due, retardMinutes, consigne, bloc, extraireTenue, marquerTenues,
};
