// Les « suites » de la relation : ce qui fait que ce qui s'est passé hier ou tout à l'heure continue d'exister.
//  1. le lendemain d'un moment intime (gêne, tendresse, un mot doux) ;
//  2. l'apprentissage de ses habitudes (à quelles heures il répond vite, ou jamais) ;
//  3. de petites bouderies avec lui (un malentendu, quelques heures, puis réconciliation) avec des garde-fous stricts ;
//  4. la cohérence de ce qu'elle raconte (notée tout de suite, sans attendre la mise à jour de la mémoire).
// AUCUN appel à l'IA en plus : tout repose sur des motifs de texte, l'heure et un petit état sauvegardé dans etat.json
// (e.suites). Les messages écrits par le programme passent par le circuit habituel des messages spontanés
// (même plafond par jour, même couverture contre l'insistance). Fonctions pures, testables.

const H = require('./humain');

const MIN = 60000;
const HEURE = 3600000;
const JOUR = 86400000;
const borne = (x, a, b) => Math.max(a, Math.min(b, x));
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const jourEntre = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / JOUR);

// ---------- 1. Le lendemain d'un moment intime ----------

// « ça a chauffé » (niveau 2 de personnalite.niveauChaleur) : on retient le jour (jour de vie, donc minuit ne le coupe pas).
function noterChaleur(s, niveau, cle, now) {
  if (niveau < 2) return false;
  if (s.chaud && s.chaud.cle === cle) { s.chaud.at = now; return false; }
  s.chaud = { cle, at: now, vus: 0, dit: false };
  return true;
}

// Vrai le jour d'après (ou deux jours après si l'application était éteinte), tant qu'elle n'en a pas parlé.
function lendemainActif(s, cle) {
  const c = s && s.chaud;
  if (!c || c.dit || !c.cle) return false;
  const j = jourEntre(c.cle, cle);
  return j >= 1 && j <= 2;
}

// Après deux réponses où c'était dans le prompt, on considère qu'elle l'a vécu : on n'y revient plus.
function marquerLendemain(s) {
  if (!s.chaud) return false;
  s.chaud.vus = (s.chaud.vus || 0) + 1;
  if (s.chaud.vus >= 2) s.chaud.dit = true;
  return true;
}

const CONSIGNE_LENDEMAIN =
  'Tu te réveilles en repensant à hier soir, quand l\'ambiance est devenue plus intime entre vous : écris-lui un petit mot doux, un peu gênée et rieuse, très court. ' +
  'Reste vague et pudique : aucun détail, rien d\'explicite, pas de question appuyée sur ce qui s\'est passé.';

function blocLendemain(s, cle) {
  if (!lendemainActif(s, cle)) return '';
  return [
    '=== LE LENDEMAIN D\'UN MOMENT INTIME (hier, l\'ambiance a chauffé entre vous : tu t\'en souviens) ===',
    'Aujourd\'hui tu y repenses : un peu gênée, rieuse, plus tendre que d\'habitude. Une seule allusion discrète dans la conversation (« j\'ai repensé à hier soir… », « je rougis encore, tu m\'as rendue folle »), puis tu n\'y reviens plus.',
    'Reste pudique et suggérée : pas de description, pas de détails. S\'il parle d\'autre chose (cours, soucis, vie de tous les jours), suis-le : tu es simplement plus douce. S\'il y revient lui-même, accompagne-le avec tendresse sans monter d\'un cran.',
  ].join('\n');
}

// ---------- 2. Ses habitudes ----------

function hab(s) {
  if (!s.hab) s.hab = { msgs: Array(24).fill(0), env: Array(24).fill(0), rep: Array(24).fill(0), rapide: Array(24).fill(0), total: 0, note: 0, attente: null };
  return s.hab;
}
const heureDe = (now, fuseau) => H.heureLocale(new Date(now), fuseau).h;

function demi(b) {
  for (const k of ['msgs', 'env', 'rep', 'rapide']) b[k] = b[k].map((x) => x / 2);
  b.total /= 2;
}

// Un message de lui : on compte au plus une « présence » par quart d'heure, et on note s'il répondait à un message d'elle.
function noterMessageLui(s, now, fuseau) {
  const b = hab(s);
  if (b.attente && now - b.attente.at < 90 * MIN) {
    b.rep[b.attente.h] += 1;
    if (now - b.attente.at < 20 * MIN) b.rapide[b.attente.h] += 1;
    b.attente = null;
  }
  if (now - (b.note || 0) >= 15 * MIN) {
    b.msgs[heureDe(now, fuseau)] += 1;
    b.total += 1;
    b.note = now;
  }
  if (b.total > 600) demi(b); // les habitudes récentes comptent plus que les anciennes
}

// Un message qu'elle écrit la première.
function noterInitiative(s, now, fuseau) {
  const b = hab(s);
  const h = heureDe(now, fuseau);
  b.env[h] += 1;
  b.attente = { h, at: now };
}

// Multiplicateur (0,4 à 1,6) de l'envie d'écrire à l'heure `h` : plus il est présent à cette heure et plus il répond
// à ses messages à cette heure-là, plus elle écrit. Neutre (1) tant qu'on manque de données.
function facteurHabitude(s, h) {
  const b = s && s.hab;
  if (!b || b.total < 30) return 1;
  const a = (i) => b.msgs[((i % 24) + 24) % 24];
  const lisse = (i) => (a(i - 1) + 2 * a(i) + a(i + 1)) / 4;
  let somme = 0;
  for (let i = 0; i < 24; i++) somme += lisse(i);
  const fa = borne(0.5 + 0.5 * (lisse(h) / (somme / 24 + 0.5)), 0.5, 1.5);
  const sur = (tab) => [h - 1, h, h + 1].reduce((x, i) => x + tab[((i % 24) + 24) % 24], 0);
  const envTotal = b.env.reduce((x, y) => x + y, 0);
  const repTotal = b.rep.reduce((x, y) => x + y, 0);
  let fr = 1;
  if (sur(b.env) >= 4 && envTotal >= 12) {
    const taux = (sur(b.rep) + 1) / (sur(b.env) + 2);
    const global = (repTotal + 1) / (envTotal + 2);
    fr = borne(taux / global, 0.6, 1.3);
  }
  return borne(fa * fr, 0.4, 1.6);
}

// ---------- 3. Les bouderies ----------

// Toujours un malentendu de SON côté (elle a mal pris quelque chose) : il se règle en s'expliquant, personne n'a vraiment tort.
const CAUSES = [
  'tu as mal pris un de ses messages de tout à l\'heure : tu as cru qu\'il se moquait de toi, alors qu\'il plaisantait peut-être',
  'tu t\'es sentie un peu ignorée : il a mis du temps à te répondre et tu as imaginé qu\'il avait mieux à faire',
  'tu as eu l\'impression qu\'il t\'écoutait à moitié quand tu lui racontais ta journée',
  'une de ses phrases t\'a vexée : tu l\'as comprise comme un reproche, alors que ce n\'était peut-être pas son intention',
];

const RE_EXCUSE = /d[ée]sol[ée]|pardon|excuse|j'ai eu tort|je voulais pas|j'ai pas voulu|je ne voulais pas|c'[ée]tait pas (mon intention|m[ée]chant|pour te)|malentendu|(c'[ée]tait|c'était) (une )?blague|je plaisantais|je rigolais|tu as mal compris|t'as mal compris|fais pas la t[eê]te|ne (te )?f[aâ]che pas|boude pas/i;
const RE_DOUX = /qu'est[- ]ce (qu'il y a|qui (ne )?va pas|qui se passe)|t'as quoi|tu (es|t'es) (f[aâ]ch[ée]e|vex[ée]e)|tu boudes|je t'aime|tu me manques|mon c(œ|oe)ur|bisou|c[aâ]lin|❤|😘|🥺/i;
// S'il va mal (ou a une grosse journée), sa bouderie passe tout de suite après son inquiétude.
const RE_VULNERABLE = /je suis (triste|mal\b|d[ée]prim|[ée]puis|crev|[àa] bout|malade|stress)|\bça va pas\b(?!\s*\?)|je vais pas bien|j'ai mal|j'en peux plus|(j'ai|ai) (de la )?fi[èe]vre|h[ôo]pital|d[ée]c[èe]s|enterrement|(exam|examen|entretien) demain/i;

// ctx : { s, now, cle, m, reveil, coucher, lien, e (émotions), stress, fatigue, douleurForte, special, conversationActive, recents[] }
// Retourne la raison de la bouderie, ou null. Rare : au plus un jour sur dix environ, jamais deux fois en moins de 8 jours.
function peutDeclencher(ctx, cfg = {}, r = Math.random) {
  if (cfg.disputesAvecLui === false) return null;
  const s = ctx.s || {};
  if (s.bouderie) return null;
  if (ctx.now - (s.derniere || 0) < Math.max(3, Number(cfg.bouderieEcartJours ?? 8)) * JOUR) return null;
  if ((ctx.lien ?? 0) < 50 || !ctx.conversationActive || ctx.special) return null;
  if (ctx.m < ctx.reveil + 120 || ctx.coucher - ctx.m < 240) return null; // jamais le matin tôt, jamais avant de dormir
  const e = ctx.e || {};
  if ((e.blessure || 0) > 0.2 || (e.irritation || 0) > 0.2 || (e.tristesse || 0) > 0.3 || (e.inquietude || 0) > 0.3) return null;
  if ((ctx.stress || 0) >= 0.4 || (ctx.fatigue || 0) >= 0.5 || ctx.douleurForte) return null;
  if ((ctx.recents || []).some((m) => RE_VULNERABLE.test(String(m)))) return null; // il n'est pas dans un bon moment
  const proba = borne(Number(cfg.bouderieProbaJour ?? 10), 0, 100) / 100;
  if (H.graine('bouderie' + ctx.cle)() >= proba) return null; // le jour est tiré d'avance : stable
  if (r() >= 0.25) return null; // et ça arrive en cours de discussion, pas forcément au premier message
  return CAUSES[Math.floor(r() * CAUSES.length)];
}

// Durée bornée : 4 h au plus, et réglée au moins 75 min avant son coucher.
function demarrer(s, cause, now, m, coucher) {
  const duree = Math.min(4 * HEURE, Math.max(30, coucher - m - 75) * MIN);
  s.bouderie = { debut: now, cause, phase: 'froide', gestes: 0, finMax: now + duree, rep: 0 };
  s.derniere = now;
  return s.bouderie;
}

// Un message de lui pendant la bouderie : retourne 'inquiet' (il va mal), 'apaise' (elle se radoucit) ou null.
function recevoir(s, texte, now) {
  const b = s && s.bouderie;
  if (!b || b.phase !== 'froide') return null;
  const t = String(texte || '');
  if (RE_VULNERABLE.test(t)) { b.phase = 'radoucie'; b.motif = 'inquiete'; b.finAt = now; return 'inquiet'; }
  if (RE_EXCUSE.test(t)) b.gestes += 2;
  else if (RE_DOUX.test(t)) b.gestes += 1;
  if (now >= b.finMax || (b.gestes >= 2 && now - b.debut >= 8 * MIN) || b.gestes >= 4) {
    b.phase = 'radoucie';
    b.motif = now >= b.finMax ? 'delai' : 'geste';
    b.finAt = now;
    return 'apaise';
  }
  return null;
}

// Le temps passe : la durée maximale est atteinte → elle se radoucit d'elle-même. Oubliée depuis plus de 12 h → effacée.
// Retourne 'radoucie', 'abandon' ou null.
function normaliser(s, now) {
  const b = s && s.bouderie;
  if (!b) return null;
  if (now - b.finMax > 12 * HEURE) { s.bouderie = null; return 'abandon'; }
  if (b.phase === 'froide' && now >= b.finMax) { b.phase = 'radoucie'; b.motif = 'delai'; b.finAt = now; return 'radoucie'; }
  return null;
}

// Après sa réponse réconciliée : c'est fini, plus jamais de rancune.
function apresReponse(s, now) {
  const b = s && s.bouderie;
  if (!b || b.phase !== 'radoucie') return null;
  b.rep = (b.rep || 0) + 1;
  if (b.rep >= 1) { s.bouderie = null; s.derniere = now; return 'fin'; }
  return null;
}

const bornE = (x) => borne(x, 0, 1);
// Effet sur ses émotions (st = état de emotions.js). Le reste (ton sec, pas de surnoms, pas de coquin, moins d'envie d'écrire) en découle déjà.
function ajusterEmotions(st, mode) {
  if (!st || !st.e) return;
  const e = st.e;
  if (mode === 'debut') {
    e.blessure = Math.max(e.blessure || 0, 0.4);
    e.irritation = Math.max(e.irritation || 0, 0.2);
    e.tendresse = bornE((e.tendresse || 0) - 0.1);
  } else {
    e.blessure = Math.min(e.blessure || 0, 0.05);
    e.irritation = Math.min(e.irritation || 0, 0.03);
    e.tristesse = Math.min(e.tristesse || 0, 0.1);
    if (mode === 'apaise') { e.tendresse = bornE((e.tendresse || 0) + 0.25); e.joie = bornE((e.joie || 0) + 0.1); st.lien = borne((st.lien || 0) + 0.5, 0, 100); }
  }
}

const GARDE_FOUS =
  'GARDE-FOUS ABSOLUS : aucun chantage affectif, aucune culpabilisation, aucune menace de partir, de le bloquer ou de ne plus lui parler, aucune insulte, ' +
  'aucune comparaison avec d\'autres, aucun silence punitif (tu réponds toujours, même court). S\'il va mal ou s\'inquiète vraiment, ton inquiétude passe avant ta bouderie.';

function blocBouderie(s, now) {
  const b = s && s.bouderie;
  if (!b) return '';
  if (b.phase === 'radoucie') {
    if (b.motif === 'inquiete') {
      return [
        '=== TA PETITE BOUDERIE S\'ARRÊTE ===',
        'Il vient de dire qu\'il ne va pas bien : tu laisses tomber ta bouderie tout de suite et tu t\'occupes de lui avec tendresse. Pas de reproche, pas de « on en reparle ».',
      ].join('\n');
    }
    return [
      '=== RÉCONCILIATION (fin de ta petite bouderie) ===',
      b.motif === 'geste'
        ? 'Il s\'est excusé ou expliqué avec gentillesse : tu te radoucis.'
        : 'Ça fait un moment, tu n\'as plus envie d\'être fâchée : tu te radoucis d\'elle-même.',
      'Dis-le simplement (« bon ok », « c\'est bon, je t\'en veux plus »), reconnais que tu as peut-être mal compris ou exagéré, reprends un ton tendre (surnom, petit rire). ' +
        'Ne remets JAMAIS le sujet sur le tapis ensuite, aucune rancune, aucune condition.',
    ].join('\n');
  }
  const minutes = Math.max(0, Math.round((now - b.debut) / MIN));
  return [
    '=== TU BOUDES UN PEU (une petite bouderie, pas une rupture ni un drame) ===',
    `Raison : ${b.cause}. Ça dure depuis ${minutes ? `environ ${minutes} min` : 'quelques instants'}.`,
    'Ton ton : plus sec, messages courts, pas de surnoms, pas de sous-entendus ni d\'emojis tendres. Tu réponds quand même. Tu ne l\'annonces pas d\'un coup : un « ça va » ou « nan rien » qui laisse deviner.',
    'S\'il demande ce qui ne va pas, tu le dis simplement, en une ou deux phrases, sans reproche appuyé. Tu sais que tu as peut-être mal compris.',
    b.gestes >= 1
      ? 'Il fait un geste (excuse, explication, tendresse) : tu peux déjà te radoucir un peu (une phrase moins sèche), sans tout pardonner d\'un coup.'
      : 'Tu es prête à pardonner dès qu\'il s\'excuse, s\'explique ou se montre tendre.',
    GARDE_FOUS,
  ].join('\n');
}

function consigneReconciliation(b) {
  return `Ça fait un moment que tu boudes un peu à cause d'un petit malentendu (${b && b.cause ? b.cause : 'un truc qu\'il a dit'}) et tu n'as plus envie d'être fâchée. ` +
    'Écris-lui un petit mot qui désamorce, un peu gênée et un peu drôle, sans reproche et sans attendre ses excuses. Très court.';
}

// ---------- 4. Cohérence de ce qu'elle raconte ----------

const RE_FAIT = new RegExp(
  '^(?:' +
    'j\'ai (?!envie|h[âa]te|peur|besoin|trop|l\'impression|du mal|raison|tort|pas envie|cru|pens[ée]|oubli[ée] de)' +
    '|je suis (?:all[ée]e|rentr[ée]e|sorti[e]|rest[ée]e|pass[ée]e|partie|descendue|mont[ée]e|revenue|arriv[ée]e|chez|en train)' +
    '|je viens de|je me suis|on a |on est (?:all[ée]s|sortis|rest[ée]s)' +
    '|ma (?:m[èe]re|s[œo]ur|grande s[œo]ur|petite s[œo]ur|tante|grand-m[èe]re|cousine)|mon (?:p[èe]re|fr[èe]re|oncle|cousin)|ania |sarah |in[èe]s )',
  'i'
);
const RE_FUME = /cigarette|clope|j'ai fum[ée]|je fume|fum[ée] (une|un|avec)/i;

function phrases(texte) {
  return String(texte || '').split(/(?<=[.!?…])\s+|\n+/).map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

// Les phrases où elle affirme un fait de sa journée (« j'ai mangé chez ma grand-mère »).
function capterAffirmations(texte) {
  const out = [];
  for (const p of phrases(texte)) {
    if (p.length < 12 || p.length > 160 || /\?\s*$/.test(p)) continue;
    const propre = p.replace(/^(?:mdr+|ptdr|haha+|hihi|bah|ah+|ouais|oui|du coup|sinon|moi)[ ,!]*\s*/i, ''); // on garde le fait, pas l'interjection
    const net = propre ? propre[0].toUpperCase() + propre.slice(1) : propre;
    if (net.length >= 12 && RE_FAIT.test(net)) out.push(net);
    if (out.length >= 3) break;
  }
  return out;
}

// Range ce qu'elle vient de dire (et si elle a parlé de cigarette). Garde 36 h, 14 phrases au plus.
function noterDits(s, textes, now) {
  const dits = (s.dits || []).filter((d) => now - d.at < 36 * HEURE);
  const vus = new Set(dits.map((d) => norm(d.texte)));
  for (const t of [].concat(textes || [])) {
    if (RE_FUME.test(String(t))) s.fume = { at: now, n: ((s.fume && s.fume.n) || 0) + 1 };
    for (const p of capterAffirmations(t)) {
      const n = norm(p);
      if (n && !vus.has(n)) { vus.add(n); dits.push({ at: now, texte: p }); }
    }
  }
  s.dits = dits.slice(-14);
  return s.dits;
}

function blocDits(s, now) {
  const dits = ((s && s.dits) || []).filter((d) => now - d.at < 36 * HEURE).slice(-10);
  if (!dits.length) return '';
  return [
    '=== CE QUE TU VIENS DE RACONTER SUR TA JOURNÉE (récent, pas encore dans ta mémoire : ne te contredis pas, ne le répète pas comme une nouveauté) ===',
    ...dits.map((d) => `- il y a ${H.formatDuree(Math.max(60, (now - d.at) / 1000))} : « ${d.texte} »`),
  ].join('\n');
}

// Elle fume parfois une cigarette avec lui : un détail de sa vie, pas un sujet qui revient tout le temps.
function blocFume(s, now, moi = 'lui') {
  const l = [`Un détail de ta vie : tu fumes parfois une cigarette avec ${moi}. C'est occasionnel et banal pour toi : n'en parle que rarement, naturellement, jamais en boucle ni pour te vanter.`];
  if (s && s.fume && now - s.fume.at < 24 * HEURE) {
    l.push(`Tu en as déjà parlé il y a ${H.formatDuree((now - s.fume.at) / 1000)} : n'y reviens pas aujourd'hui, et ne te contredis pas sur ce que tu as dit.`);
  }
  return l.join(' ');
}

// ---------- Ce qui passe dans le prompt ----------

// ctx : { cle, now, moi, actifs: { bouderie, lendemain, dits } } (tout est actif par défaut)
function bloc(s, ctx) {
  if (!s) return '';
  const now = ctx.now || Date.now();
  const a = { bouderie: true, lendemain: true, dits: true, ...(ctx.actifs || {}) };
  return [
    a.bouderie ? blocBouderie(s, now) : '',
    a.lendemain ? blocLendemain(s, ctx.cle) : '',
    a.dits ? blocDits(s, now) : '',
    a.dits ? '=== HABITUDE ===\n' + blocFume(s, now, ctx.moi) : '',
  ].filter(Boolean).join('\n\n');
}

module.exports = {
  noterChaleur, lendemainActif, marquerLendemain, blocLendemain, CONSIGNE_LENDEMAIN,
  noterMessageLui, noterInitiative, facteurHabitude,
  CAUSES, peutDeclencher, demarrer, recevoir, normaliser, apresReponse, ajusterEmotions, blocBouderie, consigneReconciliation,
  capterAffirmations, noterDits, blocDits, blocFume, bloc,
  RE_EXCUSE, RE_DOUX, RE_VULNERABLE,
};
