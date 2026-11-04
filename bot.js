const fs = require('fs');
const path = require('path');
const net = require('net');
const { execFile, spawn } = require('child_process');
const {
  normaliserNumeros,
  estAutorise,
  meilleurModele,
  decouperReponse,
  dansHoraires,
  nettoyerTexte,
  limiterReponse,
  dureeFrappe,
  dureeLecture,
} = require('./utils');

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

// ---------- Le bot ----------

class Bot {
  constructor(config, dossier, emit) {
    this.config = config;
    this.dossier = dossier;
    this.emit = emit;
    this.client = null;
    this.proc = null;
    this.surveillance = null;
    this.attente = {};
    this.file = {};
    this.ignores = new Set();
    this.modeleVerifie = false;
    this.bloques = {}; // modèles mis de côté un moment (limite atteinte, surcharge)
    this.introuvables = new Set();
    this.dernierSecours = null;
    this.fichierHistorique = path.join(dossier, 'historique.json');
    try {
      this.historiques = JSON.parse(fs.readFileSync(this.fichierHistorique, 'utf8'));
    } catch (e) {
      this.historiques = {};
    }
  }

  log(texte) {
    const h = new Date().toLocaleTimeString('fr-FR');
    this.emit('log', `${h}  ${texte}`);
  }

  sauverHistorique() {
    try {
      fs.mkdirSync(this.dossier, { recursive: true });
      fs.writeFileSync(this.fichierHistorique, JSON.stringify(this.historiques, null, 2));
    } catch (e) {}
  }

  // ----- Démarrage / arrêt -----

  async start() {
    const c = this.config;
    if (!c.cleApi || !c.cleApi.trim()) throw new Error('La clé API Google est manquante.');
    this.numeros = normaliserNumeros(c.numerosAutorises);
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
      if (this.config.passerHorsLigne !== false) {
        Promise.resolve(client.sendPresenceUnavailable()).catch(() => {});
      }
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

  async nettoyerNavigateur(profil) {
    try { if (this.proc) this.proc.kill(); } catch (e) {}
    this.proc = null;
    await tuerNavigateursDuProfil(profil || path.join(this.dossier, 'profil-navigateur'));
  }

  async stop() {
    clearInterval(this.surveillance);
    Object.values(this.attente).forEach((e) => clearTimeout(e.timer));
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

  construirePrompt() {
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
    return [base, bloc, this.reglesDeForme()].filter(Boolean).join('\n\n');
  }

  // Ces règles passent toujours en dernier : Gemini a tendance à écrire des pavés sinon.
  reglesDeForme() {
    const max = Math.max(40, Number(this.config.longueurMax) || 180);
    return [
      '=== FORME DES MESSAGES (priorité absolue, elle prime sur tout ce qui précède) ===',
      'Tu écris sur WhatsApp avec ton pouce, comme une jeune de 19 ans : pas comme un assistant, pas comme quelqu\'un qui rédige.',
      `- Une réponse = 1 à 2 phrases courtes, souvent quelques mots seulement. ${max} caractères maximum au total.`,
      '- Jamais de paragraphe, de liste, de titre, de gras, d\'explication, de morale ni de série de conseils.',
      '- Pas de formules d\'assistant ("Bien sûr", "Je comprends", "N\'hésite pas"). Ne résume pas ce que l\'autre vient de dire.',
      '- Pose une question de temps en temps seulement (moins d\'une réponse sur trois). Réagis plutôt : une remarque, une blague, une émotion.',
      '- Si tu veux envoyer deux bulles, sépare-les par une ligne vide (2 maximum), chacune très courte.',
      '- Écris à l\'oral : minuscules acceptées, abréviations (mdr, jsp, tkt), emojis avec parcimonie, ponctuation légère.',
      '- Réponds dans la langue de ton interlocuteur.',
      '- Si le dernier message n\'appelle aucune réponse (simple "ok", "d\'accord", un emoji de fin, un au revoir déjà échangé, conversation terminée), réponds exactement : [RIEN]',
      '- Si on te demande sérieusement si tu es une IA, ne le nie pas.',
      'Exemples de longueur (le fond est libre, seule la taille compte) :',
      '"t\'as fait quoi aujourd\'hui ?" -> "cours toute la journée 😮‍💨 et toi ?"',
      '"j\'ai passé une journée de fou" -> "raconte !!"',
      '"tu me manques" -> "toi aussi ❤️"',
      '"bonne nuit" -> "bonne nuit 🌙"',
      '"ok" (après un au revoir) -> [RIEN]',
    ].join('\n');
  }

  // Transforme la réponse de Gemini en 0, 1 ou 2 petites bulles.
  preparerReponse(texte) {
    const brut = String(texte || '');
    if (/\[RIEN\]/i.test(brut) && brut.replace(/\[RIEN\]/gi, '').trim().length < 3) return [];
    const propre = nettoyerTexte(brut.replace(/\[RIEN\]/gi, ''));
    return limiterReponse(decouperReponse(propre, 2), this.config.longueurMax);
  }

  // ----- Appel à Gemini (avec modèles de secours) -----

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
              contents: messages.map((m) => ({ role: m.role, parts: [{ text: m.content }] })),
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
    return this.appelerGemini(this.construirePrompt(), [{ role: 'user', content: texte }]);
  }

  // ----- Messages WhatsApp -----

  async surMessage(msg) {
    try {
      if (msg.fromMe || msg.isStatus || !msg.from) return;
      if (msg.from === 'status@broadcast' || msg.from.endsWith('@g.us')) return;
      if (msg.type !== 'chat') return;

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

      let chat = null;
      try { chat = await msg.getChat(); } catch (e) {}

      const etat = this.attente[numero] || (this.attente[numero] = { textes: [], timer: null });
      etat.textes.push(msg.body);
      this.log('Message reçu : ' + msg.body);
      clearTimeout(etat.timer);
      etat.timer = setTimeout(() => {
        const textes = etat.textes;
        etat.textes = [];
        this.file[numero] = (this.file[numero] || Promise.resolve())
          .then(() => this.repondre(chat, msg.from, numero, textes))
          .catch((e) => this.log('Erreur : ' + e.message));
      }, Math.max(0, Number(this.config.attenteFin)) * 1000);
    } catch (e) {
      this.log('Erreur : ' + e.message);
    }
  }

  async envoyer(chat, destinataire, texte) {
    const options = { sendSeen: false }; // contourne un bogue connu de whatsapp-web.js
    if (chat) {
      try {
        await avecDelai(chat.sendMessage(texte, options), 20000, 'Envoi du message');
        return;
      } catch (e) {
        this.log('Envoi via la discussion impossible (' + e.message + '). Nouvel essai…');
      }
    }
    await avecDelai(this.client.sendMessage(destinataire, texte, options), 20000, 'Envoi du message');
  }

  // ----- Comportement humain : ouvrir la discussion, lire, écrire, partir -----

  async ouvrirDiscussion(chat) {
    try { await avecDelai(this.client.sendPresenceAvailable(), 5000, 'Présence'); } catch (e) {}
    try {
      if (chat) await avecDelai(chat.sendSeen(), 8000, 'Accusé de lecture');
    } catch (e) {
      if (!this.erreurLecture) {
        this.erreurLecture = true;
        this.log('Accusé de lecture impossible : ' + e.message);
      }
    }
  }

  async quitterDiscussion(chat, numero) {
    if (this.config.passerHorsLigne === false) return;
    await attendre(alea(3000, 8000));
    const enAttente = this.attente[numero] && this.attente[numero].textes.length > 0;
    if (enAttente) return; // un autre message arrive : on reste là
    try { if (chat) await avecDelai(chat.clearState(), 5000, 'clearState'); } catch (e) {}
    try { await avecDelai(this.client.sendPresenceUnavailable(), 5000, 'Présence'); } catch (e) {}
  }

  async ecrire(chat, destinataire, texte) {
    const fin = Date.now() + dureeFrappe(texte, this.config.msParCaractere);
    while (Date.now() < fin) {
      try {
        if (chat) await avecDelai(chat.sendStateTyping(), 5000, 'Indicateur « écrit… »');
      } catch (e) {
        if (!this.erreurFrappe) {
          this.erreurFrappe = true;
          this.log('Indicateur « écrit… » ignoré : ' + e.message);
        }
      }
      await attendre(Math.max(0, Math.min(fin - Date.now(), 8000))); // WhatsApp l'efface après ~25 s
    }
    this.log('Envoi du message…');
    await this.envoyer(chat, destinataire, texte);
    try { if (chat) await avecDelai(chat.clearState(), 5000, 'clearState'); } catch (e) {}
    this.log('Réponse envoyée : ' + texte);
  }

  async repondre(chat, destinataire, numero, textes) {
    const c = this.config;
    const hist = this.historiques[numero] || [];
    const messageUtilisateur = textes.join('\n');

    // 1. La demande part tout de suite à Google, pendant que « la personne » regarde son téléphone.
    this.log('Question envoyée à Google…');
    const debut = Date.now();
    const demande = this.appelerGemini(this.construirePrompt(), [
      ...hist,
      { role: 'user', content: messageUtilisateur },
    ]).then((texte) => ({ texte }), (erreur) => ({ erreur }));

    // 2. Délai avant d'ouvrir la discussion, puis ouverture (en ligne + message lu).
    const dMin = Math.max(0, Number(c.delaiMin));
    const dMax = Math.max(dMin, Number(c.delaiMax));
    await attendre(alea(dMin, dMax) * 1000);
    await this.ouvrirDiscussion(chat);

    // 3. Temps de lecture selon la taille du message.
    await attendre(dureeLecture(messageUtilisateur, c.msLecture ?? 40));

    const res = await demande;
    if (res.erreur) {
      this.log('Erreur API Google : ' + res.erreur.message);
      await this.quitterDiscussion(chat, numero);
      return;
    }
    this.log(`Google a répondu en ${Math.round((Date.now() - debut) / 1000)} s.`);

    const morceaux = this.preparerReponse(res.texte);

    let h = [
      ...hist,
      { role: 'user', content: messageUtilisateur },
      { role: 'model', content: morceaux.length ? morceaux.join('\n\n') : '[RIEN]' },
    ].slice(-Math.max(2, Number(c.memoire || 40)));
    while (h.length && h[0].role !== 'user') h.shift();
    this.historiques[numero] = h;
    this.sauverHistorique();

    // 4. Conversation terminée : on lit, on ne répond pas, on s'en va.
    if (!morceaux.length) {
      this.log('Pas de réponse nécessaire (la discussion est terminée).');
      await this.quitterDiscussion(chat, numero);
      return;
    }

    // 5. Écriture bulle par bulle, comme un humain.
    for (let i = 0; i < morceaux.length; i++) {
      await attendre(alea(500, 1500)); // petite hésitation avant de taper
      await this.ecrire(chat, destinataire, morceaux[i]);
      if (i < morceaux.length - 1) await attendre(alea(1000, 3000));
    }

    // 6. On quitte la discussion.
    await this.quitterDiscussion(chat, numero);
  }
}

module.exports = { Bot, listerModeles, MODELE_PAR_DEFAUT };
