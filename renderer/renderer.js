const champs = () => Array.from(document.querySelectorAll('[data-key]'));
const $ = (id) => document.getElementById(id);

function afficherConfig(cfg) {
  champs().forEach((el) => {
    const v = cfg[el.dataset.key];
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v ?? '';
  });
}

function lireConfig() {
  const cfg = {};
  champs().forEach((el) => {
    if (el.type === 'checkbox') cfg[el.dataset.key] = el.checked;
    else if (el.type === 'number') cfg[el.dataset.key] = Number(el.value);
    else cfg[el.dataset.key] = el.value;
  });
  return cfg;
}

function message(texte) { $('msg').textContent = texte || ''; }

function majStatut(texte) {
  const actif = !['Arrêté', 'Déconnecté', 'Erreur'].includes(texte);
  $('status').firstChild.textContent = texte;
  $('substatus').textContent = actif ? 'Le bot tourne tant que cette fenêtre reste ouverte.' : 'Enregistre puis démarre.';
  $('btnStart').disabled = actif;
  $('btnStop').disabled = !actif;
}

function ajouterLog(ligne) {
  const log = $('log');
  log.textContent += ligne + '\n';
  log.scrollTop = log.scrollHeight;
}

window.api.onEvent(({ type, payload }) => {
  if (type === 'status') majStatut(payload);
  else if (type === 'log') ajouterLog(payload);
  else if (type === 'qr') {
    const img = $('qr');
    if (payload) { img.src = payload; img.classList.add('visible'); }
    else { img.removeAttribute('src'); img.classList.remove('visible'); }
  }
});

$('btnSave').addEventListener('click', async () => {
  await window.api.saveConfig(lireConfig());
  message('Réglages enregistrés. Ils s\'appliquent au prochain démarrage.');
});

$('btnStart').addEventListener('click', async () => {
  await window.api.saveConfig(lireConfig());
  message('');
  const r = await window.api.start();
  if (!r.ok) message(r.erreur);
});

$('btnStop').addEventListener('click', () => window.api.stop());

$('btnReset').addEventListener('click', async () => {
  await window.api.resetHistory();
  message('Mémoire du bot effacée.');
});

$('btnLogout').addEventListener('click', async () => {
  if (!confirm('Déconnecter WhatsApp ? Il faudra scanner un nouveau QR code au prochain démarrage.')) return;
  await window.api.logout();
  message('WhatsApp déconnecté.');
});

window.api.getConfig().then(afficherConfig);
majStatut('Arrêté');
