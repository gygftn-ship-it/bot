// Le calendrier de Lina : dates hégiriennes (Ramadan, Aïd), fêtes algériennes et kabyles,
// anniversaires, coucher du soleil (heure de l'iftar). Fonctions pures, sans dépendance.

const num = (v, d) => (v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? d : Number(v));
const JOUR_MS = 86400000;
const JOURS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// Date et heure dans le fuseau du personnage (indépendant du fuseau du PC).
function dateLocale(date = new Date(), fuseau) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: fuseau || undefined,
      hourCycle: 'h23',
      hour: 'numeric',
      minute: 'numeric',
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const g = (t) => parts.find((p) => p.type === t).value;
    const h = Number(g('hour')) % 24;
    const m = Number(g('minute'));
    return { y: Number(g('year')), mo: Number(g('month')), d: Number(g('day')), h, m, minutes: h * 60 + m, jour: JOURS[g('weekday')], cle: `${g('year')}-${g('month')}-${g('day')}` };
  } catch (e) {
    const h = date.getHours();
    const m = date.getMinutes();
    const mo = date.getMonth() + 1;
    const d = date.getDate();
    return { y: date.getFullYear(), mo, d, h, m, minutes: h * 60 + m, jour: date.getDay(), cle: `${date.getFullYear()}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
  }
}

// ---------- Calendrier hégirien ----------

// decalage : nombre de jours de retard de ton pays sur l'Arabie saoudite (l'Algérie commence souvent
// le Ramadan un jour plus tard). 0 par défaut ; mets 1 si tes dates sont en avance d'un jour.
function hegire(date = new Date(), cfg = {}) {
  const fuseau = cfg.fuseau || 'Africa/Algiers';
  const decalage = Math.round(num(cfg.decalageHegire, 0));
  try {
    const d = new Date(date.getTime() - decalage * JOUR_MS);
    const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', {
      timeZone: fuseau, day: 'numeric', month: 'numeric', year: 'numeric',
    }).formatToParts(d);
    const g = (t) => Number(parts.find((p) => p.type === t).value);
    const r = { jour: g('day'), mois: g('month'), an: g('year') };
    return r.jour >= 1 && r.mois >= 1 && r.mois <= 12 ? r : null;
  } catch (e) {
    return null;
  }
}

function estRamadan(date = new Date(), cfg = {}) {
  if (cfg.ramadanAuto === false || cfg.calendrierActif === false) return false;
  const h = hegire(date, cfg);
  return !!h && h.mois === 9;
}

// ---------- Coucher du soleil (iftar) ----------

// Formule astronomique simplifiée (précision de l'ordre de la dizaine de minutes).
// Renvoie les minutes depuis minuit, à l'heure locale du fuseau.
function coucherSoleil(date = new Date(), cfg = {}) {
  const fuseau = cfg.fuseau || 'Africa/Algiers';
  const lat = num(cfg.latitude, 36.71) * Math.PI / 180; // Tizi Ouzou
  const lon = num(cfg.longitude, 4.05);
  const t = dateLocale(date, fuseau);
  const debutAn = Date.UTC(t.y, 0, 0);
  const n = Math.round((Date.UTC(t.y, t.mo - 1, t.d) - debutAn) / JOUR_MS);
  const g = (2 * Math.PI / 365) * (n - 1);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const cosHa = Math.cos(90.833 * Math.PI / 180) / (Math.cos(lat) * Math.cos(decl)) - Math.tan(lat) * Math.tan(decl);
  const ha = (Math.acos(Math.max(-1, Math.min(1, cosHa))) * 180) / Math.PI;
  const coucherUtc = 720 - 4 * (lon - ha) - eq;
  // décalage horaire du fuseau à cet instant
  const utc = date.getUTCHours() * 60 + date.getUTCMinutes();
  const decalage = ((t.minutes - utc + 1440 + 720) % 1440) - 720;
  return Math.round(((coucherUtc + decalage) % 1440 + 1440) % 1440);
}

// ---------- Fêtes et anniversaires ----------

// « 04/09 », « 4-9 » ou « 04.09 » (jour puis mois) -> { j, m } ou null.
function parseJJMM(texte) {
  const m = String(texte || '').trim().match(/^(\d{1,2})\s*[/.\-]\s*(\d{1,2})$/);
  if (!m) return null;
  const j = Number(m[1]);
  const mo = Number(m[2]);
  return j >= 1 && j <= 31 && mo >= 1 && mo <= 12 ? { j, m: mo } : null;
}

const FETES_FIXES = [
  { jj: 1, mm: 1, code: 'nouvel_an', note: "C'est le jour de l'an (1er janvier).", voeux: true },
  { jj: 12, mm: 1, code: 'yennayer', note: "C'est Yennayer, le Nouvel An amazigh (Asegwas ameggaz) : en Kabylie, on le fête en famille avec un grand repas (couscous, fruits secs, œufs).", voeux: true },
  { jj: 14, mm: 2, code: 'valentin', note: "C'est la Saint-Valentin.", voeux: true },
  { jj: 8, mm: 3, code: 'journee_femme', note: "C'est la Journée internationale des droits des femmes (8 mars).", voeux: false },
  { jj: 20, mm: 4, code: 'tafsut', note: "C'est le 20 avril, le Printemps berbère (Tafsut Imazighen) : une date importante en Kabylie, mémoire de 1980.", voeux: false },
  { jj: 5, mm: 7, code: 'independance', note: "C'est la fête de l'indépendance de l'Algérie (5 juillet) : jour férié, drapeaux partout.", voeux: false },
  { jj: 1, mm: 11, code: 'revolution', note: "C'est le 1er novembre, anniversaire du début de la Révolution : jour férié en Algérie.", voeux: false },
];

const CONSIGNES_VOEUX = {
  anniv_moi: "C'est son anniversaire aujourd'hui. Écris-lui un vrai message d'anniversaire, chaleureux et personnel (2 ou 3 phrases courtes, un peu plus long que d'habitude), appuyé sur ce que tu sais vraiment de lui (mémoire). Pas de formule toute faite.",
  aid_fitr: "C'est l'Aïd el-Fitr. Souhaite-lui « Aïd Moubarak » à ta façon, naturellement, avec un mot sur ta matinée en famille.",
  aid_adha: "C'est l'Aïd el-Adha. Souhaite-lui « Aïd Moubarak » à ta façon, naturellement, avec un mot sur la journée en famille.",
  yennayer: "C'est Yennayer. Souhaite-lui « Assegwas ameggaz » (bonne année amazighe) à ta façon, avec un mot sur le repas de famille.",
  ramadan_debut: "C'est le premier jour du Ramadan. Envoie-lui un petit mot (« Ramadan Moubarak » ou « Ramadan karim »), naturel, sans en faire trop.",
  nouvel_an: "C'est le jour de l'an. Souhaite-lui une bonne année, avec tendresse et un petit mot personnel.",
  valentin: "C'est la Saint-Valentin. Envoie-lui un mot tendre et un peu taquin, sans exagérer ni faire de reproche si vous n'avez rien prévu.",
};

// Ce qui est « spécial » aujourd'hui, avec une note pour le prompt. Chaque élément : { code, note, voeux }.
function joursSpeciaux(date = new Date(), cfg = {}) {
  if (cfg.calendrierActif === false) return [];
  const fuseau = cfg.fuseau || 'Africa/Algiers';
  const t = dateLocale(date, fuseau);
  const moi = cfg.prenomMoi || 'lui';
  const liste = [];

  const annivMoi = parseJJMM(cfg.anniversaireMoi === undefined ? '04/09' : cfg.anniversaireMoi);
  const annivElle = parseJJMM(cfg.anniversaireElle === undefined ? '22/12' : cfg.anniversaireElle);
  if (annivMoi && annivMoi.j === t.d && annivMoi.m === t.mo) liste.push({ code: 'anniv_moi', note: `C'est l'anniversaire de ${moi} aujourd'hui !`, voeux: true });
  if (annivElle && annivElle.j === t.d && annivElle.m === t.mo) {
    liste.push({ code: 'anniv_elle', note: "C'est TON anniversaire aujourd'hui : tu es contente, famille et amies t'ont écrit. Tu serais touchée qu'il y pense, mais tu ne lui fais jamais de reproche s'il oublie.", voeux: false });
  }
  for (let k = 1; k <= 10; k++) {
    const f = new Date(Date.UTC(t.y, t.mo - 1, t.d + k));
    const jj = f.getUTCDate();
    const mm = f.getUTCMonth() + 1;
    if (k <= 10 && annivMoi && annivMoi.j === jj && annivMoi.m === mm) {
      liste.push({ code: 'anniv_moi_proche', note: `L'anniversaire de ${moi} est dans ${k} jour${k > 1 ? 's' : ''} : tu y penses, tu prépares peut-être une surprise ou un cadeau. Garde le secret, ne dis pas ce que tu prépares.`, voeux: false });
    }
    if (k <= 7 && annivElle && annivElle.j === jj && annivElle.m === mm) {
      liste.push({ code: 'anniv_elle_proche', note: `Ton anniversaire approche (dans ${k} jour${k > 1 ? 's' : ''}) : tu en parles peut-être avec Ania, sans rien demander à ${moi}.`, voeux: false });
    }
  }

  for (const f of FETES_FIXES) {
    if (f.jj === t.d && f.mm === t.mo) liste.push({ code: f.code, note: f.note, voeux: f.voeux });
  }

  const h = hegire(date, cfg);
  if (h) {
    if (h.mois === 9 && cfg.ramadanAuto !== false) {
      let note = `C'est le Ramadan (jour ${h.jour}) : tu jeûnes de l'aube au coucher du soleil, tu es plus fatiguée en journée, tu romps le jeûne (iftar) en famille et tu veilles plus tard le soir.`;
      if (h.jour === 27) note += ' Cette nuit est la nuit du destin (27e nuit), très importante pour ta famille.';
      liste.push({ code: h.jour === 1 ? 'ramadan_debut' : 'ramadan', note, voeux: h.jour === 1 });
    }
    if (h.mois === 10 && h.jour <= 2) liste.push({ code: 'aid_fitr', note: "C'est l'Aïd el-Fitr, la fête de fin du Ramadan : habits neufs, gâteaux, visites à la famille.", voeux: h.jour === 1 });
    if (h.mois === 12 && h.jour >= 10 && h.jour <= 12) {
      liste.push({ code: 'aid_adha', note: h.jour === 10 ? "C'est l'Aïd el-Adha (la fête du mouton) : sacrifice en famille, grillades, visites." : "C'est le lendemain de l'Aïd el-Adha : de la viande partout, des visites en famille.", voeux: h.jour === 10 });
    }
    if (h.mois === 3 && h.jour === 12) liste.push({ code: 'mawlid', note: "C'est le Mawlid (anniversaire du Prophète) : dans beaucoup de familles, on prépare un plat spécial (rechta, chorba).", voeux: false });
    if (h.mois === 1 && h.jour === 1) liste.push({ code: 'ras_el_am', note: "C'est le Nouvel An hégirien (Ras el-Am).", voeux: false });
  }

  if (t.jour === 5) liste.push({ code: 'vendredi', note: "C'est vendredi, jour de repos en Algérie : pas de cours, couscous en famille à midi, la prière du vendredi pour ton père.", voeux: false });
  return liste;
}

module.exports = { dateLocale, hegire, estRamadan, coucherSoleil, parseJJMM, joursSpeciaux, CONSIGNES_VOEUX, FETES_FIXES };
