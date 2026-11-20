// Састав тијела: % масти и мишићна маса из обима и основних података (без апарата).
// Све вриједности су ПРОЦЈЕНЕ по објављеним једначинама; грешка ±3–5 % масти у односу на DEXA.
// Калипер (Jackson-Pollock, Durnin-Womersley) је у assessment.js.

const log10 = Math.log10;
const pos = (...v) => v.every((x) => typeof x === 'number' && Number.isFinite(x) && x > 0);

/**
 * Метод америчке морнарице (Hodgdon & Beckett 1984), метричка верзија.
 * Мушкарци: струк (у висини пупка) и врат; жене: струк (најужи дио), кукови и врат. cm.
 */
export function navyFat({ sex, heightCm, waistCm, neckCm, hipCm }) {
  if (sex === 'm') {
    if (!pos(heightCm, waistCm, neckCm) || waistCm - neckCm <= 0) return null;
    return 495 / (1.0324 - 0.19077 * log10(waistCm - neckCm) + 0.15456 * log10(heightCm)) - 450;
  }
  if (sex === 'f') {
    if (!pos(heightCm, waistCm, neckCm, hipCm) || waistCm + hipCm - neckCm <= 0) return null;
    return 495 / (1.29579 - 0.35004 * log10(waistCm + hipCm - neckCm) + 0.221 * log10(heightCm)) - 450;
  }
  return null;
}

/** Relative Fat Mass (Woolcott & Bergman 2018): 64 − 20 × висина/струк + 12 × (жена) */
export function rfmFat({ sex, heightCm, waistCm }) {
  if (!['m', 'f'].includes(sex) || !pos(heightCm, waistCm)) return null;
  return 64 - 20 * (heightCm / waistCm) + (sex === 'f' ? 12 : 0);
}

/** Из BMI (Deurenberg 1991): 1,2 × BMI + 0,23 × узраст − 10,8 × (мушкарац) − 5,4. Најмање тачно код спортиста. */
export function bmiFat({ sex, heightCm, weightKg, age }) {
  if (!['m', 'f'].includes(sex) || !pos(heightCm, weightKg, age)) return null;
  const b = weightKg / (heightCm / 100) ** 2;
  return 1.2 * b + 0.23 * age - 10.8 * (sex === 'm' ? 1 : 0) - 5.4;
}

/**
 * Скелетна мишићна маса (kg), Lee и сар. 2000 (валидирано према МРИ).
 * Са обимима и наборима (тачније): обими надлактице, бутине и потколенице кориговани за кожни набор.
 * Без њих: модел висина–маса–узраст.
 */
export function leeMuscle({ sex, heightCm, weightKg, age, armCm, thighCm, calfCm, tricepsMm, thighMm, calfMm }) {
  if (!['m', 'f'].includes(sex) || !pos(heightCm, age)) return null;
  const h = heightCm / 100, s = sex === 'm' ? 1 : 0;
  if (pos(armCm, thighCm, calfCm, tricepsMm, thighMm, calfMm)) {
    const cag = armCm - Math.PI * tricepsMm / 10, ctg = thighCm - Math.PI * thighMm / 10, ccg = calfCm - Math.PI * calfMm / 10;
    if (cag > 0 && ctg > 0 && ccg > 0) return { kg: h * (0.00744 * cag ** 2 + 0.00088 * ctg ** 2 + 0.00441 * ccg ** 2) + 2.4 * s - 0.048 * age + 7.8, method: 'lee-girth' };
  }
  if (!pos(weightKg)) return null;
  return { kg: 0.244 * weightKg + 7.8 * h - 0.098 * age + 6.6 * s - 3.3, method: 'lee-simple' };
}

/** Индекс немасне масе: FFMI = LBM / висина²; нормализован на 1,8 m (Kouri 1995) */
export function ffmi(leanKg, heightCm) {
  if (!pos(leanKg, heightCm)) return null;
  const h = heightCm / 100, v = leanKg / h ** 2;
  return { ffmi: v, normalized: v + 6.1 * (1.8 - h) };
}

/** Распони % масти (општеприхваћена табела за одрасле) */
const FAT_CLASSES = {
  m: [[6, 'Есенцијална маст / такмичарски', 'warn'], [14, 'Спортиста', 'ok'], [18, 'Добра кондиција', 'ok'], [25, 'Просјечно', 'muted'], [Infinity, 'Повишено', 'bad']],
  f: [[14, 'Есенцијална маст / такмичарски', 'warn'], [21, 'Спортисткиња', 'ok'], [25, 'Добра кондиција', 'ok'], [32, 'Просјечно', 'muted'], [Infinity, 'Повишено', 'bad']],
};
export function fatClass(sex, pct) {
  if (!FAT_CLASSES[sex] || !(pct >= 0)) return null;
  const [, label, tone] = FAT_CLASSES[sex].find(([max]) => pct < max);
  return { label, tone };
}

/**
 * Све доступне процјене из истих улазних података.
 * in: { sex, age, heightCm, weightKg, waistCm, neckCm, hipCm, armCm, thighCm, calfCm, tricepsMm, thighMm, calfMm, caliperPct, scalePct, scaleMuscleKg }
 */
export function bodyComposition(inp) {
  const methods = [];
  const add = (id, name, pct, note) => { if (pct !== null && Number.isFinite(pct) && pct > 1 && pct < 70) methods.push({ id, name, pct, note }); };
  add('caliper', 'Калипер (кожни набори)', inp.caliperPct ?? null, 'најтачније од теренских метода ако мјери искусна особа');
  add('navy', 'Обими (метод америчке морнарице)', navyFat(inp), inp.sex === 'f' ? 'струк, кукови, врат' : 'струк, врат');
  add('bia', 'Вага са биоимпеданцом', inp.scalePct ?? null, 'зависи од хидрације — мјерити ујутро, наташте');
  add('rfm', 'Релативна масна маса (RFM)', rfmFat(inp), 'струк и висина');
  add('bmi', 'Из BMI (Deurenberg)', bmiFat(inp), 'само оријентационо, прецјењује код мишићавих');
  // препоручена вриједност: први доступни по тачности (калипер > обими > вага > RFM > BMI)
  const best = methods[0] || null;
  const out = { methods, best, fatPct: best?.pct ?? null, fatKg: null, leanKg: null, muscle: null, muscleKg: null, musclePct: null, ffmi: null, cls: null };
  if (best && pos(inp.weightKg)) { out.fatKg = inp.weightKg * best.pct / 100; out.leanKg = inp.weightKg - out.fatKg; out.ffmi = ffmi(out.leanKg, inp.heightCm); }
  if (best) out.cls = fatClass(inp.sex, best.pct);
  const lee = leeMuscle(inp);
  if (pos(inp.scaleMuscleKg)) out.muscle = { kg: inp.scaleMuscleKg, method: 'bia' };
  else if (lee) out.muscle = lee;
  if (out.muscle) { out.muscleKg = out.muscle.kg; if (pos(inp.weightKg)) out.musclePct = out.muscle.kg / inp.weightKg * 100; }
  return out;
}

export const MUSCLE_METHOD = { 'lee-girth': 'Lee 2000, обими и набори', 'lee-simple': 'Lee 2000, висина–маса–узраст', bia: 'вага са биоимпеданцом' };
