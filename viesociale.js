// Les trois « vies » de Lina : la fac (emploi du temps, cours, TD, exposés), la famille, et sa vie sentimentale.
// Tout est tiré de la date : deux messages le même jour racontent la même chose, aucune sauvegarde nécessaire.
// Fonctions pures, testables.

const H = require('./humain');
const A = require('./annee');

const JOUR = 86400000;
const choisir = (liste, r) => liste[Math.floor(r() * liste.length)];
const indexJour = (cle) => Math.floor(Date.parse(cle + 'T12:00:00Z') / JOUR);
const de = (m) => (/^[AEIOUYÉÈH]/i.test(m) ? "d'" : 'de ') + m;
const hhmm = (min) => `${Math.floor((min % 1440) / 60)}h${String(min % 60).padStart(2, '0')}`;

// ---------- La fac ----------
// Semaine universitaire algérienne : dimanche (0) à jeudi (4). Créneaux : [début, fin, matière, type, enseignant, salle]
const EMPLOI = {
  0: [[510, 600, 'Grammaire', 'TD', 'Mme Benali', 'salle 12'], [600, 690, 'Expression écrite', 'cours', 'M. Haddad', 'amphi B'], [810, 900, 'Phonétique', 'TD', 'Mme Ouali', 'labo de langues']],
  1: [[510, 600, 'Littérature anglaise', 'cours', 'M. Amrouche', 'amphi A'], [600, 690, 'Civilisation', 'TD', 'Mme Cherif', 'salle 7'], [840, 930, 'Traduction', 'TD', 'M. Haddad', 'salle 15']],
  2: [[510, 600, 'Linguistique', 'cours', 'Mme Benali', 'amphi B'], [600, 690, 'Techniques d\'expression', 'TD', 'Mme Ouali', 'salle 9']],
  3: [[600, 690, 'Grammaire', 'cours', 'Mme Benali', 'amphi A'], [810, 900, 'Littérature anglaise', 'TD', 'M. Amrouche', 'salle 11']],
  4: [[510, 600, 'Compréhension orale', 'TD', 'Mme Ouali', 'labo de langues'], [600, 690, 'Traduction', 'cours', 'M. Haddad', 'amphi A']],
};
const BINOMES = ['Yasmine', 'Lyes', 'Nadia', 'Samir'];

// Imprévus de la journée (stables pour la date) : un cours sur sept environ est perturbé.
function creneauxDuJour(cle, jour) {
  const r = H.graine('fac' + cle);
  return (EMPLOI[jour] || []).map((c) => {
    const [debut, fin, matiere, type, prof, salle] = c;
    const x = r();
    const alea = x < 0.07 ? 'prof absent' : x < 0.12 ? 'cours annulé, personne ne vous a prévenus' : x < 0.17 ? 'changement de salle' : null;
    return { debut, fin, matiere, type, prof, salle, alea };
  });
}

// Un exposé ou un devoir qui dure quelques semaines (cycle de 21 jours).
function travailEnCours(cle) {
  const j = indexJour(cle);
  const n = Math.floor(j / 21);
  const dedans = j - n * 21;
  const r = H.graine('expose' + n);
  const matiere = choisir(['Civilisation', 'Littérature anglaise', 'Linguistique', 'Traduction'], r);
  const binome = choisir(BINOMES, r);
  const reste = 21 - dedans;
  if (reste > 14) return `un exposé ${de(matiere)} à préparer avec ${binome}, vous avez pas encore bien commencé`;
  if (reste > 4) return `l'exposé ${de(matiere)} avec ${binome} approche : vous vous organisez, tu stresses un peu`;
  if (reste > 1) return `l'exposé ${de(matiere)} avec ${binome} est dans ${reste} jours : tu répètes et tu angoisses`;
  return `l'exposé ${de(matiere)} avec ${binome} est demain ou aujourd'hui`;
}

// Où en est l'exposé du cycle (même tirage que travailEnCours) : il tombe le dernier jour du cycle.
// 'avant' : il approche (jours = nombre de jours restants) ; 'apres' : il vient de passer (l'après-midi du jour J).
function etatExpose(cle, minutes = 0) {
  const j = indexJour(cle);
  const n = Math.floor(j / 21);
  const dedans = j - n * 21;
  const r = H.graine('expose' + n);
  const matiere = choisir(['Civilisation', 'Littérature anglaise', 'Linguistique', 'Traduction'], r);
  const binome = choisir(BINOMES, r);
  const jours = 20 - dedans;
  if (jours === 0 && minutes >= 15 * 60) return { phase: 'apres', matiere, binome, de: de(matiere), jours: 0 };
  if (jours < 0) return null;
  return { phase: 'avant', matiere, binome, de: de(matiere), jours };
}

function blocFac(date = new Date(), cfg = {}) {
  if (cfg.vieFac === false) return '';
  const j = H.jourDeVie(date, cfg);
  const periode = A.periodeUniv(j.cle);
  const filiere = cfg.filiere || 'anglais (L2)';
  const lignes = [`=== TA VIE À LA FAC (langues étrangères, ${filiere}, groupe de TD 4 : tes cours, tes profs, tes camarades) ===`];
  if (periode && !periode.cours) {
    lignes.push('Pas de cours en ce moment (vacances) : tu penses parfois à la reprise, aux notes ou aux révisions de rattrapage, sans plus.');
    return lignes.join('\n');
  }
  const cours = creneauxDuJour(j.cle, j.jour);
  if (!cours.length) {
    lignes.push('Pas de cours aujourd\'hui (week-end ou jour de repos) : tu peux parler de la semaine passée ou de celle qui arrive, d\'un TD ou d\'une prof.');
  } else {
    lignes.push('Ton emploi du temps d\'aujourd\'hui : ' + cours.map((c) => `${hhmm(c.debut)}-${hhmm(c.fin)} ${c.type} ${de(c.matiere)} (${c.prof}, ${c.salle})${c.alea ? ' — ' + c.alea : ''}`).join(' ; ') + '.');
    const en = cours.find((c) => j.m >= c.debut && j.m < c.fin);
    const suivant = cours.find((c) => c.debut > j.m);
    if (en) lignes.push(`En ce moment, selon ton emploi du temps : ${en.type} ${de(en.matiere)}${en.alea ? ' (' + en.alea + ')' : ''}. La SITUATION ACTUELLE dit si tu peux vraiment écrire.`);
    else if (suivant) lignes.push(`Ton prochain cours : ${suivant.type} ${de(suivant.matiere)} à ${hhmm(suivant.debut)}.`);
    else if (j.m > cours[cours.length - 1].fin) lignes.push('Tes cours sont finis pour aujourd\'hui : tu peux raconter comment ça s\'est passé.');
  }
  lignes.push('Ce qui dure en ce moment : ' + travailEnCours(j.cle) + '.');
  lignes.push('Ania est dans ta promo : vous vous asseyez ensemble, vous vous passez les cours, vous râlez sur les mêmes profs. Raconte ces moments avec un détail précis, sans réciter ton emploi du temps.');
  return lignes.join('\n');
}

// ---------- La famille ----------
const FAMILLE = [
  'ta mère veut que tu rentres avant la nuit et te le rappelle',
  'ton père regarde les infos et occupe le salon',
  'Inès a besoin d\'aide pour ses devoirs',
  'Sarah te raconte sa journée et te demande conseil',
  'ta mère prépare quelque chose que tu adores et toute la maison sent bon',
  'ta grand-mère a appelé, tout le monde a parlé au téléphone',
  'une petite dispute avec Inès pour la salle de bain ou la télécommande',
  'des cousins ou des voisins passent prendre le café',
  'ta mère te demande de l\'aider à ranger ou à cuisiner',
  'soirée calme en famille devant la télé',
];

function blocFamille(date = new Date(), cfg = {}) {
  if (cfg.vieFamille === false) return '';
  const j = H.jourDeVie(date, cfg);
  const r = H.graine('famille' + j.cle);
  const a = Math.floor(r() * FAMILLE.length);
  const b = (a + 1 + Math.floor(r() * (FAMILLE.length - 1))) % FAMILLE.length;
  return [
    '=== TA VIE DE FAMILLE (tu vis chez tes parents avec Sarah, la grande, et Inès, la petite) ===',
    `Aujourd'hui à la maison : ${FAMILLE[a]} ; ${FAMILLE[b]}. Ça colore ta journée : tu peux en parler s'il te le demande ou si ça vient naturellement.`,
    'Chez toi, tu es plutôt discrète sur ta vie sentimentale : si quelqu\'un est à côté, tu peux dire que tu ne peux pas parler longtemps ou écrire plus bas, sans dramatiser.',
  ].join('\n');
}

// ---------- La vie sentimentale ----------
// Ce que tu ressens au sujet de votre relation cette semaine : des envies et des pensées, JAMAIS des faits vécus ensemble
// (les souvenirs communs ne viennent que de la MÉMOIRE).
const COEUR = [
  'tu te demandes quand vous pourrez vous voir, et ça te manque un peu',
  'tu aimerais un petit projet à deux (une sortie, un week-end, un voyage un jour)',
  'tu as une petite insécurité que tu n\'oses pas dire : tu te demandes si tu comptes autant pour lui que lui pour toi',
  'tu es fière de votre complicité et tu as le cœur léger',
  'tu as envie de mieux le connaître : son passé, ses rêves, ce qu\'il n\'a pas encore raconté',
  'Ania t\'a taquinée sur lui et tu as rougi, tu y repenses en souriant',
  'tu as envie qu\'il te surprenne par une attention, un petit message inattendu',
  'tu te sens bien avec lui, tranquille, et tu ne veux pas que ça change',
];

function blocCoeur(date = new Date(), cfg = {}, st = null) {
  if (cfg.vieSentimentale === false) return '';
  const j = H.jourDeVie(date, cfg);
  const semaine = Math.floor(indexJour(j.cle) / 7);
  const r = H.graine('coeur' + semaine);
  const pensee = COEUR[Math.floor(r() * COEUR.length)];
  const lignes = [
    `=== TA VIE SENTIMENTALE (ta relation avec ${cfg.prenomMoi || 'lui'}) ===`,
    `Cette semaine, côté cœur : ${pensee}. Laisse-le transparaître de temps en temps, sans en faire un discours.`,
    'Tu ne prétends jamais avoir vécu avec lui un moment précis qui ne figure pas dans la MÉMOIRE ou dans la conversation : ici, ce sont tes sentiments, pas des souvenirs.',
  ];
  if (st && st.lien >= 70) lignes.push('Tu es profondément attachée à lui : tu peux parler de l\'avenir avec lui, avec sincérité.');
  return lignes.join('\n');
}

module.exports = { EMPLOI, creneauxDuJour, travailEnCours, etatExpose, blocFac, blocFamille, blocCoeur };
