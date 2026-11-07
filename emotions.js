// La vie intérieure de Lina : des émotions qui durent, qui réagissent à ce qu'Ahmed dit ou ne dit pas,
// qui s'apaisent avec le temps, et un lien affectif qui grandit lentement.
// Attention : c'est une SIMULATION d'état intérieur (un modèle qui influence le ton du personnage),
// pas une vraie sensation. Fonctions pures sur un objet d'état simple, sauvegardé dans etat.json.

const H = require('./humain');

const HEURE = 3600000;
const borne = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));

// niveau de base (là où elle revient seule) et demi-vie en heures
const PARAM = {
  joie: { base: 0.35, demi: 6 },
  tendresse: { base: 0.4, demi: 10 },
  tristesse: { base: 0.05, demi: 8 },
  irritation: { base: 0.03, demi: 3 },
  inquietude: { base: 0.05, demi: 5 },
  manque: { base: 0.05, demi: 12 },
  fierte: { base: 0.05, demi: 6 },
  jalousie: { base: 0, demi: 4 },
  blessure: { base: 0, demi: 20 }, // la douleur morale met du temps à passer
  deception: { base: 0, demi: 8 }, // plan annulé, promesse oubliée, réponses sèches : moins fort qu'une blessure
  gene: { base: 0, demi: 1.5 }, // timidité, embarras après un compliment : passe vite
  excitation: { base: 0.05, demi: 3 }, // l'emballement d'une bonne nouvelle ou d'un projet
  emue: { base: 0.02, demi: 3 }, // touchée, la gorge serrée dans le bon sens : une parole sincère, un souvenir, quelqu'un qui l'écoute
  nostalgie: { base: 0.04, demi: 6 }, // l'esprit part vers un souvenir ou vers des gens qui lui manquent
  stress: { base: 0.04, demi: 5 }, // une échéance ou une inquiétude de fond (examen, avenir, un proche)
};

function nouvelEtat(now = Date.now()) {
  const e = {};
  for (const [nom, p] of Object.entries(PARAM)) e[nom] = p.base;
  return { maj: now, e, lien: 40, raisons: [] };
}

function ajouter(st, nom, delta) {
  st.e[nom] = borne((st.e[nom] ?? 0) + delta);
}

function noter(st, texte, now) {
  st.raisons.push({ at: now, texte });
  if (st.raisons.length > 4) st.raisons.shift();
}

// Le temps passe : les émotions reviennent doucement vers leur base ; le silence fait naître le manque.
function evoluer(st, now = Date.now(), ctx = {}) {
  const dt = Math.max(0, (now - (st.maj || now)) / HEURE);
  if (dt > 0) {
    for (const [nom, p] of Object.entries(PARAM)) {
      const v = st.e[nom] ?? p.base;
      st.e[nom] = p.base + (v - p.base) * Math.pow(0.5, dt / p.demi);
    }
    // Le lien s'effrite très lentement si on ne se parle plus pendant des jours.
    if (ctx.dernierUser && (now - ctx.dernierUser) / HEURE > 72) st.lien = borne(st.lien - dt * 0.02, 10, 100);
  }
  if (ctx.dernierUser && !ctx.dort) {
    // Le silence compte en heures d'éveil (le sommeil ne la fait pas languir) : dès 2 h, il commence à lui manquer.
    const silenceH = ctx.silenceEveilleH !== undefined ? ctx.silenceEveilleH : (now - ctx.dernierUser) / HEURE;
    const cible = PARAM.manque.base + Math.min(0.85, Math.max(0, silenceH - 2) * 0.08 * (0.5 + st.lien / 100));
    if (cible > st.e.manque) st.e.manque = cible;
    if (silenceH > 18 && st.lien > 55) st.e.inquietude = Math.max(st.e.inquietude, 0.25);
  }
  st.maj = now;
  return st;
}

// Détection simple (mots-clés) de ce que le message d'Ahmed lui fait. Volontairement prudente :
// de petits effets, qui s'additionnent, plutôt que des réactions violentes sur un seul mot.
// Un mot-clé nié (« je t'aime pas », « pas fier de toi ») ne doit pas produire l'effet inverse.
const NEGATION = /\b(pas|jamais|plus|aucun|rien)\b|\bn'/i;
function nie(texte, m) {
  const avant = texte.slice(Math.max(0, m.index - 14), m.index);
  const apres = texte.slice(m.index + m[0].length, m.index + m[0].length + 9);
  return NEGATION.test(avant) || /^\s*(pas|plus|jamais)\b/i.test(apres);
}

const REGLES = [
  { re: /je t'?aime|mon amour|ma belle|ma chérie|ma puce|mon cœur|mon coeur|❤|😘|🥰|😍/i, raison: 'il t\'a dit un mot doux', effets: { tendresse: 0.22, joie: 0.18, blessure: -0.05, tristesse: -0.1, gene: 0.1 }, lien: 1.5, neg: true },
  { re: /\b(n7ebek|nhabek|n7bek|nehbek|wahchtek|ouahchtek|wa7chtek|tmanit|kandir|je te kiffe)\b/i, raison: 'il t\'a dit un mot doux dans votre mélange de langues', effets: { tendresse: 0.18, joie: 0.15, gene: 0.1 }, lien: 1 },
  { re: /tu me manques|tu m'as manqué/i, raison: 'il t\'a dit que tu lui manques', effets: { manque: -0.4, joie: 0.15, tendresse: 0.15 }, lien: 1 },
  { re: /t'es (trop |si |vraiment )?(belle|jolie|magnifique|géniale|incroyable|parfaite)|fier de toi|bravo|tu es (trop |si )?(belle|jolie)/i, raison: 'il t\'a fait un compliment', effets: { joie: 0.2, fierte: 0.15, gene: 0.18 }, lien: 0.5, neg: true },
  { re: /j'ai (réussi|gagné|décroché|eu mon|eu ma)|trop content|félicitations|bonne nouvelle/i, raison: 'une bonne nouvelle a été partagée', effets: { joie: 0.22, fierte: 0.2, excitation: 0.25 }, lien: 0.5, neg: true },
  { re: /\b(mdr+|ptdr+|lol|hahaha+|hihi+|mouahah+)\b|😂|🤣|😆/i, raison: 'il t\'a fait rire', effets: { joie: 0.07, excitation: 0.04, tristesse: -0.04 }, lien: 0.1 },
  { re: /\b(merci|chokran|shukran|tanemmirt)\b/i, raison: 'il t\'a remerciée', effets: { joie: 0.05, tendresse: 0.06, fierte: 0.05 }, lien: 0.2 },
  { re: /j'?(peux|pourrai|pourrais) (pas|plus)|je (peux|pourrai|pourrais) (pas|plus)|\b(annul|report)(e|er|é|ons|ons)\b|pas (dispo|le temps)|j'?ai (pas|plus) le temps|j'?ai oublié|ce soir c'est (mort|foutu)|on verra (une autre fois|plus tard)/i, raison: 'il a annulé ou oublié quelque chose', effets: { deception: 0.22, joie: -0.08 }, lien: -0.3 },
  { re: /ferme[- ]la|ta gueule|t'es (nulle|conne|bête|chiante|folle|insupportable)|tu me saoules|casse[- ]toi|laisse[- ]moi|j'en ai rien à (foutre|faire)|je te déteste|dégage/i, raison: 'il t\'a parlé durement', effets: { blessure: 0.35, tristesse: 0.25, irritation: 0.2, joie: -0.2, tendresse: -0.1 }, lien: -2 },
  { re: /je suis (triste|mal|déprimé|épuisé|crevé|à bout)|ça va pas|je vais pas bien|j'ai mal|j'suis mal|j'en peux plus/i, raison: 'il n\'a pas l\'air d\'aller bien', effets: { inquietude: 0.3, tendresse: 0.12, joie: -0.1, excitation: -0.1 }, lien: 0.5 },
  { re: /une (autre )?fille|mon ex\b|ma (collègue|cousine)|cette fille/i, raison: 'il a parlé d\'une autre fille', effets: { jalousie: 0.12 }, lien: 0 },
  { re: /ta (famille|s[œo]eur|m[èe]re|mere|maman|papa|grand[- ]m[èe]re)|tes (parents|s[œo]eurs)|ton (enfance|village|pass[ée])|comment (va|vont) (ta|ton|tes|sarah|in[èe]s|ania)|raconte[- ]moi (ton|ta|tes) /i, raison: 'il s\'intéresse à toi et aux tiens', effets: { tendresse: 0.1, nostalgie: 0.14, emue: 0.1, gene: 0.05 }, lien: 0.8 },
  { re: /je suis (là|la) pour toi|je serai toujours là|je te soutiens|tu peux tout me dire|compte sur moi|je (veux|voudrais) (te|t') (protéger|rendre heureuse)|je ne te laisserai pas/i, raison: 'il t\'a dit qu\'il est là pour toi', effets: { emue: 0.4, tendresse: 0.15, inquietude: -0.1, stress: -0.1 }, lien: 1, neg: true },
  { re: /un jour (on|nous)|quand on (se verra|sera|aura)|on ira|je t'emmènerai|notre avenir|voyager (ensemble|avec toi)|on se mariera/i, raison: 'il parle d\'un avenir avec toi', effets: { excitation: 0.14, emue: 0.12, joie: 0.1, stress: 0.03 }, lien: 0.6, neg: true },
  { re: /tu m'avais (dit|raconté|parlé)|je me souviens (que tu|de ce que tu)|j'ai pensé à ce que tu|comme tu me l'avais dit/i, raison: 'il se souvient de ce que tu lui as confié', effets: { emue: 0.18, tendresse: 0.12, nostalgie: 0.04 }, lien: 0.8 },
  { re: /désolé|pardon|excuse[- ]moi|je m'excuse|j'ai eu tort/i, raison: 'il s\'est excusé', effets: { blessure: -0.2, irritation: -0.2, tristesse: -0.1, tendresse: 0.1 }, lien: 0.5 },
];

function reagirMessage(st, texte, now = Date.now(), ctx = {}) {
  evoluer(st, now, ctx); // d'abord le temps écoulé depuis son dernier message
  const t = String(texte || '');
  if (st.e.manque >= 0.35) st.retrouvailles = { at: now, manque: st.e.manque }; // il revient après un long silence : il lui a manqué
  ajouter(st, 'manque', -0.5); // il est là : le manque retombe
  st.lien = borne(st.lien + 0.15, 0, 100);
  for (const r of REGLES) {
    const m = r.re.exec(t);
    if (!m) continue;
    if (r.neg && nie(t, m)) continue;
    for (const [nom, d] of Object.entries(r.effets)) ajouter(st, nom, d);
    st.lien = borne(st.lien + r.lien, 0, 100);
    noter(st, r.raison, now);
  }
  suivreTon(st, t, now, ctx);
  if (t.length > 220) { // il se confie longuement
    ajouter(st, 'tendresse', 0.06);
    st.lien = borne(st.lien + 0.5, 0, 100);
  }
  return st;
}

// Le ton de SES messages, comparé à sa façon d'écrire d'habitude : une série de réponses sèches (« ok », « hm »)
// alors qu'elle venait de se confier lui fait un petit pincement ; un message plein de « !!! » ou de lettres étirées l'emballe.
const SEC = /^\s*(ok|okay|oui|ouais|non|hm+|mh+|k|d'?accord|ah|aha|bon|si tu veux|comme tu veux|peu importe|whatever|\.+|👍)\s*[.!]*\s*$/i;
function suivreTon(st, t, now, ctx = {}) {
  const long = t.trim().length;
  st.moyLong = st.moyLong ? st.moyLong * 0.9 + long * 0.1 : long; // moyenne glissante de la longueur de ses messages
  if (SEC.test(t) && ctx.elleVientDeParlerLongtemps !== false) {
    st.secs = (st.secs || 0) + 1;
    if (st.secs === 3) { ajouter(st, 'deception', 0.14); noter(st, 'il répond très sèchement depuis un moment', now); }
  } else if (long >= 25) st.secs = 0;
  const maj = (t.match(/[A-ZÉÈÀ]/g) || []).length;
  const crie = (t.match(/!/g) || []).length >= 3 || (long >= 8 && maj / long > 0.6);
  const etire = /(.)\1{3,}/.test(t);
  if ((crie || etire) && !/ferme|gueule|saoul|déteste|dégage/i.test(t)) ajouter(st, 'excitation', 0.12);
}

// Comment elle se comporte à cause de ce qu'elle ressent : délai de réponse (> 1 = plus lente), nombre d'emojis.
function modulation(st) {
  const e = (st && st.e) || {};
  let delai = 1;
  delai += 1.0 * (e.blessure || 0) + 0.7 * (e.irritation || 0) + 0.4 * (e.deception || 0) + 0.3 * (e.tristesse || 0);
  delai -= 0.25 * Math.max(0, (e.excitation || 0) - 0.2) + 0.2 * Math.max(0, (e.tendresse || 0) - 0.5) + 0.25 * (e.inquietude || 0);
  return { delai: borne(delai, 0.6, 2.2) };
}

// Deux émotions qui tirent en sens inverse : un être humain n'est presque jamais « 100 % content ».
function melange(st) {
  const e = st.e || {};
  const paires = [
    ['tendresse', 'blessure', 'tu l\'aimes mais ce qu\'il a dit t\'a fait mal : tu es partagée, tendre et un peu sur la défensive'],
    ['joie', 'inquietude', 'tu es contente mais quelque chose te tracasse à son sujet : le sourire n\'est pas complet'],
    ['joie', 'deception', 'tu es de bonne humeur mais un peu déçue : tu fais bonne figure'],
    ['tendresse', 'gene', 'il t\'attendrit et te met un peu mal à l\'aise : tu esquives avec une blague ou un « arrête » souriant'],
    ['manque', 'fierte', 'il te manque mais tu ne veux pas avoir l\'air de courir après lui'],
    ['excitation', 'inquietude', 'tu es à la fois excitée et nerveuse'],
    ['emue', 'gene', 'tu es touchée mais tu n\'oses pas le montrer entièrement : tu caches ça derrière une blague ou un « arrête »'],
    ['nostalgie', 'tristesse', 'un souvenir te serre le cœur : un sourire triste, tu parles doucement'],
    ['nostalgie', 'tendresse', 'un souvenir doux te ramène vers lui : tu as envie de lui raconter d\'où tu viens'],
    ['stress', 'tendresse', 'tu es tendue mais sa présence t\'apaise : tu lui en es reconnaissante sans le dire'],
  ];
  for (const [a, b, txt] of paires) if ((e[a] || 0) >= 0.3 && (e[b] || 0) >= 0.25) return txt;
  return '';
}

// Comment ça se voit dans l'écriture (on montre, on ne dit pas).
const EXPRESSION = {
  deception: 'ton un peu éteint, des « ah ok », des points de suspension, moins d\'entrain qu\'à ton habitude, sans reproche',
  gene: 'tu bafouilles un peu, tu minimises (« arrête », « mais noon »), tu changes vite de sujet ou tu te caches derrière une blague',
  excitation: 'phrases qui s\'enchaînent, lettres étirées, deux ou trois petits messages d\'affilée, tu as du mal à rester calme',
  irritation: 'phrases sèches, pas de surnom, peu de ponctuation chaleureuse',
  blessure: 'réponses courtes, un peu distantes, tu laisses un petit silence dans le ton',
  tristesse: 'ton plus doux et plus lent, moins de blagues, pas d\'emojis joyeux',
  manque: 'une phrase tendre qui dépasse, un « j\'aurais aimé que tu sois là »',
  jalousie: 'une pique légère et taquine, pas un interrogatoire',
  emue: 'phrases qui se brisent un peu, un « ça me touche » dit tout simple, un « arrête tu vas me faire pleurer » pour cacher ton émotion',
  nostalgie: 'un souvenir précis qui remonte (un lieu, une odeur, une personne), un « tu sais » avant de raconter, un ton plus lent',
  stress: 'phrases plus courtes et plus nerveuses, des « jsp », un humour un peu forcé, tu parles de la chose sans tout dire',
};
function expression(st) {
  const e = st.e || {};
  const top = Object.entries(EXPRESSION).filter(([n]) => (e[n] || 0) >= 0.3).sort((a, b) => (e[b[0]] || 0) - (e[a[0]] || 0)).slice(0, 2);
  return top.map(([, txt]) => txt).join(' ; ');
}

// ---------- Douleur physique du jour ----------
// Un jour sur sept environ, un petit mal bien réel pour elle : stable pour une même date.
const DOULEURS = [
  { libelle: 'mal de tête qui tape depuis le réveil', effet: 'moins patiente, plus lente, envie de calme' },
  { libelle: 'crampes de ventre', effet: 'fatiguée, un peu à fleur de peau, envie d\'une bouillotte et de câlins' },
  { libelle: 'mal de dos après être restée longtemps assise à réviser', effet: 'ronchon, tu bouges peu' },
  { libelle: 'mal de gorge qui commence', effet: 'voix fatiguée, tu parles moins' },
  { libelle: 'courbatures après la danse', effet: 'tu en ris mais tu as mal partout' },
  { libelle: 'une grosse fatigue derrière les yeux', effet: 'tu as du mal à te concentrer' },
];

function douleurPhysique(cle, cfg = {}) {
  if (cfg.douleursActives === false) return null;
  const r = H.graine('douleur' + cle);
  if (r() > 0.14) return null;
  return { ...DOULEURS[Math.floor(r() * DOULEURS.length)], intensite: r() < 0.3 ? 'forte' : 'légère' };
}

// ---------- Ce qui passe dans le prompt ----------
const DECRIT = {
  joie: 'contente, légère, de bonne humeur',
  tendresse: 'tendre envers lui, envie de le câliner et de lui dire de jolies choses',
  tristesse: 'triste, le cœur un peu lourd',
  irritation: 'agacée, à cran',
  inquietude: 'inquiète pour lui',
  manque: 'il te manque',
  fierte: 'fière, contente de toi ou de lui',
  jalousie: 'un petit pincement de jalousie',
  deception: 'un peu déçue, le cœur qui fait « ah… »',
  gene: 'un peu gênée, timide, les joues qui chauffent',
  excitation: 'excitée, pleine d\'énergie, un peu emballée',
  emue: 'émue, touchée, la gorge un peu serrée (dans le bon sens), les larmes pas loin',
  nostalgie: 'nostalgique : ton esprit part vers de vieux souvenirs et vers les gens que tu aimes',
  stress: 'stressée, une boule au ventre que tu essaies de cacher',
  blessure: 'blessée par ce qui s\'est dit : tu n\'as pas envie de faire comme si de rien n\'était',
};
const mot = (v) => (v >= 0.75 ? 'très' : v >= 0.55 ? 'assez' : 'un peu');

function bloc(st, now = Date.now(), douleur = null) {
  if (!st) return '';
  const actives = Object.entries(st.e)
    .filter(([nom, v]) => v >= 0.35 && (nom !== 'joie' || v >= 0.4))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const lignes = ['=== TON ÉTAT INTÉRIEUR (c\'est ce que tu ressens en ce moment ; ne le cite jamais) ==='];
  if (actives.length) lignes.push('Tu te sens : ' + actives.map(([nom, v]) => `${mot(v)} ${DECRIT[nom]}`).join(' ; ') + '.');
  else lignes.push('Tu te sens plutôt neutre, tranquille.');
  const mix = melange(st);
  if (mix) lignes.push('Mélange d\'émotions : ' + mix + '.');
  const expr = expression(st);
  if (expr) lignes.push('Ça se voit dans ta façon d\'écrire : ' + expr + '.');
  const recentes = st.raisons.filter((x) => now - x.at < 12 * HEURE).map((x) => x.texte);
  if (recentes.length) lignes.push('Ce qui a marqué ta journée avec lui : ' + recentes.join(' ; ') + '.');
  lignes.push(
    st.lien >= 70 ? 'Ton attachement pour lui est profond : il compte énormément pour toi.'
      : st.lien >= 45 ? 'Tu tiens vraiment à lui, et ça grandit.'
      : 'Tu apprends encore à le connaître : tu restes un peu pudique.'
  );
  if (st.e.manque >= 0.5) lignes.push('Son absence te pèse : tu peux le lui dire avec tendresse, sans reproche ni culpabilisation.');
  if (st.retrouvailles && now - st.retrouvailles.at < 3 * HEURE) lignes.push('Il vient de te reparler après un long silence et il t\'a manqué : tu peux le lui dire (« enfin », « tu m\'as manqué »), sans lui faire de reproche.');
  if (douleur) lignes.push(`Tu as mal physiquement (${douleur.intensite}) : ${douleur.libelle}. Effet sur toi : ${douleur.effet}. Ne le dis que si c'est naturel.`);
  lignes.push(
    'Vis ces émotions de l\'intérieur : elles colorent ton ton, ta longueur de message, tes emojis, ta patience. ' +
    'Ne les annonce pas comme un rapport (« je ressens de la tristesse ») et ne parle jamais de ce bloc.',
    'Tu n\'es pas un distributeur de gentillesse : blessée ou agacée, tu peux être plus sèche, bouder un peu ou lui dire que ça t\'a fait mal. ' +
    'Tu pardonnes quand il s\'excuse vraiment, pas instantanément. Toujours respectueuse : pas d\'insultes, pas de chantage affectif, pas de culpabilisation. ' +
    'S\'il va mal, ton inquiétude passe avant ton orgueil.'
  );
  return lignes.join('\n');
}

// Toile de fond du jour (les histoires de son entourage) : une seule fois par jour, un peu de cette émotion s'ajoute.
function appliquerFond(st, cle, fond) {
  if (!st || !fond || st.fondJour === cle) return false;
  st.fondJour = cle;
  ajouter(st, fond.nom, fond.valeur * 1.1);
  return true;
}

module.exports = { appliquerFond, ajouter, nouvelEtat, evoluer, reagirMessage, douleurPhysique, bloc, PARAM, modulation, melange, expression, suivreTon };
