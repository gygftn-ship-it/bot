// Fournisseurs d'IA autres que Gemini (Claude d'Anthropic, ou toute API compatible OpenAI :
// OpenAI, OpenRouter, Mistral, DeepSeek, Groq, un serveur local…) + outils communs.

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

const MODELES_DEFAUT = {
  anthropic: 'claude-haiku-5-5', // économique ; « claude-sonnet-5-5 » écrit en général plus naturellement
  openai: '',
};

const URL_OPENAI_DEFAUT = 'https://api.openai.com/v1';

// Les API exigent une alternance stricte user / assistant et un premier message « user ».
// On fusionne donc les tours consécutifs du même rôle (ex. deux messages spontanés de suite).
function fusionnerRoles(messages, nomIA = 'assistant') {
  const sortie = [];
  for (const m of messages || []) {
    if (!m || !String(m.content || '').trim()) continue;
    const role = m.role === 'model' || m.role === 'assistant' ? nomIA : 'user';
    const dernier = sortie[sortie.length - 1];
    if (dernier && dernier.role === role) {
      dernier.content += '\n\n' + m.content;
      if (m.media) dernier.media = m.media;
    } else {
      sortie.push({ role, content: String(m.content), media: m.media });
    }
  }
  // Un message de l'IA tout en tête (ex. premier message spontané) : on garde son contenu derrière un début neutre.
  if (sortie.length && sortie[0].role !== 'user') sortie.unshift({ role: 'user', content: '(début de la conversation)', media: undefined });
  return sortie;
}

const erreurHttp = (data, status) => String((data && data.error && (data.error.message || data.error)) || `Erreur HTTP ${status}`).split('\n')[0];

async function appelerAvecReprise(url, options, extraireTexte, nom) {
  let derniere = '';
  for (let essai = 0; essai < 2; essai++) {
    let res;
    let data;
    try {
      res = await fetch(url, { ...options, signal: AbortSignal.timeout(45000) });
      data = await res.json().catch(() => ({}));
    } catch (e) {
      derniere = `${nom} ne répond pas (${e.message})`;
      if (essai === 0) { await attendre(2000); continue; }
      throw new Error(derniere);
    }
    if (res.ok) {
      const texte = extraireTexte(data);
      if (!texte) throw new Error(`${nom} n'a pas renvoyé de texte.`);
      return texte;
    }
    derniere = erreurHttp(data, res.status);
    if ((res.status === 429 || res.status >= 500) && essai === 0) {
      await attendre(3000 + Math.random() * 3000);
      continue;
    }
    if (res.status === 401 || res.status === 403) throw new Error(`Clé API refusée par ${nom} : ${derniere}`);
    throw new Error(`${nom} : ${derniere}`);
  }
  throw new Error(`${nom} : ${derniere}`);
}

async function appelerAnthropic({ cle, modele }, system, messages) {
  const msgs = fusionnerRoles(messages, 'assistant').map((m) => {
    if (!m.media) return { role: m.role, content: m.content };
    if (!/^image\//.test(m.media.mimeType)) throw new Error('Claude ne prend pas en charge ce type de média (audio) : message non écouté.');
    return {
      role: m.role,
      content: [
        { type: 'image', source: { type: 'base64', media_type: m.media.mimeType, data: m.media.data } },
        { type: 'text', text: m.content },
      ],
    };
  });
  return appelerAvecReprise(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': cle, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: modele || MODELES_DEFAUT.anthropic, max_tokens: 1024, system, messages: msgs }),
    },
    (d) => (d.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim(),
    'Anthropic'
  );
}

async function appelerOpenAI({ cle, modele, baseUrl }, system, messages) {
  if (!modele) throw new Error('Indique le nom du modèle dans « Modèle (autre fournisseur) ».');
  const msgs = fusionnerRoles(messages, 'assistant').map((m) => {
    if (!m.media) return { role: m.role, content: m.content };
    if (!/^image\//.test(m.media.mimeType)) throw new Error('Ce fournisseur ne prend pas en charge l\'audio : message non écouté.');
    return {
      role: m.role,
      content: [
        { type: 'image_url', image_url: { url: `data:${m.media.mimeType};base64,${m.media.data}` } },
        { type: 'text', text: m.content },
      ],
    };
  });
  const base = String(baseUrl || URL_OPENAI_DEFAUT).replace(/\/+$/, '');
  return appelerAvecReprise(
    `${base}/chat/completions`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${cle}` },
      body: JSON.stringify({ model: modele, messages: [{ role: 'system', content: system }, ...msgs] }),
    },
    (d) => String((d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '').trim(),
    'Le fournisseur'
  );
}

module.exports = { fusionnerRoles, appelerAnthropic, appelerOpenAI, MODELES_DEFAUT, URL_OPENAI_DEFAUT };
