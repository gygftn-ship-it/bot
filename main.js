const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { Bot, listerModeles, MODELE_PAR_DEFAUT } = require('./bot');
const { meilleurModele } = require('./utils');
const { PROMPT_LINA } = require('./lina');

const DEFAUT = {
  cleApi: '',
  modele: MODELE_PAR_DEFAUT,
  numerosAutorises: '',
  prenomElle: '',
  prenomMoi: '',
  relation: 'vous êtes en couple',
  styleEcriture: 'Messages courts, tutoiement, quelques emojis, ton affectueux et taquin.',
  infosSurElle: '',
  promptPerso: PROMPT_LINA,
  exemples: '',
  delaiMin: 3,
  delaiMax: 25,
  attenteFin: 6,
  msParCaractere: 250,
  msLecture: 40,
  longueurMax: 180,
  passerHorsLigne: true,
  memoire: 40,
  horairesActifs: false,
  heureDebut: 8,
  heureFin: 23,
  afficherNavigateur: false,
  versionConfig: 3,
};

let win = null;
let bot = null;

const dossierDonnees = () => app.getPath('userData');
const fichierConfig = () => path.join(dossierDonnees(), 'config.json');
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
  cfg.versionConfig = 3;
  return cfg;
}

function sauverConfig(cfg) {
  fs.mkdirSync(dossierDonnees(), { recursive: true });
  fs.writeFileSync(fichierConfig(), JSON.stringify({ ...DEFAUT, ...cfg }, null, 2));
}

function ecrireJournal(ligne) {
  try {
    fs.mkdirSync(dossierDonnees(), { recursive: true });
    fs.appendFileSync(fichierJournal(), ligne + '\n');
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
  try { fs.rmSync(path.join(dossierDonnees(), 'historique.json'), { force: true }); } catch (e) {}
  if (bot) bot.historiques = {};
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
