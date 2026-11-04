// Ce qui fait qu'elle « se souvient » et qu'elle écrit comme quelqu'un de vivant :
// - suivi de ce que tu lui annonces (un entretien, un examen, un voyage…) : elle te souhaite bonne chance
//   le jour J, puis demande comment ça s'est passé ;
// - anti-répétition : elle évite de recommencer toujours par le même mot, les mêmes emojis, la même question ;
// - longueur en miroir : elle écrit court quand tu écris court.
// Fonctions pures, testables.

const MARQUEUR = '###RAPPELS###';
const JOUR_MS = 86400000;

// ---------- Rappels datés ----------

// La réponse de l'IA contient la mémoire, puis le marqueur, puis une ligne « AAAA-MM-JJ | description » par rappel.
function separerMemoire(texte) {
  const brut = String(texte || '').replace(/\*\*/g, '');
  const i = brut.search(/^[ \t]*#{0,3}[ \t]*RAPPELS[ \t]*#{0,3}[ \t]*:?[ \t]*$/im);
  const faits = (i >= 0 ? brut.slice(0, i) : brut).trim();
  const rappels = [];
  if (i >= 0) {
    for (const ligne of brut.slice(i).split('\n').slice(1)) {
      const m = ligne.match(/^[-*•\s]*(\d{4}-\d{2}-\d{2})\s*[|:–-]\s*(.{3,160})$/);
      if (!m) continue;
      const d = new Date(m[1] + 'T12:00:00Z');
      if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== m[1]) continue;
      rappels.push({ date: m[1], texte: m[2].trim() });
    }
  }
  return { faits, rappels: rappels.slice(0, 8) };
}

const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// Ajoute les nouveaux rappels sans doublon (même date et texte proche), garde l'état de suivi des anciens,
// oublie ce qui date de plus de 10 jours.
function fusionnerRappels(anciens, nouveaux, cleAujourdhui) {
  const limite = new Date(new Date(cleAujourdhui + 'T12:00:00Z').getTime() - 10 * JOUR_MS).toISOString().slice(0, 10);
  const sortie = (anciens || []).filter((r) => r.date >= limite);
  for (const n of nouveaux || []) {
    if (n.date < limite) continue;
    const mots = new Set(norm(n.texte).split(' ').filter((w) => w.length > 3));
    const doublon = sortie.some((o) => {
      if (o.date !== n.date) return false;
      const communs = norm(o.texte).split(' ').filter((w) => mots.has(w)).length;
      return norm(o.texte) === norm(n.texte) || communs >= Math.min(2, mots.size);
    });
    if (!doublon) sortie.push({ date: n.date, texte: n.texte });
  }
  return sortie.sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-12);
}

const ecartJours = (a, b) => Math.round((new Date(a + 'T12:00:00Z') - new Date(b + 'T12:00:00Z')) / JOUR_MS);

// Rappels à traiter aujourd'hui : « jour » (un petit mot d'encouragement) ou « suivi » (comment ça s'est passé).
function rappelsDus(rappels, cleAujourdhui) {
  const dus = [];
  for (const r of rappels || []) {
    const ecart = ecartJours(cleAujourdhui, r.date); // > 0 : la date est passée
    if (ecart === 0 && !r.encourage) dus.push({ type: 'jour', rappel: r });
    else if (ecart >= 1 && ecart <= 3 && !r.suivi) dus.push({ type: 'suivi', rappel: r });
  }
  return dus;
}

function consigneRappel(due, moi = 'lui') {
  const { type, rappel } = due;
  if (type === 'jour') {
    return `${moi} t'avait dit qu'aujourd'hui il y avait ceci : « ${rappel.texte} ». Envoie-lui un petit mot d'encouragement, naturel et court, comme quelqu'un qui s'en souvient. S'il t'en a déjà parlé aujourd'hui dans la conversation, réponds [RIEN].`;
  }
  return `${moi} t'avait parlé de ceci (le ${rappel.date}) : « ${rappel.texte} ». Demande-lui simplement comment ça s'est passé, sans être lourde. S'il t'en a déjà parlé depuis dans la conversation, réponds [RIEN].`;
}

// Bloc ajouté à la mémoire : ce qui arrive bientôt dans sa vie à lui.
function blocRappels(rappels, cleAujourdhui) {
  const lignes = [];
  for (const r of rappels || []) {
    const ecart = ecartJours(r.date, cleAujourdhui); // > 0 : à venir
    if (ecart >= 0 && ecart <= 7) lignes.push(`- ${ecart === 0 ? "aujourd'hui" : ecart === 1 ? 'demain' : `dans ${ecart} jours`} : ${r.texte}`);
  }
  if (!lignes.length) return '';
  return ['=== CE QUI L\'ATTEND BIENTÔT (il te l\'a dit : tu peux y faire allusion, lui souhaiter bonne chance, sans réciter) ===', ...lignes].join('\n');
}

// Consigne ajoutée à la mise à jour de la mémoire.
function consigneRappelsMemoire(cleAujourdhui) {
  return [
    `Ensuite, sur une nouvelle ligne, écris exactement ${MARQUEUR} puis, une par ligne, les choses précises qu'il a annoncées pour une date à venir (examen, entretien, rendez-vous, voyage, anniversaire d'un proche…) au format AAAA-MM-JJ | description courte.`,
    `Aujourd'hui, nous sommes le ${cleAujourdhui}. Ne note que ce qui est daté clairement ; s'il n'y a rien, n'écris rien après ${MARQUEUR}.`,
  ].join('\n');
}

// Un message qui annonce probablement quelque chose de daté : on met la mémoire à jour tout de suite,
// pour qu'elle puisse y penser le jour J même si la mise à jour régulière est encore loin.
const ANNONCE = /\b(demain|après[- ]demain|apres[- ]demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|dans \d+ jours?|la semaine prochaine|examen|exam|entretien|rendez[- ]vous|rdv|voyage|concours|soutenance|\d{1,2}\/\d{1,2})\b/i;
const annonceProbable = (texte) => ANNONCE.test(String(texte || ''));

// ---------- Anti-répétition ----------

const EMOJI = /\p{Extended_Pictographic}/gu;
const TICS = ['habibi', 'bébé', 'mon amour', 'mon cœur', 'mdr', 'mdrrr', 'haha', 'ahah', 'tkt', 'jsp', 'trop', 'franchement', 'genre'];

const contenuModele = (x) => String(x.content || '').replace(/\[REACT[^\]]*\]/gi, '').replace(/\[RIEN\]/gi, '').trim();

// Regarde ses derniers messages et repère ce qui revient trop souvent.
function analyserRepetitions(historique, n = 8, opts = {}) {
  const msgs = (historique || []).filter((x) => x.role === 'model').map(contenuModele).filter(Boolean).slice(-n);
  if (msgs.length < 3) return [];
  const conseils = [];
  const compte = (extrait) => {
    const c = new Map();
    for (const m of msgs) for (const v of new Set(extrait(m))) c.set(v, (c.get(v) || 0) + 1);
    return [...c.entries()].filter(([, k]) => k >= 3).sort((a, b) => b[1] - a[1]);
  };
  const emojis = compte((m) => m.match(EMOJI) || []).filter(([e]) => e !== '\u2764').slice(0, 3).map(([e]) => e);
  if (emojis.length) conseils.push(`tu as déjà mis ${emojis.join(' ')} dans plusieurs de tes derniers messages : change d'emoji ou n'en mets pas`);
  const debuts = compte((m) => [norm(m.split(/\s+/)[0] || '')].filter((w) => w.length > 1)).slice(0, 2).map(([w]) => w);
  if (debuts.length) conseils.push(`tu commences souvent par « ${debuts.join('» ou «')} » : commence autrement`);
  const tics = compte((m) => TICS.filter((t) => norm(m).split(' ').includes(norm(t)) || norm(m).includes(norm(t)))).map(([t]) => t).filter((t) => !debuts.includes(norm(t))).slice(0, 3);
  if (tics.length) conseils.push(`tu as beaucoup dit « ${tics.join('», «')} » récemment : varie tes expressions`);
  const dernieres = msgs.slice(-4);
  if (!opts.ignorerQuestions && dernieres.length === 4 && dernieres.every((m) => /\?\s*(\p{Extended_Pictographic}|\s)*$/u.test(m))) {
    conseils.push('tes 4 derniers messages finissent par une question : cette fois, réagis sans poser de question');
  }
  return conseils;
}

function blocRepetitions(historique, opts = {}) {
  const c = analyserRepetitions(historique, 8, opts);
  return c.length ? ['=== ÉVITE DE TE RÉPÉTER (tu es un humain, pas un script) ===', ...c.map((x) => `- ${x}`)].join('\n') : '';
}

// ---------- Longueur en miroir ----------

// Elle écrit court quand il écrit court : une réponse proportionnée à son message, jamais au-delà du maximum réglé.
function longueurAdaptee(message, max) {
  const m = Math.max(40, Number(max) || 180);
  const len = String(message || '').replace(/^\[(vocal|photo|vidéo|sticker|position partagée)\]\s*/i, '').trim().length;
  let cible = Math.round(len * 1.6 + 25);
  if (/\?/.test(String(message || ''))) cible = Math.max(cible, 80);
  if (/^\[vocal\]/i.test(String(message || '')) || /^\[photo\]/i.test(String(message || ''))) cible = Math.max(cible, 90);
  return Math.max(40, Math.min(m, cible));
}

module.exports = {
  MARQUEUR, annonceProbable, separerMemoire, fusionnerRappels, rappelsDus, consigneRappel, blocRappels, consigneRappelsMemoire,
  analyserRepetitions, blocRepetitions, longueurAdaptee,
};
