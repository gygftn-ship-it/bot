// Mémoire à long terme, deuxième étage : les souvenirs datés de vos discussions.
// Le carnet de faits (souvent mis à jour) dit CE QU'ELLE SAIT ; les souvenirs disent CE QUI S'EST PASSÉ
// (« le 4 nov : il m'a raconté son entretien raté »). Elle peut y faire allusion (« l'autre jour tu m'avais dit… »)
// ou y revenir d'elle-même dans un message spontané. Fonctions pures, testables.

const JOUR_MS = 86400000;
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const mots = (s) => new Set(norm(s).split(' ').filter((w) => w.length > 3));
const titre = (nom) => new RegExp(`^[ \\t]*#{0,3}[ \\t]*${nom}[ \\t]*#{0,3}[ \\t]*:?[ \\t]*$`, 'i');
const LIGNE = /^[-*•\s]*(\d{4}-\d{2}-\d{2})\s*[|:–-]\s*(.{3,200})$/;
const jour = (cle) => new Date(cle + 'T12:00:00Z').getTime();

function parserEpisodes(lignes, max = 8) {
  const sortie = [];
  for (const l of lignes) {
    const m = String(l).match(LIGNE);
    if (!m) continue;
    const d = new Date(m[1] + 'T12:00:00Z');
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== m[1]) continue;
    sortie.push({ date: m[1], texte: m[2].trim() });
  }
  return sortie.slice(0, max);
}

const SECTIONS = ['SOUVENIRS', 'ELLE', 'RAPPELS'];
const estTitre = (l) => SECTIONS.some((n) => titre(n).test(l));

// Sépare une section (###SOUVENIRS### ou ###ELLE###) du reste de la réponse de l'IA : elle va jusqu'au titre suivant ou à la fin.
function separerEpisodes(texte, nom = 'SOUVENIRS') {
  const lignes = String(texte || '').replace(/\*\*/g, '').split('\n');
  const debut = lignes.findIndex((l) => titre(nom).test(l));
  if (debut < 0) return { texte: lignes.join('\n'), episodes: [] };
  let fin = lignes.findIndex((l, i) => i > debut && estTitre(l));
  if (fin < 0) fin = lignes.length;
  return {
    texte: [...lignes.slice(0, debut), ...lignes.slice(fin)].join('\n'),
    episodes: parserEpisodes(lignes.slice(debut + 1, fin)),
  };
}

// Ajoute les nouveaux souvenirs sans doublon (même jour et texte proche) ; garde les 60 plus récents.
function fusionnerEpisodes(anciens, nouveaux, max = 60) {
  const sortie = [...(anciens || [])];
  for (const n of nouveaux || []) {
    const a = mots(n.texte);
    const doublon = sortie.some((e) => {
      if (e.date !== n.date) return false;
      const b = mots(e.texte);
      const commun = [...a].filter((w) => b.has(w)).length;
      return commun >= Math.max(2, Math.min(a.size, b.size) * 0.5);
    });
    if (!doublon) sortie.push({ date: n.date, texte: n.texte });
  }
  return sortie.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0)).slice(-max);
}

function ageEnJours(date, cleAujourdhui) {
  return Math.round((jour(cleAujourdhui) - jour(date)) / JOUR_MS);
}

function libelleAge(j) {
  if (j <= 0) return "aujourd'hui";
  if (j === 1) return 'hier';
  if (j < 14) return `il y a ${j} jours`;
  if (j < 60) return `il y a ${Math.round(j / 7)} semaines`;
  return `il y a ${Math.round(j / 30)} mois`;
}

// Les souvenirs utiles pour répondre : ceux qui ressemblent au message (2 au plus) + le plus récent.
function choisirEpisodes(episodes, message, n = 3) {
  const liste = episodes || [];
  if (!liste.length) return [];
  const m = mots(message);
  const notes = liste.map((e, i) => ({ e, i, s: [...mots(e.texte)].filter((w) => m.has(w)).length }));
  const choisis = notes.filter((x) => x.s > 0).sort((a, b) => b.s - a.s || b.i - a.i).slice(0, 2).map((x) => x.i);
  const dernier = liste.length - 1;
  if (!choisis.includes(dernier)) choisis.push(dernier);
  return choisis.slice(0, n).sort((a, b) => a - b).map((i) => liste[i]);
}

function blocEpisodes(selection, cleAujourdhui) {
  if (!selection || !selection.length) return '';
  return [
    '=== SOUVENIRS DE VOS DISCUSSIONS (ce qui s\'est vraiment passé) ===',
    ...selection.map((e) => `- ${libelleAge(ageEnJours(e.date, cleAujourdhui))} : ${e.texte}`),
    '- Tu peux y faire allusion naturellement (« l\'autre jour tu m\'avais dit… », « au fait, ton… »), sans les réciter ni tout ressortir d\'un coup, et seulement si ça colle à la conversation. N\'invente aucun détail en plus.',
  ].join('\n');
}

// Un souvenir pour un message spontané : ni trop récent (2 jours), ni trop vieux (60 jours), pas déjà repris récemment.
function episodePourSouvenir(episodes, cleAujourdhui, maintenant = Date.now(), r = Math.random) {
  const candidats = (episodes || []).filter((e) => {
    const j = ageEnJours(e.date, cleAujourdhui);
    return j >= 2 && j <= 60 && !(e.repris && maintenant - e.repris < 10 * JOUR_MS);
  });
  return candidats.length ? candidats[Math.floor(r() * candidats.length)] : null;
}

// Consigne ajoutée à la mise à jour de la mémoire pour qu'elle note aussi les moments marquants.
function consigneEpisodes(cleAujourdhui, avecRappels = true) {
  return [
    'Après la mémoire, écris une ligne ###SOUVENIRS### puis, seulement si les derniers messages contiennent un moment marquant (il s\'est confié, a raconté un événement précis, une émotion forte, un moment drôle ou important pour vous deux), 1 à 3 lignes au format « AAAA-MM-JJ | souvenir en une phrase, à la 3e personne ».',
    `La date est celle d'aujourd'hui (${cleAujourdhui}) sauf si le message dit autrement. Rien d'inventé, pas de banalités (« il a dit bonjour »). Si rien de marquant, laisse la section vide.`,
    ...(avecRappels ? ['Écris ###SOUVENIRS### AVANT la ligne ###RAPPELS###.'] : []),
  ].join('\n');
}

// Ce qu'elle a elle-même raconté sur sa vie (repas, sorties, proches…) : pour qu'elle ne se contredise pas d'un jour à l'autre.
function consigneElle(cleAujourdhui, avecRappels = true) {
  return [
    'Ensuite, écris une ligne ###ELLE### puis les faits NOUVEAUX sur la vie de la personne qui répond (celle dont les messages sont marqués comme « elle ») qu\'elle a affirmés dans ces messages : ce qu\'elle a fait, mangé, vu, ses proches, ses projets, ses goûts. Format : « AAAA-MM-JJ | fait en une phrase, à la 1re personne ».',
    `La date est celle d'aujourd'hui (${cleAujourdhui}) sauf si le message dit autrement. Seulement ce qu'elle a réellement écrit, rien d'inventé, aucun doublon avec ce qui est déjà noté. Si rien de neuf, laisse la section vide.`,
    ...(avecRappels ? ['Ordre des sections : ###SOUVENIRS###, puis ###ELLE###, puis ###RAPPELS###.'] : []),
  ].join('\n');
}

function blocElle(liste, cleAujourdhui) {
  const recents = (liste || []).slice(-14);
  if (!recents.length) return '';
  return [
    '=== CE QUE TU AS DÉJÀ RACONTÉ SUR TA VIE (tu l\'as dit à lui : ne te contredis jamais, et ne le répète pas comme une nouveauté) ===',
    ...recents.map((e) => `- ${libelleAge(ageEnJours(e.date, cleAujourdhui))} : ${e.texte}`),
  ].join('\n');
}

const versTexte = (episodes) => (episodes || []).map((e) => `${e.date} | ${e.texte}`).join('\n');

module.exports = { consigneElle, blocElle, parserEpisodes, separerEpisodes, fusionnerEpisodes, ageEnJours, libelleAge, choisirEpisodes, blocEpisodes, episodePourSouvenir, consigneEpisodes, versTexte };
