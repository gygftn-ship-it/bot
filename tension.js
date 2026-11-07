// Tension qui se construit (v8.2) : deux choses qui font le charme sans jamais monter en intensité.
//  1. UN FIL DE TENSION sur 2 à 3 jours : un moment qui a chauffé, laissé en suspens, revient en allusion,
//     puis en attente, puis se referme en douceur. Un seul fil à la fois, des pauses entre deux fils.
//  2. LE RYTHME : un message très court qui laisse un blanc, deux bulles hésitantes, un petit silence avant de répondre.
// AUCUN appel IA en plus : des tirages déterministes (même message = même tirage) et un petit état dans etat.json
// (e.tension). Tout reste suggéré, jamais cru. Fonctions pures, testables.

const H = require('./humain');

const JOUR = 86400000;
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘]/g, "'");
const jourEntre = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / JOUR);
const borne = (x, a, b) => Math.max(a, Math.min(b, x));

function nouvelEtat() {
  return { fil: null, finCle: null, rythme: { hist: [], depuis: 99 } };
}

// Remet l'état en forme (ancien fichier, champ manquant) et passe au nouveau jour.
function normaliser(t, cle) {
  if (t.refus !== undefined) delete t.refus; // ancien champ du « non » joueur (retiré)
  if (!t.rythme || typeof t.rythme !== 'object') t.rythme = { hist: [], depuis: 99 };
  if (!Array.isArray(t.rythme.hist)) t.rythme.hist = [];
  return t;
}

// ---------- 1. Le fil de tension ----------

// Elle laisse une porte entrouverte (« plus tard », « tu verras », « fais-moi languir »…).
const REPORT = /\b(plus tard|tu verras|patience|pas maintenant|pas ce soir|on verra|tu vas devoir attendre|tu attendras|languir|je te laisse imaginer|la suite|tu le meriteras|merite[- ]le|pas si vite|demain peut ?etre)\b/;
function reporteDansMessage(texteElle) { return REPORT.test(norm(texteElle)); }

const JOURS_MAX_DEFAUT = 3;
const PAUSE_ENTRE_FILS = 4; // jours minimum entre la fin d'un fil et le suivant

function joursMax(cfg = {}) { return borne(Math.round(Number(cfg.tensionJoursMax) || JOURS_MAX_DEFAUT), 1, 5); }

// Étape du jour : 0 = pas de fil (ou même jour : la tension se construit dans la conversation), sinon nombre de jours écoulés.
function jourDuFil(t, cle) {
  if (!t || !t.fil) return 0;
  return Math.max(0, jourEntre(t.fil.cle, cle));
}

// Nom de l'étape : 'allusion' (le lendemain), 'attente' (entre les deux), 'relache' (dernier jour).
function nomEtape(t, cle, cfg = {}) {
  const d = jourDuFil(t, cle);
  if (d <= 0) return null;
  const max = joursMax(cfg);
  if (d >= max) return 'relache';
  if (d === 1) return 'allusion';
  return 'attente';
}

// Ferme le fil quand il est fini (ou resté trop longtemps). Renvoie 'fin' si quelque chose a changé.
function maintenir(t, cle, cfg = {}) {
  normaliser(t, cle);
  if (t.fil && jourDuFil(t, cle) > joursMax(cfg)) { fermer(t, cle); return 'fin'; }
  return null;
}

function fermer(t, cle) {
  t.fil = null;
  t.finCle = cle;
}

// Ouvre un fil à la fin d'un échange qui a chauffé et qu'elle a laissé en suspens.
// o : { cle, now, chaleur (0..3), reporte (elle a dit « plus tard »…),
//       curseur (0..3), lien, bloque, graine }
function noter(t, o, cfg = {}) {
  normaliser(t, o.cle);
  if (t.fil) return false;
  if (o.bloque || (o.curseur || 0) < 2) return false;
  if (typeof o.lien === 'number' && o.lien < 30) return false;
  if (t.finCle && jourEntre(t.finCle, o.cle) < PAUSE_ENTRE_FILS) return false;
  const chaleur = o.chaleur || 0;
  const suspens = o.reporte || chaleur >= 3;
  if (chaleur < 2 || !suspens) return false;
  const r = H.graine('fil-tension' + o.cle + String(o.graine || ''))();
  if (r > 0.7) return false; // pas systématique
  t.fil = { cle: o.cle, at: o.now || Date.now(), montre: { cle: null, n: 0 }, spontane: null };
  return true;
}

// Combien de fois le bloc du fil a été montré aujourd'hui (il n'est donné que 3 fois par jour au plus).
function montreAujourdhui(t, cle) {
  const m = t && t.fil && t.fil.montre;
  return m && m.cle === cle ? m.n : 0;
}
function marquerMontre(t, cle) {
  if (!t.fil) return;
  const m = t.fil.montre && t.fil.montre.cle === cle ? t.fil.montre : { cle, n: 0 };
  m.n += 1;
  t.fil.montre = m;
}

const FIN_BLOC = ' Si ce n\'est pas le moment (il est triste, occupé, il parle d\'autre chose), tu n\'en parles pas : le fil attendra ou s\'éteindra tout seul. Jamais crue : tu suggères.';
const TEXTES_FIL = {
  allusion:
    'FIL DE TENSION (hier, ça a chauffé entre vous et tu l\'as laissé en suspens) : il reste quelque chose dans l\'air. ' +
    'Aujourd\'hui, au détour de la conversation, UNE seule allusion très courte, sans rien expliciter (un « j\'ai pas oublié hier… », un « arrête de me regarder comme ça »). ' +
    'S\'il n\'enchaîne pas, tu laisses tomber. Rien de plus appuyé qu\'un clin d\'œil.',
  attente:
    'FIL DE TENSION (ça dure depuis quelques jours) : tu continues à le faire patienter, avec le sourire. ' +
    'Une seule fois aujourd\'hui, tu laisses entendre que tu y penses encore et que tu t\'amuses à le faire attendre (« patience… », « tu verras »), sans rien promettre de précis. Pas de pression, pas de reproche s\'il ne relève pas.',
  relache:
    'FIL DE TENSION (le moment de le refermer) : tu l\'as assez fait languir. Aujourd\'hui tu relâches avec douceur : un aveu tendre (« j\'ai adoré te faire attendre, mais tu m\'as manqué »), ' +
    'l\'envie de passer du vrai temps avec lui (un long appel, un vocal, un moment rien que pour vous deux). Un dénouement tendre et complice, pas une scène. Après ça, le fil est fini : tu reviens à la vie normale.',
};

// Bloc du prompt pour la conversation en cours.
function blocFil(t, o = {}, cfg = {}) {
  if (!t || !t.fil || o.bloque) return '';
  const nom = nomEtape(t, o.cle, cfg);
  if (!nom) return '';
  if (montreAujourdhui(t, o.cle) >= 3) return '';
  return TEXTES_FIL[nom] + FIN_BLOC;
}

// Après une réponse : le fil du jour a été montré une fois de plus ; au dernier jour, il se referme après la réponse où il a été donné.
function apresReponse(t, o, cfg = {}) {
  normaliser(t, o.cle);
  if (!t.fil || o.bloque) return null;
  const nom = nomEtape(t, o.cle, cfg);
  if (!nom) return null;
  marquerMontre(t, o.cle);
  if (nom === 'relache' && montreAujourdhui(t, o.cle) >= 2) { fermer(t, o.cle); return 'fin'; }
  return nom;
}

// Fil abandonné en silence (bouderie, il va mal) : pas de rattrapage.
function abandonner(t, cle) {
  if (!t || !t.fil) return false;
  fermer(t, cle);
  return true;
}

// Message spontané du fil : un seul par jour, en fin d'après-midi / début de soirée, si rien ne la retient.
// ctx : { cle, m, reveil, coucher }
function messageSpontane(t, ctx, cfg = {}) {
  if (!t || !t.fil) return null;
  const nom = nomEtape(t, ctx.cle, cfg);
  if (!nom || t.fil.spontane === ctx.cle) return null;
  const debut = 15 * 60 + Math.round(H.graine('tension-msg' + ctx.cle)() * 240); // 15h → 19h
  if (ctx.m < debut || ctx.m > Math.min(debut + 180, ctx.coucher - 60)) return null;
  return nom;
}
function marquerSpontane(t, cle) { if (t.fil) t.fil.spontane = cle; }

const CONSIGNES_SPONTANEES = {
  allusion: 'Tu repenses à hier : écris un message TRÈS court qui y fait allusion sans le dire (un clin d\'œil, une phrase en suspens, « j\'ai pas oublié »). Aucune question, aucun détail.',
  attente: 'Tu t\'amuses à le faire patienter : un message très court et un peu mystérieux (« patience… », « tu vas attendre »), sans rien promettre de précis. Aucune question.',
  relache: 'Tu as assez fait languir : un message doux qui referme le jeu, tendre et complice (« tu m\'as manqué », l\'envie d\'un long appel ou d\'un vocal ce soir). Court, jamais cru.',
};
const consigneSpontanee = (nom) => CONSIGNES_SPONTANEES[nom] || CONSIGNES_SPONTANEES.allusion;

// ---------- Limites ----------

// Toujours là dès que l'ambiance est joueuse : son non à LUI passe avant tout.
const BLOC_LIMITES = 'LIMITES (toujours) : s\'il dit non, stop, « pas envie », ou semble mal à l\'aise, tu arrêtes net, avec tendresse, sans insister ni bouder ni te vexer, et tu changes de sujet. Le jeu ne vaut que si les deux le veulent.';
function blocLimites(chaleur) { return (chaleur || 0) >= 1 ? BLOC_LIMITES : ''; }

// ---------- 2. Le rythme ----------

const RYTHMES = {
  bref: { poids: 30, bulles: 1, texte: 'RYTHME : cette fois, un seul message TRÈS court (2 à 6 mots) qui laisse un blanc, rien de plus, sans question. Le silence qui suit fait le travail.' },
  lent: { poids: 30, bulles: 2, texte: 'RYTHME : cette fois, deux bulles : d\'abord un mot ou deux, comme une hésitation, puis une phrase un peu plus longue et plus lente, avec « … ».' },
  languir: { poids: 20, bulles: 2, pause: [20000, 55000], texte: 'RYTHME : cette fois, tu prends ton temps : ta réponse arrive après un petit silence (le programme s\'en charge). Écris-la courte et posée.' },
  normal: { poids: 20, bulles: 2, texte: '' },
};

// o : { cle, message, chaleur, filActif, curseur, bloque }
// Renvoie { nom, texte, bulles, pauseMs } ou null (rythme habituel).
function choisirRythme(t, o, cfg = {}) {
  normaliser(t, o.cle);
  if (cfg.rythmeSensuel === false || o.bloque) return null;
  if ((o.curseur || 0) < 2 || !((o.chaleur || 0) >= 2 || o.filActif)) return null;
  const hist = t.rythme.hist;
  const dernier = hist[hist.length - 1];
  const permis = Object.keys(RYTHMES).filter((n) => n !== dernier && !(n === 'bref' && hist.includes('bref')));
  const r = H.graine('rythme' + o.cle + norm(o.message).slice(0, 40) + hist.length + (t.rythme.depuis || 0));
  const total = permis.reduce((s, n) => s + RYTHMES[n].poids, 0);
  let x = r() * total;
  let nom = permis[permis.length - 1];
  for (const n of permis) { x -= RYTHMES[n].poids; if (x < 0) { nom = n; break; } }
  const d = RYTHMES[nom];
  const pauseMs = d.pause ? Math.round(d.pause[0] + r() * (d.pause[1] - d.pause[0])) : 0;
  return { nom, texte: d.texte, bulles: d.bulles, pauseMs };
}

function noterRythme(t, nom, cle) {
  normaliser(t, cle);
  t.rythme.hist.push(nom || 'normal');
  t.rythme.hist = t.rythme.hist.slice(-3);
  t.rythme.depuis = 0;
}

// Le programme garantit la forme, même si le modèle déborde.
function appliquerRythme(morceaux, nom) {
  const m = (morceaux || []).filter(Boolean);
  if (!m.length) return m;
  if (nom === 'bref') {
    let un = m[0];
    if (un.length > 70) {
      const phrase = un.match(/^.{8,70}?[.!?…]/);
      un = phrase ? phrase[0] : un.slice(0, 70).replace(/\s+\S*$/, '…');
    }
    return [un];
  }
  if (nom === 'lent' && m.length > 2) return [m[0], m.slice(1).join(' ')];
  return m;
}

// À appeler après chaque réponse envoyée : les compteurs « depuis » avancent.
function avancer(t, cle) {
  normaliser(t, cle);
  t.rythme.depuis = Math.min(99, (t.rythme.depuis || 0) + 1);
}

module.exports = {
  nouvelEtat, normaliser, reporteDansMessage, jourDuFil, nomEtape, maintenir, fermer, noter, blocFil, apresReponse, abandonner,
  messageSpontane, marquerSpontane, consigneSpontanee, blocLimites,
  choisirRythme, noterRythme, appliquerRythme, avancer, montreAujourdhui, joursMax, RYTHMES, TEXTES_FIL,
};
