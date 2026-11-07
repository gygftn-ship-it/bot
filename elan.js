// L'élan de Lina : l'initiative DANS la conversation (pas seulement les messages spontanés).
// Une vraie personne ne se contente pas de répondre : de temps en temps elle relance, change de sujet,
// donne un avis tranché, fait une confidence, propose quelque chose. Ici, une petite suggestion
// facultative est ajoutée au prompt de certaines réponses, jamais quand elle est fatiguée, blessée,
// ou quand il se confie (là, elle écoute, c'est tout). Fonctions pures : le hasard est passé en paramètre.

const borne = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));

// Il traverse quelque chose : pas le moment de changer de sujet.
const EMOTIONNEL = /triste|d[ée]prim|stress|angoiss|peur|gal[èe]re|pleur|j'en peux plus|[àa] bout|malade|souci|probl[èe]me|deuil|d[ée]c[èe]s|ça va pas|je vais pas bien|mal au|je suis mal|[ée]puis[ée]|crev[ée]/i;

const CONSIGNES = {
  sujet: 'Après avoir répondu à ce qu\'il a dit, tu peux glisser un petit sujet à TOI (un truc de ta journée, une idée qui te trotte, une chose vue ou lue), en une phrase, sans question en fin de message.',
  opinion: 'Sur ce dont vous parlez, donne un avis franc et un peu tranché (tu peux ne PAS être d\'accord avec lui, gentiment, ou le taquiner sur son goût).',
  taquiner: 'Taquine-le gentiment sur quelque chose qu\'il vient de dire ou qu\'il fait souvent : un petit défi, une moquerie tendre, un « t\'es sûr de toi là ? ».',
  confidence: 'Fais-lui une petite confidence sur toi (un doute du moment, un rêve, une petite peur, un souvenir d\'enfance) : tu t\'ouvres un peu, il n\'a pas à la commenter longuement.',
  proposer: 'Si ça s\'y prête, propose-lui quelque chose de simple à faire ou à regarder ensemble (un appel ce soir, un film, un café ce week-end). Il peut dire non.',
  relancer: 'La conversation s\'essouffle : relance avec une idée à toi plutôt qu\'une question générique (« et toi ça va ? »). Une anecdote courte, une remarque, un défi.',
};

function estEmotionnel(texte) { return EMOTIONNEL.test(String(texte || '')); }

// ctx : { derniers: ses derniers messages (les plus récents en dernier), fatigue, e (émotions), lien,
//         minutesDepuisElan, vientDeProposer }
function probabilite(ctx) {
  const e = ctx.e || {};
  if ((ctx.fatigue || 0) >= 0.6) return 0;
  if ((e.blessure || 0) > 0.3 || (e.irritation || 0) > 0.35 || (e.tristesse || 0) > 0.4 || (e.inquietude || 0) > 0.4) return 0;
  const der = (ctx.derniers || []).slice(-3);
  if (der.some(estEmotionnel)) return 0;
  if (ctx.minutesDepuisElan !== undefined && ctx.minutesDepuisElan < 25) return 0;
  const courts = der.length >= 2 && der.slice(-2).every((m) => String(m).trim().length < 20);
  let p = courts ? 0.5 : 0.2;
  p += 0.15 * Math.max(0, (e.excitation || 0) - 0.2) + 0.1 * Math.max(0, (e.joie || 0) - 0.4);
  p -= 0.1 * (e.deception || 0);
  return borne(p, 0, 0.7);
}

function choisir(ctx, r = Math.random) {
  const p = probabilite(ctx);
  if (p <= 0 || r() >= p) return null;
  const e = ctx.e || {};
  const der = (ctx.derniers || []).slice(-2);
  const courts = der.length >= 2 && der.every((m) => String(m).trim().length < 20);
  const w = {
    sujet: 3 + 2 * (e.excitation || 0),
    opinion: 2,
    taquiner: (e.deception || 0) > 0.3 ? 0.5 : 2 + 2 * (e.joie || 0),
    confidence: (ctx.lien || 0) >= 55 && (e.tendresse || 0) >= 0.35 ? 1.5 : 0.2,
    proposer: 1 + 1.5 * (e.joie || 0),
    relancer: courts ? 5 : 0,
  };
  if (ctx.vientDeProposer) w.proposer = 0;
  const total = Object.values(w).reduce((s, v) => s + v, 0);
  let x = r() * total;
  for (const [type, v] of Object.entries(w)) { if (v <= 0) continue; x -= v; if (x <= 0) return type; }
  return 'sujet';
}

function bloc(type) {
  if (!type || !CONSIGNES[type]) return '';
  return '=== TON ÉLAN (facultatif : une seule idée, seulement si ça vient naturellement ; ne le cite jamais) ===\n' + CONSIGNES[type];
}

module.exports = { estEmotionnel, probabilite, choisir, bloc, CONSIGNES };
