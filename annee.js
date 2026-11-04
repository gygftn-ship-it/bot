// L'année universitaire de Lina : rentrée, partiels, vacances d'hiver et de printemps, rattrapages, grandes vacances.
// Sans ça, elle serait « en cours » en plein mois d'août. Dates approximatives de l'université algérienne.
// Fonctions pures : on donne la date locale « AAAA-MM-JJ ».

const PERIODES = [
  { de: 101, a: 105, code: 'cours' },
  { de: 106, a: 122, code: 'partiels' },
  { de: 123, a: 208, code: 'hiver' },
  { de: 209, a: 405, code: 'cours' },
  { de: 406, a: 412, code: 'printemps' },
  { de: 413, a: 515, code: 'cours' },
  { de: 516, a: 605, code: 'partiels' },
  { de: 606, a: 620, code: 'rattrapage' },
  { de: 621, a: 914, code: 'ete' },
  { de: 915, a: 928, code: 'rentree' },
  { de: 929, a: 1231, code: 'cours' },
];

// cours : il y a cours ces jours-là ; examens : un examen peut tomber ; note : ce que le prompt lui dit.
const INFOS = {
  cours: { cours: true, examens: true, libelle: 'semestre en cours', note: '' },
  rentree: {
    cours: true, examens: false, libelle: 'rentrée universitaire',
    note: 'C\'est la rentrée universitaire : nouveau semestre, nouvel emploi du temps à apprivoiser, retrouvailles avec les amies, un peu de stress des débuts.',
  },
  partiels: {
    cours: true, examens: true, libelle: 'période de partiels',
    note: 'C\'est la période des partiels : tu révises beaucoup, tu es plus fatiguée et plus stressée, tu as moins de temps pour discuter et certaines épreuves tombent certains jours.',
  },
  rattrapage: {
    cours: true, examens: true, libelle: 'période de rattrapages',
    note: 'Ce sont les rattrapages et l\'attente des résultats de fin d\'année : ambiance de fin de parcours, la fac se vide petit à petit.',
  },
  hiver: {
    cours: false, examens: false, libelle: 'vacances d\'hiver',
    note: 'Ce sont les vacances universitaires d\'hiver (entre les deux semestres) : pas de cours, tu te reposes, tu te lèves plus tard, tu sors un peu, il fait froid dehors.',
  },
  printemps: {
    cours: false, examens: false, libelle: 'vacances de printemps',
    note: 'Ce sont les courtes vacances de printemps : pas de cours pendant quelques jours, balades et sorties dès que le temps le permet.',
  },
  ete: {
    cours: false, examens: false, libelle: 'grandes vacances',
    note: 'Ce sont les grandes vacances d\'été : pas de cours jusqu\'à la rentrée de mi-septembre. Tu dors tard, tu sors le soir, plage, mariages, glaces, chaleur ; tu penses un peu à la rentrée.',
  },
};

function periodeUniv(cle) {
  const m = String(cle || '').match(/^\d{4}-(\d{2})-(\d{2})$/);
  if (!m) return { code: 'cours', ...INFOS.cours };
  const k = Number(m[1]) * 100 + Number(m[2]);
  const p = PERIODES.find((x) => k >= x.de && k <= x.a) || { code: 'cours' };
  return { code: p.code, ...INFOS[p.code] };
}

function blocPeriode(cle) {
  const p = periodeUniv(cle);
  return p.note ? `=== PÉRIODE DE L'ANNÉE (${p.libelle}) ===\n${p.note}\nLaisse-la colorer tes journées, sans la réciter.` : '';
}

module.exports = { periodeUniv, blocPeriode, PERIODES };
