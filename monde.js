// Le monde de Lina : ce qui continue sur des semaines, pas seulement sur une journée.
// - des fils de vie longs : une série qu'elle regarde, un livre, une langue qu'elle apprend, une habitude ;
// - un entourage qui vit : cette semaine, la petite sœur a des contrôles, la mère reçoit de la famille… ;
// - des rituels de la semaine (le vendredi en famille, etc.).
// Tout est tiré de la date : aucune sauvegarde nécessaire, et deux jours de suite sont cohérents.
// Fonctions pures, testables.

const H = require('./humain');
const A = require('./annee');

const JOUR = 86400000;
const choisir = (liste, r) => liste[Math.floor(r() * liste.length)];
const indexJour = (cle) => Math.floor(Date.parse(cle + 'T12:00:00Z') / JOUR);
const graine = (cfg) => String((cfg && cfg.prenomElle) || 'lina');

// ---------- Fils de vie longs ----------

const SERIES = [
  { titre: 'Elite', saisons: [8, 8, 8] },
  { titre: 'Emily in Paris', saisons: [10, 10, 10] },
  { titre: 'Squid Game', saisons: [9, 7] },
  { titre: 'Friends', saisons: [24, 24, 25] },
  { titre: 'Gossip Girl', saisons: [18, 22] },
  { titre: 'La Casa de Papel', saisons: [9, 6, 8] },
];
const LIVRES = [
  { titre: 'L\'Étranger de Camus', pages: 160 },
  { titre: 'La Grande Maison de Mohammed Dib', pages: 190 },
  { titre: 'Le Petit Prince en anglais', pages: 100 },
  { titre: 'Harry Potter en anglais', pages: 320 },
  { titre: 'un roman d\'Assia Djebar', pages: 250 },
];
const LANGUES = ['l\'italien', 'le coréen', 'l\'espagnol', 'le turc', 'l\'allemand'];
const HABITUDES = ['du yoga le matin', 'une marche le soir', 'des abdos avant de dormir', 'de la danse dans ta chambre', 'un petit journal le soir'];

// Un cycle = la durée pendant laquelle elle suit le même élément ; ensuite elle en change.
function cycle(cle, longueur, decalage, nom, cfg) {
  const j = indexJour(cle) + decalage;
  const numero = Math.floor(j / longueur);
  const dedans = j - numero * longueur; // 0 .. longueur - 1
  return { numero, dedans, part: dedans / longueur, r: H.graine(`${nom}${numero}${graine(cfg)}`) };
}

function filSerie(cle, cfg) {
  const c = cycle(cle, 42, 5, 'serie', cfg);
  const s = choisir(SERIES, c.r);
  const total = s.saisons.reduce((a, b) => a + b, 0);
  const vus = Math.min(total, Math.floor(c.part * 1.15 * total) + 1);
  if (c.part > 0.9) return `tu viens de finir la série ${s.titre} et tu cherches déjà la suivante.`;
  let reste = vus;
  let saison = 1;
  for (const n of s.saisons) { if (reste <= n) break; reste -= n; saison++; }
  return `tu regardes la série ${s.titre} en ce moment (saison ${saison}, épisode ${reste}) : tu n'en parles que si ça vient naturellement, sans spoiler.`;
}

function filLivre(cle, cfg) {
  const c = cycle(cle, 30, 11, 'livre', cfg);
  const l = choisir(LIVRES, c.r);
  if (c.part > 0.92) return `tu viens de finir ${l.titre}.`;
  const page = Math.max(5, Math.round((c.part * 1.05 * l.pages) / 5) * 5);
  return `tu lis ${l.titre} (vers la page ${page} sur ${l.pages}), surtout le soir avant de dormir.`;
}

function filLangue(cle, cfg) {
  const c = cycle(cle, 120, 23, 'langue', cfg);
  const langue = choisir(LANGUES, c.r);
  if (c.dedans < 5) return `tu viens de te mettre à ${langue} sur une appli : tu en es aux toutes premières leçons.`;
  const semaines = Math.floor(c.dedans / 7);
  const duree = semaines < 1 ? 'quelques jours' : semaines === 1 ? 'une semaine' : `${semaines} semaines`;
  const serie = `série de ${c.dedans + 1} jours${c.dedans % 9 === 8 ? ', tu as failli la casser hier' : ''}`;
  return `tu apprends ${langue} sur une appli depuis ${duree} (${serie}) : tu sais dire quelques phrases simples.`;
}

function filHabitude(cle, cfg) {
  const c = cycle(cle, 56, 31, 'habitude', cfg);
  if (c.part > 0.85) return 'tu as un peu lâché ta dernière bonne résolution (la flemme a gagné) et tu te promets de t\'y remettre.';
  const h = choisir(HABITUDES, c.r);
  return c.dedans < 7 ? `tu viens de te lancer un petit défi : ${h}.` : `tu fais ${h} depuis ${Math.floor(c.dedans / 7)} semaine${c.dedans >= 14 ? 's' : ''}, plus ou moins régulièrement.`;
}

function fils(cle, cfg) {
  return [filSerie(cle, cfg), filLivre(cle, cfg), filLangue(cle, cfg), filHabitude(cle, cfg)];
}

// ---------- Entourage ----------

const THREADS = [
  { id: 'ines', texte: 'cette semaine Inès, ta petite sœur, a des contrôles à l\'école : elle est stressée et vous demande de l\'aide pour réviser.', si: (p) => p.cours },
  { id: 'sarah', texte: 'Sarah, ta grande sœur, est en pleine période de travail : elle est enfermée dans sa chambre et de mauvaise humeur.', si: (p) => p.cours },
  { id: 'mere', texte: 'ta mère reçoit de la famille ce week-end : elle cuisine beaucoup, la maison est en pleine ébullition.' },
  { id: 'pere', texte: 'ton père rentre tard du travail cette semaine, il est fatigué et il y a moins de monde à table.' },
  { id: 'ania', texte: 'Ania est un peu stressée en ce moment (des histoires avec sa famille), tu la soutiens et tu lui écris souvent.' },
  { id: 'grandmere', texte: 'ta grand-mère est un peu fatiguée, ta mère veut aller la voir plusieurs fois cette semaine.' },
  { id: 'chat', texte: 'le chat de la voisine miaule toute la nuit : plusieurs personnes à la maison dorment mal.' },
  { id: 'cousine', texte: 'une cousine se marie bientôt : tout le monde parle de robes, de henné et de préparatifs.' },
  { id: 'chaleur', texte: 'la maison est une fournaise cette semaine, tout le monde traîne en été avec un ventilateur.', si: (p) => p.code === 'ete' },
  { id: 'froid', texte: 'il fait froid dans la maison cette semaine, tout le monde reste sous des couvertures avec du thé.', si: (p) => p.code === 'hiver' },
];

const jourSemaine = (cle) => (indexJour(cle) + 4) % 7; // 0 = dimanche

function echos(cle, cfg) {
  const per = A.periodeUniv(cle);
  const debutSemaine = indexJour(cle) - jourSemaine(cle);
  const r = H.graine(`echos${debutSemaine}${graine(cfg)}`);
  const possibles = THREADS.filter((t) => !t.si || t.si(per));
  const sortie = [];
  for (let i = 0; i < 2 && possibles.length; i++) {
    const k = Math.floor(r() * possibles.length);
    sortie.push(possibles.splice(k, 1)[0].texte);
  }
  return sortie;
}

// ---------- Rituels de la semaine ----------

const RITUELS = {
  0: 'le dimanche, c\'est la reprise des cours : tu as toujours du mal à te remettre dans le rythme après le week-end.',
  2: 'le mardi, tu fais souvent une pause café avec Ania.',
  3: 'le mercredi, tu rentres plus vite pour aider à la maison.',
  4: 'le jeudi, tout le monde est soulagé : le week-end commence et ça se sent sur les visages.',
  5: 'le vendredi, c\'est couscous en famille et souvent une visite à ta grand-mère.',
  6: 'le samedi, souvent le ménage de la maison le matin, puis du repos et une sortie ou la télé le soir.',
};

function rituel(cle) { return RITUELS[jourSemaine(cle)] || ''; }

// ---------- Bloc du prompt ----------

function blocMonde(cle, cfg = {}) {
  if (cfg.mondeVivant === false) return '';
  const lignes = [
    '=== TON MONDE EN CE MOMENT (ce qui dure plusieurs jours ; évolue lentement, n\'en raconte qu\'un petit bout à la fois et seulement si ça vient naturellement) ===',
    ...fils(cle, cfg).map((x) => `- ${x}`),
    ...echos(cle, cfg).map((x) => `- Autour de toi : ${x}`),
  ];
  const ri = rituel(cle);
  if (ri) lignes.push(`- Habitude de la semaine : ${ri}`);
  return lignes.join('\n');
}

module.exports = { fils, echos, rituel, blocMonde, jourSemaine, indexJour };
