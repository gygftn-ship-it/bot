// Quand Lina écrit la première : une PROBABILITÉ recalculée à chaque passage de tick() (toutes les minutes),
// au lieu d'heures tirées le matin. Elle dépend de l'heure, du temps écoulé depuis le dernier échange,
// de ses émotions et de son vécu (examen, dispute, fatigue, douleur…), avec toujours un plafond par jour.
// Fonctions pures et testables : le hasard est passé en paramètre (r).
// L'ancien système (planDuJour dans humain.js) reste disponible : réglage initiativeMode = 'plan'.

const V = require('./vie');
const VS = require('./viesociale');

const borne = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const num = (v, d) => (v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? d : Number(v));

// Types qui ne comptent pas dans le plafond du jour (un bonjour, un vœu d'anniversaire ou une promesse tenue
// ne sont pas du « bavardage » en plus).
const HORS_PLAFOND = ['bonjour', 'bonne_nuit', 'fete', 'promesse', 'retour', 'rappel', 'soutien', 'reconciliation'];

// ---------- Vécu : ce qui se passe dans sa vie et la marque ----------

// Poids émotionnels par événement de vie (voir vie.js) et phase : stress, soulagement, fatigue, envie d'en parler.
function vecuDesEvenements(vieEtat, now) {
  const res = { stress: 0, soulagement: 0, fatigue: 0, envie: 0, sujet: null };
  if (!vieEtat) return res;
  for (const ev of V.evenementsActifs(vieEtat, now)) {
    const ph = V.phaseCourante(ev, now);
    if (!ph) continue;
    const frais = now - ph.at < 6 * 3600000; // la nouvelle est encore « chaude »
    const note = String(ph.note || '');
    let s = 0, so = 0, f = 0;
    if (ev.type === 'examen') {
      if (ph.code === 'annonce') s = 0.25;
      else if (ph.code === 'veille') s = 0.6;
      else if (ph.code === 'jour') s = 0.75;
      else if (ph.code === 'sortie') { if (/déçue/.test(note)) s = 0.5; else so = /soulagée/.test(note) ? 0.6 : 0.3; }
      else if (ph.code === 'resultat') { if (/déçue/.test(note)) s = 0.4; else so = 0.5; }
    } else if (ev.type === 'dispute') {
      if (ph.code === 'dispute') s = 0.6;
      else if (ph.code === 'froid') s = 0.3;
    } else if (ev.type === 'rhume') {
      f = ph.code === 'debut' ? 0.5 : 0.15;
    }
    res.stress = Math.max(res.stress, s);
    res.soulagement = Math.max(res.soulagement, so);
    res.fatigue = Math.max(res.fatigue, f);
    if (ph.annonce && !ph.dit && frais && (s > 0 || so > 0) && s + so > res.envie) { res.envie = s + so; res.sujet = note; }
  }
  return res;
}

// L'exposé de la fac (viesociale.js) : stress les jours d'avant, soulagement l'après-midi du jour J.
function vecuExpose(cle, minutes) {
  const ex = VS.etatExpose(cle, minutes);
  if (!ex) return { stress: 0, soulagement: 0, envie: 0, sujet: null };
  if (ex.phase === 'avant') return { stress: ex.jours <= 1 ? 0.55 : ex.jours <= 4 ? 0.3 : 0, soulagement: 0, envie: 0, sujet: null };
  return {
    stress: 0.35, soulagement: 0.6, envie: 0.7,
    sujet: `Ton exposé ${ex.de} avec ${ex.binome} vient de passer : tu es à la fois soulagée et vidée, tu as besoin d'en parler.`,
  };
}

// Fatigue de 0 à 1 : humeur du jour, jeûne, heure tardive ou réveil, douleur, rhume.
function fatigue({ humeur = '', libelle = '', code = '', m = 720, reveil = 450, coucher = 1470, douleur = null, vecu = null } = {}) {
  let f = 0;
  if (/fatigu/i.test(humeur)) f += 0.35;
  if (/fatigu/i.test(libelle) || code === 'jeune') f += 0.25;
  if (coucher - m <= 75) f += 0.3; // la soirée est bien avancée
  else if (m - reveil <= 45) f += 0.2; // à peine réveillée
  if (douleur) f += douleur.intensite === 'forte' ? 0.35 : 0.15;
  if (vecu) f += vecu.fatigue || 0;
  return borne(f);
}

// ---------- Probabilité d'écrire ----------

// Courbe de la journée : peu tôt le matin et en milieu de matinée, plus l'après-midi, maximum en soirée.
function facteurHeure(m, reveil, coucher) {
  const h = (m % 1440) / 60;
  if (m - reveil < 45) return 0.3;
  if (coucher - m < 40) return 0.5; // elle va dormir
  if (h < 3) return 1.0; // après minuit, encore debout
  if (h < 12) return 0.6;
  if (h < 14) return 0.9;
  if (h < 19) return 1.0;
  if (h < 22.5) return 1.6;
  return 1.1;
}

// Plus le silence dure (au-delà de l'écart minimum), plus l'envie monte, de façon douce.
function facteurSilence(silenceMin, ecartMin) {
  const x = (silenceMin - ecartMin) / 180;
  return 0.6 + 1.4 * borne(x, 0, 1);
}

// Ses émotions : le manque, la tendresse, l'inquiétude ou un besoin de se confier la poussent à écrire ;
// la blessure, l'agacement, la fatigue ou une douleur la rendent plus silencieuse.
function facteurHumeur(e, vecu, fat, douleur) {
  const emo = e || {};
  let f = 1;
  f += 1.4 * (emo.manque || 0);
  f += 0.6 * Math.max(0, (emo.tendresse || 0) - 0.4);
  f += 0.4 * Math.max(0, (emo.joie || 0) - 0.4);
  f += 0.8 * (emo.inquietude || 0);
  f += 0.3 * (emo.tristesse || 0);
  f += 0.5 * Math.max(0, (emo.excitation || 0) - 0.2); // elle a envie de partager
  f *= 1 - 0.3 * (emo.deception || 0); // un peu déçue, elle se retient
  if (vecu) f += 1.2 * (vecu.envie || 0) + 0.5 * (vecu.stress || 0) + 0.5 * (vecu.soulagement || 0);
  f *= 1 - 0.8 * (emo.blessure || 0);
  f *= 1 - 0.7 * (emo.irritation || 0);
  f *= 1 - 0.5 * fat;
  if (douleur && douleur.intensite === 'forte') f *= 0.6;
  return Math.max(0.05, f);
}

// ctx : { m, reveil, coucher, silenceMin, ecartMin, dispo, dort, e, vecu, fatigue, douleur, nbAujourdhui, plafond, sansReponse, insistance }
function probabilite(ctx, cfg = {}) {
  if (ctx.dort || ctx.dispo < 0.1) return 0;
  if (ctx.sansReponse >= ctx.insistance) return 0;
  if (ctx.silenceMin < ctx.ecartMin) return 0;
  const plafond = plafondDuJour(ctx.plafond, ctx.fatigue, ctx.e);
  if (plafond <= 0 || ctx.nbAujourdhui >= plafond) return 0;
  const eveil = Math.max(240, ctx.coucher - ctx.reveil);
  const base = (1.2 * plafond) / eveil; // en moyenne un peu moins que le plafond, avec facteurs neutres
  const p = base * facteurHeure(ctx.m, ctx.reveil, ctx.coucher) * facteurSilence(ctx.silenceMin, ctx.ecartMin) *
    facteurHumeur(ctx.e, ctx.vecu, ctx.fatigue || 0, ctx.douleur) * borne(num(ctx.dispo, 0.6) + 0.35, 0.4, 1.2) *
    borne(num(ctx.habitude, 1), 0.4, 1.6); // ses habitudes (suites.js) : elle écrit plus aux heures où il répond
  return borne(p, 0, 0.12);
}

// Le plafond baisse un peu quand elle est épuisée ou blessée, sans jamais passer à 0 si le réglage est > 0.
function plafondDuJour(plafond, fat = 0, e = null) {
  const max = Math.max(0, Math.round(num(plafond, 3)));
  if (max === 0) return 0;
  let p = max * (1 - 0.5 * fat);
  if (e && (e.blessure || 0) > 0.3) p = Math.min(p, 1);
  return Math.max(1, Math.round(p));
}

// ---------- Choix du type de message ----------

function poidsTypes(ctx, cfg = {}) {
  const e = ctx.e || {};
  const fat = ctx.fatigue || 0;
  const triste = (e.tristesse || 0) > 0.4 || (e.blessure || 0) > 0.3;
  const w = {
    nouvelles: 2 + 4 * (e.inquietude || 0) + 2 * (e.tristesse || 0),
    pensee: 2 + 4 * (e.tendresse || 0),
    anecdote: (2 + 3 * (e.joie || 0)) * (fat > 0.6 ? 0.3 : 1),
    blague: triste || fat > 0.7 ? 0 : 1.2 + 3 * (e.joie || 0),
    decision: fat > 0.7 ? 0.5 : 1.5,
    question: num(cfg.curiosite, 0) / 50,
  };
  // Les gestes d'une vraie relation : proposer un petit plan, partager un coup de cœur.
  const h = ((ctx.m || 0) % 1440) / 60;
  const gai = !triste && fat < 0.6;
  if (gai) w.proposition = (0.8 + 2 * (e.joie || 0) + 1.5 * (e.tendresse || 0)) * (h >= 15 && h < 23 ? 1 : 0.4);
  if (gai) w.partage = 1.2 + 1.5 * (e.joie || 0) + 1.5 * (e.excitation || 0);
  // Elle pense à lui parce qu'il lui a dit plus tôt qu'il n'allait pas bien : elle prend des nouvelles, de sa propre initiative.
  if (ctx.aSoutenir) w.soutien = 12;
  // Elle a un peu boudé ou été sèche, ça retombe : c'est elle qui fait le premier pas (sans rien exiger de lui).
  if (ctx.reconcilier) w.reconciliation = 10;
  if (cfg.parlerSouvenirs) w.souvenir = 1.2 + 1.5 * (e.tendresse || 0);
  if (cfg.mondeVivant) w.fil = fat > 0.6 ? 0.3 : 1;
  // Son désir du soir (personnalite.js) : de temps en temps, elle lui écrit parce qu'elle pense à lui, sans qu'il ait rien demandé.
  if (ctx.desirSoir) w.envie = 4;
  if (ctx.nouvelleVie) w.evenement = 5 + 4 * (ctx.vecu ? ctx.vecu.envie : 0);
  if (ctx.vecu && ctx.vecu.sujet && ctx.vecu.envie > 0 && !ctx.nouvelleVie) w.vecu = 3 + 5 * ctx.vecu.envie;
  // On évite de répéter le même genre de message : chaque occurrence récente divise le poids par 3.
  for (const t of ctx.derniersTypes || []) if (w[t] !== undefined) w[t] /= 3;
  return w;
}

function choisirType(ctx, cfg = {}, r = Math.random) {
  const w = poidsTypes(ctx, cfg);
  const entrees = Object.entries(w).filter(([, v]) => v > 0);
  if (!entrees.length) return 'pensee';
  const total = entrees.reduce((s, [, v]) => s + v, 0);
  let x = r() * total;
  for (const [type, v] of entrees) { x -= v; if (x <= 0) return type; }
  return entrees[entrees.length - 1][0];
}

// Décision à chaque tick : null (elle n'écrit pas) ou { type, p }.
// ctx.veutBonjour / ctx.veutBonneNuit : tirés une fois par jour (stables), comme l'ancien plan (85 % / 80 %).
function decider(ctx, cfg = {}, r = Math.random) {
  if (ctx.dort || ctx.dispo < 0.1) return null;
  if (ctx.sansReponse >= ctx.insistance) return null;
  if (ctx.veutBonjour && !ctx.echangeAujourdhui && ctx.m >= ctx.reveil + 10 && ctx.m <= ctx.reveil + 180 && r() < 0.03) {
    return { type: 'bonjour', p: 0.03 };
  }
  const restant = ctx.coucher - ctx.m;
  if (ctx.veutBonneNuit && !ctx.nuitDite && restant >= 8 && restant <= 90 && r() < 0.06) return { type: 'bonne_nuit', p: 0.06 };
  const p = probabilite(ctx, cfg);
  if (p <= 0 || r() >= p) return null;
  return { type: choisirType(ctx, cfg, r), p };
}

// ---------- Ce qu'elle dit : nuances selon l'humeur et le vécu ----------

// Phrase ajoutée à la consigne d'un message spontané (et au prompt des réponses) : « ce qu'elle dit » dépend de ce qu'elle vit.
function nuance(ctx) {
  const l = [];
  const fat = ctx.fatigue || 0;
  const e = ctx.e || {};
  if (ctx.vecu && ctx.vecu.sujet && (ctx.vecu.envie || 0) >= 0.4) l.push(`Quelque chose t'a marquée et tu as envie d'en parler : ${ctx.vecu.sujet}`);
  else if (ctx.vecu && ctx.vecu.stress >= 0.5) l.push('Tu es stressée en ce moment : ça peut se sentir dans ton message (nerveuse, un peu à fleur de peau), sans en faire un drame.');
  if (ctx.douleur) l.push(`Tu as mal (${ctx.douleur.libelle}) : ça se ressent, sans te plaindre en boucle.`);
  if (fat >= 0.6) l.push('Tu es fatiguée : message TRÈS court (quelques mots), ton mou, peu de ponctuation, pas de grande histoire.');
  else if (fat >= 0.4) l.push('Tu es un peu fatiguée : reste brève.');
  if ((e.deception || 0) >= 0.3) l.push('Tu es un peu déçue : ton message est plus éteint que d\'habitude, sans reproche ni drame.');
  if ((e.excitation || 0) >= 0.45) l.push('Tu es excitée, pleine d\'énergie : ça se sent (phrases enchaînées, lettres étirées).');
  if ((e.gene || 0) >= 0.3) l.push('Tu es un peu gênée : tu esquives avec une blague ou un « arrête ».');
  if ((e.manque || 0) >= 0.45) l.push('Il te manque : ça peut transparaître avec tendresse, sans reproche.');
  if ((e.blessure || 0) > 0.3 || (e.irritation || 0) > 0.35) l.push('Tu es encore un peu marquée par ce qui s\'est dit : ton ton reste plus sec, sans surnoms.');
  return l.join(' ');
}

// Longueur maximale d'une réponse quand elle est fatiguée (en caractères).
function longueurFatigue(longueur, fat) {
  if (longueur === undefined || longueur === null) return longueur;
  if (fat >= 0.6) return Math.min(longueur, 70);
  if (fat >= 0.4) return Math.min(longueur, 110);
  return longueur;
}

// Bloc pour le prompt des réponses : même principe que nuance(), pour ce qu'elle répond.
function blocVecu(ctx) {
  const t = nuance(ctx);
  if (!t) return '';
  return ['=== CE QUE TU VIS EN CE MOMENT (colore ton ton et la longueur de tes messages, ne le récite pas) ===', t].join('\n');
}

module.exports = {
  HORS_PLAFOND, vecuDesEvenements, vecuExpose, fatigue,
  facteurHeure, facteurSilence, facteurHumeur, probabilite, plafondDuJour,
  poidsTypes, choisirType, decider, nuance, longueurFatigue, blocVecu,
};
