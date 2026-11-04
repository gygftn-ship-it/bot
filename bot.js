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
const { fusionnerRoles, appelerAnthropic, appelerOpenAI, MODELES_DEFAUT } = require('./fournisseurs');

const API = 'https://generativelanguage.googleapis.com/v1beta';
// Sur le palier gratuit, la version « lite » autorise bien plus de messages par jour.
const MODELE_PAR_DEFAUT = 'gemini-3.5-flash-lite';
const MODELES_SECOURS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-3.6-flash'];

// Temps d'attente conseillé par Google après une erreur de limite (en secondes), s'il y en a un.
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
  if (process.platform !== 'win32') return Promise.resolve();
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
  // Les versions récentes de WhatsApp Web veulent un vrai objet identifiant (avec toJid), pas un texte.
  const candidats = [];
  try { const c = W.Store && W.Store.Chat && W.Store.Chat.get && W.Store.Chat.get(chatId); if (c && c.id) candidats.push(c.id); } catch (e) {}
  try { if (W.Store && W.Store.WidFactory && W.Store.WidFactory.createWid) candidats.push(W.Store.WidFactory.createWid(chatId)); } catch (e) {}
  try { const wf = req('WAWebWidFactory'); if (wf && wf.createWid) candidats.push(wf.createWid(chatId)); } catch (e) {}
  try { const wf = req('WAWebWidFactory'); if (wf && wf.createUserWid) candidats.push(wf.createUserWid(String(chatId).split('@')[0], 'c.us')); } catch (e) {}
  const wid = candidats.find((x) => x && typeof x.toJid === 'function') || candidats.find((x) => x && typeof x === 'object') || chatId;
  const modules = [
    ['Store.ChatState', W.Store && W.Store.ChatState],
    ['WAWebChatStateBridge', req('WAWebChatStateBridge')],
    ['WAWebChatStateAction', req('WAWebChatStateAction')],
    ['WAWebSendChatStateAction', req('WAWebSendChatStateAction')],
  ];
  for (const [libelle, mod] of modules) {
    if (mod && typeof mod[nom] === 'function') {
      if (etat !== 'test') await mod[nom](wid);
      return libelle + '.' + nom;
    }
  }
  throw new Error('fonction ' + nom + ' introuvable dans cette version de WhatsApp Web');
};

// ---------- Réactions emoji ----------

// Exécutée DANS la page WhatsApp Web. message.react() de whatsapp-web.js ne signale jamais d'échec
// (si le message n'est pas retrouvé en mémoire ou si la fonction a changé de nom, il ne fait rien et ne dit rien).
// Celle-ci retrouve le message par plusieurs chemins, attend l'envoi, et lève une erreur claire sinon.
// idMessage = '' avec emoji = 'test' : vérifie seulement que la fonction d'envoi existe.
const PAGE_REACTION = async (idMessage, emoji) => {
  const W = window;
  const req = (n) => { try { return W.require(n); } catch (e) { return null; } };
  const modules = [
    ['Store.sendReactionToMsg', W.Store && W.Store.sendReactionToMsg ? { sendReactionToMsg: W.Store.sendReactionToMsg } : null],
    ['WAWebSendReactionMsgAction', req('WAWebSendReactionMsgAction')],
    ['WAWebReactionsSendAction', req('WAWebReactionsSendAction')],
    ['WAWebSendReactionAction', req('WAWebSendReactionAction')],
  ];
  const trouve = modules.find(([, mod]) => mod && typeof mod.sendReactionToMsg === 'function');
  if (!trouve) throw new Error('fonction sendReactionToMsg introuvable dans cette version de WhatsApp Web');
  if (emoji === 'test') return trouve[0];

  let msg = null;
  try { msg = W.Store && W.Store.Msg && W.Store.Msg.get && W.Store.Msg.get(idMessage); } catch (e) {}
  if (!msg) {
    try {
      const r = W.Store && W.Store.Msg && W.Store.Msg.getMessagesById ? await W.Store.Msg.getMessagesById([idMessage]) : null;
      msg = r && r.messages && r.messages[0];
    } catch (e) {}
  }
  if (!msg) {
    try { const col = req('WAWebCollections'); msg = col && col.Msg && col.Msg.get && col.Msg.get(idMessage); } catch (e) {}
  }
  if (!msg) throw new Error('message introuvable dans WhatsApp Web (' + idMessage + ')');
  await trouve[1].sendReactionToMsg(msg, emoji);
  return trouve[0];
};

// Les emojis « texte » (❤, ☺…) doivent porter le sélecteur de variante pour s'afficher comme réaction.
function normaliserEmoji(e) {
  const t = String(e || '').trim();
  const signes = [...t];
  if (signes.length === 1 && t.codePointAt(0) < 0x10000 && !/\uFE0F/.test(t)) return t + '\uFE0F';
  return t;
}

// ---------- Le bot ----------

const MEDIAS_PRIS_EN_CHARGE = ['chat', 'ptt', 'audio', 'image', 'sticker', 'video', 'location'];

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
    try { return JSON.parse(fs.readFileSync(fichier, 'utf8')); } catch (e) { return defaut; }
  }

  ecrireJson(fichier, objet) {
    try {
      fs.mkdirSync(this.dossier, { recursive: true });
      fs.writeFileSync(fichier, JSON.stringify(objet, null, 2));
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
    const QRCode = require('qrcode');

    this.client = new Client({
      authStrategy: new NoAuth(), // la session WhatsApp est gardée dans le profil du navigateur
      puppeteer: { browserWSEndpoint: ws },
    });
    const client = this.client;

    client.on('qr', async (qr) => {
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
    this.reprendreAttentes();
    this.majVie();
    clearInterval(this.vieDeFond);
    this.vieDeFond = setInterval(() => {
      this.tick().catch((e) => this.log('Erreur (vie de fond) : ' + e.message));
    }, 60000);
    const v = this.vie();
    this.log(`Rythme de vie : ${v.libelle} (humeur : ${H.humeur(new Date(), this.config)}).`);
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
    const memoire = faits ? `=== MÉMOIRE (ce que tu sais vraiment de ${c.prenomMoi || 'lui'}) ===\n${faits}` : '';
    const rappels = numero && this.p('rappelsSuivi', true) !== false && this.memoires[numero] ? S.blocRappels(this.memoires[numero].rappels, this.cleDuJour()) : '';
    const repetitions = numero && this.p('antiRepetition', true) !== false ? S.blocRepetitions(this.historiques[numero], { ignorerQuestions: !!extra.question }) : '';
    return [base, bloc, memoire, rappels, this.blocSituation(numero, extra), this.blocVie(), this.blocCalendrier(), this.blocPeriode(), this.blocMonde(), this.blocJournee(), repetitions, this.blocSouvenirs(numero, extra), this.blocElle(numero), this.blocCitations(extra.citables), Q.blocQuestion(extra.question), this.reglesDeForme(extra)].filter(Boolean).join('\n\n');
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
  blocElle(numero) {
    if (!numero || this.p('memoireLongue', true) === false) return '';
    const m = this.memoires[numero];
    return m && m.elle ? M.blocElle(m.elle, this.cleDuJour()) : '';
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
      '- Écris à l\'oral : minuscules acceptées, abréviations (mdr, jsp, tkt), emojis avec parcimonie, ponctuation légère.',
      '- Réponds dans la langue de ton interlocuteur.',
      '- Les messages commençant par [vocal] sont des notes vocales dont tu as entendu le contenu ; [photo] des images que tu as vues ; [sticker], [vidéo] et [position partagée] aussi. Réagis-y comme si tu les avais vraiment reçus, sans parler de "transcription" ni de "description".',
      reactions
        ? '- Tu peux réagir à son message avec un emoji, sans écrire (ou en plus d\'un texte) : écris [REACT:❤️] (ou un autre emoji). Utile pour un "ok", un "merci", une photo, un "je t\'aime".'
        : '',
      '- Si le dernier message n\'appelle aucune réponse (simple "ok", "d\'accord", un emoji de fin, un au revoir déjà échangé, conversation terminée), réponds exactement : [RIEN]',
      '- S\'il te dit sérieusement qu\'il va mal (désespoir, idées noires, danger pour lui), tu laisses les blagues de côté : tu l\'écoutes avec douceur, tu ne minimises rien, et tu l\'encourages à en parler à un proche ou à un professionnel.',
      '- Si on te demande sérieusement si tu es une IA, ne le nie pas.',
      'Exemples de longueur (le fond est libre, seule la taille compte) :',
      '"t\'as fait quoi aujourd\'hui ?" -> "cours toute la journée 😮‍💨 et toi ?"',
      '"j\'ai passé une journée de fou" -> "raconte !!"',
      '"tu me manques" -> "toi aussi ❤️"',
      '"bonne nuit" -> "bonne nuit 🌙"',
      '"ok" (après un au revoir) -> [RIEN]',
    ].filter(Boolean).join('\n');
  }

  // Transforme la réponse de l'IA en 0, 1, 2 ou 3 petites bulles.
  preparerReponse(texte, extra = {}) {
    const brut = String(texte || '');
    if (/\[RIEN\]/i.test(brut) && brut.replace(/\[RIEN\]/gi, '').trim().length < 3) return [];
    const propre = nettoyerTexte(brut.replace(/\[RIEN\]/gi, ''));
    let bulles = Math.max(1, Math.min(3, Math.round(Number(this.p('bullesMax', 2)))));
    let longueur = extra.longueur || this.config.longueurMax;
    if (extra.emballee) { bulles = Math.max(2, bulles); longueur = Math.round((Number(longueur) || 180) * 1.6); }
    if (extra.longue) { bulles = 3; longueur = Math.round(Math.max(Number(longueur) || 180, Number(this.config.longueurMax) || 180) * 1.8); }
    const morceaux = limiterReponse(decouperReponse(propre, bulles), longueur);
    return this.p('langageOral', true) === false ? morceaux : N.humaniser(morceaux);
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
              generationConfig: { maxOutputTokens: 2048, temperature: 1.0 },
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
    const recents = (this.historiques[numero] || []).slice(-24)
      .map((x) => `${x.role === 'user' ? (this.config.prenomMoi || 'Lui') : (this.config.prenomElle || 'Elle')} : ${x.content}`)
      .join('\n');
    const consigne = [
      'Tu tiens le carnet de notes privé d\'une personne sur son/sa partenaire de discussion.',
      'À partir de la mémoire actuelle et des derniers messages, écris la mémoire mise à jour, classée par rubriques (une ligne « Rubrique : » puis des lignes commençant par "- ") parmi : Lui, Famille et proches, Goûts, Travail et études, Projets et rêves, Santé et humeur, Nous deux (anecdotes, promesses, surnoms), Sujets en suspens.',
      '- uniquement des faits durables et réellement dits (goûts, famille, travail/études, projets, dates, événements importants, promesses, ce qui le touche) ;',
      '- GARDE tous les faits encore valables : ne supprime une info que si elle est périmée ou contredite, jamais pour faire de la place (condense plutôt) ;',
      '- n\'invente rien, pas de doublons ;',
      '- 40 lignes maximum au total, une information par ligne ;',
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
      m.faits = faits.slice(0, 4500);
      m.episodes = M.fusionnerEpisodes(m.episodes, sep.episodes, 60);
      m.elle = M.fusionnerEpisodes(m.elle, sepElle.episodes, 30);
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
      case 'video': return `[vidéo]${legende ? ` (légende : ${legende})` : ''}`;
      case 'sticker': return '[sticker]';
      case 'location': return '[position partagée]';
      default: return '';
    }
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

      const texte = await this.texteDuMessage(msg);
      if (!texte) return;

      let chat = null;
      try { chat = await msg.getChat(); } catch (e) { this.logChatIntrouvable(e); }

      const e = this.etatNum(numero);
      const maintenant = Date.now();
      const actif =
        maintenant - (e.dernierUser || 0) < 4 * 60000 || maintenant - (e.dernierBot || 0) < 4 * 60000;
      e.id = msg.from;
      e.dernierUser = maintenant;
      e.sansReponse = 0;
      this.sauverEtat();

      const p = this.pending[numero] || (this.pending[numero] = { textes: [], timer: null, prevu: 0, enCours: false });
      if (!p.textes.length) p.premier = maintenant;
      p.textes.push(texte);
      this.noterReference(numero, msg, texte);
      p.dernier = msg;
      p.id = msg.from;
      if (chat) p.chat = chat;
      if (!p.prevu) p.actif = actif;
      this.log('Message reçu : ' + texte);
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
      const lat = V.latence(vie, this.config, { conversationActive: !!p.actif }, V.humeurSpeciale(new Date(), this.config));
      p.prevu = maintenant + debounce + lat.secondes * 1000;
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
    this.log('Discussion non ouverte (' + resumeErreur(e.message || e) + ') : « écrit… » et accusé de lecture passent par un autre chemin. Si ça persiste, mets à jour whatsapp-web.js.');
  }

  async obtenirChat(id) {
    if (!this.client || !id) return null;
    try { return await avecDelai(this.client.getChatById(id), 10000, 'Ouverture de la discussion'); } catch (e) { this.logChatIntrouvable(e); return null; }
  }

  async envoyer(chat, destinataire, texte, options = {}) {
    const opt = { sendSeen: false }; // contourne un bogue connu de whatsapp-web.js
    if (options.citerId) opt.quotedMessageId = options.citerId;
    if (chat) {
      try {
        await avecDelai(chat.sendMessage(texte, opt), 20000, 'Envoi du message');
        return;
      } catch (e) {
        this.log('Envoi via la discussion impossible (' + e.message + '). Nouvel essai…');
        delete opt.quotedMessageId;
      }
    }
    await avecDelai(this.client.sendMessage(destinataire, texte, opt), 20000, 'Envoi du message');
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
    const e = normaliserEmoji(emoji);
    const raisons = [];
    if (id && this.client && this.client.pupPage) {
      try {
        const chemin = await avecDelai(this.client.pupPage.evaluate(PAGE_REACTION, id, e), 8000, 'Réaction');
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
      const nom = await avecDelai(this.client.pupPage.evaluate(PAGE_REACTION, '', 'test'), 8000, 'Diagnostic réactions');
      this.log(`Réactions emoji : disponibles (${nom}).`);
    } catch (e) {
      this.log(`Réactions emoji : PROBLÈME — ${resumeErreur(e.message)}. Mets à jour whatsapp-web.js (npm update whatsapp-web.js) puis relance.`);
    }
  }

  async diagnostiquerEcriture() {
    if (!this.client || !this.client.pupPage) return;
    try {
      const nom = await avecDelai(this.client.pupPage.evaluate(PAGE_ETAT_ECRITURE, '0@c.us', 'test'), 8000, 'Diagnostic');
      this.log(`Indicateur « écrit… » : disponible (${nom}).`);
    } catch (e) {
      this.log(`Indicateur « écrit… » : PROBLÈME — ${resumeErreur(e.message)}. Mets à jour whatsapp-web.js (npm update whatsapp-web.js) puis relance.`);
    }
  }

  async ouvrirDiscussion(chat, destinataire) {
    try { await avecDelai(this.client.sendPresenceAvailable(), 5000, 'Présence'); } catch (e) {}
    try {
      if (chat) await avecDelai(chat.sendSeen(), 8000, 'Accusé de lecture');
      else if (destinataire && this.client.sendSeen) await avecDelai(this.client.sendSeen(destinataire), 8000, 'Accusé de lecture');
    } catch (e) {
      if (!this.erreurLecture) {
        this.erreurLecture = true;
        this.log('Accusé de lecture impossible : ' + e.message);
      }
    }
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
        conversationActive: !!p.actif, texte: messageUtilisateur, dort: this.vie(maintenant).dort, resteAvantCoucher: j.coucher - j.m,
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
    this.log('Question envoyée à l\'IA…');
    const debut = Date.now();
    const longueur = this.p('longueurMiroir', true) !== false ? S.longueurAdaptee(messageUtilisateur, c.longueurMax) : undefined;
    const curiosite = Number(this.p('curiosite', 45));
    let question;
    if (curiosite > 0) {
      question = Q.choisirQuestion(curiosite, {
        message: messageUtilisateur,
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
    const demande = this.appelerIA(this.construirePrompt(numero, { retardMin, vu: apresVu, emballee, longueur, citables, question, message: messageUtilisateur }), [
      ...hist,
      { role: 'user', content: messageUtilisateur },
    ]).then((texte) => ({ texte }), (erreur) => ({ erreur }));

    // 2. Elle ouvre la discussion (en ligne + message lu), puis lit.
    await this.pause(H.alea(500, 2500));
    await this.ouvrirDiscussion(chat, destinataire);
    await this.pause(dureeLecture(messageUtilisateur, this.p('msLecture', 40)));

    const res = await demande;
    if (res.erreur) {
      this.log('Erreur API : ' + res.erreur.message);
      await this.quitterDiscussion(chat, numero); // p.textes est encore vide : elle repasse bien hors ligne
      this.reessayerPlusTard(p, numero, textes, dernier, premier);
      return;
    }
    p.essais = 0;
    this.log(`L'IA a répondu en ${Math.round((Date.now() - debut) / 1000)} s.`);

    const cite = H.extraireCitation(res.texte);
    const { texte: sansReaction, emoji } = this.p('reactions', true) === false
      ? { texte: cite.texte, emoji: null }
      : H.extraireReaction(cite.texte);
    const choisi = cite.n && cite.n >= 1 && cite.n <= citables.length ? citables[cite.n - 1] : null;
    if (choisi) this.log(`Elle répond à un message précis : « ${choisi.extrait} ».`);
    const morceaux = this.preparerReponse(sansReaction, { emballee, longueur });

    // Une nouveauté de sa vie figurait dans le prompt : après 2 réponses, on considère qu'elle l'a racontée.
    if (this.p('evenementsVie', true) !== false && !(hs && hs.actif) && V.marquerExposees(this.vieEtat(), Date.now())) this.sauverEtat();

    const contenuHistorique = morceaux.length ? morceaux.join('\n\n') : emoji ? `[REACT:${emoji}]` : '[RIEN]';
    let h = [
      ...hist,
      { role: 'user', content: messageUtilisateur, t: Date.now() - Math.round(retardMin * 60000) },
      { role: 'model', content: contenuHistorique, t: Date.now() },
    ].slice(-Math.max(2, Number(this.p('memoire', 60))));
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
      this.majMemoire(numero, S.annonceProbable(messageUtilisateur)).catch(() => {});
      return;
    }

    // 5. Écriture bulle par bulle. Si elle répond tard ou à plusieurs messages, elle cite parfois le sien.
    const citer =
      this.p('citations', true) !== false && dernier && dernier.id && dernier.id._serialized &&
      ((textes.length > 1 && Math.random() < 0.3) || (retardMin > 10 && Math.random() < 0.35));
    const citerId = choisi ? choisi.id : citer ? dernier.id._serialized : null;
    await this.envoyerBulles(chat, destinataire, morceaux, { citerId, emballee });

    // 6. On quitte la discussion, puis on met à jour la mémoire en arrière-plan.
    await this.quitterDiscussion(chat, numero);
    this.majMemoire(numero, S.annonceProbable(messageUtilisateur)).catch(() => {});
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
    await this.tickInitiative();
    await this.presenceAleatoire();
  }

  async tickInitiative() {
    if (this.p('initiativeActive', true) === false || this.initEnCours || !this.numeros) return;
    const maintenant = new Date();
    const vie = this.vie(maintenant);
    if (vie.dort) return;
    const hs = V.humeurSpeciale(maintenant, this.config);
    if (hs && hs.actif) return; // pas d'humeur : elle n'écrit pas la première
    const j = H.jourDeVie(maintenant, this.config);
    const ecartMs = Math.max(0, Number(this.p('initiativeEcartMin', 90))) * 60000;

    for (const numero of this.numeros) {
      const e = this.etatNum(numero);
      if (!e.plan || e.plan.cle !== j.cle) {
        e.plan = { cle: j.cle, items: H.planDuJour(maintenant, this.config) };
        // Plan créé en cours de journée (démarrage de l'appli) : on ne rattrape pas ce qui est déjà passé.
        e.plan.items.forEach((i) => { if (i.at < j.m - 20) i.fait = true; });
        this.sauverEtat();
        this.log(`Plan du jour : ${e.plan.items.map((i) => `${String(Math.floor((i.at % 1440) / 60)).padStart(2, '0')}h${String(i.at % 60).padStart(2, '0')} ${i.type}`).join(', ') || 'aucun message spontané'}.`);
      }
      if (await this.tickSpeciaux(numero, hs)) break; // retour d'humeur ou nouvelle de sa vie
      const item = e.plan.items.find((i) => !i.fait && i.at <= j.m);
      if (!item) continue;

      const p = this.pending[numero];
      if (p && (p.enCours || p.textes.length)) continue; // elle a quelque chose à répondre d'abord
      const t = Date.now();
      if (t - (e.dernierUser || 0) < 10 * 60000) continue; // ils sont en pleine discussion

      // Trop en retard : on laisse tomber (sauf bonne nuit, tant qu'elle ne dort pas).
      if (j.m - item.at > 180 && item.type !== 'bonne_nuit') { item.fait = true; this.sauverEtat(); continue; }
      if (e.sansReponse >= 2) { item.fait = true; this.sauverEtat(); continue; } // il ne répond pas : elle n'insiste pas
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
  async tickSpeciaux(numero, hs) {
    const e = this.etatNum(numero);
    const p = this.pending[numero];
    if (p && (p.enCours || p.textes.length)) return false;
    const t = Date.now();
    if (t - (e.dernierUser || 0) < 10 * 60000) return false;
    const fete = (hs && hs.retour && e.retourCle !== hs.cle) ? null : this.itemCalendrier(numero);
    if ((e.sansReponse || 0) >= 2 && !(fete && fete.priorite)) return false; // il ne répond pas : elle n'insiste pas (sauf son anniversaire)
    let item = null;
    if (hs && hs.retour && e.retourCle !== hs.cle) {
      item = { type: 'retour', consigneTexte: V.CONSIGNES.retour(hs.type), marquer: () => { e.retourCle = hs.cle; } };
    } else if (fete) {
      item = fete;
    } else if (t - Math.max(e.dernierUser || 0, e.dernierBot || 0) >= 20 * 60000) {
      item = this.itemRappel(numero);
      if (!item && this.p('evenementsVie', true) !== false) {
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
    const consigne = `[Consigne interne, invisible pour ${moi} : ${item.consigneTexte || H.CONSIGNES[item.type] || H.CONSIGNES.pensee} Écris uniquement le message à envoyer, très court. Si rien de naturel ne te vient, réponds [RIEN].]`;
    const texte = await this.appelerIA(this.construirePrompt(numero, { initiative: item.type, longue: !!item.longue }), [
      ...hist,
      { role: 'user', content: consigne },
    ]);
    const morceaux = this.preparerReponse(H.extraireReaction(texte).texte, { longue: !!item.longue });
    if (!morceaux.length) { this.log(`Message spontané (${item.type}) : rien à dire pour le moment.`); return; }

    this.log(`Message spontané (${item.type}).`);
    await this.ouvrirDiscussion(chat, destinataire);
    await this.envoyerBulles(chat, destinataire, morceaux);

    const h = [...hist, { role: 'model', content: morceaux.join('\n\n'), t: Date.now() }]
      .slice(-Math.max(2, Number(this.p('memoire', 60))));
    this.historiques[numero] = h;
    this.sauverHistorique();
    e.dernierBot = Date.now();
    e.sansReponse = (e.sansReponse || 0) + 1;
    this.sauverEtat();
    await this.quitterDiscussion(chat, numero);
  }

  // De temps en temps, elle ouvre WhatsApp « pour rien » : le statut « en ligne » apparaît un instant.
  async presenceAleatoire() {
    if (this.p('presenceAleatoire', true) === false || this.p('passerHorsLigne', true) === false) return;
    if (this.enLigneAleatoire || this.initEnCours) return;
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

module.exports = { Bot, listerModeles, MODELE_PAR_DEFAUT, PAGE_ETAT_ECRITURE, PAGE_REACTION, normaliserEmoji };
