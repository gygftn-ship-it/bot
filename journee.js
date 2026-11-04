// La journée vécue de Lina : météo du jour et petits faits (repas, cours, anecdotes) tirés une fois par jour
// et stables (même date = mêmes faits). Quand il demande « t'as fait quoi aujourd'hui ? », elle répond
// d'après ces faits au lieu d'inventer au hasard, et reste cohérente d'un message à l'autre.
// Fonctions pures : le tirage vient de la date, donc aucun état à sauvegarder.

const H = require('./humain');
const C = require('./calendrier');

const choisir = (liste, r) => liste[Math.floor(r() * liste.length)];
const hhmm = (min) => `${Math.floor((min % 1440) / 60)}h${String(min % 60).padStart(2, '0')}`;

// ---------- Météo (climat de Tizi Ouzou, un tirage par jour) ----------

// [température moyenne de jour, [[condition, poids], …]]
const CLIMAT = [
  [11, [['pluie', 4], ['nuageux', 3], ['ensoleille', 3], ['vent', 1]]], // janvier
  [12, [['pluie', 4], ['nuageux', 3], ['ensoleille', 3], ['vent', 1]]],
  [14, [['pluie', 3], ['nuageux', 3], ['ensoleille', 4], ['vent', 2]]],
  [17, [['pluie', 3], ['nuageux', 2], ['ensoleille', 5], ['vent', 1]]],
  [21, [['pluie', 2], ['nuageux', 2], ['ensoleille', 6], ['vent', 1]]],
  [26, [['ensoleille', 8], ['nuageux', 1], ['orage', 1]]],
  [30, [['ensoleille', 9], ['orage', 1]]],
  [30, [['ensoleille', 9], ['orage', 1]]],
  [25, [['ensoleille', 5], ['orage', 2], ['pluie', 2], ['nuageux', 1]]], // septembre
  [21, [['ensoleille', 4], ['pluie', 3], ['nuageux', 2], ['orage', 1]]],
  [15, [['pluie', 4], ['nuageux', 3], ['ensoleille', 3]]],
  [12, [['pluie', 4], ['nuageux', 3], ['ensoleille', 3]]],
];

function tirage(paires, r) {
  const total = paires.reduce((a, [, p]) => a + p, 0);
  let x = r() * total;
  for (const [v, p] of paires) {
    x -= p;
    if (x < 0) return v;
  }
  return paires[paires.length - 1][0];
}

function meteoDuJour(date = new Date(), cfg = {}) {
  const j = H.jourDeVie(date, cfg);
  const mois = Number(j.cle.slice(5, 7)) - 1;
  const r = H.graine('meteo' + j.cle);
  const [moyenne, conditions] = CLIMAT[mois];
  const condition = tirage(conditions, r);
  let temp = Math.round(moyenne + (r() - 0.5) * 8);
  if (condition === 'pluie') temp -= 2;
  if (condition === 'ensoleille' && mois >= 5 && mois <= 8) temp += 2;
  const ressenti = temp <= 8 ? 'il fait très froid' : temp <= 14 ? 'il fait frais' : temp <= 20 ? 'il fait doux' : temp <= 27 ? 'il fait chaud' : temp <= 33 ? 'il fait très chaud' : 'c\'est la canicule';
  const ciel = {
    pluie: 'il pleut',
    nuageux: 'le ciel est gris et nuageux',
    ensoleille: 'il y a du soleil',
    vent: 'il y a pas mal de vent',
    orage: 'le temps est orageux',
  }[condition];
  const neige = (mois >= 11 || mois <= 2) && condition !== 'pluie' && r() < 0.5;
  const ville = cfg.ville || 'Tizi Ouzou';
  const texte = `À ${ville} aujourd'hui, ${ciel} et ${ressenti} (environ ${temp} °C)${neige ? ', et le Djurdjura est enneigé' : ''}.`;
  return { condition, temp, texte, pluie: condition === 'pluie' || condition === 'orage' };
}

// ---------- Petits faits ----------

const MATIERES = ['phonétique', 'traduction', 'grammaire', 'linguistique', 'civilisation britannique', 'expression orale'];

const PLATS = [
  'du couscous', 'une chorba avec du pain maison', 'du tajine aux olives', 'de la chakhchoukha', 'des lentilles',
  'du poulet-frites', 'de la rechta', 'un reste de loubia', 'un sandwich pris à la fac', 'des pâtes à la sauce tomate',
];
const PLATS_IFTAR = [
  'de la chorba frik et des bourek', 'de la harira avec des dattes', 'du lait ribot, des dattes et de la chorba', 'des bourek et un tajine',
  'de la chorba et de la zlabia', 'du couscous et du qalb el louz',
];
const PLATS_SOIR = ['une omelette et de la salade', 'de la soupe et de la galette', 'de la pizza maison', 'du pain et des olives avec du fromage', 'des restes du déjeuner'];

// Chaque modèle : { texte, si } — `si` filtre selon le contexte du jour (pluie, jour de cours…).
const MATIN_COURS = [
  { texte: 'tu t\'es levée en retard et tu as couru pour attraper le bus' },
  { texte: 'le bus était bondé, tu es restée debout tout le trajet' },
  { texte: 'tu as oublié ton cahier à la maison' },
  { texte: 'tu as pris un café au distributeur de la fac' },
  { texte: 'tu as eu les pieds mouillés en arrivant à la fac', si: (c) => c.meteo.pluie },
  { texte: 'tu as eu froid dans l\'amphi', si: (c) => c.meteo.temp <= 13 },
  { texte: 'tu as eu chaud dans la salle bondée', si: (c) => c.meteo.temp >= 28 },
];
const COURS = (c) => [
  { texte: `le prof de ${c.matiere} était absent, vous avez eu une heure de libre` },
  { texte: `le prof de ${c.matiere} a fait un contrôle surprise` },
  { texte: 'tu as failli t\'endormir en amphi' },
  { texte: 'tu as eu un fou rire avec Ania en plein cours' },
  { texte: `le cours de ${c.matiere} était vraiment intéressant, tu as appris un truc` },
  { texte: 'un prof a annoncé un exposé à rendre dans deux semaines' },
  { texte: 'le wifi de la fac était en panne' },
];
const APRES_MIDI = [
  { texte: 'pause café avec Ania à la cafétéria' },
  { texte: 'tu as croisé une ancienne prof qui t\'a demandé de tes nouvelles' },
  { texte: 'Ania t\'a raconté un potin, tu as ri toute l\'après-midi' },
  { texte: 'tu as acheté un cahier et des stylos' },
  { texte: 'tu as pris le soleil sur un banc de la fac', si: (c) => c.meteo.condition === 'ensoleille' && c.meteo.temp < 30 },
  { texte: 'tu t\'es abritée de la pluie avec Ania', si: (c) => c.meteo.pluie },
];
const MATIN_LIBRE = [
  { texte: 'tu as aidé ta mère au marché' },
  { texte: 'tu as fait un peu de ménage dans ta chambre' },
  { texte: 'tu as traîné au lit en regardant des vidéos' },
  { texte: 'tu as discuté un bon moment avec ta sœur Sarah' },
  { texte: 'tu as révisé une heure puis tu as décroché' },
];
const SOIR = [
  { texte: 'tu as regardé un épisode d\'une série' },
  { texte: 'tu as écouté une chanson en boucle' },
  { texte: 'Inès t\'a énervée à propos de la télécommande' },
  { texte: 'ta mère a préparé ton plat préféré' },
  { texte: 'il y a eu une petite coupure d\'internet' },
  { texte: 'tu as pris des photos du coucher du soleil', si: (c) => !c.meteo.pluie },
  { texte: 'Sarah t\'a donné un conseil sur tes études' },
  { texte: 'tu as essayé un nouveau vernis, tu n\'es pas sûre d\'aimer' },
  { texte: 'tu as dansé un peu dans ta chambre sur du raï' },
];

// Les faits déjà vécus à l'instant `date` (les plus récents à la fin).
function faitsDuJour(date = new Date(), cfg = {}) {
  if (cfg.faitsJournee === false) return [];
  const j = H.jourDeVie(date, cfg);
  const cours = H.parametresVie(cfg, date).joursCours.includes(j.jour); // jour de cours selon le « jour de vie »
  const r = H.graine('faits' + j.cle);
  const meteo = meteoDuJour(date, cfg);
  const ramadan = C.estRamadan(date, cfg);
  const vendredi = j.jour === 5;
  const c = { meteo, matiere: choisir(MATIERES, r), ramadan, vendredi };
  const choisirFait = (modeles) => {
    const ok = modeles.filter((m) => !m.si || m.si(c));
    return ok.length ? choisir(ok, r) : null;
  };
  const faits = [];
  const ajouter = (debut, fin, proba, modeles, prefixe) => {
    const x = r();
    const at = Math.round(debut + r() * Math.max(0, fin - debut));
    const f = x < proba ? (Array.isArray(modeles) ? choisirFait(modeles) : modeles) : null;
    if (f && at < j.coucher - 30) faits.push({ at, texte: (prefixe || '') + (typeof f === 'string' ? f : f.texte) });
  };

  const rv = j.reveil;
  if (cours) {
    ajouter(rv + 20, rv + 90, 0.7, MATIN_COURS);
    ajouter(rv + 130, 700, 0.8, COURS(c));
    if (!ramadan) ajouter(735, 800, 1, `déjeuner : tu as mangé ${choisir(PLATS, r)}`);
    ajouter(870, 1000, 0.75, APRES_MIDI);
  } else {
    ajouter(rv + 60, 700, 0.8, MATIN_LIBRE);
    if (!ramadan) ajouter(735, 810, 1, `déjeuner : ${vendredi ? 'du couscous en famille, comme chaque vendredi' : 'tu as mangé ' + choisir(PLATS, r)}`);
    ajouter(850, 1050, 0.7, [{ texte: 'tu es sortie prendre l\'air un moment avec Ania', si: (cc) => !cc.meteo.pluie }, { texte: 'tu as passé l\'après-midi à la maison avec ta famille' }, { texte: 'tu as fait un peu de shopping en ville', si: (cc) => !cc.meteo.pluie }]);
  }
  if (ramadan) {
    const mag = C.coucherSoleil(date, cfg);
    ajouter(mag + 5, mag + 40, 1, `iftar : tu as mangé ${choisir(PLATS_IFTAR, r)}`);
  } else {
    ajouter(1200, 1260, 0.7, `dîner : tu as mangé ${choisir(PLATS_SOIR, r)}`);
  }
  ajouter(1100, 1290, 0.9, SOIR);

  return faits
    .filter((f) => f.at <= j.m)
    .sort((a, b) => a.at - b.at);
}

// Bloc ajouté au prompt.
function blocJournee(date = new Date(), cfg = {}) {
  const lignes = [];
  if (cfg.meteoActive !== false) lignes.push(meteoDuJour(date, cfg).texte);
  const faits = faitsDuJour(date, cfg);
  for (const f of faits) lignes.push(`(vers ${hhmm(f.at)}) ${f.texte}`);
  if (!lignes.length) return '';
  return [
    '=== TA JOURNÉE (vrais petits faits de ta journée : appuie-toi dessus quand il demande « tu as fait quoi ? » ou pour une anecdote, et n\'invente rien de précis en plus) ===',
    ...lignes.map((l) => `- ${l}`),
    'Tu n\'en parles pas à chaque message, seulement quand c\'est naturel.',
  ].join('\n');
}

module.exports = { meteoDuJour, faitsDuJour, blocJournee };
