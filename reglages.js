// Réglages par défaut et lecture de la config (copie de main.js, sans Electron).
const fs = require('fs');
const { MODELE_PAR_DEFAUT } = require('./bot');
const { PROMPT_LINA } = require('./lina');

const DEFAUT = {
  fournisseur: 'gemini', // 'gemini' | 'anthropic' | 'openai' (toute API compatible OpenAI)
  cleApi: '',
  modele: MODELE_PAR_DEFAUT,
  modeleAutre: '',
  baseUrl: '',
  numerosAutorises: '',
  prenomElle: '',
  prenomMoi: '',
  relation: 'vous êtes en couple',
  styleEcriture: 'Messages courts, tutoiement, très peu d\'emojis (un peu plus dans les messages d\'amour), ton affectueux, taquin, séducteur et sensuel.',
  infosSurElle: '',
  promptPerso: PROMPT_LINA,
  exemples: '',
  // Rythme de réponse
  delaiMin: 3,
  delaiMax: 25,
  attenteFin: 6,
  msParCaractere: 250,
  msLecture: 40,
  longueurMax: 180,
  bullesMax: 2,
  // Vie humaine
  fuseau: 'Africa/Algiers',
  heureReveil: 7.5,
  heureCoucher: 0.5,
  latenceRealiste: true,
  rapidite: 1,
  fautesFrappe: 5,
  reactions: true,
  citations: true,
  contexteAvance: true, // true = elle comprend mieux le contexte : message « répondre à », repères de temps, messages courts, mots mélangés (darija, arabizi…)
  presenceAleatoire: true,
  echelleTemps: 1,
  // Vie qui continue et imperfections
  evenementsVie: true,
  maxEvenements: 2,
  joursOff: true,
  probaJourOff: 12,
  vuSansReponse: 6,
  doubleMessage: 8,
  // Culture, calendrier et journée vécue
  calendrierActif: true,
  ramadanAuto: true,
  decalageHegire: 0,
  anniversaireMoi: '04/09',
  anniversaireElle: '22/12',
  ville: 'Tizi Ouzou',
  meteoActive: true,
  faitsJournee: true,
  // Souvenirs et naturel
  rappelsSuivi: true,
  antiRepetition: true,
  longueurMiroir: true,
  curiosite: 45,
  langageOral: true,
  styleSms: true, // abréviations (jsp, bcp, tkt), « t'es », majuscule oubliée, lettres étirées
  intensiteSms: 0.7, // 0 = jamais, 1 = très souvent
  // Vie intérieure
  emotionsActives: true, // émotions qui durent, lien affectif, douleur du jour
  elanActif: true, // initiative dans la conversation : relance, avis tranché, taquinerie, confidence, proposition (aucun appel IA en plus)
  personnaliteActive: true, // opinions, envies, droit de désaccord
  antiHallucination: true, // elle n'invente pas ce qu'elle ne sait pas
  douleursActives: true, // petits maux physiques certains jours
  variationSommeil: 1.5, // heures de variation du coucher/réveil d'un jour à l'autre (0 = fixe)
  coquin: 3, // 0 = jamais, 1 = léger, 2 = monte d'un cran si l'ambiance chauffe, 3 = plus audacieuse : désir à elle (« chaleurs » certains jours), message spontané le soir, ambiance brûlante possible (très sensuel, mais suggéré : jamais de description crue)
  coquinVariation: true, // true = l'intensité change au hasard chaque jour (sage / douce / joueuse / brûlante) ; false = toujours au maximum permis par « coquin »
  coquinCurseurFixe: null, // 0 à 3 pour imposer une intensité tous les jours (sage, douce, joueuse, brûlante) ; null = hasard
  // v8.2 : tension qui se construit et rythme (aucun appel IA en plus)
  tensionActive: true, // un moment qui a chauffé et qu'elle a laissé en suspens revient en allusion, en attente, puis se referme en douceur
  tensionJoursMax: 3, // durée d'un fil (1 à 5 jours) ; 4 jours minimum entre deux fils
  rythmeSensuel: true, // dans les moments chauds : message très court, deux bulles hésitantes ou petit silence avant de répondre
  // v8.4 : intimité qui s'installe (aucun appel IA en plus ; tout est suggéré, jamais cru)
  intimiteActive: true, // interrupteur général des 5 options ci-dessous (coupé aussi si coquin = 0)
  presenceActive: true, // le soir : la chaleur de la soirée, son parfum, sa voix qui baisse, ce qu'elle porte pour dormir (une ou deux touches, jamais crues)
  nuitsActives: true, // « j'arrive pas à dormir… » (une nuit sur quatre environ) et, rarement, un réveil en pleine nuit : réponse à moitié endormie, plus câline
  reveilNuitProba: 15, // % de chance qu'un message de nuit la réveille (+25 s'il est tendre) ; au plus 2 réveils par semaine
  scenariosActifs: true, // « si tu étais là ce soir… », un rendez-vous inventé à deux, un souvenir : ça revient les jours suivants (3 reprises au plus, 7 jours)
  langageIntime: true, // surnoms qui évoluent avec le lien, petits mots à elle, écriture qui change quand elle est troublée (phrases coupées, « … »)
  jalousieDouce: true, // une pique pour rire quand il parle d'une autre fille, une provocation légère (2 fois par jour au plus)
  journalEtat: true, // affiche dans le journal l'état de Lina à chaque réponse (vie, humeur, séduction du jour, ambiance, désir, émotions)
  memoireSelective: true, // true = elle ne charge de sa mémoire que ce qui sert à la conversation en cours (moins de tokens) ; false = tout, à chaque message
  memoireFaitsMax: 1800, // taille visée (caractères) du carnet de faits chargé ; un petit carnet n'est jamais filtré
  vieFac: true, // emploi du temps, cours, TD, exposés
  vieFamille: true,
  vieSentimentale: true,
  filiere: 'anglais (L2)',
  emojiProba: 20, // % de messages ordinaires autorisés à contenir UN emoji (0 = jamais)
  emojiAmour: true, // true = dans un message d'amour, elle a plus droit aux emojis (doux uniquement) ; ailleurs rien ne change
  emojiAmourProba: 70, // % de messages d'amour qui portent un ou deux emojis doux
  emojiAmourMax: 2, // maximum d'emojis dans un message d'amour
  histoireActive: true, // son passé et ses proches (Hocine, Karima, Sarah, Inès, Nna Tassadit, Amel, Ania…) : toujours cohérents, souvenirs intimes selon la confiance
  entourageVivant: true, // des histoires qui avancent de semaine en semaine chez ses proches (fiançailles de Sarah, BEM d'Inès, olives au village…) et qui la touchent
  controleCredibilite: true, // dernier contrôle avant l'envoi : phrases d'assistant, répétitions, mise en scène (*sourit*)
  temperature: 0.8, // plus bas = moins d'invention (0.5 à 1.0)
  parlerSouvenirs: true,
  calendrierUniv: true,
  mondeVivant: true,
  // Messages spontanés
  initiativeActive: true,
  initiativeMode: 'probabiliste', // 'probabiliste' = envie recalculée à chaque minute (plafond par jour) ; 'plan' = ancien système (heures tirées le matin)
  pannesActives: true, // la vraie vie : réseau qui saute, plus de data/crédit, batterie à plat, coupure de courant (silence expliqué, puis « me revoilà »)
  pannesProbaJour: 25, // % de jours avec une panne (0 = jamais)
  pannesEcartJours: 2, // jours minimum entre deux pannes
  absencesProba: 5, // % de réponses qui se terminent par une petite absence (« ma mère m'appelle, je reviens »), 0 = jamais
  absencesParJour: 2, // maximum de petites absences par jour
  promessesActives: true, // elle tient (ou s'excuse d'avoir oublié) ce qu'elle a promis : « je te raconte ça ce soir »
  vecuActif: true, // fatigue, stress, besoin de parler : influencent si elle écrit et ce qu'elle dit
  initiativeParJour: 4,
  initiativeInsistance: 3, // messages sans réponse avant qu'elle arrête d'écrire la première
  ressentirAbsence: true, // il lui manque quand il ne parle plus : elle lui écrit
  // Suites de la relation (v3.8) : aucun appel IA en plus
  suitesActives: true, // interrupteur général des 4 fonctions ci-dessous
  lendemainIntime: true, // le lendemain d'un moment qui a chauffé : un peu gênée, plus tendre, un mot doux
  habitudesActives: true, // elle apprend à quelles heures il répond vite et écrit plus à ces heures-là
  disputesAvecLui: true, // de petites bouderies avec lui (un malentendu, quelques heures, puis réconciliation)
  bouderieProbaJour: 10, // % de jours où une bouderie est possible (0 = jamais)
  bouderieEcartJours: 8, // jours minimum entre deux bouderies
  coherenceImmediate: true, // ce qu'elle raconte de sa journée est noté tout de suite
  initiativeEcartMin: 75,
  // Mémoire
  memoire: 100, // messages gardés en contexte
  memoireCaracteres: 24000, // plafond de taille de l'historique envoyé à l'IA
  memoireLongue: true,
  memoireTous: 6,
  passerHorsLigne: true,
  horairesActifs: false,
  heureDebut: 8,
  heureFin: 23,
  afficherNavigateur: false,
  versionConfig: 8,
};

// Remet dans des bornes raisonnables les réglages numériques (une faute de frappe ne casse plus rien).
const BORNES = {
  heureReveil: [4, 12], variationSommeil: [0, 4], rapidite: [0.2, 5], delaiMin: [0, 120], delaiMax: [0, 600],
  attenteFin: [0, 60], msParCaractere: [30, 600], msLecture: [0, 500], longueurMax: [40, 1000], bullesMax: [1, 5],
  fautesFrappe: [0, 100], maxEvenements: [0, 6], probaJourOff: [0, 100], vuSansReponse: [0, 100], doubleMessage: [0, 100],
  curiosite: [0, 100], intensiteSms: [0, 1], emojiProba: [0, 100], emojiAmourProba: [0, 100], emojiAmourMax: [1, 3], temperature: [0.1, 1.5], coquin: [0, 3],
  tensionJoursMax: [1, 5],
  pannesProbaJour: [0, 100], pannesEcartJours: [0, 30], absencesProba: [0, 100], absencesParJour: [0, 6],
  initiativeParJour: [0, 12], initiativeInsistance: [1, 10], initiativeEcartMin: [15, 720],
  bouderieProbaJour: [0, 100], bouderieEcartJours: [0, 60], memoire: [10, 400], memoireCaracteres: [2000, 100000],
  memoireTous: [0, 50], memoireFaitsMax: [300, 8000], heureDebut: [0, 23], heureFin: [0, 24], echelleTemps: [0.001, 1000],
};

function assainir(cfg) {
  for (const [k, [min, max]] of Object.entries(BORNES)) {
    if (cfg[k] === undefined || cfg[k] === null || cfg[k] === '') continue;
    const v = Number(cfg[k]);
    cfg[k] = Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : DEFAUT[k];
  }
  // Heure de coucher : 0 à 5 (après minuit) ou 20 à 24 ; en dehors, on revient à 00h30.
  const c = Number(cfg.heureCoucher);
  cfg.heureCoucher = Number.isFinite(c) ? (c >= 24 ? c - 24 : c) : DEFAUT.heureCoucher;
  if (!((cfg.heureCoucher >= 0 && cfg.heureCoucher <= 5) || (cfg.heureCoucher >= 20 && cfg.heureCoucher < 24))) cfg.heureCoucher = DEFAUT.heureCoucher;
  if (cfg.delaiMax < cfg.delaiMin) cfg.delaiMax = cfg.delaiMin;
  return cfg;
}

function chargerConfig(fichier) {
  let sauve = {};
  try {
    sauve = JSON.parse(fs.readFileSync(fichier, 'utf8'));
  } catch (e) {}
  const cfg = { ...DEFAUT, ...sauve };
  // Anciennes versions : l'ancien modèle de départ n'autorise que 20 messages par jour en gratuit.
  if (!sauve.versionConfig || sauve.versionConfig < 2 || !cfg.modele) cfg.modele = MODELE_PAR_DEFAUT;
  // Version 3 : prompt de Lina intégré et vitesse de frappe humaine.
  if (!sauve.versionConfig || sauve.versionConfig < 3) {
    if (!sauve.promptPerso) cfg.promptPerso = PROMPT_LINA;
    if (!sauve.msParCaractere || sauve.msParCaractere === 70) cfg.msParCaractere = 250;
  }
  // Version 4 : comportement humain complet. L'ancien prompt « compagne virtuelle » est remplacé par le nouveau.
  if (!sauve.versionConfig || sauve.versionConfig < 4) {
    if (!sauve.promptPerso || /jeune femme virtuelle/i.test(sauve.promptPerso)) cfg.promptPerso = PROMPT_LINA;
    if (!sauve.memoire || sauve.memoire === 40) cfg.memoire = 60;
  }
  // Version 7 : sommeil variable (selon le lendemain) et initiatives réparées. On remet les bons réglages une seule fois,
  // sans toucher à la clé, aux numéros ni au reste de ta config.
  if (!sauve.versionConfig || sauve.versionConfig < 7) {
    cfg.heureCoucher = 0.5;
    cfg.heureReveil = 7.5;
    cfg.variationSommeil = 1.5;
    cfg.horairesActifs = false;
    cfg.initiativeActive = true;
    cfg.initiativeMode = 'probabiliste';
    cfg.initiativeParJour = 4;
    cfg.initiativeEcartMin = 75;
    cfg.initiativeInsistance = 3;
  }
  // Version 8 : emojis permis dans les messages d'amour. On ne remplace que la phrase concernée du prompt enregistré.
  if (!sauve.versionConfig || sauve.versionConfig < 8) {
    const ancien = 'Peu d\'emojis : la plupart de tes messages n\'en ont aucun.';
    if (typeof cfg.promptPerso === 'string' && cfg.promptPerso.includes(ancien)) {
      cfg.promptPerso = cfg.promptPerso.replace(ancien, 'Emojis : la plupart de tes messages n\'en ont aucun. Mais dans les messages d\'amour (je t\'aime, tu me manques, tendresse, compliments doux), tu y as plus droit : un ou deux emojis doux (❤️ 🥰 😘 🥺). Partout ailleurs, presque jamais.');
    }
  }
  cfg.versionConfig = 8;
  return assainir(cfg);
}

module.exports = { DEFAUT, chargerConfig };
