// Tout ce qui fait « une vraie personne » : rythme de vie, humeur, délais de réponse,
// frappe hésitante, fautes de frappe, messages spontanés. Fonctions pures, testables.

const alea = (min, max, r = Math.random) => min + r() * (max - min);
const entre = (min, max, r = Math.random) => Math.floor(alea(min, max + 1, r));
const num = (v, d) => (v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? d : Number(v));

// Générateur pseudo-aléatoire déterministe : la même graine donne toujours le même tirage
// (utile pour que l'humeur et le plan de la journée restent stables).
function graine(texte) {
  let h = 1779033703 ^ texte.length;
  for (let i = 0; i < texte.length; i++) {
    h = Math.imul(h ^ texte.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Temps et rythme de vie ----------

const JOURS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function heureLocale(date = new Date(), fuseau) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: fuseau || undefined,
      hourCycle: 'h23',
      hour: 'numeric',
      minute: 'numeric',
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const g = (t) => parts.find((p) => p.type === t).value;
    const h = Number(g('hour')) % 24;
    const m = Number(g('minute'));
    return { h, m, minutes: h * 60 + m, jour: JOURS[g('weekday')], cle: `${g('year')}-${g('month')}-${g('day')}` };
  } catch (e) {
    const h = date.getHours();
    const m = date.getMinutes();
    const cle = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return { h, m, minutes: h * 60 + m, jour: date.getDay(), cle };
  }
}

function parametresVie(cfg = {}) {
  const reveil = Math.round(num(cfg.heureReveil, 7.5) * 60);
  const coucher = ((Math.round(num(cfg.heureCoucher, 0.5) * 60) % 1440) + 1440) % 1440;
  return {
    fuseau: cfg.fuseau || 'Africa/Algiers',
    reveil,
    coucher,
    joursCours: [0, 1, 2, 3, 4], // semaine universitaire algérienne : dimanche à jeudi
  };
}

// Réveil plus tardif quand il n'y a pas cours.
const reveilDuJour = (jour, p) => p.reveil + (p.joursCours.includes(jour) ? 0 : 90);

function etatDeVie(date = new Date(), cfg = {}) {
  const p = parametresVie(cfg);
  const t = heureLocale(date, p.fuseau);
  const cours = p.joursCours.includes(t.jour);
  const r = reveilDuJour(t.jour, p);
  const m = t.minutes;
  const dort = p.coucher > r ? m >= p.coucher || m < r : m >= p.coucher && m < r;

  // Petit facteur propre à chaque jour : certains jours sont plus chargés que d'autres.
  const facteur = 0.8 + graine('jour' + t.cle)() * 0.4;
  const base = { t, cours, facteur };

  if (dort) {
    const jourReveil = m >= r ? (t.jour + 1) % 7 : t.jour;
    let delta = reveilDuJour(jourReveil, p) - m;
    if (delta <= 0) delta += 1440;
    return { ...base, code: 'dort', libelle: 'tu dors profondément', dispo: 0, dort: true, reveilDans: delta };
  }

  const mm = m < r ? m + 1440 : m;
  const coucherJour = p.coucher <= r ? p.coucher + 1440 : p.coucher;
  const clamp = (x) => Math.max(0.05, Math.min(1, x * facteur));
  const fait = (code, libelle, d) => ({ ...base, code, libelle, dispo: clamp(d), dort: false, reveilDans: 0 });

  if (coucherJour - mm > 0 && coucherJour - mm <= 30) return fait('coucher', 'tu es au lit, tu vas bientôt dormir', 0.7);

  const segments = cours
    ? [
        [r, r + 60, 'reveil', 'tu viens de te réveiller et tu te prépares', 0.5],
        [r + 60, 720, 'cours', "tu es en cours à l'université : tu ne peux pas discuter longtemps", 0.25],
        [720, 810, 'repas', 'pause déjeuner', 0.8],
        [810, 960, 'cours', "tu es en cours à l'université : tu ne peux pas discuter longtemps", 0.3],
        [960, 1140, 'libre', 'tu es libre : retour à la maison, révisions, café ou sortie avec une amie', 0.8],
        [1140, 1215, 'diner', 'dîner avec ta famille', 0.5],
        [1215, 1e9, 'soiree', 'soirée tranquille à la maison, le téléphone à la main', 1],
      ]
    : [
        [r, r + 60, 'reveil', 'tu viens de te réveiller, tu traînes', 0.5],
        [r + 60, 720, 'matin', "matinée tranquille à la maison, un peu de ménage ou de famille", 0.7],
        [720, 840, 'repas', 'déjeuner en famille', 0.6],
        [840, 1140, 'libre', 'après-midi libre : sortie avec une amie, détente ou révisions', 0.7],
        [1140, 1215, 'diner', 'dîner avec ta famille', 0.5],
        [1215, 1e9, 'soiree', 'soirée tranquille à la maison, le téléphone à la main', 1],
      ];
  for (const [debut, fin, code, libelle, d] of segments) {
    if (mm >= debut && mm < fin) return fait(code, libelle, d);
  }
  return fait('libre', 'tu es tranquille', 0.8);
}

// « Jour de vie » : il commence au réveil. Entre minuit et le réveil, on est encore dans la journée d'hier.
function jourDeVie(date = new Date(), cfg = {}) {
  const p = parametresVie(cfg);
  const t = heureLocale(date, p.fuseau);
  const r = reveilDuJour(t.jour, p);
  if (t.minutes < r) {
    const veille = heureLocale(new Date(date.getTime() - 86400000), p.fuseau);
    return { cle: veille.cle, m: t.minutes + 1440, jour: veille.jour, reveil: reveilDuJour(veille.jour, p), coucher: p.coucher <= reveilDuJour(veille.jour, p) ? p.coucher + 1440 : p.coucher };
  }
  return { cle: t.cle, m: t.minutes, jour: t.jour, reveil: r, coucher: p.coucher <= r ? p.coucher + 1440 : p.coucher };
}

const HUMEURS = [
  'de très bonne humeur, pleine d\'énergie',
  'de bonne humeur, souriante',
  'calme et posée',
  'un peu fatiguée',
  'câline et tendre',
  'taquine, d\'humeur à plaisanter',
  'un peu boudeuse sans vraie raison',
  'pensive, un peu rêveuse',
  'excitée par un projet ou une idée',
  'stressée par les révisions',
  'nostalgique',
  'd\'humeur légère et rigolote',
];

// Trois humeurs par jour (matin, après-midi, soir), stables pour une même date.
function humeur(date = new Date(), cfg = {}) {
  const p = parametresVie(cfg);
  const t = heureLocale(date, p.fuseau);
  const r = graine(`humeur${t.cle}-${Math.floor(t.h / 8)}`);
  return HUMEURS[Math.floor(r() * HUMEURS.length)];
}

// ---------- Délais de réponse ----------

// Combien de secondes avant qu'elle « ouvre » la discussion. Mélange de réponses rapides,
// moyennes et lentes selon ce qu'elle est en train de vivre ; longue attente si elle dort.
function latence(etat, cfg = {}, opts = {}, r = Math.random) {
  const dMin = Math.max(0, num(cfg.delaiMin, 3));
  const dMax = Math.max(dMin, num(cfg.delaiMax, 25));
  const rapide = () => ({ secondes: alea(dMin, dMax, r), mode: 'rapide' });
  if (cfg.latenceRealiste === false) return rapide();
  const k = num(cfg.rapidite, 1) > 0 ? num(cfg.rapidite, 1) : 1;

  if (etat.dort) {
    if (r() < 0.04) return { secondes: alea(60, 600, r), mode: 'insomnie' }; // elle était réveillée
    return { secondes: etat.reveilDans * 60 + alea(120, 2400, r) * k, mode: 'reveil' };
  }
  if (opts.conversationActive) return rapide(); // en pleine discussion, on répond vite
  const d = Math.min(1, Math.max(0, etat.dispo));
  const pRapide = 0.3 + 0.5 * d;
  const x = r();
  if (x < pRapide) return rapide();
  if (x < pRapide + 0.2) return { secondes: alea(45, 240, r) * k, mode: 'moyen' };
  return { secondes: alea(480, 2100, r) * k * (1.4 - d), mode: 'lent' };
}

function formatDuree(secondes) {
  const s = Math.round(secondes);
  if (s < 90) return `${s} s`;
  const min = Math.round(s / 60);
  if (min < 90) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}

// ---------- Frappe ----------

// Plan de frappe : rafales d'écriture entrecoupées de pauses (« écrit… » puis rien, puis « écrit… »).
// Chaque étape est { tape: ms } ou { pause: ms }.
function planFrappe(texte, msParLettre, dureeFrappe, r = Math.random) {
  const total = dureeFrappe(texte, msParLettre, r);
  const plan = [];
  if (r() < 0.12) plan.push({ tape: alea(1200, 2800, r) }, { pause: alea(1500, 4500, r) }); // elle hésite
  const longueur = String(texte).length;
  const rafales = longueur > 140 ? 3 : longueur > 70 && r() < 0.6 ? 2 : 1;
  for (let i = 0; i < rafales; i++) {
    plan.push({ tape: total / rafales });
    if (i < rafales - 1) plan.push({ pause: alea(1200, 3500, r) });
  }
  return plan;
}

// Faute de frappe crédible sur un mot, suivie d'une correction « *mot » comme sur un vrai téléphone.
function ajouterFaute(texte, r = Math.random) {
  const mots = [...String(texte).matchAll(/[A-Za-zÀ-ÿ]{5,}/g)];
  if (!mots.length) return null;
  const m = mots[Math.floor(r() * mots.length)];
  const mot = m[0];
  const i = 1 + Math.floor(r() * (mot.length - 3)); // jamais la première ni la dernière lettre
  const x = r();
  let fautif;
  if (x < 0.4) fautif = mot.slice(0, i) + mot[i + 1] + mot[i] + mot.slice(i + 2); // lettres inversées
  else if (x < 0.7) fautif = mot.slice(0, i) + mot.slice(i + 1); // lettre oubliée
  else fautif = mot.slice(0, i) + mot[i] + mot.slice(i); // lettre doublée
  if (fautif === mot) return null;
  return { texte: texte.slice(0, m.index) + fautif + texte.slice(m.index + mot.length), correction: '*' + mot };
}

// ---------- Réactions ----------

// Le modèle peut répondre [REACT:❤️] pour réagir au message sans écrire.
function extraireReaction(texte) {
  const re = /\[REACT(?:ION)?\s*:\s*([^\]\s]{1,12})\s*\]/gi;
  let emoji = null;
  const sans = String(texte || '').replace(re, (_, e) => {
    emoji = emoji || e;
    return '';
  });
  return { texte: sans.trim(), emoji };
}

// ---------- Messages spontanés ----------

const CONSIGNES = {
  bonjour: 'Tu viens de commencer ta journée : envoie un petit mot de bonjour naturel (pas toujours le même).',
  nouvelles: 'Prends de ses nouvelles de façon naturelle, en lien avec ce que tu sais de lui ou de sa journée.',
  pensee: 'Tu penses à lui : envoie un petit mot spontané et affectueux, sans question forcée.',
  anecdote: 'Raconte-lui un petit truc qui t\'est arrivé ou que tu as vu aujourd\'hui, cohérent avec ce que tu fais en ce moment.',
  blague: 'Envoie-lui quelque chose de drôle ou un petit défi taquin.',
  bonne_nuit: 'Tu vas bientôt dormir : souhaite-lui bonne nuit.',
};

// Plan des messages spontanés de la journée : heures et types, tirés une fois par jour.
function planDuJour(date = new Date(), cfg = {}, r = Math.random) {
  const j = jourDeVie(date, cfg);
  const items = [];
  if (r() < 0.85) items.push({ at: j.reveil + entre(10, 90, r), type: 'bonjour', fait: false });

  const max = Math.max(0, Math.round(num(cfg.initiativeParJour, 3)));
  const n = entre(Math.max(0, max - 2), max, r);
  const debut = Math.max(j.reveil + 150, 630);
  const fin = j.coucher - 90;
  const choisis = [];
  for (let essai = 0; essai < 40 && choisis.length < n && fin > debut; essai++) {
    const at = Math.round(alea(debut, fin, r));
    if (choisis.every((x) => Math.abs(x - at) >= 100)) choisis.push(at);
  }
  const types = ['nouvelles', 'pensee', 'anecdote', 'blague', 'pensee', 'nouvelles'];
  choisis.forEach((at) => items.push({ at, type: types[Math.floor(r() * types.length)], fait: false }));

  if (r() < 0.8) items.push({ at: j.coucher - entre(15, 50, r), type: 'bonne_nuit', fait: false });
  return items.sort((a, b) => a.at - b.at);
}

module.exports = {
  alea,
  entre,
  graine,
  heureLocale,
  parametresVie,
  etatDeVie,
  jourDeVie,
  humeur,
  latence,
  formatDuree,
  planFrappe,
  ajouterFaute,
  extraireReaction,
  planDuJour,
  CONSIGNES,
};
