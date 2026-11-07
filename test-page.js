// Vérifie, sans connexion, que les réactions et les envois par la page WhatsApp Web trouvent leurs fonctions
// même quand les noms de modules ont changé. `node test-page.js`
const assert = require('assert');
const { PAGE_REACTION, PAGE_CITATION_VERIF, PAGE_CITATION_ENVOI, lancerDansPage } = require('./bot');

let ok = 0;
const essai = async (nom, fn) => { try { await fn(); ok++; console.log('  ok  ' + nom); } catch (e) { console.log('ÉCHEC ' + nom + ' : ' + e.message); process.exitCode = 1; } };

// Fausse page : exécute le code comme le ferait page.evaluate, avec une fausse « window ».
function fausseVersion(modules, collections) {
  const envoyes = [];
  const msg = { id: { _serialized: 'false_213@c.us_ABC', id: 'ABC' }, canReply: () => true };
  const chat = { id: { _serialized: '213@c.us' } };
  const cols = collections || { Msg: { get: (i) => (i === msg.id._serialized ? msg : null), getModelsArray: () => [msg] }, Chat: { get: () => chat, find: async () => chat } };
  const carte = {};
  for (const nom of Object.keys(modules)) carte[nom] = true;
  const W = {
    require: (n) => {
      if (n === 'WAWebCollections') return cols;
      if (n === '__debug') return { modulesMap: carte };
      if (modules[n]) return modules[n](envoyes, msg);
      throw new Error('module inconnu ' + n);
    },
    Store: undefined,
  };
  return { envoyes, page: { evaluate: (source) => new Function('window', 'return ' + source)(W) } };
}

(async () => {
  await essai('réaction : trouvée même sous un nouveau nom de module', async () => {
    const v = fausseVersion({ WAWebNouveauNomReactions: (env) => ({ sendReactionToMsg: async (m, e) => { env.push(['react', e]); } }) });
    const r = await lancerDansPage(v.page, PAGE_REACTION, 'false_213@c.us_ABC', '❤️', '213@c.us');
    assert(/recherche/.test(r), r);
    assert.deepStrictEqual(v.envoyes, [['react', '❤️']]);
  });
  await essai('réaction : module connu utilisé en premier', async () => {
    const v = fausseVersion({ WAWebSendReactionMsgAction: (env) => ({ sendReactionToMsg: async (m, e) => { env.push(['react', e]); } }) });
    const r = await lancerDansPage(v.page, PAGE_REACTION, 'false_213@c.us_ABC', '👍', '213@c.us');
    assert(/WAWebSendReactionMsgAction/.test(r), r);
  });
  await essai('réaction : erreur claire si la fonction n\'existe nulle part', async () => {
    const v = fausseVersion({});
    await assert.rejects(lancerDansPage(v.page, PAGE_REACTION, 'x', '❤️', ''), /introuvable/);
  });
  await essai('citation : message retrouvé et envoi avec citation par un module renommé', async () => {
    const v = fausseVersion({ WAWebSendTextNouveauNom: (env) => ({ sendTextMsgToChat: async (chat, t, o) => { env.push([t, !!o.quotedMsg]); } }) });
    const r = await lancerDansPage(v.page, PAGE_CITATION_ENVOI, 'false_213@c.us_ABC', '213@c.us', 'salut');
    assert(/WAWebSendTextNouveauNom/.test(r), r);
    assert.deepStrictEqual(v.envoyes, [['salut', true]]);
  });
  await essai('envoi simple (message spontané) : même chemin, sans citation', async () => {
    const v = fausseVersion({ WAWebSendTextMsgChatAction: (env) => ({ sendTextMsgToChat: async (chat, t, o) => { env.push([t, !!o.quotedMsg]); } }) });
    await lancerDansPage(v.page, PAGE_CITATION_ENVOI, '', '213@c.us', 'coucou toi');
    assert.deepStrictEqual(v.envoyes, [['coucou toi', false]]);
  });
  await essai('vérification de la citation : fonctionne avec les collections de secours (pas de Store.Msg)', async () => {
    const v = fausseVersion({});
    const r = await lancerDansPage(v.page, PAGE_CITATION_VERIF, 'false_213@c.us_ABC', '213@c.us');
    assert.strictEqual(r.id, 'false_213@c.us_ABC'); assert.strictEqual(r.peut, true);
  });
  console.log(process.exitCode ? '\nDes vérifications ont échoué.' : `\nTout est bon (${ok} vérifications).`);
})();
