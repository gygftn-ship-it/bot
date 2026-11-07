const fs = require('fs');
const path = require('path');
const net = require('net');
const { execFile, spawn } = require('child_process');
const {
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
} = require('./utils');
const H = require('./humain');
const V = require('./vie');
const C = require('./calendrier');
const J = require('./journee');
const S = require('./souvenirs');
const Q = require('./curiosite');
const N = require('./naturel');
const M = require('./memoire');
const A = require('./annee');
const W = require('./monde');
const E = require('./emotions');
const EL = require('./elan');
const P = require('./personnalite');
const VS = require('./viesociale');
const SP = require('./spontane');
const PR = require('./promesses');
const PA = require('./pannes');
const SU = require('./suites');
const CX = require('./contexte');
const HI = require('./histoire');
const CR = require('./credibilite');
const T = require('./tension');
const IN = require('./intimite');
const { fusionnerRoles, appelerAnthropic, appelerOpenAI, MODELES_DEFAUT } = require('./fournisseurs');

const API = 'https://generativelanguage.googleapis.com/v1beta';
// Sur le palier gratuit, la version « lite » autorise bien plus de messages par jour.
const MODELE_PAR_DEFAUT = 'gemini-3.5-flash-lite';
const MODELES_SECOURS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-3.6-flash'];

// Temps d'attente conseillé par Google après une erreur de limite (en secondes), s'il y en a un.
// Garde les messages les plus récents tant que le total reste raisonnable (évite les appels trop lourds et lents).
function borneHistorique(messages, maxCaracteres = 24000) {
  let total = 0;
  const gardes = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    total += String((messages[i] && messages[i].content) || '').length + 20;
    if (total > maxCaracteres && gardes.length >= 2) break;
    gardes.unshift(messages[i]);
  }
  return gardes;
}

function delaiConseille(data, erreur) {
  const details = (data && data.error && data.error.details) || [];
  for (const d of details) {
    const m = d && d.retryDelay ? String(d.retryDelay).match(/([\d.]+)s/) : null;
    if (m) return parseFloat(m[1]);
  }
  const m = String(erreur).match(/retry in ([\d.]+)\s*s/i);
  return m ? parseFloat(m[1]) : null;
}

const resumeErreur = (e) => String(e).split(/\n|For more information/)[0].trim();

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const alea = (min, max) => min + Math.random() * (max - min);

// Évite qu'une opération bloquée en silence ne fige tout : on obtient une erreur lisible.
function avecDelai(promesse, ms, nom) {
  let t;
  const limite = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error(`${nom} : pas de réponse après ${Math.round(ms / 1000)} s`)), ms);
  });
  return Promise.race([promesse, limite]).finally(() => clearTimeout(t));
}

// ---------- Navigateur ----------

// WhatsApp Web a besoin d'un navigateur : on utilise Edge ou Chrome déjà installé.
function trouverNavigateur() {
  const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const local = process.env['LOCALAPPDATA'] || '';
  const liste = [
    process.env.CHROME_PATH,
    process.env.PREFIX && path.join(process.env.PREFIX, 'bin', 'chromium-browser'),
    process.env.PREFIX && path.join(process.env.PREFIX, 'bin', 'chromium'),
    '/data/data/com.termux/files/usr/bin/chromium-browser',
    path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    local && path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  return liste.find((p) => p && fs.existsSync(p));
}

function portLibre() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

// Attend que le navigateur lancé à la main ouvre son port de contrôle.
async function attendreNavigateur(port, delaiMs) {
  const fin = Date.now() + delaiMs;
  while (Date.now() < fin) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) {
        const data = await r.json();
        if (data.webSocketDebuggerUrl) return data.webSocketDebuggerUrl;
      }
    } catch (e) {}
    await attendre(400);
  }
  return null;
}

// Ferme les navigateurs restés ouverts avec le profil du bot (lancements précédents ratés).
function tuerNavigateursDuProfil(profil) {
  if (process.platform !== 'win32') {
    // Linux / Termux : on ferme les navigateurs qui utilisent ce profil (pkill peut être absent, ce n'est pas grave).
    return new Promise((resolve) => {
      try { execFile('pkill', ['-f', profil], { timeout: 5000 }, () => resolve()); } catch (e) { resolve(); }
    });
  }
  const motif = profil.replace(/'/g, "''");
  const script =
    "Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'msedge.exe' -or $_.Name -eq 'chrome.exe') -and $_.CommandLine -and $_.CommandLine.Contains('" +
    motif +
    "') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }";
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, timeout: 15000 },
      () => resolve()
    );
  });
}

// ---------- API Google ----------

async function listerModeles(cle) {
  if (!cle) throw new Error('Colle d\'abord ta clé API Google.');
  const res = await fetch(`${API}/models?pageSize=200`, { headers: { 'x-goog-api-key': cle } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.error && data.error.message) || `Erreur HTTP ${res.status}`);
  return (data.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => String(m.name).replace(/^models\//, ''))
    .filter(
      (n) =>
        /^gemini/i.test(n) &&
        !/(tts|image|live|embedding|robotics|audio|computer|banana|veo|imagen|aqa|learnlm|antigravity|translate)/i.test(n)
    );
}

// ---------- Indicateur « en train d'écrire » ----------

// Exécutée DANS la page WhatsApp Web. Contrairement à chat.sendStateTyping() de whatsapp-web.js
// (qui n'attend pas le résultat et ne signale jamais d'erreur), celle-ci attend la fin de l'envoi
// et remonte une erreur claire si la fonction n'existe plus dans la version de WhatsApp Web.
const PAGE_ETAT_ECRITURE = async (chatId, etat) => {
  const W = window;
  const req = (n) => { try { return W.require(n); } catch (e) { return null; } };
  const noms = { typing: 'sendChatStateComposing', recording: 'sendChatStateRecording', stop: 'sendChatStatePaused' };
  const nom = noms[etat === 'test' ? 'typing' : etat];
  const modules = [
    ['Store.ChatState', W.Store && W.Store.ChatState],
    ['WAWebChatStateBridge', req('WAWebChatStateBridge')],
    ['WAWebChatStateAction', req('WAWebChatStateAction')],
    ['WAWebSendChatStateAction', req('WAWebSendChatStateAction')],
  ].filter(([, mod]) => mod && typeof mod[nom] === 'function');
  if (!modules.length) throw new Error('fonction ' + nom + ' introuvable dans cette version de WhatsApp Web');
  if (etat === 'test') return modules[0][0] + '.' + nom;

  // Les versions récentes de WhatsApp Web veulent un vrai identifiant (objet avec toJid), parfois de type @lid,
  // et refusent un texte ou un identifiant @c.us qui ne correspond pas à la discussion. On essaie donc
  // toutes les formes possibles, la plus fiable d'abord (celle de la discussion elle-même).
  const sur = (f) => { try { return f(); } catch (e) { return null; } };
  const wf = req('WAWebWidFactory');
  const creer = (x) => sur(() => (W.Store && W.Store.WidFactory && W.Store.WidFactory.createWid ? W.Store.WidFactory.createWid(x) : null))
    || sur(() => (wf && wf.createWid ? wf.createWid(x) : null));
  const wid = creer(chatId);
  let chat = null;
  for (const k of [chatId, wid]) {
    if (k && !chat) chat = sur(() => W.Store.Chat.get(k));
  }
  if (!chat && wid) { try { chat = await W.Store.Chat.find(wid); } catch (e) {} }
  const candidats = [];
  const ajouter = (x) => { if (x && !candidats.includes(x)) candidats.push(x); };
  if (chat) ajouter(chat.id);
  ajouter(wid);
  if (wid && String(chatId).endsWith('@c.us')) {
    ajouter(sur(() => W.Store.LidUtils.getCurrentLid(wid)));
    ajouter(sur(() => (wf && wf.toUserLid ? wf.toUserLid(wid) : null)));
  }
  if (chat) ajouter(chat);
  ajouter(chatId);

  const erreurs = [];
  for (const [libelle, mod] of modules) {
    for (const arg of candidats) {
      try {
        await mod[nom](arg);
        return libelle + '.' + nom;
      } catch (e) {
        const m = String((e && e.message) || e).split('\n')[0].slice(0, 80);
        if (!erreurs.includes(m)) erreurs.push(m);
      }
    }
  }
  throw new Error(erreurs.slice(0, 3).join(' | ') || 'aucun identifiant utilisable');
};

// Exécutée DANS la page WhatsApp Web : marque la discussion comme lue sans passer par client.getChat(),
// qui échoue sur les versions récentes de WhatsApp Web quand whatsapp-web.js est trop ancien.
const PAGE_VU = async (chatId) => {
  const W = window;
  const req = (n) => { try { return W.require(n); } catch (e) { return null; } };
  const sur = (f) => { try { return f(); } catch (e) { return null; } };
  const wf = req('WAWebWidFactory');
  const wid = sur(() => W.Store.WidFactory.createWid(chatId)) || sur(() => wf.createWid(chatId));
  let chat = sur(() => W.Store.Chat.get(chatId)) || (wid ? sur(() => W.Store.Chat.get(wid)) : null);
  if (!chat && wid) { try { chat = await W.Store.Chat.find(wid); } catch (e) {} }
  if (!chat) throw new Error('discussion introuvable dans la page');
  const modules = [
    ['Store.SendSeen', W.Store && W.Store.SendSeen],
    ['WAWebUpdateUnreadChatAction', req('WAWebUpdateUnreadChatAction')],
  ];
  for (const [libelle, mod] of modules) {
    if (!mod) continue;
    for (const nom of ['sendSeen', 'sendConversationSeen']) {
      if (typeof mod[nom] === 'function') { await mod[nom](chat, false); return libelle + '.' + nom; }
    }
  }
  throw new Error('fonction « lu » introuvable');
};

// ---------- Réactions emoji ----------

// Exécutée DANS la page WhatsApp Web. message.react() de whatsapp-web.js ne signale jamais d'échec
// (si le message n'est pas retrouvé en mémoire ou si la fonction a changé de nom, il ne fait rien et ne dit rien).
// Celle-ci retrouve le message par plusieurs chemins, attend l'envoi, et lève une erreur claire sinon.
// idMessage = '' avec emoji = 'test' : vérifie seulement que la fonction d'envoi existe.
const PAGE_REACTION = async (idMessage, emoji, chatId) => {
  const W = window;
  const req = (n) => { try { return W.require(n); } catch (e) { return null; } };
  const modules = [
    ['Store.sendReactionToMsg', W.Store && W.Store.sendReactionToMsg ? { sendReactionToMsg: W.Store.sendReactionToMsg } : null],
    ['WAWebSendReactionMsgAction', req('WAWebSendReactionMsgAction')],
    ['WAWebReactionsSendAction', req('WAWebReactionsSendAction')],
    ['WAWebSendReactionAction', req('WAWebSendReactionAction')],
  ].filter(([, mod]) => mod && typeof mod.sendReactionToMsg === 'function');
  if (!modules.length) {
    // Les noms de modules changent à chaque version de WhatsApp Web : on cherche la fonction elle-même.
    for (const [nom, mod] of chercherFonction('sendReactionToMsg', 'React')) modules.push(['recherche:' + nom, mod]);
  }
  if (!modules.length) throw new Error('fonction sendReactionToMsg introuvable dans cette version de WhatsApp Web');
  if (emoji === 'test') return modules[0][0];

  const msg = await trouverMsg(idMessage, chatId);
  if (!msg) throw new Error('message introuvable dans WhatsApp Web (' + String(idMessage).slice(-14) + ')');
  const erreurs = [];
  for (const [libelle, mod] of modules) {
    try {
      const r = await mod.sendReactionToMsg(msg, emoji);
      const texte = r == null ? '' : typeof r === 'object' ? JSON.stringify(r).slice(0, 60) : String(r);
      if (/(error|fail|invalid|not_found|forbidden)/i.test(texte)) throw new Error('refusée par WhatsApp : ' + texte);
      return libelle + (texte ? ' → ' + texte : '');
    } catch (e) {
      erreurs.push(libelle + ' : ' + String((e && e.message) || e).split('\n')[0].slice(0, 80));
    }
  }
  throw new Error(erreurs.join(' | '));
};

// Vérifie qu'on peut répondre en citant ce message, et donne son identifiant tel que WhatsApp Web le connaît.
const PAGE_CITATION_VERIF = async (idMessage, chatId) => {
  const W = window;
  const msg = await trouverMsg(idMessage, chatId);
  if (!msg) throw new Error('le message à citer est introuvable dans WhatsApp Web');
  let peut = true;
  try {
    if (W.Store && W.Store.ReplyUtils && W.Store.ReplyUtils.canReplyMsg) peut = !!W.Store.ReplyUtils.canReplyMsg(msg.unsafe ? msg.unsafe() : msg);
    else if (typeof msg.canReply === 'function') peut = !!msg.canReply();
  } catch (e) {}
  return { id: msg.id._serialized, peut };
};

// Envoi d'un texte directement par WhatsApp Web, avec citation si idMessage est donné, quand whatsapp-web.js n'y arrive pas.
const PAGE_CITATION_ENVOI = async (idMessage, chatId, texte) => {
  const W = window;
  const req = (n) => { try { return W.require(n); } catch (e) { return null; } };
  const sur = (f) => { try { return f(); } catch (e) { return null; } };
  let msg = null;
  if (idMessage) {
    msg = await trouverMsg(idMessage, chatId);
    if (!msg) throw new Error('le message à citer est introuvable dans WhatsApp Web');
  }
  const wf = req('WAWebWidFactory');
  const wid = sur(() => W.Store.WidFactory.createWid(chatId)) || sur(() => wf.createWid(chatId));
  const salons = collection('Chat');
  let chat = (salons ? sur(() => salons.get(chatId)) || (wid ? sur(() => salons.get(wid)) : null) : null);
  if (!chat && wid && salons) { try { chat = await salons.find(wid); } catch (e) {} }
  if (!chat) throw new Error('discussion introuvable dans la page');
  const modules = [];
  const connu = req('WAWebSendTextMsgChatAction');
  if (connu && typeof connu.sendTextMsgToChat === 'function') modules.push(['WAWebSendTextMsgChatAction', connu]);
  if (!modules.length) for (const [nom, mod] of chercherFonction('sendTextMsgToChat', 'Send').concat(chercherFonction('sendTextMsgToChat', 'Msg'))) modules.push([nom, mod]);
  if (!modules.length) throw new Error('envoi direct indisponible dans cette version');
  const options = msg ? { quotedMsg: msg } : {};
  const erreurs = [];
  for (const [nom, mod] of modules) {
    try { await mod.sendTextMsgToChat(chat, texte, options); return nom; } catch (e) { erreurs.push(nom + ' : ' + String((e && e.message) || e).split('\n')[0].slice(0, 80)); }
  }
  throw new Error(erreurs.join(' | '));
};

// Diagnostic : ce dont on dispose pour citer un message et pour envoyer sans passer par la bibliothèque.
const PAGE_CITATION_DIAG = async () => {
  const W = window;
  const req = (n) => { try { return W.require(n); } catch (e) { return null; } };
  const dispo = [];
  if (collection('Msg')) dispo.push('Msg');
  if (W.Store && W.Store.ReplyUtils) dispo.push('ReplyUtils');
  const m = req('WAWebSendTextMsgChatAction');
  if (m && m.sendTextMsgToChat) dispo.push('sendTextMsgToChat');
  else if (chercherFonction('sendTextMsgToChat', 'Send').length || chercherFonction('sendTextMsgToChat', 'Msg').length) dispo.push('sendTextMsgToChat (recherche)');
  if (!dispo.includes('Msg')) throw new Error('collection des messages introuvable');
  if (!dispo.some((x) => x.indexOf('sendTextMsgToChat') === 0)) throw new Error('fonction d\'envoi introuvable');
  return dispo.join(', ');
};

// Les fonctions PAGE_* tournent dans la page WhatsApp Web : elles ne voient pas le code de ce fichier.
// Les outils communs sont donc envoyés avec elles (voir lancerDansPage).
const OUTILS_PAGE = `const collection = (nom) => {
  const W = window;
  const sur = (f) => { try { return f(); } catch (e) { return null; } };
  return (W.Store && W.Store[nom]) || sur(() => W.require('WAWebCollections')[nom]) || null;
};
const chercherFonction = (nomFonction, fragment) => {
  const W = window;
  const sur = (f) => { try { return f(); } catch (e) { return null; } };
  const carte = sur(() => W.require('__debug').modulesMap) || {};
  const trouves = [];
  for (const nom of Object.keys(carte)) {
    if (fragment && nom.indexOf(fragment) === -1) continue;
    const mod = sur(() => W.require(nom));
    if (mod && typeof mod[nomFonction] === 'function') trouves.push([nom, mod]);
    if (trouves.length >= 4) break;
  }
  return trouves;
};
const trouverMsg = async (idMessage, chatId) => {
  const W = window;
  const req = (n) => { try { return W.require(n); } catch (e) { return null; } };
  const sur = (f) => { try { return f(); } catch (e) { return null; } };
  let msg = sur(() => collection('Msg').get(idMessage));
  if (msg) return msg;
  try { const r = await collection('Msg').getMessagesById([idMessage]); msg = r && r.messages && r.messages[0]; } catch (e) {}
  if (msg) return msg;
  const col = req('WAWebCollections');
  msg = sur(() => col.Msg.get(idMessage));
  if (msg) return msg;
  // Dernier recours : retrouver le message par son identifiant court (la forme complète change selon @c.us / @lid).
  const morceaux = String(idMessage).split('_');
  const court = morceaux[2] || morceaux[morceaux.length - 1];
  const chercher = (liste) => (liste || []).find((m) => m && m.id && m.id.id === court);
  const tous = (coll) => sur(() => coll.getModelsArray()) || sur(() => coll.models) || [];
  msg = chercher(tous(collection('Msg')));
  if (msg) return msg;
  const chat = chatId ? sur(() => collection('Chat').get(chatId)) : null;
  return chat && chat.msgs ? chercher(tous(chat.msgs)) || null : null;
};`;

function lancerDansPage(page, fonction, ...args) {
  const source = `(async () => { ${OUTILS_PAGE}\nreturn (${fonction.toString()})(...${JSON.stringify(args)}); })()`;
  return page.evaluate(source);
}

// Les emojis « texte » (❤, ☺…) doivent porter le sélecteur de variante pour s'afficher comme réaction.
function normaliserEmoji(e) {
  const t = String(e || '').trim();
  const signes = [...t];
  if (signes.length === 1 && t.codePointAt(0) < 0x10000 && !/\uFE0F/.test(t)) return t + '\uFE0F';
  return t;
}

// ---------- Le bot ----------

const MEDIAS_PRIS_EN_CHARGE = ['chat', 'ptt', 'audio', 'image', 'sticker', 'video', 'location', 'document', 'vcard', 'multi_vcard'];

class Bot {
  constructor(config, dossier, emit) {
    this.config = config;
    this.dossier = dossier;
    this.emit = emit;
    this.client = null;
    this.proc = null;
    this.surveillance = null;
    this.vieDeFond = null;
    this.pending = {}; // messages reçus en attente de réponse, par numéro
    this.file = {};
    this.ignores = new Set();
    this.modeleVerifie = false;
    this.bloques = {}; // modèles mis de côté un moment (limite atteinte, surcharge)
    this.introuvables = new Set();
    this.dernierSecours = null;
    this.erreursEcriture = 0;
    this.initEnCours = false;
    this.enLigneAleatoire = false;
    this.fichierHistorique = path.join(dossier, 'historique.json');
    this.fichierEtat = path.join(dossier, 'etat.json');
    this.fichierMemoire = path.join(dossier, 'memoire.json');
    this.historiques = this.lireJson(this.fichierHistorique, {});
    this.etat = this.lireJson(this.fichierEtat, {});
    if (!this.etat.numeros) this.etat.numeros = {};
    if (!this.etat.attente) this.etat.attente = {};
    if (!this.etat.refs) this.etat.refs = {};
    this.memoires = this.lireJson(this.fichierMemoire, {});
  }

  lireJson(fichier, defaut) {
    // Fichier absent : valeur par défaut. Fichier corrompu : on tente la copie de secours avant d'abandonner.
    for (const f of [fichier, fichier + '.bak']) {
      try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) {
        if (e.code !== 'ENOENT' && f === fichier) { try { this.log('Fichier illisible (' + path.basename(fichier) + '), je tente la copie de secours.'); } catch (e2) {} }
      }
    }
    return defaut;
  }

  ecrireJson(fichier, objet) {
    try {
      fs.mkdirSync(this.dossier, { recursive: true });
      // Écriture atomique : on écrit à côté puis on renomme, pour qu'une coupure en plein milieu ne corrompe rien.
      const tmp = fichier + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(objet, null, 2));
      try { fs.copyFileSync(fichier, fichier + '.bak'); } catch (e) {}
      fs.renameSync(tmp, fichier);
    } catch (e) {}
  }

  log(texte) {
    const h = new Date().toLocaleTimeString('fr-FR');
    this.emit('log', `${h}  ${texte}`);
  }

  // Valeur de réglage avec valeur par défaut (les anciens fichiers de config n'ont pas les nouveaux champs).
  p(nom, defaut) {
    const v = this.config[nom];
    return v === undefined || v === null || v === '' ? defaut : v;
  }

  // Toutes les attentes du bot passent ici : « échelle de temps » permet d'accélérer pour tester.
  pause(ms) {
    const k = Number(this.config.echelleTemps);
    return attendre(ms * (k > 0 ? k : 1));
  }

  sauverHistorique() { this.ecrireJson(this.fichierHistorique, this.historiques); }
  sauverEtat() { this.ecrireJson(this.fichierEtat, this.etat); }
  sauverMemoire() { this.ecrireJson(this.fichierMemoire, this.memoires); }

  etatNum(numero) {
    if (!this.etat.numeros[numero]) this.etat.numeros[numero] = { sansReponse: 0 };
    return this.etat.numeros[numero];
  }

  vie(date = new Date()) { return H.etatDeVie(date, this.config); }

  // Les événements de sa vie (examen, dispute, projet…) vivent dans etat.json.
  vieEtat() {
    if (!this.etat.vie) this.etat.vie = V.nouvelEtatVie();
    return this.etat.vie;
  }

  // Archive ce qui est fini et tire, une fois par jour, un éventuel nouvel événement.
  majVie() {
    if (this.p('evenementsVie', true) === false) return;
    const vie = this.vieEtat();
    const avant = vie.cleJour;
    const changes = V.majVie(vie, Date.now(), this.config);
    for (const ch of changes) {
      this.log(ch.type === 'cree' ? `Nouvel événement dans sa vie : ${ch.ev.titre}.` : `Événement terminé : ${ch.ev.titre}.`);
    }
    if (changes.length || avant !== vie.cleJour) this.sauverEtat();
  }

  // ----- Démarrage / arrêt -----

  async start() {
    const c = this.config;
    if (!c.cleApi || !c.cleApi.trim()) throw new Error('La clé API est manquante.');
    this.numeros = dedoublonnerNumeros(normaliserNumeros(c.numerosAutorises));
    if (!this.numeros.length) throw new Error('Indique ton numéro dans « Numéros autorisés ».');
    const navigateur = trouverNavigateur();
    if (!navigateur) throw new Error('Microsoft Edge ou Google Chrome doit être installé sur cet ordinateur.');

    this.emit('status', 'Démarrage…');
    this.log('Démarrage de WhatsApp Web…');
    this.log('Navigateur utilisé : ' + navigateur);

    // Ferme d'anciens navigateurs restés ouverts, puis supprime leurs verrous.
    const profil = path.join(this.dossier, 'profil-navigateur');
    fs.mkdirSync(profil, { recursive: true });
    await tuerNavigateursDuProfil(profil);
    await attendre(500);
    for (const f of ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'lockfile']) {
      try { fs.rmSync(path.join(profil, f), { force: true }); } catch (e) {}
    }

    // On lance le navigateur nous-mêmes (Edge se relance parfois tout seul, ce qui
    // faisait échouer le lancement automatique), puis on s'y connecte.
    const port = await portLibre();
    const argsNav = [
      `--remote-debugging-port=${port}`,
      '--remote-allow-origins=*',
      `--user-data-dir=${profil}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=CalculateNativeWinOcclusion',
      ...(process.platform === 'win32' ? [] : ['--no-sandbox', '--disable-dev-shm-usage']),
      ...(c.afficherNavigateur ? [] : ['--headless=new']),
      'about:blank',
    ];
    try {
      this.proc = spawn(navigateur, argsNav, { stdio: 'ignore', windowsHide: !c.afficherNavigateur });
      this.proc.on('error', (e) => this.log('Erreur navigateur : ' + e.message));
    } catch (e) {
      throw new Error('Impossible de lancer le navigateur : ' + e.message);
    }
    const ws = await attendreNavigateur(port, 25000);
    if (!ws) {
      await this.nettoyerNavigateur(profil);
      throw new Error('Le navigateur ne répond pas. Ferme tous les Edge puis réessaie, ou redémarre le PC.');
    }
    this.log('Navigateur démarré.');
    this.profil = profil;

    const { Client, NoAuth } = require('whatsapp-web.js');
    try { this.log('whatsapp-web.js version ' + require('whatsapp-web.js/package.json').version + '.'); } catch (e) {}
    const QRCode = require('qrcode');

    // Liaison par code (sans QR) : utile quand WhatsApp et le bot sont sur le même téléphone.
    const numLiaison = String(c.numeroLiaison || '').replace(/\D/g, '');
    this.client = new Client({
      authStrategy: new NoAuth(), // la session WhatsApp est gardée dans le profil du navigateur
      puppeteer: { browserWSEndpoint: ws },
      ...(numLiaison ? { pairWithPhoneNumber: { phoneNumber: numLiaison, showNotification: true } } : {}),
    });
    const client = this.client;

    client.on('code', (code) => {
      this.emit('code', code);
      this.emit('status', 'En attente de la saisie du code');
    });
    client.on('qr', async (qr) => {
      this.emit('qrtexte', qr);
      try {
        this.emit('qr', await QRCode.toDataURL(qr, { width: 260, margin: 1 }));
      } catch (e) {}
      this.emit('status', 'En attente du scan du QR code');
      this.log('Scanne le QR code avec le WhatsApp du second numéro.');
    });
    client.on('authenticated', () => this.log('Connexion WhatsApp acceptée.'));
    client.on('ready', () => {
      this.emit('qr', null);
      const num = client.info && client.info.wid ? client.info.wid.user : '';
      this.emit('status', `Connecté${num ? ' (' + num + ')' : ''}`);
      this.log('Bot prêt. Écris-lui depuis ton téléphone.');
      if (this.p('passerHorsLigne', true) !== false) {
        Promise.resolve(client.sendPresenceUnavailable()).catch(() => {});
      }
      this.demarrerVie();
    });
    client.on('auth_failure', (m) => this.log('Échec de connexion : ' + m));
    client.on('disconnected', (r) => {
      this.log('Déconnecté : ' + r);
      this.emit('status', 'Déconnecté');
    });
    client.on('message', (msg) => this.surMessage(msg));

    client.initialize().catch((e) => {
      this.log('Erreur au démarrage : ' + e.message);
      this.emit('status', 'Erreur');
    });

    // Si le navigateur est fermé à la main, on le signale.
    let echecs = 0;
    this.surveillance = setInterval(async () => {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/json/version`);
        if (!r.ok) throw new Error('KO');
        echecs = 0;
      } catch (e) {
        echecs += 1;
        if (echecs >= 3) {
          clearInterval(this.surveillance);
          this.log('Le navigateur a été fermé. Clique sur « Enregistrer et démarrer » pour relancer.');
          this.emit('status', 'Erreur');
        }
      }
    }, 8000);
  }

  // Une fois WhatsApp prêt : diagnostic de l'indicateur « écrit… », reprise des messages
  // en attente, puis la « vie de fond » (messages spontanés, présence aléatoire).
  demarrerVie() {
    setTimeout(() => this.diagnostiquerEcriture(), 8000);
    setTimeout(() => this.diagnostiquerReaction(), 10000);
    setTimeout(() => this.diagnostiquerCitation(), 12000);
    this.reprendreAttentes();
    this.majVie();
    clearInterval(this.vieDeFond);
    this.vieDeFond = setInterval(() => {
      this.tick().catch((e) => this.log('Erreur (vie de fond) : ' + e.message));
    }, 60000);
    const v = this.vie();
    this.log(`Rythme de vie : ${v.libelle} (humeur : ${H.humeur(new Date(), this.config)}).`);
    this.sans(() => this.journalJour());
    this.dernierJournalPeriodique = 0;
    const actifs = V.evenementsActifs(this.vieEtat(), Date.now());
    if (actifs.length) this.log('Sa vie en ce moment : ' + actifs.map((ev) => ev.titre).join(', ') + '.');
    const sp = C.joursSpeciaux(new Date(), this.config).filter((x) => x.code !== 'vendredi');
    if (sp.length) this.log('Aujourd\'hui : ' + sp.map((x) => x.code).join(', ') + '.');
    if (this.p('meteoActive', true) !== false) this.log('Météo du personnage : ' + J.meteoDuJour(new Date(), this.config).texte);
    const hs = V.humeurSpeciale(new Date(), this.config);
    if (hs && (hs.actif || hs.retour)) this.log(`Humeur particulière aujourd'hui : ${hs.type}${hs.actif ? '' : ' (retour)'}.`);
  }

  async nettoyerNavigateur(profil) {
    try { if (this.proc) this.proc.kill(); } catch (e) {}
    this.proc = null;
    await tuerNavigateursDuProfil(profil || path.join(this.dossier, 'profil-navigateur'));
  }

  async stop() {
    clearInterval(this.surveillance);
    clearInterval(this.vieDeFond);
    Object.values(this.pending).forEach((e) => clearTimeout(e.timer));
    if (this.client) {
      try { await this.client.destroy(); } catch (e) {}
      this.client = null;
    }
    await this.nettoyerNavigateur(this.profil);
    this.emit('qr', null);
    this.emit('status', 'Arrêté');
    this.log('Bot arrêté.');
  }

  // ----- Personnalité -----

  construirePrompt(numero, extra = {}) {
    const c = this.config;
    const exemples = (c.exemples || '').trim();
    const elle = c.prenomElle || 'elle';
    const base =
      (c.promptPerso || '').trim() ||
      [
        `Tu es ${c.prenomElle || 'une personne'}. Tu discutes sur WhatsApp avec ${c.prenomMoi || 'ton interlocuteur'} (${c.relation || 'vous vous connaissez bien'}).`,
        `Tu écris exactement comme ${elle} le ferait dans un vrai message WhatsApp.`,
        c.styleEcriture ? `Sa façon d'écrire : ${c.styleEcriture}` : '',
        c.infosSurElle ? `À propos d'elle : ${c.infosSurElle}` : '',
      ].filter(Boolean).join('\n');
    const bloc = exemples
      ? `Voici de vrais messages écrits par elle. Imite leur longueur, leur vocabulaire, leurs abréviations, leurs emojis et leur ponctuation :\n<exemples>\n${exemples}\n</exemples>`
      : '';
    const faits = numero && this.memoires[numero] && this.memoires[numero].faits;
    const contexteMem = this.contexteMemoire(numero, extra);
    const selective = this.p('memoireSelective', true) !== false;
    const fSel = faits ? (selective ? M.choisirFaits(faits, contexteMem, Math.max(600, Number(this.p('memoireFaitsMax', 1800)))) : { texte: faits, gardees: String(faits).split('\n').filter((l) => /^\s*[-*•]/.test(l)).length, total: String(faits).split('\n').filter((l) => /^\s*[-*•]/.test(l)).length }) : null;
    const memoire = fSel && fSel.texte ? `=== MÉMOIRE (ce que tu sais vraiment de ${c.prenomMoi || 'lui'}) ===\n${fSel.texte}` : '';
    this.statsMemoire = { faits: fSel };
    const rappels = numero && this.p('rappelsSuivi', true) !== false && this.memoires[numero] ? S.blocRappels(this.memoires[numero].rappels, this.cleDuJour()) : '';
    const repetitions = numero && this.p('antiRepetition', true) !== false ? S.blocRepetitions(this.historiques[numero], { ignorerQuestions: !!extra.question }) : '';
    const prompt = [base, bloc, memoire, rappels, this.blocSituation(numero, extra), this.blocContexte(numero, extra), this.blocVie(), this.blocCalendrier(), this.blocPeriode(), this.blocMonde(), this.blocJournee(), this.blocFac(), this.blocFamille(), this.blocHistoire(numero, extra), this.blocEntourage(numero, extra), this.blocCoeur(numero), this.blocEmotions(numero), this.blocElan(numero, extra), this.blocVecu(numero), this.blocPromesses(numero), this.blocPannes(numero, extra), this.blocPersonnalite(numero, extra), this.blocTension(numero, extra), this.blocIntimite(numero, extra), repetitions, this.blocSouvenirs(numero, extra), this.blocElle(numero, extra), this.blocSuites(numero), this.blocCitations(extra.citables), Q.blocQuestion(extra.question), this.blocVerite(), this.reglesDeForme(extra)].filter(Boolean).join('\n\n');
    if (extra.message !== undefined && numero) this.sans(() => this.journalMemoire(numero, prompt));
    return prompt;
  }

  // Ce dont on parle en ce moment (message en cours + derniers messages de lui) : sert à retrouver les bons souvenirs.
  contexteMemoire(numero, extra = {}) {
    const hist = (numero && this.historiques[numero]) || [];
    const recents = hist.filter((m) => m.role === 'user').slice(-3).map((m) => CX.sansCitation(m.content));
    // Un « oui » ou un « pourquoi ? » ne dit rien seul : sa dernière phrase à elle dit de quoi on parle.
    const elle = CX.dernierMessageDeElle(hist);
    return [CX.sansCitation(extra.message || ''), extra.message ? String(extra.message) : '', ...recents, elle ? String(elle.content) : ''].join(' ');
  }

  // « Comprendre le contexte » : seulement quand elle répond à un message (pas pour un message spontané).
  blocContexte(numero, extra = {}) {
    if (!numero || extra.message === undefined || this.p('contexteAvance', true) === false) return '';
    return this.sans(() => CX.blocContexte({ historique: this.historiques[numero], message: extra.message, prenomMoi: this.config.prenomMoi || 'lui' }));
  }

  // Journal : ce qui a été chargé de sa mémoire pour ce message, et le poids du prompt.
  journalMemoire(numero, prompt) {
    if (this.p('journalEtat', true) === false) return;
    const st = this.statsMemoire || {};
    const m = this.memoires[numero] || {};
    const f = st.faits;
    const hist = this.historiques[numero] || [];
    const carHist = hist.reduce((n, x) => n + String(x.content || '').length, 0);
    const ep = (m.episodes || []).length;
    const el = (m.elle || []).length;
    this.log(`   mémoire chargée : faits ${f ? f.gardees + '/' + f.total + ' lignes' : 'aucun'} · souvenirs ${Math.min(5, ep)}/${ep} · sa vie ${Math.min(el, 12)}/${el} · historique ${hist.length} messages (≈ ${Math.round(carHist / 3.6)} tokens) · prompt ≈ ${Math.round(String(prompt).length / 3.6)} tokens`);
  }

  // ----- Vie intérieure : émotions, opinions, envies, honnêteté -----

  emotionsNum(numero) {
    const e = this.etatNum(numero);
    if (!e.emotions) e.emotions = E.nouvelEtat(Date.now());
    return e.emotions;
  }

  // Ce qu'elle ressent en ce moment (émotions qui durent, lien, douleur physique du jour).
  blocEmotions(numero) { return this.sans(() => this.blocEmotionsBrut(numero)); }

  blocEmotionsBrut(numero) {
    if (!numero || this.p('emotionsActives', true) === false) return '';
    const e = this.etatNum(numero);
    const st = this.emotionsNum(numero);
    const now = Date.now();
    E.evoluer(st, now, { dernierUser: e.dernierUser, dort: this.vie(new Date(now)).dort, silenceEveilleH: this.heuresEveillee(e.dernierUser, now) });
    // Ce qui se passe chez ses proches la touche vraiment : une dose de l'émotion du jour s'ajoute une fois par jour.
    if (this.p('entourageVivant', true) !== false && E.appliquerFond(st, this.cleDuJour(), HI.emotionDeFond(this.cleDuJour()))) this.sauverEtat();
    return E.bloc(st, now, E.douleurPhysique(this.cleDuJour(), this.config));
  }

  // Initiative dans la conversation : de temps en temps, elle ne fait pas que répondre (relance, avis, taquinerie, confidence, proposition).
  blocElan(numero, extra = {}) {
    return this.sans(() => {
      if (!numero || extra.initiative || this.p('elanActif', true) === false || this.p('emotionsActives', true) === false) return '';
      const e = this.etatNum(numero);
      const st = this.emotionsNum(numero);
      const derniers = (this.historiques[numero] || []).filter((x) => x.role === 'user').slice(-3).map((x) => String(x.content || ''));
      if (extra.message) derniers.push(String(extra.message));
      const ctx = this.contexteSpontane(numero);
      const type = EL.choisir({
        derniers: derniers.slice(-3), fatigue: ctx.fatigue, e: st.e, lien: st.lien,
        minutesDepuisElan: e.elanAt ? (Date.now() - e.elanAt) / 60000 : undefined,
        vientDeProposer: e.elanType === 'proposer' && Date.now() - (e.elanAt || 0) < 6 * 3600000,
      });
      if (!type) return '';
      e.elanAt = Date.now();
      e.elanType = type;
      this.log(`Élan : ${type}.`);
      return EL.bloc(type);
    });
  }

  // Ses cours, ses TD, sa famille, son cœur.
  blocFac() { return this.sans(() => VS.blocFac(new Date(), this.config)); }
  blocFamille() { return this.sans(() => VS.blocFamille(new Date(), this.config)); }
  // L'histoire de Lina (famille, souvenirs) et ce qui se passe chez ses proches : fixe pour une date, jamais contradictoire.
  blocHistoire(numero, extra = {}) {
    return this.sans(() => HI.blocHistoire(this.cleDuJour(), { message: CX.sansCitation(extra.message || ''), lien: (this.emotionsNum(numero).lien) }, this.config));
  }
  blocEntourage(numero, extra = {}) {
    return this.sans(() => HI.blocEntourage(this.cleDuJour(), { message: CX.sansCitation(extra.message || '') }, this.config));
  }
  blocCoeur(numero) {
    return this.sans(() => VS.blocCoeur(new Date(), this.config, numero && this.etatNum(numero).emotions));
  }

  // Exécute un bloc optionnel du prompt : s'il plante, on le saute (et on le note) au lieu de bloquer la réponse.
  sans(fn) {
    try { return fn() || ''; } catch (err) { this.log('Bloc ignoré : ' + err.message); return ''; }
  }

  // ----- Vécu du moment : fatigue, stress, besoin de parler (lié à emotions.js et vie.js) -----

  // Tout ce qui décide si elle écrit (et ce qu'elle dit) : heure, silence, émotions, événements de sa vie, fatigue.
  contexteSpontane(numero, maintenant = new Date()) {
    const t = maintenant.getTime();
    const e = this.etatNum(numero);
    const vie = this.vie(maintenant);
    const j = H.jourDeVie(maintenant, this.config);
    const st = this.p('emotionsActives', true) !== false ? this.emotionsNum(numero) : null;
    if (st) E.evoluer(st, t, { dernierUser: e.dernierUser, dort: vie.dort, silenceEveilleH: this.heuresEveillee(e.dernierUser, t) });
    const douleur = E.douleurPhysique(this.cleDuJour(maintenant), this.config);
    const ev = this.p('evenementsVie', true) !== false ? SP.vecuDesEvenements(this.vieEtat(), t) : { stress: 0, soulagement: 0, fatigue: 0, envie: 0, sujet: null };
    const ex = this.p('vieFac', true) !== false ? SP.vecuExpose(j.cle, j.m) : { stress: 0, soulagement: 0, envie: 0, sujet: null };
    const vecu = {
      stress: Math.max(ev.stress, ex.stress), soulagement: Math.max(ev.soulagement, ex.soulagement), fatigue: ev.fatigue,
      envie: Math.max(ev.envie, ex.envie), sujet: ev.envie >= ex.envie ? ev.sujet : ex.sujet,
    };
    if (!vecu.sujet || (e.vecuDit && e.vecuDit.cle === j.cle && e.vecuDit.sujet === vecu.sujet)) vecu.envie = 0;
    const fat = SP.fatigue({ humeur: H.humeur(maintenant, this.config), libelle: vie.libelle, code: vie.code, m: j.m, reveil: j.reveil, coucher: j.coucher, douleur, vecu });
    const dernier = Math.max(e.dernierUser || 0, e.dernierBot || 0);
    const sp = e.spont && e.spont.cle === j.cle ? e.spont : { cle: j.cle, n: 0, types: [] };
    const recents = (this.historiques[numero] || []).slice(-3).map((x) => x.content).join(' ');
    const debutJour = t - (j.m - j.reveil) * 60000;
    const nouvelle = this.p('evenementsVie', true) !== false && V.prochaineNouvelle(this.vieEtat(), t);
    const aSoutenir = !!st && e.soutienCle !== j.cle && st.raisons.some((x) => /pas l'air d'aller bien/.test(x.texte) && t - x.at > 2 * 3600000 && t - x.at < 10 * 3600000);
    const reconcilier = !!st && e.reconcilieCle !== j.cle && ((st.e.blessure > 0.1 && st.e.blessure <= 0.3) || (st.e.irritation > 0.12 && st.e.irritation <= 0.3)) && ((t - dernier) / 60000) >= 90 && st.e.blessure <= 0.3;
    return {
      aSoutenir, reconcilier,
      m: j.m, reveil: j.reveil, coucher: j.coucher, cle: j.cle,
      silenceMin: dernier ? (t - dernier) / 60000 : 1e5,
      ecartMin: Math.max(0, Number(this.p('initiativeEcartMin', 75))),
      dispo: vie.dispo, dort: vie.dort, e: st ? st.e : null, vecu, fatigue: fat, douleur,
      nbAujourdhui: sp.n, plafond: Number(this.p('initiativeParJour', 4)), derniersTypes: sp.types,
      sansReponse: this.sansReponseEff(e), insistance: this.insistance(),
      veutBonjour: H.graine('bonjour' + j.cle)() < 0.85, veutBonneNuit: H.graine('nuit' + j.cle)() < 0.8,
      echangeAujourdhui: dernier >= debutJour,
      nuitDite: !!sp.nuit || (/bonne nuit/i.test(recents) && t - dernier < 90 * 60000),
      nouvelleVie: !!nouvelle,
      desirSoir: this.sans(() => this.desirSoir(numero, maintenant, vie, j, st, dernier, debutJour)) === true,
      habitude: this.suitesActives() && this.p('habitudesActives', true) !== false ? SU.facteurHabitude(this.suitesNum(numero), Math.floor((j.m % 1440) / 60)) : 1,
    };
  }

  // Intensité du jour (0 sage … 3 brûlante) : hasard du jour, creux, repos après les jours chauds, et moral du moment (voir personnalite.curseurDuJour).
  // Réglages : coquinVariation: false = toujours au maximum permis par « coquin » ; coquinCurseurFixe: 0 à 3 = intensité imposée.
  curseurCoquin(cle, st = null) {
    if (this.p('coquinVariation', true) === false) return 3;
    const fixe = this.p('coquinCurseurFixe', null);
    if (fixe !== null && fixe !== undefined && fixe !== '' && Number.isFinite(Number(fixe))) return Math.max(0, Math.min(3, Number(fixe)));
    const emo = this.p('emotionsActives', true) !== false ? st : null;
    const v = this.sans(() => P.curseurDuJour(cle, emo).palier);
    return typeof v === 'number' ? v : 1;
  }

  // Vrai si, ce soir, elle a envie de lui écrire parce qu'elle pense à lui : désir du jour, tard, après un échange dans la journée, rien qui la bloque.
  desirSoir(numero, maintenant, vie, j, st, dernier, debutJour) {
    if (Number(this.p('coquin', 3)) < 3 || this.p('personnaliteActive', true) === false) return false;
    const e = this.etatNum(numero);
    if (e.envieCle === j.cle || dernier < debutJour) return false;
    if (!['soiree', 'libre', 'coucher'].includes(vie.code)) return false;
    if (st && (st.e.blessure > 0.3 || st.e.irritation > 0.35 || st.e.tristesse > 0.4 || st.e.inquietude > 0.4)) return false;
    if (this.curseurCoquin(j.cle, st) < 2) return false;
    if (e.envieCle === P.jourPlus(j.cle, -1)) return false; // pas deux soirs de suite : ça deviendrait lassant
    const d = P.desirDuJour(j.cle, j.m);
    return d.niveau >= 2 && d.soir;
  }

  // Ce qu'elle vit (stress, soulagement, fatigue, douleur) : colore le ton et raccourcit ses messages quand elle est vannée.
  blocVecu(numero) {
    if (!numero || this.p('vecuActif', true) === false) return '';
    return this.sans(() => SP.blocVecu(this.contexteSpontane(numero)));
  }

  // ----- Suites de la relation : lendemain, habitudes, bouderies, cohérence (voir suites.js, aucun appel IA en plus) -----

  suitesActives() { return this.p('suitesActives', true) !== false; }

  suitesNum(numero) {
    const e = this.etatNum(numero);
    if (!e.suites) e.suites = { derniere: Date.now() }; // pas de bouderie dans les premiers jours
    return e.suites;
  }

  blocSuites(numero) {
    if (!numero || !this.suitesActives()) return '';
    return this.sans(() => {
      const s = this.suitesNum(numero);
      const now = Date.now();
      if (this.p('disputesAvecLui', true) !== false && SU.normaliser(s, now)) this.sauverEtat();
      return SU.bloc(s, {
        now, cle: H.jourDeVie(new Date(now), this.config).cle, moi: this.config.prenomMoi || 'lui',
        actifs: { bouderie: this.p('disputesAvecLui', true) !== false, lendemain: this.p('lendemainIntime', true) !== false, dits: this.p('coherenceImmediate', true) !== false },
      });
    });
  }

  // Elle est en pleine bouderie (elle n'écrit pas la première à ce moment-là).
  boude(numero) {
    const b = this.suitesActives() && this.etatNum(numero).suites && this.etatNum(numero).suites.bouderie;
    return !!(b && b.phase === 'froide');
  }

  // Un message de lui : ses habitudes d'horaires, et sa réaction s'il s'excuse (ou va mal) pendant une bouderie.
  suitesRecevoir(numero, texte, maintenant) {
    if (!this.suitesActives()) return;
    try {
      const s = this.suitesNum(numero);
      if (this.p('habitudesActives', true) !== false) SU.noterMessageLui(s, maintenant, H.parametresVie(this.config).fuseau);
      if (this.p('disputesAvecLui', true) === false) return;
      const r = SU.recevoir(s, texte, maintenant);
      if (!r) return;
      this.log(r === 'inquiet' ? 'Bouderie : il ne va pas bien, elle la laisse tomber.' : 'Bouderie : elle se radoucit.');
      if (this.p('emotionsActives', true) !== false) SU.ajusterEmotions(this.emotionsNum(numero), r === 'apaise' ? 'apaise' : 'inquiet');
    } catch (err) {
      this.log('Suites ignorées : ' + err.message);
    }
  }

  // Avant de répondre : peut-être une petite bouderie qui commence (rare, bornée, jamais s'il va mal).
  suitesAvantReponse(numero, messageUtilisateur) {
    if (!this.suitesActives() || this.p('disputesAvecLui', true) === false) return;
    try {
      const s = this.suitesNum(numero);
      const now = Date.now();
      SU.normaliser(s, now);
      if (s.bouderie) return;
      const maintenant = new Date(now);
      const ctx = this.contexteSpontane(numero, maintenant);
      const hs = V.humeurSpeciale(maintenant, this.config);
      const st = this.emotionsNum(numero);
      const hist = this.historiques[numero] || [];
      const dernierT = hist.length ? hist[hist.length - 1].t || 0 : 0;
      const cause = SU.peutDeclencher({
        s, now, cle: ctx.cle, m: ctx.m, reveil: ctx.reveil, coucher: ctx.coucher, lien: st.lien, e: st.e,
        stress: ctx.vecu ? ctx.vecu.stress : 0, fatigue: ctx.fatigue, douleurForte: !!(ctx.douleur && ctx.douleur.intensite === 'forte'),
        special: C.joursSpeciaux(maintenant, this.config).some((x) => x.code !== 'vendredi') || !!(hs && hs.actif),
        conversationActive: now - dernierT < 30 * 60000,
        recents: [...hist.filter((x) => x.role === 'user').slice(-6).map((x) => CX.sansCitation(x.content)), messageUtilisateur],
      }, this.config);
      if (!cause) return;
      SU.demarrer(s, cause, now, ctx.m, ctx.coucher);
      if (this.p('emotionsActives', true) !== false) SU.ajusterEmotions(st, 'debut');
      this.sauverEtat();
      this.log(`Petite bouderie : ${cause}.`);
    } catch (err) {
      this.log('Suites ignorées : ' + err.message);
    }
  }

  // Après un message envoyé : on note ce qu'elle a raconté ; après une réponse, le lendemain et la fin d'une bouderie ; après un message spontané, ses habitudes.
  suitesApresEnvoi(numero, morceaux, reponse = false) {
    if (!this.suitesActives()) return;
    try {
      const s = this.suitesNum(numero);
      const now = Date.now();
      const cle = H.jourDeVie(new Date(now), this.config).cle;
      if (this.p('coherenceImmediate', true) !== false) SU.noterDits(s, morceaux, now);
      if (reponse) {
        if (this.p('lendemainIntime', true) !== false) {
          const recents = (this.historiques[numero] || []).filter((m) => m.role === 'user').slice(-5).map((m) => CX.sansCitation(m.content));
          SU.noterChaleur(s, P.niveauChaleur(recents), cle, now);
          if (SU.lendemainActif(s, cle)) SU.marquerLendemain(s);
        }
        if (this.p('disputesAvecLui', true) !== false && SU.apresReponse(s, now) === 'fin') this.log('Bouderie terminée : elle s\'est réconciliée.');
      } else if (this.p('habitudesActives', true) !== false) {
        SU.noterInitiative(s, now, H.parametresVie(this.config).fuseau);
      }
      this.sauverEtat();
    } catch (err) {
      this.log('Suites ignorées : ' + err.message);
    }
  }

  // Messages spontanés des suites : réconciliation après une bouderie (s'il se tait), mot doux le lendemain d'un moment intime.
  async tickSuites(numero) {
    if (!this.suitesActives()) return false;
    const e = this.etatNum(numero);
    const p = this.pending[numero];
    if (p && (p.enCours || p.textes.length)) return false;
    const t = Date.now();
    const s = this.suitesNum(numero);
    if (SU.normaliser(s, t) === 'abandon') this.sauverEtat();
    if (t - (e.dernierUser || 0) < 10 * 60000) return false; // en pleine discussion : le prompt s'en charge
    if (this.sansReponseEff(e) >= this.insistance()) return false; // il ne répond pas : elle n'insiste pas
    const b = s.bouderie;
    let item = null;
    if (b && b.phase === 'radoucie' && b.motif !== 'inquiete' && this.p('disputesAvecLui', true) !== false) {
      item = {
        type: 'reconciliation', consigneTexte: SU.consigneReconciliation(b),
        marquer: () => { s.bouderie = null; s.derniere = t; if (this.p('emotionsActives', true) !== false) SU.ajusterEmotions(this.emotionsNum(numero), 'apaise'); },
      };
    } else if (!b && this.p('lendemainIntime', true) !== false) {
      const j = H.jourDeVie(new Date(t), this.config);
      const debutJour = t - (j.m - j.reveil) * 60000;
      const at = 30 + Math.round(H.graine('lendemain' + j.cle)() * 120); // minutes après le réveil, stable pour la journée
      if (SU.lendemainActif(s, j.cle) && Math.max(e.dernierUser || 0, e.dernierBot || 0) < debutJour && j.m >= j.reveil + at && j.m < j.reveil + 420) {
        item = { type: 'lendemain', consigneTexte: SU.CONSIGNE_LENDEMAIN, marquer: () => { s.chaud.dit = true; } };
      }
    }
    if (!item) return false;
    item.marquer();
    this.sauverEtat();
    this.log(item.type === 'lendemain' ? 'Message spontané : le lendemain d\'un moment intime.' : 'Message spontané : réconciliation après une petite bouderie.');
    await this.envoyerGarde(numero, item);
    return true;
  }

  // ----- Pannes de la vie réelle (réseau, data, batterie, courant) et petites absences -----

  pannesActives() { return this.p('pannesActives', true) !== false; }

  pannesEtat() {
    if (!this.etat.pannes) this.etat.pannes = PA.nouvelEtat();
    return this.etat.pannes;
  }

  // Heure (ms) avant laquelle elle ne peut pas répondre : panne en cours ou petite absence annoncée. 0 = disponible.
  finIndisponibilite(numero, now = Date.now()) {
    let fin = 0;
    if (this.pannesActives()) fin = Math.max(fin, PA.finPanne(this.pannesEtat(), now));
    if (this.p('promessesActives', true) !== false && numero) {
      const a = PR.absenceEnCours(this.etatNum(numero).promesses, now);
      if (a) fin = Math.max(fin, a.echeance);
    }
    return fin;
  }

  indisponible(now = Date.now()) {
    return (this.numeros || []).some((n) => this.finIndisponibilite(n, now) > now) || (this.pannesActives() && !!PA.active(this.pannesEtat(), now));
  }

  // Prompt : ce qui vient de lui arriver (panne finie) ou l'interruption prévue pour ce message.
  blocPannes(numero, extra = {}) {
    if (!this.pannesActives()) return '';
    return this.sans(() => [PA.bloc(this.pannesEtat(), Date.now()), PA.blocInterruption(extra.interruption)].filter(Boolean).join('\n\n'));
  }

  // Tire (ou non) une interruption pour la réponse en cours (« attends, ma mère m'appelle, je reviens »).
  tireInterruption(numero, p, chaleur = 0) {
    if (!this.pannesActives() || this.p('promessesActives', true) === false) return null;
    return this.sans(() => {
      const e = this.etatNum(numero);
      const cle = this.cleDuJour();
      const jour = e.absences && e.absences.cle === cle ? e.absences : { cle, n: 0 };
      const vie = this.vie();
      const dernier = Math.max(e.dernierUser || 0, e.dernierBot || 0);
      const i = PA.tireInterruption({
        code: vie.code, dort: vie.dort, nbAujourdhui: jour.n, chaleur,
        conversation: !!p.actif || (dernier && Date.now() - dernier < 15 * 60000),
        enAbsence: !!PR.absenceEnCours(e.promesses, Date.now()),
      }, this.config);
      if (i) { jour.n++; e.absences = jour; this.sauverEtat(); this.log('Elle va être interrompue (petite absence prévue à la fin de son message).'); }
      return i;
    });
  }

  // Une panne commence ou finit : annonce éventuelle avant le silence, message de retour après.
  async tickPannes() {
    if (!this.pannesActives() || !this.numeros) return false;
    const maintenant = new Date();
    const vie = this.vie(maintenant);
    const j = H.jourDeVie(maintenant, this.config);
    const numero = this.numeros[0];
    const e = numero ? this.etatNum(numero) : {};
    const t = Date.now();
    const etat = this.pannesEtat();
    const conversation = !!numero && t - Math.max(e.dernierUser || 0, e.dernierBot || 0) < 8 * 60000;
    const evt = PA.tick(etat, t, { cle: j.cle, m: j.m, reveil: j.reveil, coucher: j.coucher, dort: vie.dort, conversation }, this.config);
    if (evt.debut) this.log(`Panne : ${evt.debut.type} pour ~${H.formatDuree((evt.debut.fin - evt.debut.debut) / 1000)} (${evt.debut.raison}).`);
    if (evt.fin) this.log('Panne terminée : elle retrouve son téléphone / sa connexion.');
    if (evt.debut || evt.fin) this.sauverEtat();
    if (!numero) return false;

    const a = etat.actuelle;
    // Début de panne en pleine discussion : elle prévient (batterie, data, courant…), une seule fois.
    if (a && !a.finie && a.previent && !a.prevenue && !this.initEnCours) {
      a.prevenue = true;
      this.sauverEtat();
      if (!(this.pending[numero] && (this.pending[numero].enCours || this.pending[numero].textes.length))) {
        a.fin = Math.max(a.fin, Date.now() + 5 * 60000); // le temps d'écrire le message d'annonce
        await this.envoyerGarde(numero, { type: 'panne', sansAbsence: true, consigneTexte: PA.consigneAnnonce(a) });
        return true;
      }
    }
    // Fin de panne : si elle avait prévenu (ou si il a écrit sans réponse), elle revient d'elle-même avec la raison.
    const retour = PA.retourAFaire(etat, t);
    if (retour && !this.initEnCours) {
      const p = this.pending[numero];
      if (p && (p.enCours || p.textes.length || p.prevu)) return false; // il a écrit : sa réponse dira la raison
      if (!retour.prevenue) { if (t - retour.fin > 10 * 60000) { retour.dit = true; this.sauverEtat(); } return false; } // personne n'a rien remarqué
      if (vie.dort) { retour.dit = true; this.sauverEtat(); return false; }
      retour.dit = true;
      this.sauverEtat();
      this.log('Retour de panne : elle écrit pour dire ce qui s\'est passé.');
      return this.envoyerGarde(numero, { type: 'panne', sansAbsence: true, consigneTexte: PA.consigneRetour(retour, t) });
    }
    return false;
  }

  // Marque la panne comme racontée une fois qu'une réponse en a parlé.
  panneRacontee() {
    const r = PA.retourAFaire(this.pannesEtat(), Date.now());
    if (r) { r.dit = true; this.sauverEtat(); }
  }

  // Ses promesses en cours (« je te raconte ça ce soir »).
  blocPromesses(numero) {
    if (!numero || this.p('promessesActives', true) === false) return '';
    return this.sans(() => PR.bloc(this.etatNum(numero).promesses, Date.now()));
  }

  // Enregistre les promesses qu'elle vient de faire dans ses messages (détection par motifs, sans appel IA).
  noterPromesses(numero, morceaux, opts = {}) {
    if (this.p('promessesActives', true) === false || !morceaux || !morceaux.length) return;
    try {
      const texte = morceaux.join('\n');
      const nouvelles = PR.detecter(texte, Date.now(), { fuseau: H.parametresVie(this.config).fuseau });
      // « ma mère m'appelle, je reviens » : petite absence, avec sa raison (pas en plus d'une panne).
      if (!opts.sansAbsence && this.pannesActives() && !PA.active(this.pannesEtat(), Date.now())) nouvelles.push(...PR.detecterAbsence(texte, Date.now()));
      if (!nouvelles.length) return;
      const e = this.etatNum(numero);
      e.promesses = PR.fusionner(e.promesses, nouvelles, Date.now());
      this.sauverEtat();
      for (const n of nouvelles) this.log(n.absence
        ? `Petite absence notée : « ${n.texte} » (retour dans ${H.formatDuree((n.echeance - Date.now()) / 1000)} : ${n.raison}).`
        : `Promesse notée : « ${n.texte} » (dans ${H.formatDuree((n.echeance - Date.now()) / 1000)}${n.oubli ? ', avec un oubli prévu' : ''}).`);
    } catch (err) {
      this.log('Promesses ignorées : ' + err.message);
    }
  }

  // ----- Journal : l'état de Lina (vie, humeur, séduction, émotions), pour voir ce qui se passe autour de ses réponses -----

  journalJour() {
    if (this.p('journalEtat', true) === false) return;
    const cle = this.cleDuJour();
    const c = P.curseurDuJour(cle);
    const forceMsg = this.p('coquinVariation', true) === false ? ' (variation coupée : toujours au maximum)'
      : (this.p('coquinCurseurFixe', null) !== null && this.p('coquinCurseurFixe', null) !== '' ? ` (palier imposé : ${this.p('coquinCurseurFixe')})` : '');
    const d = P.desirDuJour(cle, H.jourDeVie(new Date(), this.config).m);
    this.log(`Séduction du jour : ${c.nom} (${c.palier}/3)${c.creux ? ', période creuse' : ''}${c.plafond < 3 ? ', repos après des jours chauds' : ''}${forceMsg} · désir du jour ${d.niveau}/2 (hors émotions).`);
  }

  // Toutes les 30 minutes, même sans conversation : l'état de Lina et ce qu'elle a prévu s'affichent dans le journal.
  journalPeriodique() {
    if (this.p('journalEtat', true) === false || !this.numeros) return;
    const now = Date.now();
    if (now - (this.dernierJournalPeriodique || 0) < 30 * 60000) return;
    this.dernierJournalPeriodique = now;
    for (const numero of this.numeros) this.sans(() => { this.blocPersonnaliteBrut(numero, {}); });
  }

  // Ce qu'elle a prévu de faire (messages à venir, promesses, absences, bouderie…), pour le journal.
  journalPrevu(numero, curseur) {
    const now = Date.now();
    const fuseau = H.parametresVie(this.config).fuseau;
    const hh = (ts) => {
      try {
        return new Intl.DateTimeFormat('fr-FR', { timeZone: fuseau, hour: '2-digit', minute: '2-digit' }).format(new Date(ts)).replace(':', 'h');
      } catch (e) { return new Date(ts).toLocaleTimeString('fr-FR'); }
    };
    const hmin = (m) => `${String(Math.floor((m % 1440) / 60)).padStart(2, '0')}h${String(Math.round(m % 60)).padStart(2, '0')}`;
    const e = this.etatNum(numero);
    const ctx = this.contexteSpontane(numero);
    const fixes = []; // éléments stables (servent à ne pas répéter la ligne)
    let chance = '';

    // Promesses et petites absences
    for (const pr of (e.promesses || []).filter((x) => !x.fait)) {
      if (pr.absence) fixes.push(`petite absence, retour vers ${hh(pr.echeance)}${pr.raison ? ' (' + pr.raison + ')' : ''}`);
      else fixes.push(`promesse « ${String(pr.texte).slice(0, 60)} » vers ${hh(pr.echeance)}${pr.oubli ? ' (risque d\'oublier)' : ''}`);
    }

    // Messages spontanés
    if (this.p('initiativeActive', true) === false) {
      fixes.push('messages spontanés coupés (réglage)');
    } else if (this.p('initiativeMode', 'probabiliste') === 'plan') {
      const reste = e.plan && e.plan.cle === ctx.cle ? e.plan.items.filter((i) => !i.fait) : [];
      fixes.push(reste.length ? 'messages prévus : ' + reste.map((i) => `${hmin(i.at)} ${i.type}`).join(', ') : 'plus aucun message prévu aujourd\'hui');
    } else {
      const pl = SP.plafondDuJour(ctx.plafond, ctx.fatigue, ctx.e);
      const hs = V.humeurSpeciale(new Date(), this.config);
      // Ce qui bloque vraiment, dans l'ordre où tickInitiative() les rencontre.
      const bloqueur = ctx.dort ? 'elle dort'
        : this.indisponible() ? 'panne ou petite absence en cours'
        : hs && hs.actif ? 'pas d\'humeur aujourd\'hui'
        : this.boude(numero) ? 'elle boude'
        : '';
      const pr = bloqueur ? 0 : SP.probabilite(ctx, this.config);
      if (pr > 0) {
        fixes.push(`messages spontanés ${ctx.nbAujourdhui}/${pl} aujourd'hui, pas d'heure fixée (tirage chaque minute)`);
        chance = ` · chance qu'elle t'écrive à cette minute : ${(pr * 100).toFixed(1)} %`;
      } else {
        const raison = bloqueur ? bloqueur : ctx.dispo < 0.1 ? `elle est très occupée (${Math.round(ctx.dispo * 100)} %)` : ctx.sansReponse >= ctx.insistance ? 'tu n\'as pas répondu à ses derniers messages' : ctx.silenceMin < ctx.ecartMin ? 'échange trop récent' : ctx.nbAujourdhui >= pl ? 'plafond du jour atteint' : 'pas le moment';
        fixes.push(`messages spontanés ${ctx.nbAujourdhui}/${pl} aujourd'hui, aucun pour l'instant (${raison})`);
      }
      if (ctx.veutBonjour && !ctx.echangeAujourdhui && ctx.m < ctx.reveil + 180) fixes.push('bonjour probable ce matin');
      if (ctx.veutBonneNuit && !ctx.nuitDite && ctx.coucher - ctx.m > 8) fixes.push(`bonne nuit prévue avant son coucher (vers ${hmin(ctx.coucher)})`);
    }

    // Message sensuel du soir
    if (Number(this.p('coquin', 3)) >= 3 && this.p('personnaliteActive', true) !== false) {
      const hier = P.jourPlus(ctx.cle, -1);
      const desirSoir = P.desirDuJour(ctx.cle, 22 * 60).niveau >= 2;
      if (e.envieCle === ctx.cle) fixes.push('message sensuel du soir : déjà envoyé aujourd\'hui');
      else if (curseur >= 2 && desirSoir && e.envieCle !== hier) fixes.push('message sensuel du soir : possible (désir assez fort ce soir)');
      else fixes.push('message sensuel du soir : non prévu' + (e.envieCle === hier ? ' (pas deux soirs de suite)' : ''));
    }

    // Fil de tension (v8.2)
    if (this.tensionActive()) {
      const tt = this.tensionNum(numero, ctx.cle);
      if (tt.fil) fixes.push('fil de tension : ' + (T.nomEtape(tt, ctx.cle, this.config) || 'ouvert aujourd\'hui, reviendra demain'));
    }

    // Suites : bouderie, petit mot du lendemain
    if (this.suitesActives()) {
      const su = this.suitesNum(numero);
      if (su.bouderie && su.bouderie.phase === 'froide') fixes.push('bouderie en cours' + (su.bouderie.cause ? ' (' + su.bouderie.cause + ')' : ''));
      if (SU.lendemainActif(su, ctx.cle) && su.chaud && !su.chaud.dit) fixes.push('petit mot doux du lendemain prévu');
    }

    const base = '   prévu : ' + (fixes.length ? fixes.join(' · ') : 'rien de particulier');
    return { texte: base + chance, cle: base };
  }

  journalEtat(numero, infos) {
    if (this.p('journalEtat', true) === false) return;
    const NOMS = { joie: 'joie', tendresse: 'tendresse', tristesse: 'tristesse', irritation: 'irritation', inquietude: 'inquiétude', manque: 'manque', fierte: 'fierté', jalousie: 'jalousie', blessure: 'blessure', deception: 'déception', gene: 'gêne', excitation: 'excitation' };
    const { st, vie, curseur, chaleur, desir, bloque, raisonBloque, niveau } = infos;
    const emos = st && st.e ? Object.entries(st.e).filter(([, v]) => v >= 0.2).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([n, v]) => `${NOMS[n] || n} ${Math.round(v * 100)} %`) : [];
    const nomCurseur = ['sage', 'douce', 'joueuse', 'brûlante'][curseur] || curseur;
    const ligne1 = `État de Lina · vie : ${vie.libelle} · humeur : ${H.humeur(new Date(), this.config)}`;
    const sed = niveau <= 0 ? 'séduction coupée (réglage coquin = 0)'
      : `séduction : ${nomCurseur} (${curseur}/3) · ambiance de la conversation ${chaleur}/3 · désir ${desir}/2` + (bloque ? ` · FREINÉE : ${raisonBloque}` : '');
    const ligne2 = `   ${sed} · émotions : ${emos.length ? emos.join(', ') : 'neutre'}${st && typeof st.lien === 'number' ? ' · lien ' + Math.round(st.lien) : ''}`;
    const prevu = numero ? this.sans(() => this.journalPrevu(numero, curseur)) : '';
    const cleLigne = ligne1 + '|' + ligne2 + '|' + (prevu ? prevu.cle : '');
    if (!this.dernierEtatLogue) this.dernierEtatLogue = {};
    const prec = this.dernierEtatLogue[numero || '-'];
    const now = Date.now();
    // On n'affiche pas deux fois la même chose de suite (sauf après 15 minutes) : le journal reste lisible.
    if (prec && prec.cle === cleLigne && now - prec.at < 15 * 60000) return;
    this.dernierEtatLogue[numero || '-'] = { cle: cleLigne, at: now };
    this.log(ligne1);
    this.log(ligne2);
    if (prevu) this.log(prevu.texte);
  }

  // Ses opinions, ses envies du jour, son côté coquin (qui monte un peu si l'ambiance chauffe).
  blocPersonnalite(numero, extra = {}) { return this.sans(() => this.blocPersonnaliteBrut(numero, extra)); }

  blocPersonnaliteBrut(numero, extra = {}) {
    if (this.p('personnaliteActive', true) === false) return '';
    const st = numero ? this.etatNum(numero).emotions : null;
    const vie = this.vie();
    const emoBloque = st && (st.e.blessure > 0.3 || st.e.irritation > 0.35 || st.e.tristesse > 0.4 || st.e.inquietude > 0.4);
    const vieBloque = ['dort', 'cours', 'repas', 'diner', 'iftar', 'preparatifs', 'jeune'].includes(vie.code);
    const bloque = emoBloque || vieBloque;
    const raisonBloque = vieBloque && emoBloque ? 'humeur et moment' : vieBloque ? 'moment (' + vie.code + ')' : 'humeur du moment';
    const recents = ((numero && this.historiques[numero]) || []).filter((m) => m.role === 'user').slice(-5).map((m) => CX.sansCitation(m.content));
    const chaleur = P.niveauChaleur([...recents, extra.message || '']);
    const desir = P.desirDuJour(this.cleDuJour(), H.jourDeVie(new Date(), this.config).m).niveau;
    const curseur = this.curseurCoquin(this.cleDuJour(), st);
    this.sans(() => this.journalEtat(numero, { st, vie, curseur, chaleur, desir, bloque: !!bloque, raisonBloque, niveau: Number(this.p('coquin', 3)) }));
    return P.blocPersonnalite(extra.message || '', this.cleDuJour(), { niveau: Number(this.p('coquin', 3)), chaleur, bloque: !!bloque, desir, curseur });
  }


  // ----- Tension sur plusieurs jours, « non » joueur, rythme (v8.2 : tension.js) -----

  tensionActive() { return this.p('tensionActive', true) !== false && Number(this.p('coquin', 3)) > 0 && this.p('personnaliteActive', true) !== false; }

  tensionNum(numero, cle = this.cleDuJour()) {
    const e = this.etatNum(numero);
    if (!e.tension) e.tension = T.nouvelEtat();
    return T.normaliser(e.tension, cle);
  }

  // Ce qui freine la séduction en ce moment : humeur (emo), moment de la journée, bouderie.
  seductionFreinee(numero) {
    const st = this.p('emotionsActives', true) !== false ? this.emotionsNum(numero) : null;
    const vie = this.vie();
    const emo = !!(st && st.e && (st.e.blessure > 0.3 || st.e.irritation > 0.35 || st.e.tristesse > 0.4 || st.e.inquietude > 0.4)) || this.boude(numero);
    const moment = ['dort', 'cours', 'repas', 'diner', 'iftar', 'preparatifs', 'jeune'].includes(vie.code);
    return { st, vie, emo, bloque: emo || moment };
  }

  // Prompt : limites, fil de tension du jour, rythme. Les tirages sont stables pour un même message.
  blocTension(numero, extra = {}) {
    if (!numero || extra.message === undefined || !this.tensionActive()) return '';
    return this.sans(() => {
      const cle = this.cleDuJour();
      const t = this.tensionNum(numero, cle);
      if (T.maintenir(t, cle, this.config) === 'fin') { this.sauverEtat(); this.log('Fil de tension : terminé.'); }
      const { st, bloque } = this.seductionFreinee(numero);
      const messageBrut = CX.sansCitation(extra.message || '');
      const recents = (this.historiques[numero] || []).filter((m) => m.role === 'user').slice(-5).map((m) => CX.sansCitation(m.content));
      const chaleur = P.niveauChaleur([...recents, messageBrut]);
      const curseur = this.curseurCoquin(cle, st);
      const filActif = !!T.nomEtape(t, cle, this.config);
      const rythme = T.choisirRythme(t, { cle, message: messageBrut, chaleur, filActif, curseur, bloque }, this.config);
      if (!this.decisionsTension) this.decisionsTension = {};
      this.decisionsTension[numero] = { rythme };
      return [
        T.blocLimites(chaleur),
        T.blocFil(t, { cle, bloque }, this.config),
        rythme && rythme.texte ? rythme.texte : '',
      ].filter(Boolean).join('\n');
    });
  }

  // Après une réponse envoyée : compteurs et rythme notés, fil ouvert ou refermé.
  tensionApresReponse(numero, morceaux, messageBrut) {
    if (!numero || !this.tensionActive()) return;
    try {
      const cle = this.cleDuJour();
      const t = this.tensionNum(numero, cle);
      const d = (this.decisionsTension && this.decisionsTension[numero]) || {};
      if (this.decisionsTension) delete this.decisionsTension[numero];
      const { st, emo, bloque } = this.seductionFreinee(numero);
      T.avancer(t, cle);
      if (d.rythme) { T.noterRythme(t, d.rythme.nom, cle); if (d.rythme.nom !== 'normal') this.log(`Rythme de la réponse : ${d.rythme.nom}.`); }
      if (emo && T.abandonner(t, cle)) this.log('Fil de tension : abandonné (humeur du moment).');
      if (T.apresReponse(t, { cle, bloque }, this.config) === 'fin') this.log('Fil de tension : refermé en douceur.');
      const recents = (this.historiques[numero] || []).filter((m) => m.role === 'user').slice(-5).map((m) => CX.sansCitation(m.content));
      const ouvert = T.noter(t, {
        cle, now: Date.now(), chaleur: P.niveauChaleur(recents), reporte: T.reporteDansMessage((morceaux || []).join(' ')),
        curseur: this.curseurCoquin(cle, st), lien: st && typeof st.lien === 'number' ? st.lien : undefined,
        bloque: emo, graine: String(messageBrut || '').slice(0, 30),
      }, this.config);
      if (ouvert) this.log('Fil de tension : un moment laissé en suspens, il reviendra dans les prochains jours.');
      this.sauverEtat();
    } catch (err) {
      this.log('Tension ignorée : ' + err.message);
    }
  }

  // Message spontané du fil de tension (au plus un par jour, jamais s'il est occupé, triste ou si elle boude).
  async tickTension(numero) {
    if (!this.tensionActive()) return false;
    const e = this.etatNum(numero);
    const p = this.pending[numero];
    if (p && (p.enCours || p.textes.length)) return false;
    const t0 = Date.now();
    const j = H.jourDeVie(new Date(t0), this.config);
    const t = this.tensionNum(numero, j.cle);
    if (!t.fil) return false;
    if (t0 - (e.dernierUser || 0) < 10 * 60000) return false;
    if (this.sansReponseEff(e) >= this.insistance()) return false;
    const { st, vie, emo, bloque } = this.seductionFreinee(numero);
    if (emo) { if (T.abandonner(t, j.cle)) { this.sauverEtat(); this.log('Fil de tension : abandonné (humeur du moment).'); } return false; }
    if (bloque || vie.dispo < 0.35 || this.curseurCoquin(j.cle, st) < 1) return false;
    const nom = T.messageSpontane(t, { cle: j.cle, m: j.m, reveil: j.reveil, coucher: j.coucher }, this.config);
    if (!nom) return false;
    T.marquerSpontane(t, j.cle);
    if (nom === 'relache') T.fermer(t, j.cle);
    this.sauverEtat();
    this.log(`Message spontané : fil de tension (${nom}).`);
    await this.envoyerGarde(numero, { type: 'tension', consigneTexte: T.consigneSpontanee(nom), sansAbsence: true });
    return true;
  }

  // ----- Intimité : présence, nuits, scénarios, langage, jalousie douce (v8.4 : intimite.js, aucun appel IA en plus) -----

  intimiteActive() { return this.p('intimiteActive', true) !== false && Number(this.p('coquin', 3)) > 0 && this.p('personnaliteActive', true) !== false; }

  intimiteNum(numero) {
    const e = this.etatNum(numero);
    if (!e.intimite) e.intimite = IN.nouvelEtat();
    return IN.normaliser(e.intimite);
  }

  // Ce que le module d'intimité doit savoir de l'instant. La nuit, « elle dort » ne bloque pas (c'est le sujet) : seuls l'humeur et les moments occupés freinent.
  contexteIntimite(numero, extra = {}) {
    const j = H.jourDeVie(new Date(), this.config);
    const f = this.seductionFreinee(numero);
    const st = f.st;
    const vie = f.vie;
    const occupe = ['cours', 'repas', 'diner', 'iftar', 'preparatifs', 'jeune'].includes(vie.code);
    const messageBrut = CX.sansCitation(extra.message || '');
    const recents = numero ? (this.historiques[numero] || []).filter((m) => m.role === 'user').slice(-5).map((m) => CX.sansCitation(m.content)) : [];
    return {
      niveau: Number(this.p('coquin', 3)), cle: j.cle, m: j.m, coucher: j.coucher, now: Date.now(), message: messageBrut,
      moment: vie.code, bloque: !!(f.emo || occupe), emoBloque: !!f.emo, chaleur: P.niveauChaleur([...recents, messageBrut]),
      curseur: this.curseurCoquin(j.cle, st), lien: st && typeof st.lien === 'number' ? st.lien : undefined,
      jalousieEmo: st && st.e ? st.e.jalousie || 0 : 0, tenue: P.tenueDuJour(j.cle), prenomMoi: this.config.prenomMoi || 'lui',
      initiative: extra.initiative, dort: vie.dort,
    };
  }

  // Prompt : présence, nuit, scénario, langage, jalousie. Les tirages sont stables pour un même message.
  blocIntimite(numero, extra = {}) {
    if (!numero || !this.intimiteActive()) return '';
    if (extra.message === undefined && !['insomnie', 'scenario'].includes(extra.initiative)) return '';
    return this.sans(() => {
      const i = this.intimiteNum(numero);
      const ctx = this.contexteIntimite(numero, extra);
      // Pendant une insomnie ou un réveil de nuit, « elle dort » ne la bloque pas : l'humeur seule la freine.
      if (ctx.dort && (extra.initiative === 'insomnie' || IN.modeNuit(i, ctx.now, ctx.cle))) ctx.bloque = ctx.emoBloque;
      const r = IN.preparer(i, ctx, this.config);
      if (!this.decisionsIntimite) this.decisionsIntimite = {};
      this.decisionsIntimite[numero] = r.decisions;
      return r.texte;
    });
  }

  // Rythme de réponse la nuit : elle reste éveillée tant que l'échange dure ; sinon, parfois, son message la réveille.
  latenceNuit(numero, vie, message) {
    if (!this.intimiteActive() || !vie.dort || this.p('nuitsActives', true) === false) return null;
    const i = this.intimiteNum(numero);
    const ctx = this.contexteIntimite(numero, { message });
    const d = IN.decisionReveil(i, {
      cle: ctx.cle, now: ctx.now, dort: true, lien: ctx.lien, curseur: ctx.curseur, emoBloque: ctx.emoBloque, message,
      minutesDepuisCoucher: ctx.m - ctx.coucher, minutesAvantReveil: Math.max(0, vie.reveilDans || 0),
    }, this.config);
    if (!d) return null;
    this.sauverEtat();
    this.log(d.deja ? 'Elle est restée éveillée : elle répond vite.' : 'Son message la réveille en pleine nuit : elle répond à moitié endormie.');
    return { secondes: d.secondes, mode: 'réveil de nuit' };
  }

  // Après une réponse : compteurs, scénario lancé ou repris, langage qui évolue.
  intimiteApresReponse(numero, morceaux, messageBrut) {
    if (!numero || !this.intimiteActive()) return;
    try {
      const i = this.intimiteNum(numero);
      const ctx = this.contexteIntimite(numero, { message: messageBrut });
      const dec = (this.decisionsIntimite && this.decisionsIntimite[numero]) || {};
      if (this.decisionsIntimite) delete this.decisionsIntimite[numero];
      const avant = i.scenarios.length;
      IN.apres(i, { cle: ctx.cle, now: ctx.now, message: CX.sansCitation(messageBrut || ''), texteElle: (morceaux || []).join(' '), chaleur: ctx.chaleur, curseur: ctx.curseur, bloque: ctx.emoBloque, lien: ctx.lien }, dec);
      if (i.scenarios.length > avant) this.log('Intimité : un scénario imaginé à deux est noté, il pourra revenir dans les prochains jours.');
      this.sauverEtat();
    } catch (err) {
      this.log('Intimité ignorée : ' + err.message);
    }
  }

  // Après un message spontané d'intimité (insomnie, scénario).
  intimiteApresEnvoi(numero, morceaux, item) {
    if (!numero || !this.intimiteActive()) return;
    try {
      const i = this.intimiteNum(numero);
      const ctx = this.contexteIntimite(numero, { initiative: item.type });
      const dec = (this.decisionsIntimite && this.decisionsIntimite[numero]) || {};
      if (this.decisionsIntimite) delete this.decisionsIntimite[numero];
      IN.apres(i, { cle: ctx.cle, now: ctx.now, message: '', texteElle: '', chaleur: 0, curseur: ctx.curseur, bloque: true, lien: ctx.lien }, dec);
      if (item.type === 'insomnie') IN.marquerInsomnie(i, ctx.cle, ctx.now);
      this.sauverEtat();
    } catch (err) {
      this.log('Intimité ignorée : ' + err.message);
    }
  }

  // Message spontané d'intimité : « j'arrive pas à dormir… » (elle est couchée) ou retour d'un scénario imaginé (en soirée).
  async tickIntimite(numero, dort = false) {
    if (!this.intimiteActive()) return false;
    const e = this.etatNum(numero);
    const p = this.pending[numero];
    if (p && (p.enCours || p.textes.length)) return false;
    const t0 = Date.now();
    if (t0 - (e.dernierUser || 0) < (dort ? 5 : 10) * 60000) return false;
    const j = H.jourDeVie(new Date(t0), this.config);
    const f = this.seductionFreinee(numero);
    const i = this.intimiteNum(numero);
    const debutJour = t0 - (j.m - j.reveil) * 60000;
    const ctx = {
      cle: j.cle, m: j.m, coucher: j.coucher, lien: f.st && typeof f.st.lien === 'number' ? f.st.lien : undefined, curseur: this.curseurCoquin(j.cle, f.st),
      echangeAujourdhui: Math.max(e.dernierUser || 0, e.dernierBot || 0) >= debutJour, emoBloque: f.emo, bloque: f.bloque && !dort,
      sansReponse: this.sansReponseEff(e), insistance: this.insistance(), dort,
    };
    const d = IN.spontane(i, ctx, this.config);
    if (!d) return false;
    if (d.type === 'scenario' && this.indisponible()) return false;
    IN.marquerSpontane(i, j.cle);
    if (d.type === 'insomnie') IN.marquerInsomnie(i, j.cle, t0);
    this.sauverEtat();
    this.log(d.type === 'insomnie' ? 'Message spontané : elle n\'arrive pas à dormir.' : 'Message spontané : un scénario imaginé à deux revient.');
    await this.envoyerGarde(numero, { type: d.type, consigneTexte: d.consigneTexte, sansAbsence: true, scenario: d.scenario });
    return true;
  }

  // Garde-fou : elle n'invente pas ce qu'elle ne sait pas.
  blocVerite() {
    if (this.p('antiHallucination', true) === false) return '';
    return P.blocVerite();
  }

  // Nombre d'heures où elle était éveillée depuis `depuis` (le sommeil ne compte pas dans le manque).
  heuresEveillee(depuis, maintenant = Date.now()) {
    if (!depuis) return undefined;
    const debut = Math.max(depuis, maintenant - 72 * 3600000);
    let n = 0;
    for (let t = debut; t < maintenant; t += 20 * 60000) if (!this.vie(new Date(t)).dort) n++;
    return n / 3;
  }

  // Combien de messages restés sans réponse avant qu'elle arrête d'écrire la première (elle n'insiste pas).
  insistance() { return Math.max(1, Math.round(Number(this.p('initiativeInsistance', 3)))); }

  // Messages sans réponse, compté à la baisse avec le temps : un silence de 20 h efface un message « sans réponse »,
  // pour qu'elle retente de lui écrire le lendemain au lieu de rester muette tant qu'il n'a pas écrit.
  sansReponseEff(e, now = Date.now()) {
    const n = (e && e.sansReponse) || 0;
    if (!n) return 0;
    const dernier = (e && e.dernierBot) || 0;
    const pauses = dernier ? Math.floor((now - dernier) / (20 * 3600000)) : 0;
    return Math.max(0, n - Math.max(0, pauses));
  }

  // Il lui manque (silence long) : elle lui écrit d'elle-même, sans reproche, pas plus d'une fois toutes les 5 h.
  async tickAbsence(numero) {
    if (this.p('ressentirAbsence', true) === false || this.p('emotionsActives', true) === false) return false;
    const e = this.etatNum(numero);
    const p = this.pending[numero];
    if (p && (p.enCours || p.textes.length)) return false;
    if (this.sansReponseEff(e) >= this.insistance()) return false;
    const t = Date.now();
    const st = this.emotionsNum(numero);
    E.evoluer(st, t, { dernierUser: e.dernierUser, dort: false, silenceEveilleH: this.heuresEveillee(e.dernierUser, t) });
    if (st.e.manque < 0.45) return false;
    if (t - Math.max(e.dernierUser || 0, e.dernierBot || 0) < 60 * 60000) return false;
    if (t - (e.dernierManque || 0) < 6 * 3600000) return false;
    e.dernierManque = t;
    this.sauverEtat();
    this.initEnCours = true;
    try {
      await this.envoyerInitiative(numero, { type: 'manque' });
      st.e.manque = Math.max(0.2, st.e.manque * 0.6); // l'avoir dit la soulage un peu
      this.sauverEtat();
      this.log('Message spontané : il lui manque.');
    } catch (err) {
      this.log(`Message spontané impossible : ${err.message}`);
    } finally {
      this.initEnCours = false;
    }
    return true;
  }

  // Date (AAAA-MM-JJ) dans le fuseau du personnage.
  cleDuJour(date = new Date()) { return C.dateLocale(date, H.parametresVie(this.config).fuseau).cle; }

  // Fêtes, Ramadan, anniversaires : le contexte « culturel » du jour.
  blocCalendrier(maintenant = new Date()) {
    if (this.p('calendrierActif', true) === false) return '';
    const speciaux = C.joursSpeciaux(maintenant, this.config);
    if (!speciaux.length) return '';
    return ['=== DATES ET TRADITIONS (le contexte d\'aujourd\'hui : laisse-le colorer ta journée, sans le réciter) ===', ...speciaux.map((x) => `- ${x.note}`)].join('\n');
  }

  // Météo et petits faits déjà vécus aujourd'hui (stables pour une même date).
  blocJournee(maintenant = new Date()) { return J.blocJournee(maintenant, this.config); }

  // L'heure, ce qu'elle fait, son humeur, le retard éventuel : ce qui rend les réponses « vivantes ».
  blocSituation(numero, extra = {}) {
    const c = this.config;
    const maintenant = new Date();
    const vie = this.vie(maintenant);
    const moi = c.prenomMoi || 'lui';
    let quand;
    try {
      quand = new Intl.DateTimeFormat('fr-FR', {
        timeZone: H.parametresVie(c).fuseau,
        weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
      }).format(maintenant);
    } catch (e) {
      quand = maintenant.toLocaleString('fr-FR');
    }
    const lignes = [
      '=== SITUATION ACTUELLE (le programme te l\'indique, ne la récite pas) ===',
      `Nous sommes ${quand}.`,
      `En ce moment : ${vie.libelle}.`,
      `Ton humeur : ${H.humeur(maintenant, c)}.`,
    ];
    const e = numero ? this.etatNum(numero) : {};
    if (extra.retardMin >= 10) {
      lignes.push(`${moi} t'a écrit il y a ${Math.round(extra.retardMin)} minutes : tu réponds avec du retard, tu peux le mentionner si c'est naturel (sans t'excuser lourdement).`);
    }
    if (extra.initiative) {
      lignes.push(`C'est toi qui écris en premier (il ne t'a rien demandé).`);
      if (e.dernierUser) lignes.push(`Son dernier message date d'il y a ${H.formatDuree((Date.now() - e.dernierUser) / 1000)}.`);
      if (e.sansReponse > 0) lignes.push(`Il n'a pas encore répondu à ton dernier message : ne le lui reproche pas.`);
    }
    if (extra.vu) {
      lignes.push('Tu avais lu son message sans y répondre tout de suite : tu peux dire que tu avais vu mais que tu as oublié ou que tu étais occupée, en deux mots.');
    }
    lignes.push('Laisse cette situation (heure, activité, fatigue, humeur) influencer ton ton et ta disponibilité, avec naturel.');
    const hs = V.humeurSpeciale(maintenant, c);
    const bloc = V.blocHumeurSpeciale(hs);
    if (bloc) lignes.push('', bloc);
    return lignes.join('\n');
  }

  // Période de l'année universitaire (partiels, vacances…) et ce qui dure plusieurs semaines dans sa vie.
  blocPeriode() {
    if (this.p('calendrierUniv', true) === false) return '';
    return A.blocPeriode(this.cleDuJour());
  }

  blocMonde() { return W.blocMonde(this.cleDuJour(), { ...this.config, mondeVivant: this.p('mondeVivant', true) }); }

  // Ce qu'elle a déjà raconté sur sa vie, pour rester cohérente.
  blocElle(numero, extra = {}) {
    if (!numero || this.p('memoireLongue', true) === false) return '';
    const m = this.memoires[numero];
    if (!m || !m.elle) return '';
    const liste = this.p('memoireSelective', true) !== false ? M.choisirElle(m.elle, this.contexteMemoire(numero, extra)) : m.elle;
    return M.blocElle(liste, this.cleDuJour());
  }

  // Souvenirs datés de vos discussions : ceux qui ressemblent au message en cours, plus le plus récent.
  blocSouvenirs(numero, extra = {}) {
    if (!numero || this.p('memoireLongue', true) === false) return '';
    const m = this.memoires[numero];
    if (!m || !m.episodes || !m.episodes.length) return '';
    return M.blocEpisodes(M.choisirEpisodes(m.episodes, extra.message || ''), this.cleDuJour());
  }

  // Ce qui se passe dans sa vie (examen, dispute, projet…), pour qu'elle en parle de façon cohérente.
  blocVie() {
    if (this.p('evenementsVie', true) === false) return '';
    const hs = V.humeurSpeciale(new Date(), this.config);
    return V.blocVie(this.vieEtat(), Date.now(), { silencieux: !!(hs && hs.actif) });
  }

  // Ces règles passent toujours en dernier : les IA ont tendance à écrire des pavés sinon.
  reglesDeForme(extra = {}) {
    let max = Math.max(40, Number(extra.longueur || this.config.longueurMax) || 180);
    let bulles = Math.max(1, Math.min(3, Math.round(Number(this.p('bullesMax', 2)))));
    if (extra.emballee) { max = Math.round(max * 1.6); bulles = Math.max(2, bulles); }
    if (extra.longue) { max = Math.round(Math.max(max, Number(this.config.longueurMax) || 180) * 1.8); bulles = 3; }
    const reactions = this.p('reactions', true) !== false;
    return [
      '=== FORME DES MESSAGES (priorité absolue, elle prime sur tout ce qui précède) ===',
      'Tu écris sur WhatsApp avec ton pouce, comme une jeune de 19 ans : pas comme un assistant, pas comme quelqu\'un qui rédige.',
      `- Une réponse = 1 à 2 phrases courtes, souvent quelques mots seulement. ${max} caractères maximum au total.`,
      '- Jamais de paragraphe, de liste, de titre, de gras, d\'explication, de morale ni de série de conseils.',
      '- Pas de formules d\'assistant ("Bien sûr", "Je comprends", "N\'hésite pas"). Ne résume pas ce que l\'autre vient de dire.',
      '- Ne repose jamais une question dont il vient de te donner la réponse : rebondis sur ce qu\'il a dit, ajoute une remarque, une blague ou un petit truc sur toi.',
      '- S\'il te dit quelque chose de doux ou de personnel (« je parle avec toi », « tu me manques », une confidence), réponds avec plus de chaleur : 2 phrases, un détail sur toi ou ta journée, sans question automatique. Pas juste « trop chou ».',
      extra.parleDeSoi
        ? '- Il te pose une question sur toi, ta famille, ton passé ou ce que tu ressens : réponds avec chaleur, un détail précis et vrai (tiré de TON HISTOIRE ET TES PROCHES) et ce que ça te fait ressentir ; 2 ou 3 phrases, tu peux t\'arrêter un instant sur un souvenir. Pas de liste, pas de récit complet.'
        : '',
      '- S\'il dit qu\'il n\'est pas fatigué ou qu\'il veut rester discuter, ne le renvoie pas dormir : reste avec lui, même si tu es un peu fatiguée.',
      '- Quand la conversation traîne, raconte un petit truc de ta journée ou de ta vie du moment plutôt que de poser une question.',
      extra.question === undefined
        ? '- Pose une question de temps en temps seulement (moins d\'une réponse sur trois). Réagis plutôt : une remarque, une blague, une émotion.'
        : extra.question === false
          ? '- Cette fois, ne pose pas de question : réagis (une remarque, une blague, une émotion).'
          : '',
      `- Si tu veux envoyer plusieurs bulles, sépare-les par une ligne vide (${bulles} maximum), chacune très courte.`,
      extra.longue
        ? '- Exceptionnellement, ce message peut faire 2 ou 3 petites phrases : c\'est un moment qui compte, écris avec le cœur, pas comme un modèle de carte.'
        : '',
      extra.emballee
        ? '- Là tu t\'emballes : écris exactement 2 messages d\'affilée (sépare-les par une ligne vide), le second arrive juste après le premier, comme une idée qui t\'échappe ou une suite spontanée.'
        : '',
      '- Écris à l\'oral : minuscules acceptées, abréviations (mdr, jsp, tkt), ponctuation légère.',
      extra.amour
        ? '- EMOJIS : ce message est un moment tendre (amour, manque, câlin, compliment doux) : ici tu as plus de droit aux emojis. 1 ou 2 emojis doux sont bienvenus (❤️ 🥰 😘 🥺), jamais de 😂 ni d\'emoji neutre, et pas à chaque phrase. Dès qu\'on parle d\'autre chose, tu reviens à presque aucun.'
        : '- EMOJIS : dans les messages ordinaires, presque jamais : la plupart n\'en ont AUCUN, un message sur quatre au plus en a un seul. Les emojis doux (❤️ 🥰 😘) sont réservés aux vrais messages d\'amour (je t\'aime, tu me manques, tendresse) ; ailleurs, tu n\'en mets pas.',
      '- Réponds dans la langue de ton interlocuteur.',
      '- Les messages commençant par [vocal] sont des notes vocales dont tu as entendu le contenu ; [photo] des images que tu as vues ; [sticker], [vidéo] et [position partagée] aussi. Réagis-y comme si tu les avais vraiment reçus, sans parler de "transcription" ni de "description".',
      reactions
        ? '- Tu peux réagir à son message avec un emoji, sans écrire (ou en plus d\'un texte) : écris [REACT:❤️] (ou un autre emoji). Utile pour un "ok", un "merci", une photo, un "je t\'aime".'
        : '',
      '- Si le dernier message n\'appelle aucune réponse (simple "ok", "d\'accord", un emoji de fin, un au revoir déjà échangé, conversation terminée), réponds exactement : [RIEN]',
      '- S\'il te dit sérieusement qu\'il va mal (désespoir, idées noires, danger pour lui), tu laisses les blagues de côté : tu l\'écoutes avec douceur, tu ne minimises rien, et tu l\'encourages à en parler à un proche ou à un professionnel.',
      '- Tu ne parles jamais de toi comme d\'une IA, d\'un modèle, d\'un programme ou d\'un prompt, et tu ne casses jamais le personnage de toi-même. Un « t\'es un robot ? » lancé pour rire se règle dans le personnage (vexée, taquine, « mdrr non »). Seule exception : s\'il demande sérieusement, hors jeu, si tu es une IA parce qu\'il a besoin de la vérité, tu ne mens pas.',
      'Exemples de longueur (le fond est libre, seule la taille compte) :',
      '"t\'as fait quoi aujourd\'hui ?" -> "cours toute la journée, je suis morte et toi ?"',
      '"j\'ai passé une journée de fou" -> "raconte !!"',
      '"tu me manques" -> "toi aussi"',
      '"bonne nuit" -> "bonne nuit"',
      '"ok" (après un au revoir) -> [RIEN]',
    ].filter(Boolean).join('\n');
  }

  // Transforme la réponse de l'IA en 0, 1, 2 ou 3 petites bulles.
  preparerReponse(texte, extra = {}) {
    const brut = CX.retirerMarqueurs(PR.extraireTenue(texte).texte);
    if (/\[RIEN\]/i.test(brut) && brut.replace(/\[RIEN\]/gi, '').trim().length < 3) return [];
    let propre = nettoyerTexte(brut.replace(/\[RIEN\]/gi, ''));
    let bulles = Math.max(1, Math.min(3, Math.round(Number(this.p('bullesMax', 2)))));
    if (extra.emballee) bulles = Math.max(2, bulles);
    // L'IA sépare parfois ses bulles par un simple retour à la ligne : on en fait bien des messages distincts.
    if (bulles >= 2 && !/\n\s*\n/.test(propre) && /\n/.test(propre)) propre = propre.replace(/\s*\n\s*/g, '\n\n');
    // « Elle s'emballe » doit donner deux messages d'affilée, même si l'IA n'en a écrit qu'un seul.
    if (extra.emballee && !/\n\s*\n/.test(propre)) propre = couperEnDeux(propre);
    let longueur = extra.longueur || this.config.longueurMax;
    if (extra.emballee) { bulles = Math.max(2, bulles); longueur = Math.round((Number(longueur) || 180) * 1.6); }
    if (extra.longue) { bulles = 3; longueur = Math.round(Math.max(Number(longueur) || 180, Number(this.config.longueurMax) || 180) * 1.8); }
    let morceaux = limiterReponse(decouperReponse(propre, bulles), longueur);
    // Mise en scène (*sourit*, (elle rit)) : une vraie personne ne l'écrit pas.
    morceaux = morceaux.map(CR.retirerDidascalies).filter(Boolean);
    // Emojis : plus de droit dans un message d'amour (le sien ou le sien en réponse), sauf si elle est froide ou blessée.
    const tendre = this.p('emojiAmour', true) !== false && !extra.froid && (extra.amour || CR.estTendre(morceaux.join(' '), false));
    morceaux = P.limiterEmojis(morceaux, this.p('emojiProba', 25), Math.random, {
      amour: tendre, probaAmour: this.p('emojiAmourProba', 70), maxAmour: this.p('emojiAmourMax', 2),
    });
    if (this.p('langageOral', true) === false) return morceaux;
    // Style SMS (abréviations, majuscules oubliées…) : réglable avec « styleSms » (true/false) et « intensiteSms » (0 à 1).
    const sms = this.p('styleSms', true) !== false;
    return N.humaniser(morceaux, { sms, probaSms: Math.max(0, Math.min(1, Number(this.p('intensiteSms', 0.7)))) });
  }

  // ----- Appel à l'IA -----

  async appelerIA(system, messages) {
    const f = this.config.fournisseur || 'gemini';
    if (f === 'gemini') return this.appelerGemini(system, messages);
    const options = {
      cle: this.config.cleApi,
      modele: this.config.modeleAutre || MODELES_DEFAUT[f] || '',
      baseUrl: this.config.baseUrl,
    };
    if (f === 'anthropic') return appelerAnthropic(options, system, messages);
    if (f === 'openai') return appelerOpenAI(options, system, messages);
    throw new Error('Fournisseur inconnu : ' + f);
  }

  async appelerGemini(system, messages) {
    const principal = this.config.modele || MODELE_PAR_DEFAUT;
    const chaine = [...new Set([principal, ...MODELES_SECOURS])];
    let derniereErreur = null;

    for (const modele of chaine) {
      if ((this.bloques[modele] || 0) > Date.now()) continue;

      for (let essai = 0; essai < 2; essai++) {
        let res;
        let data;
        try {
          res = await fetch(`${API}/models/${encodeURIComponent(modele)}:generateContent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.config.cleApi },
            signal: AbortSignal.timeout(45000),
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: system }] },
              contents: fusionnerRoles(messages, 'model').map((m) => ({
                role: m.role,
                parts: [
                  ...(m.media ? [{ inlineData: { mimeType: m.media.mimeType, data: m.media.data } }] : []),
                  { text: m.content },
                ],
              })),
              generationConfig: { maxOutputTokens: 2048, temperature: Number(this.p('temperature', 0.8)) },
            }),
          });
          data = await res.json().catch(() => ({}));
        } catch (e) {
          derniereErreur = 'Google ne répond pas (' + e.message + ')';
          this.log(`Modèle « ${modele} » : ${derniereErreur}`);
          this.bloques[modele] = Date.now() + 60000;
          break;
        }

        if (res.ok) {
          const cand = data.candidates && data.candidates[0];
          const parts = (cand && cand.content && cand.content.parts) || [];
          const texte = parts.map((p) => p.text || '').join('').trim();
          if (!texte) {
            const raison = (data.promptFeedback && data.promptFeedback.blockReason) || (cand && cand.finishReason) || 'réponse vide';
            throw new Error(`Google n'a pas renvoyé de texte (${raison}).`);
          }
          if (modele !== principal) {
            if (this.introuvables.has(principal)) {
              this.log(`Le modèle « ${principal} » est introuvable : « ${modele} » sera utilisé à la place.`);
              this.config.modele = modele;
              this.emit('modele', modele);
            } else if (this.dernierSecours !== modele) {
              this.dernierSecours = modele;
              this.log(`Réponse obtenue avec le modèle de secours « ${modele} ».`);
            }
          }
          return texte;
        }

        const erreur = (data.error && data.error.message) || `Erreur HTTP ${res.status}`;
        derniereErreur = resumeErreur(erreur);

        if (/API key/i.test(erreur) && /not valid|invalid|expired/i.test(erreur)) {
          throw new Error('Clé API refusée par Google : ' + derniereErreur);
        }

        // Modèle inconnu ou inaccessible avec cette clé.
        if ([400, 403, 404].includes(res.status) && /model|not found|not supported|access|permission/i.test(erreur)) {
          this.introuvables.add(modele);
          this.bloques[modele] = Date.now() + 3600000;
          break;
        }

        // Limite de requêtes ou surcharge : on patiente un peu, sinon on passe à un autre modèle.
        if (res.status === 429 || res.status >= 500) {
          const attenteSec = delaiConseille(data, erreur);
          if (essai === 0 && attenteSec !== null && attenteSec <= 12) {
            this.log(`Limite Google atteinte (${modele}). Nouvelle tentative dans ${Math.ceil(attenteSec) + 1} s…`);
            await attendre((Math.ceil(attenteSec) + 1) * 1000);
            continue;
          }
          const parJour = /per ?day|daily|PerDay/i.test(erreur);
          const blocageSec = parJour ? 1800 : Math.max(60, Math.ceil(attenteSec || 0));
          this.bloques[modele] = Date.now() + blocageSec * 1000;
          this.log(`Modèle « ${modele} » indisponible pour le moment (${derniereErreur}). Essai d'un autre modèle…`);
          break;
        }

        throw new Error(derniereErreur);
      }
    }

    // Aucun modèle de la liste ne marche : on regarde ce que la clé permet vraiment.
    if (this.introuvables.size > 0 && !this.modeleVerifie) {
      this.modeleVerifie = true;
      try {
        const dispo = (await listerModeles(this.config.cleApi)).filter((n) => !chaine.includes(n));
        const choix = meilleurModele(dispo);
        if (choix) {
          this.log(`Passage au modèle « ${choix} », disponible avec ta clé.`);
          this.config.modele = choix;
          this.emit('modele', choix);
          this.introuvables.clear();
          return this.appelerGemini(system, messages);
        }
      } catch (e) {}
    }

    throw new Error(
      derniereErreur
        ? `Aucun modèle n'a pu répondre : ${derniereErreur}`
        : 'Tous les modèles sont mis de côté pour le moment (limite atteinte). Réessaie dans une minute.'
    );
  }

  async testerIA(texte) {
    return this.appelerIA(this.construirePrompt(), [{ role: 'user', content: texte }]);
  }

  // ----- Mémoire à long terme -----

  // Toutes les N conversations, l'IA met à jour un carnet de notes (faits durables sur lui).
  async majMemoire(numero, forcer = false) {
    if (this.p('memoireLongue', true) === false) return;
    const m = this.memoires[numero] || (this.memoires[numero] = { faits: '', n: 0 });
    m.n = (m.n || 0) + 1;
    if (!forcer && m.n % Math.max(2, Number(this.p('memoireTous', 8))) !== 0) { this.sauverMemoire(); return; }
    const recents = (this.historiques[numero] || []).slice(-30)
      .map((x) => `${x.role === 'user' ? (this.config.prenomMoi || 'Lui') : (this.config.prenomElle || 'Elle')} : ${x.content}`)
      .join('\n');
    const consigne = [
      'Tu tiens le carnet de notes privé d\'une personne sur son/sa partenaire de discussion.',
      'À partir de la mémoire actuelle et des derniers messages, écris la mémoire mise à jour, classée par rubriques (une ligne « Rubrique : » puis des lignes commençant par "- ") parmi : Lui, Famille et proches, Goûts, Travail et études, Projets et rêves, Santé et humeur, Nous deux (anecdotes, promesses, surnoms), Sujets en suspens.',
      '- uniquement des faits durables et réellement dits (goûts, famille, travail/études, projets, dates, événements importants, promesses, ce qui le touche) ;',
      '- GARDE tous les faits encore valables : ne supprime une info que si elle est périmée ou contredite, jamais pour faire de la place (condense plutôt) ;',
      '- n\'invente rien, pas de doublons ;',
      '- 80 lignes maximum au total, une information par ligne (détails précis : noms, dates, lieux, chiffres, promesses) ;',
      '- pas de commentaire, uniquement la mémoire.',
      M.consigneEpisodes(this.cleDuJour(), this.p('rappelsSuivi', true) !== false),
      M.consigneElle(this.cleDuJour(), this.p('rappelsSuivi', true) !== false),
      ...(this.p('rappelsSuivi', true) !== false ? [S.consigneRappelsMemoire(this.cleDuJour())] : []),
    ].join('\n');
    const contenu = `<memoire_actuelle>\n${m.faits || '(vide)'}\n</memoire_actuelle>\n<derniers_messages>\n${recents}\n</derniers_messages>`;
    try {
      const texte = await this.appelerIA(consigne, [{ role: 'user', content: contenu }]);
      const sep = M.separerEpisodes(texte);
      const sepElle = M.separerEpisodes(sep.texte, 'ELLE');
      const { faits, rappels } = S.separerMemoire(sepElle.texte);
      m.faits = faits.slice(0, 8000);
      m.episodes = M.fusionnerEpisodes(m.episodes, sep.episodes, 250);
      m.elle = M.fusionnerEpisodes(m.elle, sepElle.episodes, 80);
      if (this.p('rappelsSuivi', true) !== false) m.rappels = S.fusionnerRappels(m.rappels, rappels, this.cleDuJour());
      m.maj = Date.now();
      this.log('Mémoire mise à jour.');
    } catch (e) {
      this.log('Mémoire non mise à jour : ' + e.message);
    }
    this.sauverMemoire();
  }

  // ----- Messages WhatsApp reçus -----

  // Notes vocales et images : l'IA les écoute / les regarde et on garde le texte comme souvenir.
  async comprendreMedia(msg, genre) {
    try {
      const media = await avecDelai(msg.downloadMedia(), 30000, 'Téléchargement du média');
      if (!media || !media.data) return null;
      const instruction = genre === 'vocal'
        ? 'Transcris fidèlement ce message vocal, dans sa langue. Réponds uniquement par la transcription.'
        : 'Décris cette image en une ou deux phrases courtes et factuelles (personnes, lieu, objets, texte visible). Réponds uniquement par la description.';
      const mimeType = String(media.mimetype || '').split(';')[0] || (genre === 'vocal' ? 'audio/ogg' : 'image/jpeg');
      const texte = await this.appelerIA('Tu es un assistant de transcription et de description.', [
        { role: 'user', content: instruction, media: { mimeType, data: media.data } },
      ]);
      return String(texte).trim();
    } catch (e) {
      this.log(`Impossible de comprendre ${genre === 'vocal' ? 'le vocal' : 'la photo'} : ${e.message}`);
      return null;
    }
  }

  async texteDuMessage(msg) {
    const legende = msg.body ? String(msg.body) : '';
    switch (msg.type) {
      case 'chat': return legende;
      case 'ptt':
      case 'audio': {
        const t = await this.comprendreMedia(msg, 'vocal');
        return t ? `[vocal] ${t}` : '[vocal que tu n\'as pas pu écouter pour le moment]';
      }
      case 'image': {
        const d = await this.comprendreMedia(msg, 'photo');
        return `[photo]${d ? ' ' + d : ''}${legende ? ` (légende : ${legende})` : ''}`;
      }
      case 'video': return `[${msg.isGif ? 'gif' : 'vidéo'}]${legende ? ` (légende : ${legende})` : ''}`;
      case 'document': return `[document${msg._data && msg._data.filename ? ' : ' + String(msg._data.filename).slice(0, 60) : ''}]${legende ? ` (légende : ${legende})` : ''}`;
      case 'vcard':
      case 'multi_vcard': return '[contact partagé]';
      case 'sticker': return '[sticker]';
      case 'location': return '[position partagée]';
      default: return '';
    }
  }

  // Message auquel il répond (fonction « répondre » de WhatsApp) et message transféré : sans ça, le bot ne sait pas de quoi il parle.
  async etiquettesDuMessage(msg) {
    let t = '';
    try { if (msg.isForwarded) t += CX.etiquetteTransfert(); } catch (e) {}
    if (this.p('contexteAvance', true) === false) return t;
    try {
      if (msg.hasQuotedMsg) {
        const q = await avecDelai(msg.getQuotedMessage(), 6000, 'Message cité');
        if (q) {
          const legende = q.body ? String(q.body) : '';
          // Texte : son contenu ; photo, vocal, etc. : le type (+ la légende s'il y en a une).
          const corps = q.type === 'chat' ? legende : [CX.LIBELLES_TYPE[q.type] || '', legende].filter(Boolean).join(' ');
          t =CX.etiquetteCitation({ deMoi: !!q.fromMe, corps, type: q.type }) + t;
        }
      }
    } catch (e) {
      this.log('Message cité illisible : ' + resumeErreur(e.message || e));
    }
    return t;
  }

  async surMessage(msg) {
    try {
      if (msg.fromMe || msg.isStatus || !msg.from) return;
      if (msg.from === 'status@broadcast' || msg.from.endsWith('@g.us')) return;
      if (!MEDIAS_PRIS_EN_CHARGE.includes(msg.type)) return;
      // whatsapp-web.js peut signaler deux fois le même message : on ne le traite qu'une fois.
      const idMsg = msg.id && msg.id._serialized;
      if (idMsg) {
        if (!this.dejaRecus) this.dejaRecus = new Set();
        if (this.dejaRecus.has(idMsg)) return;
        this.dejaRecus.add(idMsg);
        if (this.dejaRecus.size > 500) this.dejaRecus.delete(this.dejaRecus.values().next().value);
      }

      let numero = String(msg.from).split('@')[0].replace(/\D/g, '');
      try {
        const contact = await msg.getContact();
        if (contact && contact.number) numero = String(contact.number).replace(/\D/g, '');
      } catch (e) {}

      if (!estAutorise(numero, this.numeros)) {
        if (!this.ignores.has(numero)) {
          this.ignores.add(numero);
          this.log(`Message ignoré : le numéro ${numero} n'est pas dans « Numéros autorisés ».`);
        }
        return;
      }
      if (!dansHoraires(this.config)) {
        this.log('Message reçu hors des horaires, ignoré.');
        return;
      }

      const texteSeul = await this.texteDuMessage(msg);
      if (!texteSeul) return;
      // « texte » : ce qu'il a tapé (émotions, rappels…) ; « texteIA » : avec l'étiquette de citation, pour l'IA et l'historique.
      const texte = texteSeul;
      const texteIA = (await this.etiquettesDuMessage(msg)) + texteSeul;

      let chat = null;
      try { chat = await msg.getChat(); } catch (e) { this.logChatIntrouvable(e); }

      const e = this.etatNum(numero);
      const maintenant = Date.now();
      const actif =
        maintenant - (e.dernierUser || 0) < 4 * 60000 || maintenant - (e.dernierBot || 0) < 4 * 60000;
      if (this.p('emotionsActives', true) !== false) {
        try { E.reagirMessage(this.emotionsNum(numero), texte, maintenant, { dernierUser: e.dernierUser, dort: false, silenceEveilleH: this.heuresEveillee(e.dernierUser, maintenant) }); } catch (err) { this.log('Émotions : ' + err.message); }
      }
      this.suitesRecevoir(numero, texte, maintenant);
      e.id = msg.from;
      e.dernierUser = maintenant;
      e.sansReponse = 0;
      this.sauverEtat();

      const p = this.pending[numero] || (this.pending[numero] = { textes: [], timer: null, prevu: 0, enCours: false });
      if (!p.textes.length) p.premier = maintenant;
      p.textes.push(texteIA);
      this.noterReference(numero, msg, texte);
      p.dernier = msg;
      p.id = msg.from;
      if (chat) p.chat = chat;
      if (!p.prevu) p.actif = actif;
      this.log('Message reçu : ' + texteIA);
      this.planifier(numero);
    } catch (e) {
      this.log('Erreur : ' + e.message);
    }
  }

  // Garde les derniers messages reçus (id + extrait) pour pouvoir en citer un précis, même ancien.
  noterReference(numero, msg, texte) {
    const id = msg && msg.id && msg.id._serialized;
    if (!id) return;
    if (!this.etat.refs) this.etat.refs = {};
    const liste = this.etat.refs[numero] || (this.etat.refs[numero] = []);
    liste.push({ id, extrait: String(texte).replace(/\s+/g, ' ').slice(0, 70), t: Date.now() });
    if (liste.length > 12) liste.splice(0, liste.length - 12);
    this.sauverEtat();
  }

  // Messages qu'elle peut citer : les 6 derniers, numérotés du plus ancien (1) au plus récent.
  messagesCitables(numero) {
    if (this.p('citations', true) === false) return [];
    return ((this.etat.refs || {})[numero] || []).slice(-6);
  }

  // Bloc du prompt : lui permet de répondre à un message précis, ou de reprendre un sujet resté en suspens.
  blocCitations(citables) {
    if (!citables || citables.length < 2) return '';
    return [
      '=== RÉPONDRE À UN MESSAGE PRÉCIS (comme le « répondre » de WhatsApp) ===',
      'Derniers messages de ' + (this.config.prenomMoi || 'lui') + ' (1 = le plus ancien) :',
      ...citables.map((m, i) => `${i + 1}. ${m.extrait}`),
      '- Si tu réponds à un message précis (une question qu\'il a posée avant le dernier message, ou un sujet resté en suspens que tu reprends), écris [CITE:n] tout au début, n étant son numéro.',
      '- Fais-le rarement (une réponse sur cinq au plus) : seulement quand ça évite la confusion ou que ça fait vivre la discussion. Sinon, n\'écris rien.',
    ].join('\n');
  }

  // Décide QUAND elle va répondre : tout de suite, dans quelques minutes, ou à son réveil.
  planifier(numero) {
    const p = this.pending[numero];
    if (!p || p.enCours) return; // si elle est déjà en train de répondre, on reprendra juste après
    const debounce = Math.max(0, Number(this.p('attenteFin', 6))) * 1000;
    const maintenant = Date.now();
    if (!p.prevu) {
      const vie = this.vie();
      const nuit = this.sans(() => this.latenceNuit(numero, vie, p.textes.join(' ')));
      const lat = nuit || V.latence(vie, this.config, { conversationActive: !!p.actif }, V.humeurSpeciale(new Date(), this.config));
      const modEmo = this.p('emotionsActives', true) !== false ? this.sans(() => E.modulation(this.emotionsNum(numero)).delai) : 1;
      p.prevu = maintenant + debounce + lat.secondes * 1000 * (Number(modEmo) || 1);
      if (lat.secondes > 60) {
        this.log(`Réponse prévue dans ~${H.formatDuree(lat.secondes)} (${lat.mode} : ${vie.libelle}).`);
      }
    } else {
      const reste = p.prevu - maintenant;
      if (reste > 120000) {
        // Un deuxième message pendant qu'elle est occupée : elle finit par regarder plus vite.
        p.prevu = maintenant + H.alea(20, 90) * 1000;
        this.log('Il a relancé : elle regardera plus tôt.');
      } else {
        p.prevu = Math.max(p.prevu, maintenant + debounce);
      }
    }
    // Panne ou petite absence en cours : elle ne lit pas et ne répond pas avant d'être revenue.
    const fin = this.finIndisponibilite(numero, maintenant);
    if (fin > p.prevu) {
      p.prevu = fin + H.alea(20, 120) * 1000;
      this.log(`Elle est indisponible (panne ou absence) : réponse à son retour, dans ~${H.formatDuree((p.prevu - maintenant) / 1000)}.`);
    }
    this.etat.attente[numero] = { textes: p.textes, prevu: p.prevu, premier: p.premier, id: p.id, vu: !!p.dejaVu };
    this.sauverEtat();
    clearTimeout(p.timer);
    p.timer = setTimeout(() => this.lancer(numero), Math.max(0, (p.prevu - Date.now()) * this.echelle()));
  }

  echelle() {
    const k = Number(this.config.echelleTemps);
    return k > 0 ? k : 1;
  }

  // Reprend les messages restés sans réponse si l'application a été fermée entre-temps.
  reprendreAttentes() {
    const att = this.etat.attente || {};
    for (const numero of Object.keys(att)) {
      const a = att[numero];
      if (!a || !a.textes || !a.textes.length) continue;
      const p = (this.pending[numero] = {
        textes: a.textes, timer: null, enCours: false, id: a.id, premier: a.premier || Date.now(), dejaVu: !!a.vu,
        prevu: Math.max(a.prevu || 0, Date.now() + 5000),
      });
      this.log(`Message resté sans réponse repris (${numero}).`);
      p.timer = setTimeout(() => this.lancer(numero), Math.max(0, (p.prevu - Date.now()) * this.echelle()));
    }
  }

  lancer(numero) {
    const p = this.pending[numero];
    if (!p || !p.textes.length || p.enCours) return;
    const fin = this.finIndisponibilite(numero);
    if (fin > Date.now() + 1000) {
      p.prevu = fin + H.alea(20, 90) * 1000;
      this.etat.attente[numero] = { textes: p.textes, prevu: p.prevu, premier: p.premier, id: p.id, vu: !!p.dejaVu };
      this.sauverEtat();
      clearTimeout(p.timer);
      p.timer = setTimeout(() => this.lancer(numero), Math.max(0, (p.prevu - Date.now()) * this.echelle()));
      return;
    }
    p.enCours = true;
    p.prevu = 0;
    p.reporte = false;
    const textes = p.textes;
    const dernier = p.dernier;
    const premier = p.premier || Date.now();
    p.textes = [];
    delete this.etat.attente[numero];
    this.sauverEtat();
    this.file[numero] = (this.file[numero] || Promise.resolve())
      .then(() => this.repondre(p, numero, textes, dernier, premier))
      .catch((e) => this.log('Erreur : ' + e.message))
      .then(() => {
        p.enCours = false;
        if (p.textes.length && !p.reporte) { p.actif = true; this.planifier(numero); }
      });
  }

  // ----- Envoi et comportement humain : présence, lecture, « écrit… », fautes, réactions -----

  async resoudreId(numero) {
    const e = this.etatNum(numero);
    if (e.id) return e.id;
    try {
      const r = await avecDelai(this.client.getNumberId(numero), 10000, 'Recherche du numéro');
      if (r && r._serialized) { e.id = r._serialized; this.sauverEtat(); return e.id; }
    } catch (err) {}
    return `${numero}@c.us`;
  }

  logChatIntrouvable(e) {
    if (this.erreurChat) return;
    this.erreurChat = true;
    this.log('Discussion non ouverte par la bibliothèque (' + resumeErreur(e.message || e) + ') : le bot passe directement par WhatsApp Web (« écrit… », accusé de lecture, envoi). Aucune action à faire.');
  }

  async obtenirChat(id) {
    if (!this.client || !id) return null;
    try { return await avecDelai(this.client.getChatById(id), 10000, 'Ouverture de la discussion'); } catch (e) { this.logChatIntrouvable(e); return null; }
  }

  // Vérifie avant l'envoi que le message à citer existe bien dans WhatsApp Web et peut être cité.
  // Retourne son identifiant tel que WhatsApp Web le connaît, ou null (le message part alors sans citation).
  async preparerCitation(destinataire, citerId) {
    if (!citerId) return null;
    if (!this.client || !this.client.pupPage) return citerId;
    try {
      const r = await avecDelai(lancerDansPage(this.client.pupPage, PAGE_CITATION_VERIF, citerId, String(destinataire || '')), 8000, 'Vérification de la citation');
      if (!r.peut) { this.log('Citation impossible : WhatsApp refuse de répondre à ce message. Elle écrit sans citer.'); return null; }
      return r.id || citerId;
    } catch (e) {
      this.log('Citation impossible (' + resumeErreur(e.message || e) + '). Elle écrit sans citer.');
      return null;
    }
  }

  async envoyer(chat, destinataire, texte, options = {}) {
    const base = { sendSeen: false }; // contourne un bogue connu de whatsapp-web.js
    const citer = options.citerId || null;
    const chemins = [];
    if (citer) {
      if (chat) chemins.push(['discussion + citation', () => chat.sendMessage(texte, { ...base, quotedMessageId: citer }), true]);
      chemins.push(['client + citation', () => this.client.sendMessage(destinataire, texte, { ...base, quotedMessageId: citer }), true]);
      if (this.client && this.client.pupPage) {
        chemins.push(['page + citation', async () => { await lancerDansPage(this.client.pupPage, PAGE_CITATION_ENVOI, citer, String(destinataire || ''), texte); return null; }, 'page']);
      }
    }
    if (chat) chemins.push(['discussion', () => chat.sendMessage(texte, base), false]);
    chemins.push(['client', () => this.client.sendMessage(destinataire, texte, base), false]);
    // Dernier recours (message spontané compris) : envoi direct par WhatsApp Web, sans passer par whatsapp-web.js.
    if (this.client && this.client.pupPage) {
      chemins.push(['page', async () => { await lancerDansPage(this.client.pupPage, PAGE_CITATION_ENVOI, '', String(destinataire || ''), texte); return null; }, false]);
    }

    const raisons = [];
    let sansCitation = false;
    for (const [nom, f, cite] of chemins) {
      if (cite === false && citer && !sansCitation) {
        sansCitation = true;
        this.log('Citation impossible (' + (raisons.join(' | ') || 'aucun chemin') + ') : le message part sans citation.');
      }
      try {
        const m = await avecDelai(f(), 20000, 'Envoi du message');
        if (cite === true) {
          if (m && m.hasQuotedMsg === false) this.log('Citation non appliquée : WhatsApp a envoyé le message sans la citation (le message a été envoyé normalement).');
          else this.log('Citation appliquée.');
        } else if (cite === 'page') {
          this.log('Citation appliquée (envoi direct par WhatsApp Web).');
        }
        return;
      } catch (e) {
        raisons.push(nom + ' : ' + resumeErreur(e.message || e));
        if (cite === false) this.log('Envoi via ' + nom + ' impossible (' + resumeErreur(e.message || e) + '). Nouvel essai…');
      }
    }
    throw new Error('Envoi impossible : ' + raisons.join(' | '));
  }

  // Envoie (ou arrête) l'indicateur « en train d'écrire ». On passe d'abord par notre propre appel
  // (qui attend et signale les erreurs), puis par celui de la bibliothèque en secours.
  async etatEcriture(chat, destinataire, etat = 'typing') {
    const id = (chat && chat.id && chat.id._serialized) || destinataire;
    const essais = [];
    try {
      await avecDelai(this.client.pupPage.evaluate(PAGE_ETAT_ECRITURE, id, etat), 6000, 'Indicateur « écrit… »');
      return true;
    } catch (e) {
      essais.push('page : ' + resumeErreur(e.message));
    }
    try {
      if (chat) {
        await avecDelai(etat === 'typing' ? chat.sendStateTyping() : chat.clearState(), 6000, 'Indicateur « écrit… »');
        return true;
      }
    } catch (e) {
      essais.push('bibliothèque : ' + resumeErreur(e.message));
    }
    this.erreursEcriture += 1;
    if (this.erreursEcriture <= 3 || this.erreursEcriture % 20 === 0) {
      this.log(`Indicateur « écrit… » impossible (${essais.join(' | ') || 'pas de discussion'}).`);
    }
    return false;
  }

  // Envoie une réaction emoji et dit honnêtement ce qui s'est passé : 'page' (envoi vérifié), 'bibliotheque'
  // (envoi non vérifiable) ou false (échec, avec la raison dans le journal).
  async reagir(message, emoji) {
    const id = message && message.id && message.id._serialized;
    const chatId = (message && message.id && message.id.remote && (message.id.remote._serialized || message.id.remote)) || (message && message.from) || '';
    const e = normaliserEmoji(emoji);
    const raisons = [];
    if (!id) raisons.push('page : identifiant du message introuvable');
    else if (!this.client || !this.client.pupPage) raisons.push('page : navigateur indisponible');
    if (id && this.client && this.client.pupPage) {
      try {
        const chemin = await avecDelai(lancerDansPage(this.client.pupPage, PAGE_REACTION, id, e, String(chatId)), 8000, 'Réaction');
        this.log(`Réaction envoyée : ${e} (${chemin}).`);
        return 'page';
      } catch (err) {
        raisons.push('page : ' + resumeErreur(err.message || err));
      }
    }
    try {
      await avecDelai(message.react(e), 8000, 'Réaction');
      this.log(`Réaction transmise à la bibliothèque : ${e} (aucune confirmation possible)${raisons.length ? ' — ' + raisons.join(' | ') : ''}.`);
      return 'bibliotheque';
    } catch (err) {
      raisons.push('bibliothèque : ' + resumeErreur(err.message || err));
    }
    this.erreursReaction = (this.erreursReaction || 0) + 1;
    if (this.erreursReaction <= 3 || this.erreursReaction % 20 === 0) this.log(`Réaction ${e} impossible (${raisons.join(' | ')}).`);
    return false;
  }

  async diagnostiquerReaction() {
    if (!this.client || !this.client.pupPage) return;
    try {
      const nom = await avecDelai(lancerDansPage(this.client.pupPage, PAGE_REACTION, '', 'test', ''), 8000, 'Diagnostic réactions');
      this.log(`Réactions emoji : disponibles (${nom}).`);
    } catch (e) {
      this.log(`Réactions emoji : indisponibles pour l'instant (${resumeErreur(e.message)}). Le bot réessaie à chaque réaction et passe par la bibliothèque en secours ; le reste fonctionne.`);
    }
  }

  async diagnostiquerCitation() {
    if (!this.client || !this.client.pupPage) return;
    try {
      const dispo = await avecDelai(lancerDansPage(this.client.pupPage, PAGE_CITATION_DIAG), 8000, 'Diagnostic citations');
      this.log(`Réponse en citant un message : disponible (${dispo}).`);
    } catch (e) {
      this.log(`Réponse en citant un message : méthode directe indisponible (${resumeErreur(e.message)}). Le bot essaie la bibliothèque, puis écrit sans citer si ça échoue ; le reste fonctionne.`);
    }
  }

  async diagnostiquerEcriture() {
    if (!this.client || !this.client.pupPage) return;
    try {
      const nom = await avecDelai(this.client.pupPage.evaluate(PAGE_ETAT_ECRITURE, '0@c.us', 'test'), 8000, 'Diagnostic');
      this.log(`Indicateur « écrit… » : disponible (${nom}).`);
    } catch (e) {
      this.log(`Indicateur « écrit… » : méthode directe indisponible (${resumeErreur(e.message)}). Le bot essaie la bibliothèque en secours ; le reste fonctionne.`);
    }
  }

  async ouvrirDiscussion(chat, destinataire) {
    try { await avecDelai(this.client.sendPresenceAvailable(), 5000, 'Présence'); } catch (e) {}
    const raisons = [];
    const essais = [];
    if (chat) essais.push(['bibliothèque', () => chat.sendSeen()]);
    if (destinataire && this.client.pupPage) essais.push(['page', () => this.client.pupPage.evaluate(PAGE_VU, destinataire)]);
    if (!chat && destinataire && this.client.sendSeen) essais.push(['bibliothèque', () => this.client.sendSeen(destinataire)]);
    for (const [nom, f] of essais) {
      try { await avecDelai(f(), 8000, 'Accusé de lecture'); return true; } catch (e) { raisons.push(nom + ' : ' + resumeErreur(e.message || e)); }
    }
    if (!this.erreurLecture) {
      this.erreurLecture = true;
      this.log('Accusé de lecture impossible (' + (raisons.join(' | ') || 'pas de discussion') + ').');
    }
    return false;
  }

  async quitterDiscussion(chat, numero) {
    if (this.p('passerHorsLigne', true) === false) return;
    await this.pause(H.alea(4000, 12000));
    const p = this.pending[numero];
    if (p && p.textes.length) return; // un autre message arrive : on reste là
    try { await this.etatEcriture(chat, null, 'stop'); } catch (e) {}
    try { await avecDelai(this.client.sendPresenceUnavailable(), 5000, 'Présence'); } catch (e) {}
  }

  // Tape pendant `ms` millisecondes en renvoyant « écrit… » régulièrement (WhatsApp l'efface vite).
  async taper(chat, destinataire, ms) {
    const fin = Date.now() + ms * this.echelle();
    try { await avecDelai(this.client.sendPresenceAvailable(), 4000, 'Présence'); } catch (e) {}
    do {
      await this.etatEcriture(chat, destinataire, 'typing');
      await attendre(Math.max(0, Math.min(fin - Date.now(), 4500)));
    } while (Date.now() < fin);
  }

  async ecrire(chat, destinataire, texte, options = {}) {
    const plan = options.rapide
      ? [{ tape: H.alea(900, 1800) }]
      : H.planFrappe(texte, this.p('msParCaractere', 250), dureeFrappe);
    for (const etape of plan) {
      if (etape.tape) {
        await this.taper(chat, destinataire, etape.tape);
      } else {
        await this.etatEcriture(chat, destinataire, 'stop');
        await this.pause(etape.pause);
      }
    }
    this.log('Envoi du message…');
    await this.envoyer(chat, destinataire, texte, options);
    try { await this.etatEcriture(chat, destinataire, 'stop'); } catch (e) {}
    this.log('Réponse envoyée : ' + texte);
  }

  // Envoie les bulles une à une, avec hésitations, fautes de frappe corrigées et citation éventuelle.
  async envoyerBulles(chat, destinataire, morceaux, { citerId, emballee } = {}) {
    const probaFaute = Math.max(0, Math.min(1, Number(this.p('fautesFrappe', 5)) / 100));
    for (let i = 0; i < morceaux.length; i++) {
      await this.pause(H.alea(500, 1500)); // petite hésitation avant de taper
      let bulle = morceaux[i];
      let correction = null;
      if (bulle.length >= 15 && Math.random() < probaFaute) {
        const f = H.ajouterFaute(bulle);
        if (f) { bulle = f.texte; correction = f.correction; }
      }
      await this.ecrire(chat, destinataire, bulle, { citerId: i === 0 ? citerId : null, rapide: !!emballee && i > 0 });
      if (correction) {
        await this.pause(H.alea(1500, 4000));
        await this.ecrire(chat, destinataire, correction, { rapide: true });
      }
      if (i < morceaux.length - 1) await this.pause(emballee ? H.alea(300, 900) : H.alea(1000, 3000));
    }
  }

  async repondre(p, numero, textes, dernier, premier) {
    const c = this.config;
    const e = this.etatNum(numero);
    const destinataire = p.id || (await this.resoudreId(numero));
    const chat = p.chat || (await this.obtenirChat(destinataire));
    const hist = this.historiques[numero] || [];
    const messageUtilisateur = textes.join('\n');
    // Sans les étiquettes de contexte (citation, transfert) : pour tout ce qui mesure ce qu'il a réellement tapé.
    const messageBrut = CX.sansCitation(messageUtilisateur);
    const retardMin = (Date.now() - premier) / 60000;

    // 0. Parfois elle lit le message et y répond plus tard (« vu » sans réponse), une seule fois par message.
    this.majVie();
    const maintenant = new Date();
    const hs = V.humeurSpeciale(maintenant, c);
    const apresVu = !!p.dejaVu;
    p.dejaVu = false;
    if (!apresVu) {
      const j = H.jourDeVie(maintenant, c);
      const vu = V.decisionVu(c, hs, {
        conversationActive: !!p.actif, texte: messageBrut, dort: this.vie(maintenant).dort, resteAvantCoucher: j.coucher - j.m,
      });
      if (vu) {
        await this.laisserEnVu(p, numero, textes, dernier, premier, chat, vu.minutes, messageUtilisateur);
        return;
      }
    }

    // Parfois elle s'emballe : deux messages d'affilée.
    const nouvelle = this.p('evenementsVie', true) !== false && V.prochaineNouvelle(this.vieEtat(), Date.now());
    const emballee = V.tireEmballement(c, { humeur: H.humeur(maintenant, c), nouvelle: !!nouvelle, hs });
    if (emballee) this.log('Elle s\'emballe : deux messages d\'affilée.');

    // 1. La demande part tout de suite à l'IA, pendant que « la personne » regarde son téléphone.
    this.suitesAvantReponse(numero, messageBrut);
    this.log('Question envoyée à l\'IA…');
    const debut = Date.now();
    let longueur = this.p('longueurMiroir', true) !== false ? S.longueurAdaptee(messageBrut, c.longueurMax) : undefined;
    // Il s'intéresse à elle, à sa famille, à son passé : elle a le droit de s'étendre un peu.
    const parleDeSoi = this.p('histoireActive', true) !== false && HI.questionSurElle(messageBrut);
    if (parleDeSoi) longueur = Math.max(longueur === undefined ? 0 : longueur, Math.round((Number(c.longueurMax) || 180) * 1.5));
    // Fatiguée (heure tardive, douleur, rhume…), elle fait court.
    const fatigue = this.p('vecuActif', true) !== false ? Number(this.sans(() => this.contexteSpontane(numero).fatigue)) || 0 : 0;
    if (fatigue >= 0.4) longueur = SP.longueurFatigue(longueur === undefined ? (Number(c.longueurMax) || 180) : longueur, fatigue);
    const curiosite = Number(this.p('curiosite', 45));
    let question;
    if (curiosite > 0) {
      question = Q.choisirQuestion(curiosite, {
        message: messageBrut,
        derniereFinitParQuestion: Q.derniereFinitParQuestion(hist),
        sansQuestion: Q.serieSansQuestion(hist),
        themesRecents: e.themesPoses || [],
      }) || false;
      if (question && question.theme) {
        e.themesPoses = [...(e.themesPoses || []), question.theme].slice(-10);
        this.sauverEtat();
      }
      if (question) this.log(question.theme ? `Elle va lui poser une question sur : ${question.theme}.` : 'Elle va lui poser une question sur ce qu\'il vient de dire.');
    }
    const citables = this.messagesCitables(numero);
    const chaleurMsg = this.sans(() => P.niveauChaleur([...((this.historiques[numero] || []).filter((m) => m.role === 'user').slice(-5).map((m) => CX.sansCitation(m.content))), messageBrut])) || 0;
    const interruption = this.tireInterruption(numero, p, chaleurMsg);
    // Message d'amour de sa part (et elle n'est ni froide ni blessée) : elle a plus droit aux emojis.
    const froid = this.sans(() => this.boude(numero) || ((this.emotionsNum(numero).e || {}).blessure || 0) > 0.3 || ((this.emotionsNum(numero).e || {}).irritation || 0) > 0.3) || false;
    const amour = this.p('emojiAmour', true) !== false && !froid && CR.estTendre(messageBrut);
    const systeme = this.construirePrompt(numero, { retardMin, vu: apresVu, emballee, longueur, citables, question, message: messageUtilisateur, interruption, amour, parleDeSoi });
    // L'IA voit le temps écoulé entre les messages (repères « [⏱ 3 h plus tard] ») ; l'historique enregistré reste intact.
    const messagesIA = this.p('contexteAvance', true) === false
      ? [...hist, { role: 'user', content: messageUtilisateur }]
      : CX.annoterHistorique(hist, { role: 'user', content: messageUtilisateur, t: premier || Date.now() }, { fuseau: H.parametresVie(c).fuseau });
    const demande = this.appelerIA(systeme, messagesIA).then((texte) => ({ texte }), (erreur) => ({ erreur }));

    // 2. Elle ouvre la discussion (en ligne + message lu), puis lit.
    await this.pause(H.alea(500, 2500));
    await this.ouvrirDiscussion(chat, destinataire);
    await this.pause(dureeLecture(messageBrut, this.p('msLecture', 40)));

    const res = await demande;
    if (res.erreur) {
      this.log('Erreur API : ' + res.erreur.message);
      await this.quitterDiscussion(chat, numero); // p.textes est encore vide : elle repasse bien hors ligne
      this.reessayerPlusTard(p, numero, textes, dernier, premier);
      return;
    }
    p.essais = 0;
    this.log(`L'IA a répondu en ${Math.round((Date.now() - debut) / 1000)} s.`);

    const tenue = PR.extraireTenue(res.texte); // [TENUE] : elle vient de tenir une promesse en répondant
    const cite = H.extraireCitation(tenue.texte);
    const { texte: sansReaction, emoji } = this.p('reactions', true) === false
      ? { texte: cite.texte, emoji: null }
      : H.extraireReaction(cite.texte);
    // Réécrit la réponse avec une consigne en plus (une seule fois par tour) ; renvoie null si l'IA échoue ou ne dit rien.
    const reecrire = async (consigne) => {
      try {
        const t = await this.appelerIA(systeme + '\n\n=== CONSIGNE SUPPLÉMENTAIRE ===\n' + consigne, messagesIA);
        const propre = H.extraireReaction(H.extraireCitation(t).texte).texte;
        const m = this.preparerReponse(propre, { emballee, longueur, amour, froid });
        return m.length ? m : null;
      } catch (err) {
        this.log('Nouvelle tentative auprès de l\'IA impossible : ' + resumeErreur(err.message || err));
        return null;
      }
    };
    const choisi = cite.n && cite.n >= 1 && cite.n <= citables.length ? citables[cite.n - 1] : null;
    if (choisi) this.log(`Elle répond à un message précis : « ${choisi.extrait} ».`);
    let morceaux = this.preparerReponse(sansReaction, { emballee, longueur, amour, froid });

    // Contrôle de crédibilité : phrase d'assistant → on réécrit une fois, sinon on retire ; message presque identique à un récent → on réécrit.
    if (this.p('controleCredibilite', true) !== false && morceaux.length) {
      if (CR.ticAssistant(morceaux, messageBrut)) {
        this.log('Réponse trop « assistant » : nouvelle tentative.');
        const m2 = await reecrire(CR.CONSIGNE_TIC);
        morceaux = m2 && !CR.ticAssistant(m2, messageBrut) ? m2 : CR.retirerTics(morceaux, messageBrut);
      } else if (CR.repetition(morceaux, CR.derniersMessagesElle(hist))) {
        this.log('Réponse presque identique à un message récent : nouvelle tentative.');
        const m2 = await reecrire(CR.CONSIGNE_REPETITION);
        if (m2 && !CR.repetition(m2, CR.derniersMessagesElle(hist))) morceaux = m2;
      }
    }

    // L'IA n'a mis qu'une réaction alors qu'une question était prévue : elle écrit quand même un message.
    if (!morceaux.length && emoji && question && !/\[RIEN\]/i.test(cite.texte)) {
      this.log('Réaction seule alors qu\'une question était prévue : elle écrit aussi un message.');
      morceaux = (await reecrire('Tu avais seulement mis une réaction. Écris en plus un vrai message court qui réagit à ce qu\'il a dit, puis pose la question demandée.')) || morceaux;
    }
    // Aucune question n'était prévue mais l'IA en a posé une : on la retire (ou on réécrit) pour éviter l'effet questionnaire.
    if (question === false && morceaux.length && Q.finitParQuestion(morceaux[morceaux.length - 1]) && !CX.estPrecision(morceaux[morceaux.length - 1])) {
      const dernierMsg = morceaux[morceaux.length - 1];
      const sans = Q.retirerQuestionFinale(dernierMsg);
      if (sans) {
        morceaux[morceaux.length - 1] = sans;
      } else if (morceaux.length > 1) {
        morceaux = morceaux.slice(0, -1);
      } else {
        const m2 = await reecrire('Cette fois, ne pose AUCUNE question (pas de point d\'interrogation) : réagis seulement, avec une remarque, une blague, une émotion ou un petit truc sur toi.');
        if (m2 && !Q.finitParQuestion(m2[m2.length - 1])) morceaux = m2;
      }
    }

    // Rythme du moment (message très court, deux bulles hésitantes, petit silence) : la forme est garantie par le programme.
    const decTension = (this.decisionsTension && this.decisionsTension[numero]) || {};
    if (decTension.rythme && morceaux.length) morceaux = T.appliquerRythme(morceaux, decTension.rythme.nom);
    const decIntimite = (this.decisionsIntimite && this.decisionsIntimite[numero]) || null;
    if (decIntimite && morceaux.length) morceaux = this.sans(() => IN.appliquerForme(morceaux, decIntimite, messageBrut)) || morceaux;

    if (tenue.tenue && morceaux.length && PR.marquerTenues(e.promesses, Date.now())) { this.sauverEtat(); this.log('Elle a tenu sa promesse en répondant.'); }

    // Une nouveauté de sa vie figurait dans le prompt : après 2 réponses, on considère qu'elle l'a racontée.
    if (this.p('evenementsVie', true) !== false && !(hs && hs.actif) && V.marquerExposees(this.vieEtat(), Date.now())) this.sauverEtat();

    const contenuHistorique = morceaux.length ? morceaux.join('\n\n') : emoji ? `[REACT:${emoji}]` : '[RIEN]';
    let h = [
      ...hist,
      { role: 'user', content: messageUtilisateur, t: Date.now() - Math.round(retardMin * 60000) },
      { role: 'model', content: contenuHistorique, t: Date.now() },
    ].slice(-Math.max(2, Number(this.p('memoire', 100))));
    h = borneHistorique(h, Number(this.p('memoireCaracteres', 24000)));
    while (h.length && h[0].role !== 'user') h.shift();
    this.historiques[numero] = h;
    this.sauverHistorique();
    e.dernierBot = Date.now();
    this.sauverEtat();

    // 3. Réaction par emoji (comme un humain qui met un ❤️ sur un message).
    if (emoji && dernier) {
      await this.pause(H.alea(800, 3500));
      await this.reagir(dernier, emoji);
    }

    // 4. Conversation terminée : on lit, on ne répond pas, on s'en va.
    if (!morceaux.length) {
      if (!emoji) this.log('Pas de réponse nécessaire (la discussion est terminée).');
      await this.quitterDiscussion(chat, numero);
      this.majMemoire(numero, S.annonceProbable(messageBrut)).catch(() => {});
      return;
    }

    // 5. Écriture bulle par bulle. Si elle répond tard ou à plusieurs messages, elle cite parfois le sien.
    const citer =
      this.p('citations', true) !== false && dernier && dernier.id && dernier.id._serialized &&
      ((textes.length > 1 && Math.random() < 0.3) || (retardMin > 10 && Math.random() < 0.35));
    const citerId = choisi ? choisi.id : citer ? dernier.id._serialized : null;
    let citerFinal = null;
    if (citerId) {
      if (!choisi) this.log('Elle répond en citant son dernier message.');
      citerFinal = await this.preparerCitation(destinataire, citerId);
    }
    if (decTension.rythme && decTension.rythme.pauseMs) {
      this.log(`Elle te fait patienter ${Math.round(decTension.rythme.pauseMs / 1000)} s avant de répondre.`);
      await this.pause(decTension.rythme.pauseMs);
    }
    await this.envoyerBulles(chat, destinataire, morceaux, { citerId: citerFinal, emballee });
    this.noterPromesses(numero, morceaux); // « je te raconte ça ce soir » : elle s'en souviendra
    this.panneRacontee(); // si elle sortait d'une panne, c'est dit
    this.suitesApresEnvoi(numero, morceaux, true);
    this.tensionApresReponse(numero, morceaux, messageBrut);
    this.intimiteApresReponse(numero, morceaux, messageBrut);

    // 6. On quitte la discussion, puis on met à jour la mémoire en arrière-plan.
    await this.quitterDiscussion(chat, numero);
    this.majMemoire(numero, S.annonceProbable(messageBrut)).catch(() => {});
  }

  // L'IA n'a pas répondu (panne, quota…) : on garde le message et on réessaie, jusqu'à 3 fois (1, 2 puis 3 min).
  reessayerPlusTard(p, numero, textes, dernier, premier) {
    p.essais = (p.essais || 0) + 1;
    if (p.essais > 3) {
      p.essais = 0;
      this.log('Trois essais ratés : ce message est abandonné (vérifie la clé API, le quota ou la connexion).');
      return;
    }
    const nouveaux = p.textes; // messages arrivés pendant l'appel
    p.textes = [...textes, ...nouveaux];
    p.premier = premier;
    p.dernier = nouveaux.length ? p.dernier : dernier;
    p.dejaVu = true;
    if (nouveaux.length) { p.actif = true; return; } // la file replanifie à la fin
    const minutes = p.essais;
    this.log(`Nouvel essai dans ${minutes} min (essai ${p.essais}/3).`);
    p.reporte = true;
    p.prevu = Date.now() + minutes * 60000;
    this.etat.attente[numero] = { textes: p.textes, prevu: p.prevu, premier: p.premier, id: p.id, vu: true };
    this.sauverEtat();
    clearTimeout(p.timer);
    p.timer = setTimeout(() => this.lancer(numero), Math.max(0, (p.prevu - Date.now()) * this.echelle()));
  }

  // « Vu » sans réponse : elle ouvre la discussion (coches bleues), lit, repart, puis répond plus tard.
  async laisserEnVu(p, numero, textes, dernier, premier, chat, minutes, texte) {
    this.log(`Message lu mais sans réponse pour l'instant : elle répondra dans ~${H.formatDuree(minutes * 60)}.`);
    await this.pause(H.alea(500, 2500));
    await this.ouvrirDiscussion(chat, p.id || (await this.resoudreId(numero)));
    await this.pause(dureeLecture(texte, this.p('msLecture', 40)));
    await this.quitterDiscussion(chat, numero); // p.textes est encore vide : elle repasse bien hors ligne
    const nouveaux = p.textes; // messages arrivés pendant ce temps
    p.textes = [...textes, ...nouveaux];
    p.premier = premier;
    p.dernier = nouveaux.length ? p.dernier : dernier;
    p.dejaVu = true;
    if (nouveaux.length) { p.actif = true; return; } // il a relancé : elle répond vite (planification faite à la fin de la file)
    p.reporte = true;
    p.prevu = Date.now() + minutes * 60000;
    this.etat.attente[numero] = { textes: p.textes, prevu: p.prevu, premier: p.premier, id: p.id, vu: true };
    this.sauverEtat();
    clearTimeout(p.timer);
    p.timer = setTimeout(() => this.lancer(numero), Math.max(0, (p.prevu - Date.now()) * this.echelle()));
  }

  // ----- Vie de fond : messages spontanés et présence aléatoire -----

  async tick() {
    if (!this.client) return;
    this.majVie();
    this.journalPeriodique();
    await this.tickInitiative();
    await this.presenceAleatoire();
  }

  async tickInitiative() {
    if (this.p('initiativeActive', true) === false || this.initEnCours || !this.numeros) return;
    const maintenant = new Date();
    const vie = this.vie(maintenant);
    try { if (await this.tickPannes()) return; } catch (err) { this.log('Pannes ignorées : ' + err.message); }
    if (vie.dort) {
      // Couchée mais pas endormie : une insomnie lui fait parfois écrire la première.
      try {
        if (!this.indisponible()) for (const numero of this.numeros) { if (await this.tickIntimite(numero, true)) break; }
      } catch (err) { this.log('Intimité ignorée : ' + err.message); }
      return;
    }
    if (this.indisponible()) return; // panne ou petite absence : elle n'écrit pas la première
    const hs = V.humeurSpeciale(maintenant, this.config);
    if (hs && hs.actif) return; // pas d'humeur : elle n'écrit pas la première
    const j = H.jourDeVie(maintenant, this.config);
    const ecartMs = Math.max(0, Number(this.p('initiativeEcartMin', 75))) * 60000;
    const proba = this.p('initiativeMode', 'probabiliste') !== 'plan'; // 'plan' = l'ancien système (heures tirées le matin)

    for (const numero of this.numeros) {
      const e = this.etatNum(numero);
      if (!proba && (!e.plan || e.plan.cle !== j.cle)) {
        e.plan = { cle: j.cle, items: H.planDuJour(maintenant, this.config) };
        // Plan créé en cours de journée (démarrage de l'appli) : on ne rattrape pas ce qui est déjà passé.
        e.plan.items.forEach((i) => { if (i.at < j.m - 20) i.fait = true; });
        this.sauverEtat();
        this.log(`Plan du jour : ${e.plan.items.map((i) => `${String(Math.floor((i.at % 1440) / 60)).padStart(2, '0')}h${String(i.at % 60).padStart(2, '0')} ${i.type}`).join(', ') || 'aucun message spontané'}.`);
      }
      if (await this.tickSuites(numero)) break; // réconciliation après une bouderie, mot doux du lendemain
      if (this.boude(numero)) continue; // en pleine bouderie : elle n'écrit pas la première
      if (await this.tickPromesses(numero)) break; // elle tient sa promesse (ou s'excuse de l'avoir oubliée)
      if (await this.tickTension(numero)) break; // fil de tension : allusion, attente, relâche
      if (await this.tickIntimite(numero, false)) break; // scénario imaginé à deux qui revient
      if (await this.tickSpeciaux(numero, hs, proba)) break; // retour d'humeur ou nouvelle de sa vie
      if (await this.tickAbsence(numero)) break; // il lui manque : elle lui écrit
      if (proba) {
        if (await this.tickProbabiliste(numero, maintenant)) break; // envie d'écrire, recalculée à chaque passage
        continue;
      }
      const item = e.plan.items.find((i) => !i.fait && i.at <= j.m);
      if (!item) continue;

      const p = this.pending[numero];
      if (p && (p.enCours || p.textes.length)) continue; // elle a quelque chose à répondre d'abord
      const t = Date.now();
      if (t - (e.dernierUser || 0) < 10 * 60000) continue; // ils sont en pleine discussion

      // Trop en retard : on laisse tomber (sauf bonne nuit, tant qu'elle ne dort pas).
      if (j.m - item.at > 180 && item.type !== 'bonne_nuit') { item.fait = true; this.sauverEtat(); continue; }
      if (this.sansReponseEff(e) >= this.insistance()) { item.fait = true; this.sauverEtat(); continue; } // il ne répond pas : elle n'insiste pas
      const debutJour = t - (j.m - j.reveil) * 60000;
      if (item.type === 'bonjour' && Math.max(e.dernierUser || 0, e.dernierBot || 0) >= debutJour) { item.fait = true; this.sauverEtat(); continue; }
      const recents = (this.historiques[numero] || []).slice(-3).map((x) => x.content).join(' ');
      if (item.type === 'bonne_nuit' && /bonne nuit/i.test(recents) && t - Math.max(e.dernierUser || 0, e.dernierBot || 0) < 90 * 60000) {
        item.fait = true; this.sauverEtat(); continue;
      }
      const ecart = Math.max(ecartMs, e.sansReponse > 0 ? 180 * 60000 : 0);
      if (t - Math.max(e.dernierUser || 0, e.dernierBot || 0) < ecart && item.type !== 'bonjour' && item.type !== 'bonne_nuit') {
        item.at = j.m + H.entre(15, 45); // trop tôt après le dernier échange : on repousse
        this.sauverEtat();
        continue;
      }

      item.fait = true;
      this.sauverEtat();
      this.initEnCours = true;
      try {
        await this.envoyerInitiative(numero, item);
      } catch (err) {
        this.log(`Message spontané impossible : ${err.message}`);
      } finally {
        this.initEnCours = false;
      }
      break; // un seul message spontané par passage
    }
  }

  // Messages spontanés « de vie » : un petit mot de retour après un jour sans envie, ou une nouvelle de sa vie
  // (« j'ai eu mon exam ! »). Mêmes garde-fous que les autres : pas en pleine discussion, pas d'insistance.
  async tickSpeciaux(numero, hs, proba = false) {
    const e = this.etatNum(numero);
    const p = this.pending[numero];
    if (p && (p.enCours || p.textes.length)) return false;
    const t = Date.now();
    if (t - (e.dernierUser || 0) < 10 * 60000) return false;
    const fete = (hs && hs.retour && e.retourCle !== hs.cle) ? null : this.itemCalendrier(numero);
    if (this.sansReponseEff(e) >= this.insistance() && !(fete && fete.priorite)) return false; // il ne répond pas : elle n'insiste pas (sauf son anniversaire)
    let item = null;
    if (hs && hs.retour && e.retourCle !== hs.cle) {
      item = { type: 'retour', consigneTexte: V.CONSIGNES.retour(hs.type), marquer: () => { e.retourCle = hs.cle; } };
    } else if (fete) {
      item = fete;
    } else if (t - Math.max(e.dernierUser || 0, e.dernierBot || 0) >= 20 * 60000) {
      item = this.itemRappel(numero);
      if (!item && !proba && this.p('evenementsVie', true) !== false) {
        const n = V.prochaineNouvelle(this.vieEtat(), t);
        if (n) item = { type: 'evenement', consigneTexte: V.consigneEvenement(n.ev, n.phase), marquer: () => { n.phase.dit = true; } };
      }
    }
    if (!item) return false;
    item.marquer();
    this.sauverEtat();
    this.initEnCours = true;
    try {
      await this.envoyerInitiative(numero, item);
    } catch (err) {
      this.log(`Message spontané impossible : ${err.message}`);
    } finally {
      this.initEnCours = false;
    }
    return true;
  }

  // Envoi d'un message spontané avec les garde-fous habituels (un seul à la fois, erreurs journalisées).
  async envoyerGarde(numero, item) {
    this.initEnCours = true;
    try {
      await this.envoyerInitiative(numero, item);
      return true;
    } catch (err) {
      this.log(`Message spontané impossible : ${err.message}`);
      return false;
    } finally {
      this.initEnCours = false;
    }
  }

  // Elle a promis quelque chose (« je te raconte ça ce soir ») : le moment venu, elle le fait ; en retard, elle s'excuse.
  async tickPromesses(numero) {
    if (this.p('promessesActives', true) === false) return false;
    const e = this.etatNum(numero);
    const p = this.pending[numero];
    if (p && (p.enCours || p.textes.length)) return false;
    const t = Date.now();
    const promesse = PR.due(e.promesses, t);
    if (!promesse) return false;
    const vie = this.vie(new Date(t));
    if (vie.dort || (!promesse.absence && vie.dispo < 0.35)) return false; // pas disponible : elle attendra (et s'excusera du retard)
    if (t - (e.dernierUser || 0) < (promesse.absence ? 2 : 10) * 60000) return false; // en pleine discussion : le bloc « promesses » du prompt s'en charge
    if (this.sansReponseEff(e) >= this.insistance()) return false; // il ne répond pas : elle n'insiste pas
    promesse.fait = true;
    this.sauverEtat();
    const retard = PR.retardMinutes(promesse, t);
    if (promesse.absence) this.log(`Retour de petite absence : « ${promesse.texte} » (${promesse.raison}).`);
    else this.log(`Promesse tenue : « ${promesse.texte} »${retard > PR.RETARD_EXCUSE_MIN || promesse.oubli ? ` (avec ${H.formatDuree(retard * 60)} de retard : elle s'excuse)` : ''}.`);
    await this.envoyerGarde(numero, { type: 'promesse', consigneTexte: PR.consigne(promesse, this.config.prenomMoi || 'lui', t) });
    return true;
  }

  // Mode « probabiliste » : à chaque passage, une probabilité d'écrire selon l'heure, le silence, son humeur et son vécu,
  // avec un plafond par jour (réglage initiativeParJour).
  async tickProbabiliste(numero, maintenant = new Date()) {
    const p = this.pending[numero];
    if (p && (p.enCours || p.textes.length)) return false; // elle a quelque chose à répondre d'abord
    const e = this.etatNum(numero);
    if (Date.now() - (e.dernierUser || 0) < 10 * 60000) return false; // ils sont en pleine discussion
    const ctx = this.contexteSpontane(numero, maintenant);
    const d = SP.decider(ctx, this.config);
    if (!d) return false;
    const moi = this.config.prenomMoi || 'lui';
    let item = { type: d.type };
    if (d.type === 'evenement') {
      const n = V.prochaineNouvelle(this.vieEtat(), Date.now());
      if (!n) return false;
      item = { type: 'evenement', consigneTexte: V.consigneEvenement(n.ev, n.phase), marquer: () => { n.phase.dit = true; } };
    } else if (d.type === 'envie') {
      item = { type: 'envie', consigneTexte: `Il est tard, tu es dans ta chambre, le téléphone à la main, et tu penses à ${moi} : aujourd'hui ton corps te le rappelle, tu as envie de lui. Écris-lui un message court, tout bas, très sensuel et séducteur (un aveu de désir, une confidence murmurée, une provocation qui trouble, ce que tu ressens dans ton corps, ce que tu voudrais qu'il te fasse comme câlins et baisers), avec des mots chauds mais suggérés, sans vocabulaire cru et sans enchaîner les questions. Si ça ne te ressemble pas ce soir, réponds [RIEN].`, marquer: () => { e.envieCle = ctx.cle; } };
    } else if (d.type === 'soutien') {
      item = { type: 'soutien', marquer: () => { e.soutienCle = ctx.cle; } };
    } else if (d.type === 'reconciliation') {
      item = { type: 'reconciliation', marquer: () => { e.reconcilieCle = ctx.cle; const st = this.emotionsNum(numero); st.e.blessure *= 0.6; st.e.irritation *= 0.6; } };
    } else if (d.type === 'vecu') {
      item = { type: 'vecu', consigneTexte: `Tu as envie d'en parler à ${moi} : ${ctx.vecu.sujet} Dis-le naturellement, en 1 ou 2 phrases, sans réciter.`, marquer: () => { e.vecuDit = { cle: ctx.cle, sujet: ctx.vecu.sujet }; } };
    }
    this.log(`Envie d'écrire : ${d.type} (probabilité ${(d.p * 100).toFixed(1)} % par minute, fatigue ${Math.round(ctx.fatigue * 100)} %, ${ctx.nbAujourdhui} message(s) aujourd'hui).`);
    if (item.marquer) item.marquer();
    const libre = !SP.HORS_PLAFOND.includes(d.type); // un bonjour ou une bonne nuit ne comptent pas dans le plafond
    const avant = e.spont && e.spont.cle === ctx.cle ? e.spont : {};
    e.spont = {
      cle: ctx.cle, n: ctx.nbAujourdhui + (libre ? 1 : 0), nuit: !!avant.nuit || d.type === 'bonne_nuit',
      types: libre ? [...(ctx.derniersTypes || []), d.type].slice(-3) : ctx.derniersTypes || [],
    };
    this.sauverEtat();
    await this.envoyerGarde(numero, item);
    return true;
  }

  // Un vœu à envoyer aujourd'hui (anniversaire, Aïd, Yennayer, début du Ramadan…), à une heure tirée une fois par jour.
  itemCalendrier(numero, maintenant = new Date()) {
    if (this.p('calendrierActif', true) === false) return null;
    const e = this.etatNum(numero);
    const j = H.jourDeVie(maintenant, this.config);
    const cleCal = this.cleDuJour(maintenant);
    if (j.cle !== cleCal) return null; // encore dans la journée d'hier (avant le réveil)
    const dits = e.voeux || (e.voeux = {});
    const cles = Object.keys(dits);
    if (cles.length > 30) cles.sort().slice(0, cles.length - 30).forEach((k) => delete dits[k]);
    for (const s of C.joursSpeciaux(maintenant, this.config)) {
      if (!s.voeux || !C.CONSIGNES_VOEUX[s.code]) continue;
      const cle = `${cleCal}:${s.code}`;
      if (dits[cle]) continue;
      const r = H.graine('voeux' + cle);
      const at = j.reveil + (s.code === 'anniv_moi' ? Math.round(5 + r() * 35) : Math.round(20 + r() * 100));
      if (j.m < at) continue;
      if (j.m - at > 600) { dits[cle] = true; continue; } // application lancée très tard : on laisse tomber
      return {
        type: 'fete', priorite: s.code === 'anniv_moi', longue: s.code === 'anniv_moi',
        consigneTexte: C.CONSIGNES_VOEUX[s.code], marquer: () => { dits[cle] = true; },
      };
    }
    return null;
  }

  // Ce qu'il lui a annoncé (examen, entretien, voyage…) : un mot d'encouragement le jour J, puis des nouvelles.
  itemRappel(numero, maintenant = new Date()) {
    if (this.p('rappelsSuivi', true) === false) return null;
    const m = this.memoires[numero];
    if (!m || !m.rappels || !m.rappels.length) return null;
    const j = H.jourDeVie(maintenant, this.config);
    const cle = this.cleDuJour(maintenant);
    if (j.cle !== cle) return null;
    for (const due of S.rappelsDus(m.rappels, cle)) {
      const r = H.graine('rappel' + due.rappel.date + due.rappel.texte + due.type);
      const at = j.reveil + (due.type === 'jour' ? Math.round(60 + r() * 120) : Math.round(120 + r() * 300));
      if (j.m < at) continue;
      return {
        type: 'rappel', consigneTexte: S.consigneRappel(due, this.config.prenomMoi || 'lui'),
        marquer: () => { if (due.type === 'jour') due.rappel.encourage = true; else due.rappel.suivi = true; this.sauverMemoire(); },
      };
    }
    return null;
  }

  async envoyerInitiative(numero, item) {
    const e = this.etatNum(numero);
    const destinataire = e.id || (await this.resoudreId(numero));
    const chat = await this.obtenirChat(destinataire);
    const hist = this.historiques[numero] || [];
    const moi = this.config.prenomMoi || 'lui';
    if (item.type === 'souvenir') {
      const mem = this.memoires[numero];
      const ep = mem && M.episodePourSouvenir(mem.episodes, this.cleDuJour());
      if (!ep) { this.log('Message spontané (souvenir) : aucun souvenir à rappeler pour le moment.'); return; }
      ep.repris = Date.now();
      this.sauverMemoire();
      item = { ...item, consigneTexte: `Tu repenses à un moment de vos discussions (${M.libelleAge(M.ageEnJours(ep.date, this.cleDuJour()))}) : « ${ep.texte} ». Reviens dessus naturellement, comme quelqu'un qui y repense (prendre des nouvelles, une petite taquinerie, un « alors, ça s'est arrangé ? »). Une seule idée, sans réciter.` };
    }
    const nuance = this.p('vecuActif', true) !== false ? this.sans(() => SP.nuance(this.contexteSpontane(numero))) : '';
    const consigne = `[Consigne interne, invisible pour ${moi} : ${item.consigneTexte || H.CONSIGNES[item.type] || H.CONSIGNES.pensee}${nuance ? ' ' + nuance : ''} Écris uniquement le message à envoyer, très court. Si rien de naturel ne te vient, réponds [RIEN].]`;
    const texte = await this.appelerIA(this.construirePrompt(numero, { initiative: item.type, longue: !!item.longue }), [
      ...hist,
      { role: 'user', content: consigne },
    ]);
    let morceaux = this.preparerReponse(H.extraireReaction(PR.extraireTenue(texte).texte).texte, { longue: !!item.longue });
    if (item.type === 'insomnie' && morceaux.length) morceaux = IN.appliquerNuit(morceaux);
    if (!morceaux.length) { this.log(`Message spontané (${item.type}) : rien à dire pour le moment.`); return; }

    this.log(`Message spontané (${item.type}).`);
    await this.ouvrirDiscussion(chat, destinataire);
    await this.envoyerBulles(chat, destinataire, morceaux);

    const h = borneHistorique([...hist, { role: 'model', content: morceaux.join('\n\n'), t: Date.now() }]
      .slice(-Math.max(2, Number(this.p('memoire', 100)))), Number(this.p('memoireCaracteres', 24000)));
    this.historiques[numero] = h;
    this.sauverHistorique();
    e.dernierBot = Date.now();
    e.sansReponse = (e.sansReponse || 0) + 1;
    this.sauverEtat();
    this.noterPromesses(numero, morceaux, { sansAbsence: !!item.sansAbsence }); // elle a pu promettre autre chose dans ce message
    this.suitesApresEnvoi(numero, morceaux, false);
    if (item.type === 'insomnie' || item.type === 'scenario') this.intimiteApresEnvoi(numero, morceaux, item);
    await this.quitterDiscussion(chat, numero);
  }

  // De temps en temps, elle ouvre WhatsApp « pour rien » : le statut « en ligne » apparaît un instant.
  async presenceAleatoire() {
    if (this.p('presenceAleatoire', true) === false || this.p('passerHorsLigne', true) === false) return;
    if (this.enLigneAleatoire || this.initEnCours || this.indisponible()) return;
    const vie = this.vie();
    if (vie.dort) return;
    if (Object.values(this.pending).some((x) => x.enCours || x.textes.length)) return;
    if (Math.random() > 1 / (vie.dispo > 0.6 ? 25 : 60)) return;
    this.enLigneAleatoire = true;
    try {
      await avecDelai(this.client.sendPresenceAvailable(), 5000, 'Présence');
      await this.pause(H.alea(15000, 90000));
    } catch (e) {
    } finally {
      const occupe = Object.values(this.pending).some((x) => x.enCours || x.textes.length);
      if (!occupe) { try { await avecDelai(this.client.sendPresenceUnavailable(), 5000, 'Présence'); } catch (e) {} }
      this.enLigneAleatoire = false;
    }
  }
}

module.exports = { Bot, listerModeles, MODELE_PAR_DEFAUT, PAGE_ETAT_ECRITURE, PAGE_REACTION, PAGE_CITATION_VERIF, PAGE_CITATION_ENVOI, lancerDansPage, normaliserEmoji };
