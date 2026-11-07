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
    else if (el.dataset.null) cfg[el.dataset.key] = el.value === '' ? null : Number(el.value); // liste « au hasard » = null
    else if (el.type === 'number') cfg[el.dataset.key] = el.value === '' ? undefined : Number(el.value);
    else cfg[el.dataset.key] = el.value.trim();
  });
  return cfg;
}

function message(texte) { $('msg').textContent = texte || ''; }

function ajouterLog(ligne) {
  const log = $('log');
  log.textContent += ligne + '\n';
  log.scrollTop = log.scrollHeight;
}

function majStatut(texte) {
  const inactif = ['Arrêté', 'Déconnecté', 'Erreur'].includes(texte);
  $('status').firstChild.textContent = texte;
  $('substatus').textContent = inactif
    ? 'Enregistre puis démarre.'
    : 'Le bot tourne tant que cette fenêtre reste ouverte.';
  $('btnStart').disabled = !inactif;
  $('btnStop').disabled = inactif;
}

window.api.onEvent(({ type, payload }) => {
  if (type === 'status') majStatut(payload);
  else if (type === 'log') ajouterLog(payload);
  else if (type === 'modele') {
    document.querySelector('[data-key="modele"]').value = payload;
  } else if (type === 'qr') {
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

$('btnModeles').addEventListener('click', async () => {
  if ($('fournisseur').value !== 'gemini') { message('La liste des modèles n\'est disponible que pour Gemini.'); return; }
  message('Chargement des modèles…');
  const r = await window.api.listModels(lireConfig().cleApi);
  if (!r.ok) { message(r.erreur); return; }
  const liste = $('modeles');
  liste.innerHTML = '';
  r.modeles.forEach((nom) => {
    const o = document.createElement('option');
    o.value = nom;
    liste.appendChild(o);
  });
  if (r.conseille) document.querySelector('[data-key="modele"]').value = r.conseille;
  message(`Clé valide. ${r.modeles.length} modèles disponibles, « ${r.conseille || '—'} » sélectionné.`);
});

$('btnTest').addEventListener('click', async () => {
  message('Test en cours…');
  const r = await window.api.testAI(lireConfig());
  if (r.ok) {
    ajouterLog('Test IA — réponse : ' + r.texte);
    message('Le test a fonctionné.');
  } else {
    ajouterLog('Test IA — erreur : ' + r.erreur);
    message('Le test a échoué : ' + r.erreur);
  }
});

$('btnCopy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('log').textContent);
    message('Journal copié.');
  } catch (e) {
    message('Copie impossible : sélectionne le texte et fais Ctrl+C.');
  }
});

$('btnFolder').addEventListener('click', () => window.api.openFolder());

$('btnReset').addEventListener('click', async () => {
  await window.api.resetHistory();
  message('Mémoire du bot effacée.');
  chargerMemoire().catch(() => {});
});

$('btnLogout').addEventListener('click', async () => {
  if (!confirm('Déconnecter WhatsApp ? Il faudra scanner un nouveau QR code au prochain démarrage.')) return;
  await window.api.logout();
  message('WhatsApp déconnecté.');
});

function majFournisseur() {
  const gemini = $('fournisseur').value === 'gemini';
  $('blocGemini').style.display = gemini ? '' : 'none';
  $('blocAutre').style.display = gemini ? 'none' : '';
}
$('fournisseur').addEventListener('change', majFournisseur);

// ----- Profils rapides -----
const PROFILS = {
  equilibre: { initiativeParJour: 3, curiosite: 45, doubleMessage: 8, vuSansReponse: 6, fautesFrappe: 5, probaJourOff: 12, memoireTous: 8, memoire: 60, parlerSouvenirs: true, langageOral: true },
  vivante: { initiativeParJour: 5, curiosite: 60, doubleMessage: 15, vuSansReponse: 8, fautesFrappe: 8, probaJourOff: 15, memoireTous: 6, memoire: 80, parlerSouvenirs: true, langageOral: true },
  discrete: { initiativeParJour: 1, curiosite: 25, doubleMessage: 4, vuSansReponse: 4, fautesFrappe: 3, probaJourOff: 8, memoireTous: 10, memoire: 40, parlerSouvenirs: false, langageOral: true },
  econome: { initiativeParJour: 2, curiosite: 35, doubleMessage: 8, vuSansReponse: 6, fautesFrappe: 5, probaJourOff: 12, memoireTous: 16, memoire: 30, parlerSouvenirs: true, langageOral: true },
};

$('profil').addEventListener('change', () => {
  const p = PROFILS[$('profil').value];
  if (!p) return;
  Object.entries(p).forEach(([cle, v]) => {
    const el = document.querySelector(`[data-key="${cle}"]`);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v;
  });
  $('profilInfo').textContent = 'Profil appliqué. Clique sur « Enregistrer » pour le garder.';
});

// ----- Éditeur de mémoire -----
let memoires = {};

function afficherMemoire() {
  const numero = $('memNumero').value;
  const m = memoires[numero] || {};
  $('memFaits').value = m.faits || '';
  $('memEpisodes').value = (m.episodes || []).map((e) => `${e.date} | ${e.texte}`).join('\n');
  $('memElle').value = (m.elle || []).map((e) => `${e.date} | ${e.texte}`).join('\n');
}

async function chargerMemoire() {
  memoires = (await window.api.getMemoire()) || {};
  const liste = Object.keys(memoires);
  const choix = $('memNumero');
  const courant = choix.value;
  choix.innerHTML = '';
  (liste.length ? liste : ['']).forEach((n) => {
    const o = document.createElement('option');
    o.value = n;
    o.textContent = n || '(aucune mémoire pour l\'instant)';
    choix.appendChild(o);
  });
  if (liste.includes(courant)) choix.value = courant;
  afficherMemoire();
}

$('memNumero').addEventListener('change', afficherMemoire);
$('btnMemCharger').addEventListener('click', async () => { await chargerMemoire(); message('Mémoire rechargée.'); });
$('btnMemSauver').addEventListener('click', async () => {
  const numero = $('memNumero').value;
  if (!numero) { message('Aucune mémoire à enregistrer : elle se remplit en discutant.'); return; }
  await window.api.saveMemoire(numero, $('memFaits').value, $('memEpisodes').value, $('memElle').value);
  await chargerMemoire();
  message('Mémoire enregistrée.');
});

window.api.getConfig().then((cfg) => { afficherConfig(cfg); majFournisseur(); });
majStatut('Arrêté');
chargerMemoire().catch(() => {});
