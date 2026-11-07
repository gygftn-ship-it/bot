// Tout ce qui fait « une vraie personne » : rythme de vie, humeur, délais de réponse,
// frappe hésitante, fautes de frappe, messages spontanés. Fonctions pures, testables.

const C = require('./calendrier');
const A = require('./annee');

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

// Pendant le Ramadan (si une date est donnée), elle se lève plus tard et se couche plus tard.
function parametresVie(cfg = {}, date) {
  const ramadan = !!date && C.estRamadan(date, cfg);
  const reveil = Math.round(num(cfg.heureReveil, 7.5) * 60) + (ramadan ? 60 : 0);
  const brut = Math.round(num(cfg.heureCoucher, 0.5) * 60) + (ramadan ? 120 : 0);
  const coucher = ((brut % 1440) + 1440) % 1440;
  const coucherBase = coucher < 720 ? coucher + 1440 : coucher; // 00h30 -> 1470 (après minuit)
  const fuseau = cfg.fuseau || 'Africa/Algiers';
  // Année universitaire : pas de cours pendant les vacances (sans date donnée, on suppose la période de cours).
  const periode = date && cfg.calendrierUniv !== false ? A.periodeUniv(heureLocale(date, fuseau).cle) : null;
  return {
    ramadan,
    periode,
    fuseau,
    reveil,
    coucher,
    coucherBase,
    joursCours: periode && !periode.cours ? [] : [0, 1, 2, 3, 4], // semaine universitaire algérienne : dimanche à jeudi
  };
}

// ---------- Rythme de sommeil variable ----------
// Chaque jour a son propre réveil et son propre coucher (tirés de façon stable pour une date donnée) :
// elle ne dort donc pas à la même heure tous les jours. Parfois grasse matinée, parfois nuit trop courte,
// parfois nuit blanche ou coucher tôt. Le coucher est exprimé en minutes depuis minuit du jour J (1440 = minuit).
// Ce que le lendemain change à sa soirée : cours tôt = elle se couche plus tôt, pas de cours = elle veille plus tard,
// examen ou exposé demain = soit couchée tôt (stressée), soit elle révise tard. Tirage stable pour une date donnée.
function influenceLendemain(cle, cfg = {}) {
  const l = lendemainDe(cle);
  const fuseau = cfg.fuseau || 'Africa/Algiers';
  const per = cfg.calendrierUniv !== false ? A.periodeUniv(l.cle) : null;
  const coursDemain = [0, 1, 2, 3, 4].includes(l.jour) && !(per && !per.cours);
  const r = graine('veille' + cle);
  const a = r(), b = r(), c = r(), d = r();
  if (coursDemain) {
    const probaExamen = per && per.code === 'partiels' ? 0.45 : per && per.examens ? 0.07 : 0;
    if (a < probaExamen) {
      return c < 0.6
        ? { decalage: -(30 + Math.round(b * 30)), raison: 'examen demain : elle veut être en forme' }
        : { decalage: 20 + Math.round(b * 50), raison: 'elle révise tard avant son examen de demain' };
    }
    if (d < 0.25) return { decalage: 15 + Math.round(b * 35), raison: 'elle traîne sur son téléphone malgré les cours de demain' };
    return { decalage: -(10 + Math.round(b * 40)), raison: 'cours demain matin' };
  }
  return { decalage: 20 + Math.round(b * 60), raison: 'pas de cours demain : elle veille plus tard' };
}

function rythmeBrut(cle, jour, p, cfg = {}) {
  const r = graine('sommeil' + cle);
  const variation = Math.max(0, num(cfg.variationSommeil, 1.5)) * 60; // amplitude en minutes
  const weekend = !p.joursCours.includes(jour);
  let reveil = p.reveil + (weekend ? 90 : 0) + Math.round((r() * 2 - 1) * variation * 0.6);
  // Deux tirages moyennés = pas toujours la même fourchette, mais des écarts francs possibles ; plus le lendemain.
  let coucher = p.coucherBase + Math.round(((r() + r()) - 1) * variation);
  const hasard = r();
  let raison = '';
  if (variation > 0) {
    const inf = influenceLendemain(cle, cfg);
    coucher += Math.round(inf.decalage * Math.min(1, variation / 90));
    raison = inf.raison;
    if (hasard < 0.07) { coucher += 150 + Math.round(r() * 60); reveil += 60; raison = 'nuit blanche (discussion, série, insomnie)'; } // nuit blanche ou presque
    else if (hasard < 0.16) { coucher -= 90 + Math.round(r() * 30); raison = 'crevée, couchée tôt'; } // couchée tôt, crevée
    else if (hasard > 0.93) reveil += 60; // grasse matinée
  }
  return { reveil: Math.max(300, Math.min(720, reveil)), coucher: Math.max(1290, Math.min(1650, coucher)), raison }; // lever 5h-12h, coucher 21h30-3h30
}

function rythmeDuJour(cle, jour, p, cfg = {}) {
  const brut = rythmeBrut(cle, jour, p, cfg);
  const v = veilleDe(cle);
  const hier = rythmeBrut(v.cle, v.jour, p, cfg);
  const reveil = Math.max(brut.reveil, hier.coucher - 1440 + 360); // au moins 6 h de sommeil
  return { reveil, coucher: brut.coucher, raison: brut.raison };
}

// Veille d'une date (AAAA-MM-JJ) au format AAAA-MM-JJ, avec le jour de la semaine.
function veilleDe(cle) {
  const d = new Date(cle + 'T12:00:00Z');
  const v = new Date(d.getTime() - 86400000);
  return { cle: v.toISOString().slice(0, 10), jour: v.getUTCDay() };
}

function lendemainDe(cle) {
  const v = new Date(new Date(cle + 'T12:00:00Z').getTime() + 86400000);
  return { cle: v.toISOString().slice(0, 10), jour: v.getUTCDay() };
}

// Où en est-elle dans son cycle de sommeil ? Rattache l'instant au bon « jour de vie » (la nuit appartient à la veille).
function contexteSommeil(date, cfg) {
  const p = parametresVie(cfg, date);
  const t = heureLocale(date, p.fuseau);
  const m = t.minutes;
  const auj = rythmeDuJour(t.cle, t.jour, p, cfg);
  const v = veilleDe(t.cle);
  const hier = rythmeDuJour(v.cle, v.jour, p, cfg);
  if (m < auj.reveil) {
    const dort = m + 1440 >= hier.coucher;
    return { p, t, dort, reveilDans: dort ? auj.reveil - m : 0, life: { cle: v.cle, jour: v.jour, m: m + 1440, reveil: hier.reveil, coucher: hier.coucher, raison: hier.raison } };
  }
  const dort = auj.coucher < 1440 && m >= auj.coucher;
  let reveilDans = 0;
  if (dort) { const l = lendemainDe(t.cle); reveilDans = 1440 - m + rythmeDuJour(l.cle, l.jour, p, cfg).reveil; }
  return { p, t, dort, reveilDans, life: { cle: t.cle, jour: t.jour, m, reveil: auj.reveil, coucher: auj.coucher, raison: auj.raison } };
}

const reveilDuJour = (jour, p, cle, cfg) => (cle ? rythmeDuJour(cle, jour, p, cfg).reveil : p.reveil + (p.joursCours.includes(jour) ? 0 : 90));

function etatDeVie(date = new Date(), cfg = {}) {
  const { p, t, dort, reveilDans, life } = contexteSommeil(date, cfg);
  const cours = p.joursCours.includes(life.jour);
  const r = life.reveil;

  // Petit facteur propre à chaque jour : certains jours sont plus chargés que d'autres.
  const facteur = 0.8 + graine('jour' + life.cle)() * 0.4;
  const base = { t, cours, facteur };

  if (dort) return { ...base, code: 'dort', libelle: 'tu dors profondément', dispo: 0, dort: true, reveilDans: Math.max(1, reveilDans) };

  const mm = life.m;
  const coucherJour = life.coucher;
  const clamp = (x) => Math.max(0.05, Math.min(1, x * facteur));
  const fait0 = (code, libelle, d) => ({ ...base, code, libelle, dispo: clamp(d), dort: false, reveilDans: 0 });
  const fait = p.ramadan ? (code, libelle, d) => ramadanVie(fait0, date, cfg, mm, code, libelle, d) : fait0;

  if (coucherJour - mm > 0 && coucherJour - mm <= 30) return fait('coucher', 'tu es au lit, tu vas bientôt dormir' + (life.raison ? ` (${life.raison})` : ''), 0.7);

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
        [840, 1140, 'libre', p.periode && p.periode.code === 'ete' ? 'après-midi libre : plage, glaces, sortie avec les copines ou sieste à cause de la chaleur' : p.periode && !p.periode.cours ? 'après-midi libre de vacances : sortie avec une amie, série ou détente' : 'après-midi libre : sortie avec une amie, détente ou révisions', 0.7],
        [1140, 1215, 'diner', 'dîner avec ta famille', 0.5],
        [1215, 1e9, 'soiree', 'soirée tranquille à la maison, le téléphone à la main', 1],
      ];
  for (const [debut, fin, code, libelle, d] of segments) {
    if (mm >= debut && mm < fin) return fait(code, libelle, d);
  }
  return fait('libre', 'tu es tranquille', 0.8);
}

// Le Ramadan change la journée : pas de déjeuner, de la fatigue, la préparation puis la rupture du jeûne (iftar).
function ramadanVie(fait, date, cfg, mm, code, libelle, d) {
  const maghrib = C.coucherSoleil(date, cfg);
  if (mm >= maghrib - 30 && mm < maghrib + 75) return fait('iftar', "c'est l'heure de rompre le jeûne (iftar) avec ta famille : dattes, lait ribot, chorba, bourek", 0.4);
  if (mm >= maghrib - 120 && mm < maghrib - 30) return fait('preparatifs', "tu aides à préparer l'iftar, tu as faim et tu es un peu à cran, le jeûne touche à sa fin", 0.45);
  if (code === 'repas') return fait('jeune', "tu jeûnes (Ramadan) : pas de déjeuner, tu te reposes, fatiguée", 0.5);
  if (code === 'diner') return fait('soiree', "soirée en famille après l'iftar : thé, gâteaux, peut-être la prière de tarawih", 0.8);
  if (code === 'soiree') return fait(code, 'soirée de Ramadan, éveillée tard, le téléphone à la main, des visites ou des sorties entre amis', d);
  if (['reveil', 'cours', 'matin', 'libre'].includes(code)) return fait(code, `${libelle} (tu jeûnes : fatiguée, la tête un peu lourde)`, d * 0.9);
  return fait(code, libelle, d);
}

// « Jour de vie » : il commence au réveil. Entre minuit et le réveil, on est encore dans la journée d'hier.
function jourDeVie(date = new Date(), cfg = {}) {
  const { life } = contexteSommeil(date, cfg);
  return life;
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

// Extrait la balise [CITE:n] : l'IA choisit le message (numéro) auquel elle répond en le citant.
function extraireCitation(texte) {
  const re = /\[CITE\s*:\s*#?(\d{1,2})\s*\]/gi;
  let n = null;
  const sans = String(texte || '').replace(re, (_, k) => {
    if (n === null) n = Number(k);
    return '';
  });
  return { texte: sans.trim(), n };
}

// ---------- Messages spontanés ----------

const CONSIGNES = {
  bonjour: 'Tu viens de commencer ta journée : envoie un petit mot de bonjour naturel (pas toujours le même).',
  nouvelles: 'Prends de ses nouvelles de façon naturelle, en lien avec ce que tu sais de lui ou de sa journée.',
  pensee: 'Tu penses à lui : envoie un petit mot spontané et affectueux, sans question forcée.',
  anecdote: 'Raconte-lui un petit truc qui t\'est arrivé ou que tu as vu aujourd\'hui, cohérent avec ce que tu fais en ce moment.',
  fil: 'Parle-lui de l\'un de tes petits fils de vie du moment (ta série, ton livre, ta langue ou ton défi, voir « TON MONDE EN CE MOMENT ») avec un détail précis, sans lui demander de s\'y intéresser.',
  souvenir: 'Tu repenses à un moment de vos discussions : reviens dessus naturellement.',
  question: 'Pose-lui une vraie question curieuse sur lui (ses goûts, ses projets, son passé, sa journée), en lien avec ce que tu sais de lui. Une seule question, courte et naturelle.',
  blague: 'Envoie-lui quelque chose de drôle ou un petit défi taquin.',
  bonne_nuit: 'Tu vas bientôt dormir : souhaite-lui bonne nuit.',
  manque: 'Il te manque : ça fait un moment que vous ne vous êtes pas parlé. Écris-lui un message court et sincère qui dit que tu penses à lui ou qu\'il te manque, sans reproche, sans culpabiliser, sans le sommer de répondre.',
  proposition: 'Propose-lui un petit plan à deux, concret et simple (un appel ce soir, regarder un film chacun de son côté en s\'écrivant, une sortie ce week-end, un café). Tu proposes, tu n\'imposes pas, et tu acceptes qu\'il dise non.',
  partage: 'Partage-lui un coup de cœur du moment (une chanson que tu écoutes en boucle, une phrase lue, un truc drôle vu, une idée). Cite un titre ou un détail précis qui colle à tes goûts, sans demander qu\'il aime.',
  soutien: 'Plus tôt, il n\'avait pas l\'air d\'aller bien et tu y repenses. Prends de ses nouvelles avec délicatesse, sans lui rappeler ce qu\'il a dit mot pour mot, sans le presser de se confier, juste pour qu\'il sente que tu es là.',
  reconciliation: 'Tu étais un peu froissée tout à l\'heure et tu n\'as plus envie de rester sur ça. Fais le premier pas avec simplicité (un mot doux, une petite blague, ou dire que tu y repensais), sans exiger d\'excuses et sans faire comme si de rien n\'était si ça t\'avait fait mal.',
  decision: 'Annonce-lui une décision que TU as prise pour toi (ce que tu vas faire ce soir ou demain, un plan que tu proposes, une résolution), en lien avec tes envies du jour et ta situation. Tu ne demandes pas la permission : tu informes ou tu proposes.',
};

// Plan des messages spontanés de la journée : heures et types, tirés une fois par jour.
function planDuJour(date = new Date(), cfg = {}, r = Math.random) {
  const j = jourDeVie(date, cfg);
  const items = [];
  if (r() < 0.85) items.push({ at: j.reveil + entre(10, 90, r), type: 'bonjour', fait: false });

  const max = Math.max(0, Math.round(num(cfg.initiativeParJour, 3)));
  const n = entre(Math.max(0, max - 2), max, r);
  const debut = Math.max(j.reveil + 90, 600);
  const fin = j.coucher - 90;
  const choisis = [];
  for (let essai = 0; essai < 40 && choisis.length < n && fin > debut; essai++) {
    const at = Math.round(alea(debut, fin, r));
    if (choisis.every((x) => Math.abs(x - at) >= Math.max(50, num(cfg.initiativeEcartMin, 90) - 10))) choisis.push(at);
  }
  const types = ['nouvelles', 'pensee', 'anecdote', 'blague', 'pensee', 'nouvelles', 'decision', 'decision'];
  if (cfg.parlerSouvenirs) types.push('souvenir', 'souvenir');
  if (cfg.mondeVivant) types.push('fil', 'fil');
  const nbQuestions = Math.round(Math.max(0, Math.min(100, num(cfg.curiosite, 0))) / 25); // 0 à 4 « parts » de questions
  for (let i = 0; i < nbQuestions; i++) types.push('question');
  // Tirage sans remise : on évite d'avoir deux fois le même type de message dans la journée tant qu'il reste du choix.
  let pool = [...types];
  choisis.forEach((at) => {
    if (!pool.length) pool = [...types];
    const type = pool[Math.floor(r() * pool.length)];
    const reste = pool.filter((x) => x !== type);
    pool = reste.length ? reste : pool;
    items.push({ at, type, fait: false });
  });

  if (r() < 0.8) items.push({ at: j.coucher - entre(15, 50, r), type: 'bonne_nuit', fait: false });
  return items.sort((a, b) => a.at - b.at);
}

module.exports = {
  alea,
  entre,
  graine,
  heureLocale,
  parametresVie,
  ramadanVie,
  etatDeVie,
  jourDeVie,
  humeur,
  latence,
  formatDuree,
  planFrappe,
  ajouterFaute,
  extraireReaction,
  extraireCitation,
  planDuJour,
  CONSIGNES,
};
