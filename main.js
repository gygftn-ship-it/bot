const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { Bot, listerModeles, MODELE_PAR_DEFAUT } = require('./bot');
const { meilleurModele } = require('./utils');
const { PROMPT_LINA } = require('./lina');
const MemoireEp = require('./memoire');

const DEFAUT = {
  fournisseur: 'gemini', // 'gemini' | 'anthropic' | 'openai' (toute API compatible OpenAI)
  cleApi: '',
  modele: MODELE_PAR_DEFAUT,
  modeleAutre: '',
  baseUrl: '',
  numerosAutorises: '',
  prenomElle: '',
  prenomMoi: '',
  relation: 'vous êtes en couple',
  styleEcriture: 'Messages courts, tutoiement, quelques emojis, ton affectueux et taquin.',
  infosSurElle: '',
  promptPerso: PROMPT_LINA,
  exemples: '',
  // Rythme de réponse
  delaiMin: 3,
  delaiMax: 25,
  attenteFin: 6,
  msParCaractere: 250,
  msLecture: 40,
  longueurMax: 180,
  bullesMax: 2,
  // Vie humaine
  fuseau: 'Africa/Algiers',
  heureReveil: 7.5,
  heureCoucher: 0.5,
  latenceRealiste: true,
  rapidite: 1,
  fautesFrappe: 5,
  reactions: true,
  citations: true,
  presenceAleatoire: true,
  echelleTemps: 1,
  // Vie qui continue et imperfections
  evenementsVie: true,
  maxEvenements: 2,
  joursOff: true,
  probaJourOff: 12,
  vuSansReponse: 6,
  doubleMessage: 8,
  // Culture, calendrier et journée vécue
  calendrierActif: true,
  ramadanAuto: true,
  decalageHegire: 0,
  anniversaireMoi: '04/09',
  anniversaireElle: '22/12',
  ville: 'Tizi Ouzou',
  meteoActive: true,
  faitsJournee: true,
  // Souvenirs et naturel
  rappelsSuivi: true,
  antiRepetition: true,
  longueurMiroir: true,
  curiosite: 45,
  langageOral: true,
  parlerSouvenirs: true,
  calendrierUniv: true,
  mondeVivant: true,
  // Messages spontanés
  initiativeActive: true,
  initiativeParJour: 3,
  initiativeEcartMin: 90,
  // Mémoire
  memoire: 60,
  memoireLongue: true,
  memoireTous: 8,
  passerHorsLigne: true,
  horairesActifs: false,
  heureDebut: 8,
  heureFin: 23,
  afficherNavigateur: false,
  versionConfig: 6,
};

let win = null;
let bot = null;

const dossierDonnees = () => app.getPath('userData');
const fichierConfig = () => path.join(dossierDonnees(), 'config.json');
const fichierMemoire = () => path.join(dossierDonnees(), 'memoire.json');
const fichierJournal = () => path.join(dossierDonnees(), 'journal.txt');

function chargerConfig() {
  let sauve = {};
  try {
    sauve = JSON.parse(fs.readFileSync(fichierConfig(), 'utf8'));
  } catch (e) {}
  const cfg = { ...DEFAUT, ...sauve };
  // Anciennes versions : l'ancien modèle de départ n'autorise que 20 messages par jour en gratuit.
  if (!sauve.versionConfig || sauve.versionConfig < 2 || !cfg.modele) cfg.modele = MODELE_PAR_DEFAUT;
  // Version 3 : prompt de Lina intégré et vitesse de frappe humaine.
  if (!sauve.versionConfig || sauve.versionConfig < 3) {
    if (!sauve.promptPerso) cfg.promptPerso = PROMPT_LINA;
    if (!sauve.msParCaractere || sauve.msParCaractere === 70) cfg.msParCaractere = 250;
  }
  // Version 4 : comportement humain complet. L'ancien prompt « compagne virtuelle » est remplacé par le nouveau.
  if (!sauve.versionConfig || sauve.versionConfig < 4) {
    if (!sauve.promptPerso || /jeune femme virtuelle/i.test(sauve.promptPerso)) cfg.promptPerso = PROMPT_LINA;
    if (!sauve.memoire || sauve.memoire === 40) cfg.memoire = 60;
  }
  cfg.versionConfig = 6;
  return cfg;
}

function sauverConfig(cfg) {
  fs.mkdirSync(dossierDonnees(), { recursive: true });
  fs.writeFileSync(fichierConfig(), JSON.stringify({ ...DEFAUT, ...cfg }, null, 2));
}

const TAILLE_MAX_JOURNAL = 2 * 1024 * 1024;

function ecrireJournal(ligne) {
  try {
    fs.mkdirSync(dossierDonnees(), { recursive: true });
    const f = fichierJournal();
    // Le journal ne grossit pas indéfiniment : au-delà de 2 Mo, on garde l'ancien à côté et on repart de zéro.
    try { if (fs.statSync(f).size > TAILLE_MAX_JOURNAL) fs.renameSync(f, f.replace(/\.txt$/, '.ancien.txt')); } catch (e) {}
    fs.appendFileSync(f, ligne + '\n');
  } catch (e) {}
}

function emettre(type, payload) {
  if (win && !win.isDestroyed()) win.webContents.send('bot:event', { type, payload });

  if (type === 'log') ecrireJournal(payload);

  // Le bot a changé de modèle tout seul : on le retient.
  if (type === 'modele') {
    try { sauverConfig({ ...chargerConfig(), modele: payload }); } catch (e) {}
  }

  // Après une erreur ou une déconnexion, on libère le bot pour pouvoir relancer.
  if (type === 'status' && (payload === 'Erreur' || payload === 'Déconnecté') && bot) {
    const b = bot;
    bot = null;
    b.stop().catch(() => {});
  }
}

async function arreterBot() {
  if (bot) {
    const b = bot;
    bot = null;
    await b.stop();
  }
}

function creerFenetre() {
  win = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 860,
    minHeight: 600,
    title: 'Bot WhatsApp',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

ipcMain.handle('config:get', () => chargerConfig());

ipcMain.handle('config:save', (_e, cfg) => {
  sauverConfig(cfg);
  return true;
});

ipcMain.handle('bot:start', async () => {
  if (bot) return { ok: false, erreur: 'Le bot est déjà lancé.' };
  bot = new Bot(chargerConfig(), dossierDonnees(), emettre);
  try {
    await bot.start();
    return { ok: true };
  } catch (e) {
    const b = bot;
    bot = null;
    if (b) await b.stop().catch(() => {});
    emettre('log', 'Démarrage impossible : ' + e.message);
    return { ok: false, erreur: e.message };
  }
});

ipcMain.handle('bot:stop', async () => {
  await arreterBot();
  return true;
});

ipcMain.handle('bot:reset', () => {
  for (const f of ['historique.json', 'memoire.json', 'etat.json']) {
    try { fs.rmSync(path.join(dossierDonnees(), f), { force: true }); } catch (e) {}
  }
  if (bot) { bot.historiques = {}; bot.memoires = {}; bot.etat = { numeros: {}, attente: {}, refs: {} }; }
  return true;
});

ipcMain.handle('bot:logout', async () => {
  await arreterBot();
  for (const d of ['profil-navigateur', 'session']) {
    try { fs.rmSync(path.join(dossierDonnees(), d), { recursive: true, force: true }); } catch (e) {}
  }
  return true;
});

ipcMain.handle('models:list', async (_e, cle) => {
  try {
    const modeles = await listerModeles(cle);
    return { ok: true, modeles, conseille: meilleurModele(modeles) };
  } catch (e) {
    return { ok: false, erreur: e.message };
  }
});

ipcMain.handle('ai:test', async (_e, cfg) => {
  try {
    const b = new Bot({ ...DEFAUT, ...cfg }, dossierDonnees(), emettre);
    const texte = await b.testerIA('coucou, ça va ?');
    return { ok: true, texte };
  } catch (e) {
    return { ok: false, erreur: e.message };
  }
});

// Mémoire du bot : on lit celle du bot s'il tourne (elle est en cours de mise à jour), sinon le fichier.
function lireMemoires() {
  if (bot) return bot.memoires;
  try { return JSON.parse(fs.readFileSync(fichierMemoire(), 'utf8')); } catch (e) { return {}; }
}

ipcMain.handle('memoire:get', () => {
  const sortie = {};
  for (const [n, m] of Object.entries(lireMemoires())) sortie[n] = { faits: m.faits || '', episodes: m.episodes || [], elle: m.elle || [] };
  return sortie;
});

ipcMain.handle('memoire:save', (_e, numero, faits, episodesTexte, elleTexte) => {
  const memoires = lireMemoires();
  const m = memoires[numero] || (memoires[numero] = { faits: '', n: 0 });
  const anciens = m.episodes || [];
  m.faits = String(faits || '').trim().slice(0, 4500);
  // On garde l'état « déjà repris » des souvenirs qui n'ont pas changé.
  m.episodes = MemoireEp.parserEpisodes(String(episodesTexte || '').split('\n'), 200).map((e) => {
    const avant = anciens.find((a) => a.date === e.date && a.texte === e.texte);
    return avant ? avant : e;
  });
  if (elleTexte !== undefined) {
    const avantElle = m.elle || [];
    m.elle = MemoireEp.parserEpisodes(String(elleTexte || '').split('\n'), 200).map((e) => avantElle.find((a) => a.date === e.date && a.texte === e.texte) || e);
  }
  if (bot) bot.sauverMemoire();
  else fs.writeFileSync(fichierMemoire(), JSON.stringify(memoires, null, 2));
  return true;
});

ipcMain.handle('folder:open', () => shell.openPath(dossierDonnees()));

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(creerFenetre);
  app.on('window-all-closed', async () => {
    await arreterBot();
    app.quit();
  });
}
