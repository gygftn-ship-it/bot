const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { Bot, listerModeles } = require('./bot');
const { meilleurModele } = require('./utils');
const MemoireEp = require('./memoire');
// Réglages par défaut, bornes et migrations : un seul fichier, partagé avec la version Termux.
const { DEFAUT, chargerConfig: lireConfigFichier } = require('./reglages');

let win = null;
let bot = null;

// Une erreur imprévue dans une promesse ne doit pas tuer le bot en silence : on la note dans le journal.
process.on('unhandledRejection', (e) => emettre('log', 'Erreur non gérée : ' + ((e && e.stack) || e)));

const dossierDonnees = () => app.getPath('userData');
const fichierConfig = () => path.join(dossierDonnees(), 'config.json');
const fichierMemoire = () => path.join(dossierDonnees(), 'memoire.json');
const fichierJournal = () => path.join(dossierDonnees(), 'journal.txt');

function chargerConfig() {
  return lireConfigFichier(fichierConfig());
}

function sauverConfig(cfg) {
  fs.mkdirSync(dossierDonnees(), { recursive: true });
  // Écriture atomique : une coupure en plein milieu ne corrompt pas la config.
  const f = fichierConfig();
  const tmp = f + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ ...DEFAUT, ...cfg }, null, 2));
  fs.renameSync(tmp, f);
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
  // On part de la config déjà enregistrée : un réglage qui n'a pas de champ dans la fenêtre (modifié à la main dans config.json) n'est pas perdu.
  sauverConfig({ ...chargerConfig(), ...cfg });
  return true;
});

ipcMain.handle('bot:start', async () => {
  if (bot) return { ok: false, erreur: 'Le bot est déjà lancé.' };
  const cfg = chargerConfig();
  // Le bot raisonne dans le fuseau du personnage : on aligne aussi l'horloge du processus.
  process.env.TZ = cfg.fuseau || 'Africa/Algiers';
  bot = new Bot(cfg, dossierDonnees(), emettre);
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
    // Le bot garde une copie de secours (.bak) de chaque fichier : on l'efface aussi, sinon il la relirait.
    for (const ext of ['', '.bak', '.tmp']) {
      try { fs.rmSync(path.join(dossierDonnees(), f + ext), { force: true }); } catch (e) {}
    }
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
