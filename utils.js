// Fonctions simples, sans dépendance, faciles à tester.

function normaliserNumeros(texte) {
  return String(texte || '')
    .split(/[,;\n]+/) // les espaces dans un numéro (+33 6 12 …) sont conservés
    .map((n) => n.replace(/\D/g, ''))
    .filter(Boolean);
}

// « 0555123456 » et « 213555123456 » sont le même numéro : on garde la forme avec l'indicatif pays.
function dedoublonnerNumeros(numeros) {
  const uniques = [...new Set(numeros)];
  return uniques.filter((n) => {
    const court = n.replace(/^0+/, '');
    return !(n.startsWith('0') && court.length >= 8 && uniques.some((m) => m !== n && !m.startsWith('0') && m.endsWith(court)));
  });
}

// Accepte « 33612345678 » mais aussi « 0612345678 » (format national).
function estAutorise(numero, autorises) {
  const n = String(numero || '').replace(/\D/g, '');
  if (!n) return false;
  return autorises.some((a) => {
    if (n === a) return true;
    const sansZero = a.replace(/^0+/, '');
    return sansZero.length >= 8 && n.endsWith(sansZero);
  });
}

// Choisit le modèle Gemini le plus récent et le plus adapté au chat (type « flash »).
function meilleurModele(noms) {
  const score = (n) => {
    const m = n.match(/gemini-(\d+(?:\.\d+)?)/);
    let s = (m ? parseFloat(m[1]) : 0) * 10;
    s += /flash/i.test(n) ? 5 : -5;
    if (/lite/i.test(n)) s -= 2;
    if (/preview|exp/i.test(n)) s -= 3;
    if (/latest/i.test(n)) s -= 1;
    return s;
  };
  return [...noms].sort((a, b) => score(b) - score(a))[0] || null;
}

// Découpe la réponse de l'IA en 1 à 3 petits messages (séparés par une ligne vide).
function decouperReponse(texte, max = 3) {
  return String(texte || '')
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max);
}

// Coupe un message en deux bulles à la fin de sa première phrase (ou au premier retour à la ligne).
// Sans phrase assez longue des deux côtés, le texte reste tel quel.
function couperEnDeux(texte) {
  const t = String(texte || '').trim();
  if (/\n\s*\n/.test(t)) return t;
  const nl = t.replace(/\s*\n\s*/, '\n\n');
  if (nl !== t) return nl;
  const m = t.match(/^(.{6,}?[.!?…]+(?:\s*[\p{Extended_Pictographic}\uFE0F\u200D]+)*)\s+(\S.{3,})$/su);
  return m ? m[1] + '\n\n' + m[2] : t;
}

function dansHoraires(cfg, date = new Date()) {
  if (!cfg.horairesActifs) return true;
  const h = date.getHours();
  const d = Number(cfg.heureDebut);
  const f = Number(cfg.heureFin);
  return d <= f ? h >= d && h < f : h >= d || h < f;
}

// Enlève la mise en forme que Gemini ajoute volontiers (gras, titres, puces, guillemets autour du message).
function nettoyerTexte(texte) {
  let t = String(texte || '').replace(/\r/g, '');
  t = t.replace(/\*\*|__|`/g, '');
  t = t
    .split('\n')
    .map((l) => l.replace(/^\s{0,3}#{1,6}\s+/, '').replace(/^\s*[-*•]\s+/, ''))
    .join('\n')
    .trim();
  if (t.length > 2 && /^["«“]/.test(t) && /["»”]$/.test(t) && !/["«»“”]/.test(t.slice(1, -1))) {
    t = t.slice(1, -1).trim();
  }
  return t;
}

// Garde des phrases entières jusqu'à `max` caractères. Coupe au mot près seulement si `permettreCoupe`.
function couperPhrases(texte, max, permettreCoupe) {
  if (texte.length <= max) return texte;
  const phrases = texte.match(/[^.!?…\n]+[.!?…]*\s*/g) || [texte];
  let sortie = '';
  for (const p of phrases) {
    if ((sortie + p).trim().length > max) break;
    sortie += p;
  }
  if (sortie.trim()) return sortie.trim();
  if (!permettreCoupe) return '';
  const coupe = texte.slice(0, max);
  const i = coupe.lastIndexOf(' ');
  return (i > max * 0.5 ? coupe.slice(0, i) : coupe).trim();
}

// Impose une longueur totale maximale à l'ensemble des bulles.
function limiterReponse(morceaux, max) {
  const sortie = [];
  let reste = Math.max(40, Number(max) || 180);
  for (let i = 0; i < morceaux.length; i++) {
    const c = couperPhrases(morceaux[i], reste, i === 0);
    if (!c) break;
    sortie.push(c);
    reste -= c.length;
    if (c.length < morceaux[i].length || reste <= 0) break;
  }
  return sortie;
}

// Temps de frappe d'un humain sur téléphone : environ 4 lettres par seconde, avec de la variation.
function dureeFrappe(texte, msParLettre, alea = Math.random) {
  const base = String(texte).length * Number(msParLettre || 250) * (0.8 + alea() * 0.4);
  return Math.min(20000, Math.max(1500, base));
}

// Temps de lecture avant de répondre : un petit délai fixe, puis proportionnel à la taille du message.
function dureeLecture(texte, msParLettre, alea = Math.random) {
  const base = 800 + String(texte).length * Number(msParLettre ?? 40) * (0.8 + alea() * 0.4);
  return Math.min(8000, base);
}

module.exports = {
  normaliserNumeros,
  dedoublonnerNumeros,
  estAutorise,
  meilleurModele,
  decouperReponse,
  couperEnDeux,
  dansHoraires,
  nettoyerTexte,
  limiterReponse,
  dureeFrappe,
  dureeLecture,
};
