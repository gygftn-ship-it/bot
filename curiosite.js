// Curiosité : elle s'intéresse à toi et te pose de vraies questions.
// - un réglage 0-100 décide à quelle fréquence elle termine son message par une question ;
// - soit une question « de suite » (un détail de ce que tu viens de dire), soit un sujet nouveau pour faire connaissance ;
// - elle varie les sujets (jamais deux fois le même de suite) et évite l'effet questionnaire.
// Fonctions pures, testables.

const THEMES = [
  'ce qu\'il a mangé ou ce qu\'il aime cuisiner',
  'son travail ou ses études, ce qu\'il y aime ou pas',
  'un souvenir d\'enfance',
  'sa famille, ses frères et sœurs, ses parents',
  'la musique qu\'il écoute en ce moment',
  'une série, un film ou un livre qu\'il aime',
  'ses projets pour le week-end ou les vacances',
  'un rêve ou un projet qu\'il aimerait réaliser',
  'ce qui l\'a fait rire récemment',
  'ses amis proches',
  'un endroit où il rêve d\'aller',
  'ses habitudes du matin ou du soir',
  'ce qui l\'énerve ou le stresse en ce moment',
  'son sport ou ses loisirs',
  'sa ville, son quartier, ce qu\'il y aime',
  'un talent ou un truc dont il est fier',
  'sa plus belle rencontre ou son plus beau voyage',
  'ce qu\'il aurait fait dans une autre vie',
  'ses plats préférés et ceux qu\'il déteste',
  'ce qu\'il pense de leur relation, ce qu\'il aime chez elle',
];

const finitParQuestion = (t) => /\?\s*(\p{Extended_Pictographic}|\uFE0F|\s)*$/u.test(String(t || '').trim());

const contenu = (x) => String(x.content || '').replace(/\[REACT[^\]]*\]/gi, '').replace(/\[CITE[^\]]*\]/gi, '').replace(/\[RIEN\]/gi, '').trim();

// Combien de ses derniers messages d'affilée n'ont pas posé de question.
function serieSansQuestion(historique) {
  const msgs = (historique || []).filter((x) => x.role === 'model').map(contenu).filter(Boolean);
  let n = 0;
  for (let i = msgs.length - 1; i >= 0 && !finitParQuestion(msgs[i]); i--) n++;
  return n;
}

function derniereFinitParQuestion(historique) {
  const msgs = (historique || []).filter((x) => x.role === 'model').map(contenu).filter(Boolean);
  return msgs.length ? finitParQuestion(msgs[msgs.length - 1]) : false;
}

// Décide si elle pose une question cette fois, et laquelle. Retourne null (pas de question) ou { mode, theme? }.
function choisirQuestion(curiosite, ctx = {}, r = Math.random) {
  const c = Math.max(0, Math.min(100, Number(curiosite) || 0));
  if (c <= 0) return null;
  let p = c / 100;
  if (ctx.derniereFinitParQuestion) p *= 0.5; // elle vient de poser une question : pas deux fois de suite
  if ((ctx.sansQuestion || 0) >= 3) p = Math.min(1, p * 1.5); // longtemps sans rien demander : elle s'intéresse un peu plus
  if (r() >= p) return null;
  const msg = String(ctx.message || '');
  const riche = msg.length >= 60;
  const recents = new Set(ctx.themesRecents || []);
  if (riche || r() < 0.65) return { mode: 'suite' };
  const libres = THEMES.filter((t) => !recents.has(t));
  const pool = libres.length ? libres : THEMES;
  return { mode: 'sujet', theme: pool[Math.floor(r() * pool.length)] };
}

// Consigne ajoutée au prompt quand elle doit poser une question.
function blocQuestion(decision) {
  if (!decision) return '';
  const lignes = ['=== UNE QUESTION À POSER CETTE FOIS ==='];
  if (decision.mode === 'sujet') {
    lignes.push(`- Réagis d'abord à son message, puis pose-lui une vraie question pour mieux le connaître, sur ce thème : ${decision.theme}. Reformule-la à ta façon, comme une curiosité spontanée.`);
    lignes.push('- Si le moment ne s\'y prête pas (il est triste, pressé, en plein sujet sérieux), pose plutôt une question sur ce qu\'il vient de dire.');
  } else {
    lignes.push('- Réagis à son message, puis finis par une vraie question qui prolonge ce qu\'il vient de dire : un détail, une émotion, la suite. Pas un « et toi ? » automatique.');
  }
  lignes.push('- Une seule question, courte, naturelle, jamais une série. Ne redemande pas ce que tu sais déjà (ta mémoire, la conversation).');
  return lignes.join('\n');
}

module.exports = { THEMES, finitParQuestion, serieSansQuestion, derniereFinitParQuestion, choisirQuestion, blocQuestion };
