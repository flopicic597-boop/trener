// Стручни прорачуни (процјене): калипер и % масти, антропометрија, енергетска потрошња,
// пулсне зоне, процијењени 1RM, оптерећење тренинга и присуство.
// Све вриједности су ПРОЦЈЕНЕ по објављеним формулама; у апликацији су тако и означене.
import { isValidDate, parseDate, addDays, weekStart, daysBetween } from '../lib/util.js';

/* ------------------------------------------------------------------ */
/* Узраст                                                               */
/* ------------------------------------------------------------------ */
export function ageAt(birthDate, onDate) {
  if (!isValidDate(birthDate) || !isValidDate(onDate)) return null;
  const b = parseDate(birthDate), d = parseDate(onDate);
  let a = d.getFullYear() - b.getFullYear();
  if (d.getMonth() < b.getMonth() || (d.getMonth() === b.getMonth() && d.getDate() < b.getDate())) a--;
  return a >= 0 && a < 120 ? a : null;
}

/* ------------------------------------------------------------------ */
/* Калипер (кожни набори, mm) → густина тијела → % масти (Siri)         */
/* ------------------------------------------------------------------ */
export const SITES = {
  chest: 'Груди (прсни)', midaxillary: 'Средња пазушна линија', triceps: 'Трицепс', biceps: 'Бицепс',
  subscapular: 'Испод лопатице', abdomen: 'Стомак (поред пупка)', suprailiac: 'Изнад кука (супраилијачни)', thigh: 'Бутина',
};
export const PROTOCOLS = {
  jp7: { name: 'Jackson-Pollock, 7 мјеста', sites: { m: ['chest', 'midaxillary', 'triceps', 'subscapular', 'abdomen', 'suprailiac', 'thigh'], f: ['chest', 'midaxillary', 'triceps', 'subscapular', 'abdomen', 'suprailiac', 'thigh'] } },
  jp3: { name: 'Jackson-Pollock, 3 мјеста', sites: { m: ['chest', 'abdomen', 'thigh'], f: ['triceps', 'suprailiac', 'thigh'] } },
  dw4: { name: 'Durnin-Womersley, 4 мјеста', sites: { m: ['biceps', 'triceps', 'subscapular', 'suprailiac'], f: ['biceps', 'triceps', 'subscapular', 'suprailiac'] } },
};
// Durnin & Womersley (1974): BD = c − m·log10(Σ4); по полу и узрасту
const DW = {
  m: [[19, 1.1620, 0.0630], [29, 1.1631, 0.0632], [39, 1.1422, 0.0544], [49, 1.1620, 0.0700], [200, 1.1715, 0.0779]],
  f: [[19, 1.1549, 0.0678], [29, 1.1599, 0.0717], [39, 1.1423, 0.0632], [49, 1.1333, 0.0612], [200, 1.1339, 0.0645]],
};

/** Просјек поновљених мјерења истог набора (1–3 мјерења); празна се занемарују */
export const avgSite = (arr) => { const v = (arr || []).filter((x) => typeof x === 'number' && Number.isFinite(x) && x > 0); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };

/** Густина тијела (g/cm³) или null ако недостаје податак */
export function bodyDensity(protocol, sex, age, sitesMm) {
  const p = PROTOCOLS[protocol];
  if (!p || !['m', 'f'].includes(sex) || !(age >= 15 && age < 100)) return null;
  const vals = p.sites[sex].map((s) => sitesMm[s]);
  if (vals.some((v) => !(typeof v === 'number' && v > 0))) return null;
  const S = vals.reduce((a, b) => a + b, 0);
  if (protocol === 'jp7') return sex === 'm'
    ? 1.112 - 0.00043499 * S + 0.00000055 * S * S - 0.00028826 * age
    : 1.097 - 0.00046971 * S + 0.00000056 * S * S - 0.00012828 * age;
  if (protocol === 'jp3') return sex === 'm'
    ? 1.10938 - 0.0008267 * S + 0.0000016 * S * S - 0.0002574 * age
    : 1.0994921 - 0.0009929 * S + 0.0000023 * S * S - 0.0001392 * age;
  const [, c, m] = DW[sex].find(([max]) => age <= max);
  return c - m * Math.log10(S);
}
/** Siri (1961): % масти = 495 / BD − 450 */
export const siri = (bd) => (bd ? 495 / bd - 450 : null);

/** Комплетна процјена: {sum, density, fatPct, fatKg, leanKg} */
export function caliperResult({ protocol, sex, age, sitesMm, weightKg }) {
  const bd = bodyDensity(protocol, sex, age, sitesMm);
  if (!bd) return null;
  const fatPct = siri(bd);
  const sites = PROTOCOLS[protocol].sites[sex];
  const out = { sum: sites.reduce((a, s) => a + sitesMm[s], 0), density: bd, fatPct, fatKg: null, leanKg: null };
  if (weightKg > 0) { out.fatKg = weightKg * fatPct / 100; out.leanKg = weightKg - out.fatKg; }
  return out;
}

/* ------------------------------------------------------------------ */
/* Антропометрија                                                       */
/* ------------------------------------------------------------------ */
export const bmi = (kg, cm) => (kg > 0 && cm > 0 ? kg / ((cm / 100) ** 2) : null);
export const whr = (waist, hip) => (waist > 0 && hip > 0 ? waist / hip : null);
export const whtr = (waist, cm) => (waist > 0 && cm > 0 ? waist / cm : null);
/** Граница повећаног ризика (СЗО): WHR ≥ 0,90 мушкарци, ≥ 0,85 жене; WHtR ≥ 0,5 */
export const whrLimit = (sex) => (sex === 'f' ? 0.85 : 0.9);
export const WHTR_LIMIT = 0.5;

/* ------------------------------------------------------------------ */
/* Енергија и исхрана (Mifflin-St Jeor)                                 */
/* ------------------------------------------------------------------ */
export const ACTIVITY = {
  1.2: 'Мало кретања (канцеларијски посао)', 1.375: 'Лагано активан (1–3 тренинга седмично)',
  1.55: 'Умјерено активан (3–5 тренинга)', 1.725: 'Веома активан (6–7 тренинга)', 1.9: 'Изузетно активан (физички посао + тренинг)',
};
export function bmr(sex, kg, cm, age) {
  if (!['m', 'f'].includes(sex) || !(kg > 0) || !(cm > 0) || !(age > 0)) return null;
  return 10 * kg + 6.25 * cm - 5 * age + (sex === 'm' ? 5 : -161);
}
/** Дневни циљеви према циљу клијента (оријентационо) */
export function nutritionTargets({ sex, kg, cm, age, activity = 1.375, goalDir = 'none' }) {
  const b = bmr(sex, kg, cm, age);
  if (!b) return null;
  const tdee = b * activity;
  const factor = goalDir === 'down' ? 0.85 : goalDir === 'up' ? 1.1 : 1;
  return {
    bmr: b, tdee, kcal: tdee * factor,
    protein: [kg * (goalDir === 'down' ? 1.8 : 1.6), kg * 2.2], // g/дан
    waterL: kg * 0.035,
  };
}

/* ------------------------------------------------------------------ */
/* Пулсне зоне (Karvonen) — HRmax по Tanaka (208 − 0,7 × узраст)        */
/* ------------------------------------------------------------------ */
export const hrMax = (age) => (age > 0 ? 208 - 0.7 * age : null);
export const ZONES = [
  [1, 'Опоравак', 0.5, 0.6], [2, 'Аеробна основа', 0.6, 0.7], [3, 'Аеробни темпо', 0.7, 0.8], [4, 'Праг', 0.8, 0.9], [5, 'Максимално', 0.9, 1.0],
];
export function karvonen(age, restHr) {
  const max = hrMax(age);
  if (!max || !(restHr > 25 && restHr < max)) return null;
  const hrr = max - restHr;
  return { max: Math.round(max), rest: restHr, zones: ZONES.map(([n, name, lo, hi]) => ({ n, name, from: Math.round(restHr + lo * hrr), to: Math.round(restHr + hi * hrr) })) };
}

/* ------------------------------------------------------------------ */
/* Процијењени 1RM и рекорди                                            */
/* ------------------------------------------------------------------ */
/** Epley: 1RM = kg × (1 + понављања / 30); поуздано до ~12 понављања */
export function e1rm(kg, reps) {
  if (!(kg > 0) || !(reps > 0) || reps > 15) return null;
  return reps === 1 ? kg : kg * (1 + reps / 30);
}
/** Рекорди по вјежби из завршених серија са оптерећењем: [{exerciseId, best1rm, bestKg, ...}] */
export function personalRecords(sets, sessionsById) {
  const by = new Map();
  for (const s of sets) {
    if (s.done !== 1 || s.deleted || !(s.weightKg > 0) || !(s.reps > 0)) continue;
    const ses = sessionsById.get(s.sessionId);
    if (!ses || ses.deleted) continue;
    const r = by.get(s.exerciseId) || { exerciseId: s.exerciseId, best1rm: null, best1rmDate: null, bestKg: null, bestKgReps: null, bestKgDate: null };
    const e = e1rm(s.weightKg, s.reps);
    if (e && (r.best1rm === null || e > r.best1rm)) { r.best1rm = e; r.best1rmDate = ses.date; }
    if (r.bestKg === null || s.weightKg > r.bestKg || (s.weightKg === r.bestKg && s.reps > r.bestKgReps)) { r.bestKg = s.weightKg; r.bestKgReps = s.reps; r.bestKgDate = ses.date; }
    by.set(s.exerciseId, r);
  }
  return [...by.values()];
}
/** Серија 1RM кроз вријеме за једну вјежбу: [{x: датум, y: најбољи e1RM тог дана}] */
export function e1rmSeries(sets, sessionsById, exerciseId) {
  const day = new Map();
  for (const s of sets) {
    if (s.exerciseId !== exerciseId || s.done !== 1 || s.deleted) continue;
    const ses = sessionsById.get(s.sessionId); const e = e1rm(s.weightKg, s.reps);
    if (!ses || !e) continue;
    day.set(ses.date, Math.max(day.get(ses.date) || 0, e));
  }
  return [...day.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([x, y]) => ({ x, y }));
}

/* ------------------------------------------------------------------ */
/* Оптерећење тренинга (sRPE) и однос акутног и хроничног оптерећења     */
/* ------------------------------------------------------------------ */
export const sessionLoad = (s) => (s && s.status === 'done' && s.rpe > 0 && s.durationMin > 0 ? s.rpe * s.durationMin : null);
/**
 * ACWR на дан `day`: акутно = збир оптерећења посљедњих 7 дана; хронично = просјечно седмично
 * оптерећење посљедњих 28 дана. Без бар 3 седмице података враћа null (нема поузданог закључка).
 */
export function acwr(sessions, day) {
  const loads = sessions.map((s) => ({ d: s.date, l: sessionLoad(s) })).filter((x) => x.l !== null && x.d <= day);
  if (!loads.length) return null;
  const first = loads.reduce((m, x) => (x.d < m ? x.d : m), day);
  if (daysBetween(first, day) < 21) return null;
  const sum = (from) => loads.filter((x) => x.d > from).reduce((a, x) => a + x.l, 0);
  const acute = sum(addDays(day, -7)), chronic = sum(addDays(day, -28)) / 4;
  if (!chronic) return null;
  const ratio = acute / chronic;
  return { acute, chronic, ratio, level: ratio > 1.5 ? 'high' : ratio < 0.8 ? 'low' : 'ok' };
}
/** Седмично оптерећење (збир sRPE) по седмицама */
export function weeklyLoad(sessions) {
  const m = new Map();
  for (const s of sessions) { const l = sessionLoad(s); if (l === null) continue; const w = weekStart(s.date); m.set(w, (m.get(w) || 0) + l); }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([x, y]) => ({ x, y }));
}

/* ------------------------------------------------------------------ */
/* Обим по мишићној групи и присуство                                   */
/* ------------------------------------------------------------------ */
/** Број завршених серија по категорији вјежбе у периоду: {категорија: број} */
export function setsByCategory(sets, exMap, sessionsById, from, to) {
  const out = {};
  for (const s of sets) {
    if (s.done !== 1 || s.deleted) continue;
    const ses = sessionsById.get(s.sessionId);
    if (!ses || ses.date < from || ses.date > to) continue;
    const cat = exMap.get(s.exerciseId)?.category || 'Остало';
    out[cat] = (out[cat] || 0) + 1;
  }
  return out;
}
/** Присуство: одржани / (одржани + прескочени) у периоду, и низ узастопних седмица са бар једним тренингом */
export function attendance(sessions, from, to, today) {
  const inP = sessions.filter((s) => !s.deleted && s.date >= from && s.date <= to && s.date <= today);
  const done = inP.filter((s) => s.status === 'done').length, skipped = inP.filter((s) => s.status === 'skipped').length;
  const weeks = new Set(sessions.filter((s) => !s.deleted && s.status === 'done').map((s) => weekStart(s.date)));
  let streak = 0, w = weekStart(today);
  if (!weeks.has(w)) w = addDays(w, -7); // текућа седмица још траје
  while (weeks.has(w)) { streak++; w = addDays(w, -7); }
  return { done, skipped, pct: done + skipped ? done / (done + skipped) : null, streak };
}
