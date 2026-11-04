const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { Bot } = require('./bot');

const DEFAUT = {
  cleApi: '',
  modele: 'gemini-2.5-flash',
  numerosAutorises: '',
  prenomElle: '',
  prenomMoi: '',
  relation: 'vous êtes en couple',
  styleEcriture: 'Messages courts, tutoiement, quelques emojis, ton affectueux et taquin.',
  infosSurElle: '',
  promptPerso: '',
  exemples: '',
  delaiMin: 3,
  delaiMax: 25,
  attenteFin: 6,
  msParCaractere: 70,
  memoire: 40,
  horairesActifs: false,
  heureDebut: 8,
  heureFin: 23,
  afficherNavigateur: false,
};

let win = null;
let bot = null;

const dossierDonnees = () => app.getPath('userData');
const fichierConfig = () => path.join(dossierDonnees(), 'config.json');

function chargerConfig() {
  try {
    return { ...DEFAUT, ...JSON.parse(fs.readFileSync(fichierConfig(), 'utf8')) };
  } catch (e) {
    return { ...DEFAUT };
  }
}

function emettre(type, payload) {
  if (win && !win.isDestroyed()) win.webContents.send('bot:event', { type, payload });
  // Si le démarrage échoue après coup, on libère le bot pour pouvoir relancer.
  if (type === 'status' && payload === 'Erreur' && bot) {
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
  fs.mkdirSync(dossierDonnees(), { recursive: true });
  fs.writeFileSync(fichierConfig(), JSON.stringify({ ...DEFAUT, ...cfg }, null, 2));
  return true;
});

ipcMain.handle('bot:start', async () => {
  if (bot) return { ok: false, erreur: 'Le bot est déjà lancé.' };
  bot = new Bot(chargerConfig(), dossierDonnees(), emettre);
  try {
    await bot.start();
    return { ok: true };
  } catch (e) {
    bot = null;
    emettre('status', 'Arrêté');
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
  try { fs.rmSync(path.join(dossierDonnees(), 'session'), { recursive: true, force: true }); } catch (e) {}
  return true;
});

app.whenReady().then(creerFenetre);
app.on('window-all-closed', async () => {
  await arreterBot();
  app.quit();
});
