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

// ---------- Écriture SMS ----------
// Le modèle écrit trop proprement. Ici on glisse, au hasard et avec parcimonie, ce que fait un pouce pressé :
// abréviations, contractions, majuscule oubliée, lettres étirées. Jamais systématique : une vraie personne n'est pas régulière.
const NOMS_PROPRES = /^(ahmed|ania|sarah|inès|ines|lina|tizi|alger|kabyle|ramadan|aïd|aid|dieu|allah)/i;

const ABREVIATIONS = [
  [/\bje ne sais pas\b|\bje sais pas\b|\bj['’]sais pas\b/gi, 'jsp', 0.4],
  [/\bpourquoi\b/gi, 'pq', 0.25],
  [/\bbeaucoup\b/gi, 'bcp', 0.35],
  [/\bmaintenant\b/gi, 'mnt', 0.3],
  [/\bquelqu['’]un\b/gi, 'qqn', 0.4],
  [/\bquelque chose\b/gi, 'qqch', 0.4],
  [/\bpeut-être\b/gi, 'ptet', 0.3],
  [/\bparce que\b/gi, 'pcq', 0.2],
  [/\bd['’]accord\b/gi, 'dac', 0.3],
  [/\bne t['’]inquiète pas\b|\bt['’]inquiète pas\b/gi, 'tkt', 0.5],
  [/\bs['’]il te plaît\b/gi, 'stp', 0.5],
  [/\bje suis\b/gi, 'chuis', 0.12],
  [/\bil y a\b/gi, 'y a', 0.3],
];

function gardeInitiale(modele, texte) { return /^[A-ZÀ-ÖØ-Þ]/.test(modele) ? texte.charAt(0).toUpperCase() + texte.slice(1) : texte; }

function styleSms(texte, { proba = 1, r = Math.random } = {}) {
  let t = String(texte || '');
  if (!t || proba <= 0 || /https?:\/\//i.test(t)) return t;
  const p = Math.max(0, Math.min(1, proba));
  const court = t.length <= 140;

  if (court) {
    let nb = 0;
    for (const [re, abr, pr] of ABREVIATIONS) {
      if (nb >= 2) break;
      t = t.replace(re, (m) => { if (nb >= 2 || r() >= pr * p) return m; nb++; return gardeInitiale(m, abr); });
    }
  }
  // « tu es » -> « t'es » : à l'oral on ne dit presque jamais « tu es »
  t = t.replace(/\btu es\b/gi, (m) => (r() < 0.85 * p ? gardeInitiale(m, "t'es") : m));

  // lettres étirées sur une émotion, uniquement dans un message court
  if (t.length <= 45) {
    t = t.replace(/\b(trop|oui|non|mdr|ptdr|stp|merci|bravo|nooon|siii)\b/i, (m) => {
      if (r() >= 0.18 * p) return m;
      const k = 2 + Math.floor(r() * 3);
      return m + m.slice(-1).repeat(k);
    });
  }

  // majuscule initiale oubliée sur un message court (sauf nom propre)
  if (t.length <= 70 && /^[A-ZÀ-ÖØ-Þ][a-zà-ÿ]/.test(t) && !NOMS_PROPRES.test(t) && r() < 0.6 * p) {
    t = t.charAt(0).toLowerCase() + t.slice(1);
  }
  return t;
}

const OUVERTURE = /^(bien sûr|certainement|absolument|évidemment|tout à fait|avec plaisir)\s*[!,.:]+\s*/i;
const FERMETURE = /\s*(n['’]hésite pas[^.!?\n]*|j['’]espère que (ça|cela)[^.!?\n]*|si tu as (d['’]autres|besoin)[^.!?\n]*)[.!?]*\s*$/i;

function humaniserBulle(bulle, { oral = true, sms = false, probaSms = 1, r = Math.random } = {}) {
  let t = String(bulle || '');
  const original = t.trim();
  t = t.replace(/\s*[—–]\s*/g, ', ').replace(/\s{2,}/g, ' ').trim();
  const sansOuverture = t.replace(OUVERTURE, '');
  if (sansOuverture.length >= 8) t = sansOuverture;
  const sansFermeture = t.replace(FERMETURE, '');
  if (sansFermeture.length >= 4) t = sansFermeture;
  if (t.length <= 120 && /[^.]\.$/.test(t)) t = t.slice(0, -1); // un message court ne finit pas par un point
  if (oral) t = oraliser(t);
  if (sms) t = styleSms(t, { proba: probaSms, r });
  t = t.trim();
  return t || original;
}

const humaniser = (bulles, options) => (bulles || []).map((b) => humaniserBulle(b, options)).filter(Boolean);

module.exports = { oraliser, styleSms, humaniserBulle, humaniser };
