// Naturel : retire ce qui fait « assistant IA » dans un message WhatsApp et passe à l'écrit oral.
// - formules d'assistant au début (« Bien sûr ! ») et à la fin (« N'hésite pas à… ») ;
// - tirets longs, point final d'un message court ;
// - négation orale : « je ne sais pas » -> « je sais pas », « ce n'est pas » -> « c'est pas », « cela » -> « ça ».
// Fonctions pures, testables.

const gardeCasse = (modele, texte) => (/^[A-ZÀ-ÖØ-Þ]/.test(modele) ? texte.charAt(0).toUpperCase() + texte.slice(1) : texte);

const NEGATION = /\b(pas|plus|jamais|rien|personne|aucun|aucune)\b/i;

function oraliserPhrase(s) {
  if (!NEGATION.test(s) || /\bque\b/i.test(s) || /\bni\b/i.test(s)) return s;
  return s
    .replace(/\bce n['’]est\b/gi, (m) => gardeCasse(m, "c'est"))
    .replace(/\bil n['’]y a\b/gi, (m) => gardeCasse(m, 'il y a'))
    .replace(/\btu n['’]es\b/gi, (m) => gardeCasse(m, "t'es"))
    .replace(/\btu n['’]as\b/gi, (m) => gardeCasse(m, "t'as"))
    .replace(/\bje n['’]/gi, (m) => gardeCasse(m, "j'"))
    .replace(/(?<![\p{L}\d])(tu|il|elle|on|ça|ca|ils|elles|nous|vous) n['’]/giu, (m, p) => gardeCasse(m, p.toLowerCase() + ' '))
    .replace(/(?<![\p{L}\d])(je|tu|il|elle|on|ça|ca|ils|elles|nous|vous) ne /giu, (m, p) => gardeCasse(m, p.toLowerCase() + ' '));
}

// Applique l'écriture orale phrase par phrase (la négation à deux mots n'est retirée que s'il y a « pas », « plus »…).
function oraliser(texte) {
  const parts = String(texte).replace(/\bcela\b/gi, (m) => gardeCasse(m, 'ça')).split(/([.!?…\n]+)/);
  for (let i = 0; i < parts.length; i += 2) parts[i] = oraliserPhrase(parts[i]);
  return parts.join('');
}

const OUVERTURE = /^(bien sûr|certainement|absolument|évidemment|tout à fait|avec plaisir)\s*[!,.:]+\s*/i;
const FERMETURE = /\s*(n['’]hésite pas[^.!?\n]*|j['’]espère que (ça|cela)[^.!?\n]*|si tu as (d['’]autres|besoin)[^.!?\n]*)[.!?]*\s*$/i;

function humaniserBulle(bulle, { oral = true } = {}) {
  let t = String(bulle || '');
  const original = t.trim();
  t = t.replace(/\s*[—–]\s*/g, ', ').replace(/\s{2,}/g, ' ').trim();
  const sansOuverture = t.replace(OUVERTURE, '');
  if (sansOuverture.length >= 8) t = sansOuverture;
  const sansFermeture = t.replace(FERMETURE, '');
  if (sansFermeture.length >= 4) t = sansFermeture;
  if (t.length <= 120 && /[^.]\.$/.test(t)) t = t.slice(0, -1); // un message court ne finit pas par un point
  if (oral) t = oraliser(t);
  t = t.trim();
  return t || original;
}

const humaniser = (bulles, options) => (bulles || []).map((b) => humaniserBulle(b, options)).filter(Boolean);

module.exports = { oraliser, humaniserBulle, humaniser };
