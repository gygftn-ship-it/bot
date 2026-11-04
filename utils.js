// Fonctions simples, sans dépendance, faciles à tester.

function normaliserNumeros(texte) {
  return String(texte || '')
    .split(/[,;\n]+/) // les espaces dans un numéro (+33 6 12 …) sont conservés
    .map((n) => n.replace(/\D/g, ''))
    .filter(Boolean);
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

function dansHoraires(cfg, date = new Date()) {
  if (!cfg.horairesActifs) return true;
  const h = date.getHours();
  const d = Number(cfg.heureDebut);
  const f = Number(cfg.heureFin);
  return d <= f ? h >= d && h < f : h >= d || h < f;
}

module.exports = { normaliserNumeros, estAutorise, meilleurModele, decouperReponse, dansHoraires };
