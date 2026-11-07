// Crédibilité : un dernier contrôle sur ce que l'IA a écrit, avant l'envoi.
// Fonctions pures, sans dépendance, faciles à tester.

const norm = (s) => String(s || '').replace(/[’‘]/g, '\'').toLowerCase();

// ---------- Messages d'amour (pour les emojis) ----------

const RE_TENDRE = new RegExp([
  'je t\'?aime', 't\'aime', 'tu me manques?', 'tu m\'as (?:trop )?manqu', 'mon c(?:œ|oe)ur', 'mon amour', 'ma vie', 'mon ange',
  'b[ée]b[ée]', 'habibi', 'habibti', 'mon (?:ch[ée]ri|tr[ée]sor)', 'bisous?', 'c[âa]lins?', 'je pense (?:trop |tout le temps )?[àa] toi',
  'je suis folle de toi', 'tu es (?:trop |vraiment )?(?:adorable|mignon|chou)', 't\'es (?:trop |vraiment )?(?:adorable|mignon|chou)',
  'trop chou', 'fais de beaux r[êe]ves', 'je t\'adore', 'tu me rends (?:folle|heureuse)', 'tu comptes (?:trop )?pour moi',
].join('|'), 'i');
const RE_TENDRE_EMOJI = /[❤♥💕💖💗💓💞💘😘😚🥰😍💋]/u;

// Dans un message de lui, un ❤️ compte ; dans ce qu'elle écrit, seuls les mots comptent (sinon un ❤️ ajouté à un message ordinaire suffirait).
function estTendre(texte, avecEmojis = true) { return RE_TENDRE.test(norm(texte)) || (avecEmojis && RE_TENDRE_EMOJI.test(String(texte || ''))); }

// Les seuls emojis permis dans un message d'amour : doux, jamais « 😂 » ou « 😭 ».
const RE_EMOJI_DOUX = /[❤♥💕💖💗💓💞💘😘😚🥰😍🥺🤍🫶💋😊☺🥹]\uFE0F?/gu;

// ---------- Tics d'assistant ----------

const TICS = [
  /en tant qu'?(?:ia|intelligence artificielle|assistant|mod[èe]le)/,
  /mod[èe]le de langage/,
  /je suis (?:une? )?(?:ia|intelligence artificielle|assistant(?:e)? virtuel|programme|chatbot)/,
  /as an ai|language model|i'?m sorry, but|i cannot (?:help|assist)/,
  /je ne peux pas (?:t'|vous )?(?:aider|assister|r[ée]pondre [àa] (?:cela|ça))/,
  /n'h[ée]site pas [àa] (?:me|revenir|demander)/,
  /je suis l[àa] pour (?:t'|vous )?(?:aider|[ée]couter et)/,
  /(?:comment|en quoi) puis-je (?:t'|vous )?(?:aider|assister)/,
  /j'esp[èe]re que (?:cela|ça) (?:t'|vous )?aide/,
  /^\s*(?:bien s[ûu]r|absolument|certainement) ?[!,.]/,
  /^\s*voici (?:quelques|une? |la |des )/,
  /^\s*(?:r[ée]ponse|message) ?:/,
  /si tu veux, je peux (?:aussi |te )/,
];

// L'IA a-t-elle écrit une phrase d'assistant ? (On laisse passer s'il vient de lui demander sérieusement si elle est une IA.)
function ticAssistant(morceaux, messageUtilisateur = '') {
  const lui = norm(messageUtilisateur);
  const demandeIA = /\b(?:ia|robot|bot|chatgpt|intelligence artificielle|programme)\b/.test(lui);
  for (const m of morceaux) {
    const t = norm(m);
    for (const re of TICS) {
      if (re.test(t)) {
        if (demandeIA && /ia|mod[èe]le|programme|chatbot|language|intelligence/.test(re.source)) continue;
        return true;
      }
    }
  }
  return false;
}

// Retire les phrases qui sonnent « assistant » ; ce qui reste est utilisable, sinon liste vide.
function retirerTics(morceaux, messageUtilisateur = '') {
  const sortie = [];
  for (const m of morceaux) {
    const phrases = String(m).match(/[^.!?…\n]+[.!?…]*\s*/g) || [String(m)];
    const gardees = phrases.filter((p) => !ticAssistant([p], messageUtilisateur));
    const t = gardees.join('').trim();
    if (t) sortie.push(t);
  }
  return sortie;
}

// ---------- Didascalies et mise en scène ----------

// Une vraie personne n'écrit pas « *sourit* », « (rires) » ou « [elle rougit] » dans un SMS.
function retirerDidascalies(texte) {
  return String(texte || '')
    .replace(/\*[^*\n]{2,40}\*/g, '')
    .replace(/\((?:rires?|elle|il|sourit|rit|soupir|je (?:souris|rougis|ris))[^)\n]{0,40}\)/gi, '')
    .replace(/\[(?:elle|il|sourit|rit|rougit)[^\]\n]{0,40}\]/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .trim();
}

// ---------- Répétition ----------

function mots(t) {
  return new Set(norm(t).replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 1));
}

function similarite(a, b) {
  const A = mots(a), B = mots(b);
  if (!A.size || !B.size) return 0;
  let commun = 0;
  for (const w of A) if (B.has(w)) commun++;
  return commun / (A.size + B.size - commun);
}

// Le nouveau message ressemble-t-il trop à l'un de ses derniers ? (les messages très courts, « mdr », peuvent se répéter)
function repetition(morceaux, dejaEcrits, seuil = 0.8) {
  const neuf = morceaux.join(' ').trim();
  if (neuf.length < 14) return false;
  return (dejaEcrits || []).slice(-6).some((ancien) => String(ancien).length >= 14 && similarite(neuf, ancien) >= seuil);
}

// Ses derniers messages (hors marqueurs), du plus ancien au plus récent.
function derniersMessagesElle(historique, n = 6) {
  const sortie = [];
  for (const m of (historique || []).filter((x) => x && x.role === 'model')) {
    for (const bulle of String(m.content || '').split(/\n\s*\n/)) {
      const t = bulle.trim();
      if (t && !/^\[(?:RIEN|REACT:)/.test(t)) sortie.push(t);
    }
  }
  return sortie.slice(-n);
}

const CONSIGNE_TIC = 'Ta réponse sonnait comme un assistant. Réécris-la comme une vraie personne sur WhatsApp : pas de formule de politesse d\'assistant, pas d\'offre d\'aide, aucune mention d\'IA ou de modèle. Reste dans le personnage.';
const CONSIGNE_REPETITION = 'Ta réponse ressemble trop à un de tes messages récents. Dis autre chose : un autre angle, d\'autres mots, un autre début de phrase.';

module.exports = {
  estTendre, RE_EMOJI_DOUX, ticAssistant, retirerTics, retirerDidascalies,
  similarite, repetition, derniersMessagesElle, CONSIGNE_TIC, CONSIGNE_REPETITION,
};
