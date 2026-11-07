// Compréhension du contexte : aider l'IA à comprendre CE QUE l'autre veut dire, pas seulement ce qu'il écrit.
// - citations WhatsApp (« répondre à ») et messages transférés, gardés dans le message ;
// - repères de temps dans l'historique (« 3 h plus tard »), pour distinguer une suite d'un nouveau sujet ;
// - bloc « comprendre le contexte » : dernier message d'elle, message trop court pour se comprendre seul, langues mélangées ;
// - réponse de précision (« tu veux dire quoi ? ») reconnue pour ne pas être supprimée comme un questionnaire.
// Fonctions pures, testables sans WhatsApp ni IA.

const MARQUEUR_TEMPS = /^\s*\[⏱[^\]]*\]\s*/;
const BALISES_EN_TETE = /^\[(?:en réponse à|message transféré)[^\]]*\]\s*/gm;

const nettoyerExtrait = (s, max) => {
  const t = String(s || '').replace(/[\[\]]/g, '').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
};

const LIBELLES_TYPE = {
  ptt: '[vocal]', audio: '[vocal]', image: '[photo]', video: '[vidéo]', sticker: '[sticker]',
  location: '[position partagée]', document: '[document]', vcard: '[contact]', multi_vcard: '[contacts]',
};

// Étiquette ajoutée devant un message qui répond à un autre (citation WhatsApp).
// deMoi : le message cité est de NOUS (le bot) ; sinon c'est un ancien message de l'interlocuteur.
function etiquetteCitation({ deMoi, corps, type }) {
  const extrait = nettoyerExtrait(corps, 160) || LIBELLES_TYPE[type] || '';
  if (!extrait) return '';
  return `[en réponse à ${deMoi ? 'ton message' : 'un de ses messages précédents'} : « ${extrait} »] `;
}

const etiquetteTransfert = () => '[message transféré] ';

// Retire les étiquettes de contexte : les calculs de longueur, d'émotion, de question… ne doivent voir que ce qu'il a tapé.
function sansCitation(texte) {
  return String(texte || '').replace(BALISES_EN_TETE, '');
}

// L'IA recopie parfois les repères de temps : on les enlève de sa réponse.
function retirerMarqueurs(texte) {
  return String(texte || '')
    .split('\n')
    .map((l) => l.replace(MARQUEUR_TEMPS, ''))
    .join('\n')
    .replace(BALISES_EN_TETE, '')
    .trim();
}

function formaterEcart(ms) {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${Math.max(1, min)} min`;
  const h = Math.round(min / 6) / 10; // 1 décimale
  if (h < 24) return `${Number.isInteger(h) ? h : String(h).replace('.', ',')} h`;
  const j = Math.round(h / 24);
  return `${j} jour${j > 1 ? 's' : ''}`;
}

function libelleMoment(t, fuseau) {
  try {
    return new Intl.DateTimeFormat('fr-FR', { timeZone: fuseau, weekday: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(t));
  } catch (e) {
    return '';
  }
}

function jourLocal(t, fuseau) {
  try {
    return new Intl.DateTimeFormat('fr-CA', { timeZone: fuseau, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
  } catch (e) {
    return new Date(t).toISOString().slice(0, 10);
  }
}

// Historique + nouveau message, avec un repère de temps devant les messages de l'interlocuteur qui arrivent
// après un long silence ou un autre jour. Le contenu stocké n'est pas modifié (on renvoie des copies).
function annoterHistorique(historique, nouveau, { fuseau = 'Africa/Algiers', seuilMin = 60 } = {}) {
  const liste = [...(historique || []), ...(nouveau ? [nouveau] : [])];
  let precedent = null;
  return liste.map((m) => {
    const copie = { role: m.role, content: m.content };
    if (m.media) copie.media = m.media;
    if (precedent && m.role === 'user' && m.t && precedent.t) {
      const ecart = m.t - precedent.t;
      const autreJour = jourLocal(m.t, fuseau) !== jourLocal(precedent.t, fuseau);
      if (ecart >= seuilMin * 60000 || (autreJour && ecart >= 3 * 3600000)) {
        const quand = libelleMoment(m.t, fuseau);
        copie.content = `[⏱ ${formaterEcart(ecart)} plus tard${quand ? ' — ' + quand : ''}] ${m.content}`;
      }
    }
    if (m.t) precedent = m;
    return copie;
  });
}

const ELLIPTIQUE = /^(oui|ouais|ouai|non|nn|si|ok|okay|d'?accord|mdr|lol|ah|ahh?|bah|ben|bon|et|et toi|et alors|mais|donc|pourquoi|pk|pq|pourquoi pas|comment|quoi|koi|kwa|lequel|laquelle|lesquels|où|ou|quand|qui|combien|c'?est quoi|ça|ca|cela|pareil|moi aussi|moi non|idem|exactement|grave|carrément|trop|vraiment|vrmt|sérieux|serieux|jsp|je sais pas|peut[- ]être|ptet|aussi|ensuite|après|apres)\b/i;

// Un message qu'on ne comprend pas sans le précédent : très court, ou qui commence comme une réponse / une relance.
function estElliptique(texte) {
  const t = sansCitation(texte).replace(/\s+/g, ' ').trim();
  if (!t) return false;
  if (/^\[(vocal|photo|vidéo|sticker|position)/i.test(t)) return false;
  const mots = t.split(' ').filter(Boolean).length;
  return t.length <= 24 || mots <= 4 || (mots <= 7 && ELLIPTIQUE.test(t));
}

// Une demande de précision (« tu veux dire quoi ? », « c'est quoi X ? ») : courte, à garder même quand on n'a pas droit à une question.
function estPrecision(texte) {
  const t = String(texte || '').trim();
  if (t.length > 90 || !/\?\s*$/.test(t)) return false;
  return /(tu veux dire|ça veut dire|ca veut dire|c'?est quoi|tu parles de|tu parles d'|de qui|de quoi|lequel|laquelle|quel(?:le)? .{0,20}\?|comment ça|comment ca|je (?:te )?suis pas|j'?ai pas compris|pas compris|répète|repete|redis)/i.test(t);
}

const BRUT = /^\[(?:rien|react)/i;

function dernierMessageDeElle(historique) {
  const h = historique || [];
  for (let i = h.length - 1; i >= 0; i--) {
    const m = h[i];
    if (m && m.role === 'model' && !BRUT.test(String(m.content || '').trim())) return m;
  }
  return null;
}

function derniersMessagesDeLui(historique, n = 3) {
  return (historique || []).filter((m) => m && m.role === 'user').slice(-n).map((m) => nettoyerExtrait(sansCitation(m.content), 110));
}

// Bloc du prompt : relire avant de répondre, et comment traiter ce qu'on ne comprend pas tout de suite.
function blocContexte({ historique, message, prenomMoi = 'lui', maintenant = Date.now() } = {}) {
  const brut = sansCitation(message);
  const lignes = ['=== COMPRENDRE LE CONTEXTE (relis avant de répondre) ==='];

  const dernier = dernierMessageDeElle(historique);
  if (dernier) {
    const il = dernier.t ? ` (il y a ${formaterEcart(Math.max(0, maintenant - dernier.t))})` : '';
    const texte = nettoyerExtrait(String(dernier.content).split(/\n\s*\n/).slice(-1)[0], 220);
    lignes.push(`Ton dernier message à ${prenomMoi}${il} : « ${texte} »`);
  }

  if (/\[en réponse à/i.test(String(message || ''))) {
    lignes.push(`- Il répond à un message PRÉCIS (indiqué entre crochets devant son texte) : réponds à celui-là, pas au dernier sujet. « ton message » = ce que TOI tu as écrit ; « un de ses messages précédents » = ce que LUI avait écrit.`);
  }
  if (/\[message transféré\]/i.test(String(message || ''))) {
    lignes.push('- Il te transfère un message qu\'il a reçu d\'ailleurs : ce n\'est pas lui qui l\'a écrit. Réagis au contenu et à pourquoi il te le montre.');
  }

  if (estElliptique(message)) {
    const avant = derniersMessagesDeLui((historique || []), 3);
    lignes.push(`- Son message est très court (« ${nettoyerExtrait(brut, 60)} ») : il ne se comprend qu'avec ce qui précède. C'est presque sûrement la réponse à ta dernière question ou la suite du sujet en cours, pas un nouveau sujet.`);
    if (avant.length) lignes.push(`  Ce dont il parlait juste avant : ${avant.map((x) => `« ${x} »`).join(' · ')}`);
  }

  lignes.push(
    '- Plusieurs messages d\'affilée = une seule pensée : réponds à l\'ensemble, dans l\'ordre, sans en oublier.',
    '- « ça », « il », « elle », « lui », « là-bas », « ce truc », « pareil » : retrouve de quoi / de qui il s\'agit dans les derniers messages avant de répondre. Un repère [⏱ …] devant un message indique le temps écoulé : après plusieurs heures, ça peut être un nouveau sujet ; ne les recopie jamais.',
    '- Il écrit vite, au pouce : fautes, SMS, mots collés, absence d\'accents, arabizi (3 = ع, 7 = ح, 9 = ق, 5 = خ), darija, kabyle, anglais ou français mélangés dans la même phrase. Déduis le sens avec le contexte et tente de comprendre vraiment avant de réagir.',
    '- Si un mot ou une phrase t\'échappe vraiment, ne fais pas semblant d\'avoir compris et ne réponds pas à côté : demande en quelques mots (« tu veux dire quoi ? », « c\'est quoi ça ? »). Une demande de précision est toujours permise, même quand on t\'a dit de ne pas poser de question.',
    '- Quand tu doutes, rattache-toi à ce qui a été dit juste avant plutôt que d\'inventer un nouveau sujet ou un fait que tu ne sais pas.',
  );
  return lignes.join('\n');
}

module.exports = {
  etiquetteCitation, etiquetteTransfert, sansCitation, retirerMarqueurs, formaterEcart,
  annoterHistorique, estElliptique, estPrecision, dernierMessageDeElle, blocContexte, LIBELLES_TYPE,
};
