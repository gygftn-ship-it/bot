const fs = require('fs');
const path = require('path');
const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const alea = (min, max) => min + Math.random() * (max - min);

// WhatsApp Web a besoin d'un navigateur : on utilise Chrome ou Edge déjà installé.
function trouverNavigateur() {
  const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const local = process.env['LOCALAPPDATA'] || '';
  const liste = [
    path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    local && path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  return liste.find((p) => p && fs.existsSync(p));
}

class Bot {
  constructor(config, dossier, emit) {
    this.config = config;
    this.dossier = dossier;
    this.emit = emit;
    this.client = null;
    this.attente = {};
    this.file = {};
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

  async start() {
    const c = this.config;
    if (!c.cleApi) throw new Error('La clé API Google est manquante.');
    this.numeros = String(c.numerosAutorises || '')
      .split(/[,;\s]+/)
      .map((n) => n.replace(/\D/g, ''))
      .filter(Boolean);
    if (!this.numeros.length) throw new Error('Indique ton numéro dans « Numéros autorisés ».');
    const navigateur = trouverNavigateur();
    if (!navigateur) throw new Error('Google Chrome ou Microsoft Edge doit être installé sur cet ordinateur.');

    this.emit('status', 'Démarrage…');
    this.log('Démarrage de WhatsApp Web…');

    this.client = new Client({
      authStrategy: new LocalAuth({ dataPath: path.join(this.dossier, 'session') }),
      puppeteer: {
        headless: true,
        executablePath: navigateur,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
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
    });
    client.on('auth_failure', (m) => this.log('Échec de connexion : ' + m));
    client.on('disconnected', (r) => {
      this.emit('status', 'Déconnecté');
      this.log('Déconnecté : ' + r);
    });
    client.on('message', (msg) => this.surMessage(msg));

    client.initialize().catch((e) => {
      this.log('Erreur au démarrage : ' + e.message);
      this.emit('status', 'Erreur');
    });
  }

  async stop() {
    Object.values(this.attente).forEach((e) => clearTimeout(e.timer));
    if (this.client) {
      try { await this.client.destroy(); } catch (e) {}
      this.client = null;
    }
    this.emit('qr', null);
    this.emit('status', 'Arrêté');
    this.log('Bot arrêté.');
  }

  dansHoraires() {
    const c = this.config;
    if (!c.horairesActifs) return true;
    const h = new Date().getHours();
    const d = Number(c.heureDebut);
    const f = Number(c.heureFin);
    return d <= f ? h >= d && h < f : h >= d || h < f;
  }

  construirePrompt() {
    const c = this.config;
    const exemples = (c.exemples || '').trim();
    const bloc = exemples
      ? `Voici de vrais messages écrits par elle. Imite leur longueur, leur vocabulaire, leurs abréviations, leurs emojis et leur ponctuation :\n<exemples>\n${exemples}\n</exemples>`
      : '';
    if ((c.promptPerso || '').trim()) {
      return [c.promptPerso.trim(), bloc].filter(Boolean).join('\n\n');
    }
    const elle = c.prenomElle || 'elle';
    return [
      `Tu es ${c.prenomElle || 'une personne'}. Tu discutes sur WhatsApp avec ${c.prenomMoi || 'ton interlocuteur'} (${c.relation || 'vous vous connaissez bien'}).`,
      `Tu écris exactement comme ${elle} le ferait dans un vrai message WhatsApp.`,
      c.styleEcriture ? `Sa façon d'écrire : ${c.styleEcriture}` : '',
      c.infosSurElle ? `À propos d'elle : ${c.infosSurElle}` : '',
      bloc,
      [
        'Règles :',
        '- Réponds en messages courts, comme sur un vrai chat. Pas de listes, pas de mise en forme, pas de guillemets autour de tes réponses.',
        '- Ne parle jamais comme un assistant ("Bien sûr", "Je suis là pour t\'aider", etc.).',
        '- Si tu veux envoyer plusieurs messages à la suite, sépare-les par une ligne vide (3 maximum).',
        '- Réponds dans la langue de ton interlocuteur.',
        '- Si on te demande sérieusement si tu es une IA, ne le nie pas.',
      ].join('\n'),
    ].filter(Boolean).join('\n\n');
  }

  async appelerGemini(system, messages) {
    const modele = encodeURIComponent(this.config.modele || 'gemini-2.5-flash');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modele}:generateContent`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.config.cleApi },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: messages.map((m) => ({ role: m.role, parts: [{ text: m.content }] })),
        generationConfig: { maxOutputTokens: 1024, temperature: 1.0 },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data.error && data.error.message) || `Erreur HTTP ${res.status}`);
    const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    return parts.map((p) => p.text || '').join('').trim();
  }

  surMessage(msg) {
    (async () => {
      if (msg.fromMe || msg.isStatus || msg.from.endsWith('@g.us')) return;
      if (msg.type !== 'chat') return;

      const contact = await msg.getContact();
      const numero = String(contact.number || '').replace(/\D/g, '');
      if (!this.numeros.includes(numero)) return;

      if (!this.dansHoraires()) {
        this.log('Message reçu hors des horaires, ignoré.');
        return;
      }

      const chat = await msg.getChat();
      const etat = this.attente[numero] || (this.attente[numero] = { textes: [], timer: null });
      etat.textes.push(msg.body);
      this.log('Message reçu : ' + msg.body);
      clearTimeout(etat.timer);
      etat.timer = setTimeout(() => {
        const textes = etat.textes;
        etat.textes = [];
        this.file[numero] = (this.file[numero] || Promise.resolve())
          .then(() => this.repondre(chat, numero, textes))
          .catch((e) => this.log('Erreur : ' + e.message));
      }, Number(this.config.attenteFin) * 1000);
    })().catch((e) => this.log('Erreur : ' + e.message));
  }

  async repondre(chat, numero, textes) {
    const c = this.config;
    const hist = this.historiques[numero] || [];
    const messageUtilisateur = textes.join('\n');

    let reponse = '';
    try {
      reponse = await this.appelerGemini(this.construirePrompt(), [
        ...hist,
        { role: 'user', content: messageUtilisateur },
      ]);
    } catch (e) {
      this.log('Erreur API Google : ' + e.message);
      return;
    }
    if (!reponse) {
      this.log("L'IA n'a rien répondu.");
      return;
    }

    const morceaux = reponse.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean).slice(0, 3);

    let h = [
      ...hist,
      { role: 'user', content: messageUtilisateur },
      { role: 'model', content: morceaux.join('\n\n') },
    ].slice(-Number(c.memoire || 40));
    while (h.length && h[0].role !== 'user') h.shift();
    this.historiques[numero] = h;
    this.sauverHistorique();

    const dMin = Number(c.delaiMin);
    const dMax = Math.max(dMin, Number(c.delaiMax));
    await attendre(alea(dMin, dMax) * 1000);
    for (const m of morceaux) {
      await chat.sendStateTyping();
      await attendre(Math.min(8000, Math.max(1200, m.length * Number(c.msParCaractere || 70))));
      await chat.sendMessage(m);
      await chat.clearState();
      this.log('Réponse envoyée : ' + m);
      await attendre(alea(500, 2000));
    }
  }
}

module.exports = { Bot };
