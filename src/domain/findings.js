// Налази и анализе: каталог параметара, препознавање вриједности из текста налаза,
// поређење два мјерења и напомене за рад. Без базе и интерфејса — лако се тестира.
//
// ВАЖНО: референтни опсези у каталогу су ОРИЈЕНТАЦИОНИ (одрасли). Лабораторије користе своје опсеге,
// зависно од пола, узраста и методе — увијек се предност даје опсегу са самог налаза.
// Напомене су савјети за ТРЕНИНГ, не медицинска процјена. Код одступања лабораторијских
// вриједности клијента треба упутити љекару.
import { normSearch, isValidDate } from '../lib/util.js';

export const FINDING_KINDS = { body: 'Мјерење тијела', lab: 'Лабораторијски налаз', fitness: 'Тест кондиције', other: 'Друго' };

/**
 * dir: 'down' — мање је боље; 'up' — више је боље; 'range' — најбоље унутар референтног опсега;
 *      'goal' — смјер зависи од циља клијента (тјелесна маса); 'none' — само праћење.
 * med: true — лабораторијски/медицински параметар (код одступања: упутити љекару).
 */
export const PARAMS = [
  // --- тијело ---
  { id: 'tezina', name: 'Тјелесна маса', unit: 'kg', kind: 'body', dir: 'goal', aliases: ['тјелесна маса', 'телесна маса', 'тезина', 'маса тијела', 'weight', 'body weight'] },
  { id: 'bmi', name: 'Индекс тјелесне масе (BMI)', unit: 'kg/m²', kind: 'body', dir: 'range', refMin: 18.5, refMax: 24.9, aliases: ['бми', 'bmi', 'индекс тјелесне масе', 'индекс телесне масе', 'итм'],
    adviceHigh: 'BMI изнад опсега: комбиновати тренинг снаге и аеробни рад, пратити обим струка и % масти (BMI не разликује мишиће од масти).',
    adviceLow: 'BMI испод опсега: нагласак на тренингу снаге и довољном уносу хране; провјерити исхрану.' },
  { id: 'mast', name: 'Тјелесна маст', unit: '%', kind: 'body', dir: 'down', aliases: ['тјелесна маст', 'телесна маст', 'проценат масти', 'постотак масти', 'маст %', 'body fat', 'пбф', 'pbf', 'фат %', 'fat %'],
    adviceWorse: 'Проценат масти расте: повећати дневну активност и аеробни рад (2–3 пута седмично), задржати тренинг снаге и размотрити исхрану.' },
  { id: 'misici', name: 'Мишићна маса', unit: 'kg', kind: 'body', dir: 'up', aliases: ['мишицна маса', 'скелетна мишицна маса', 'мисицна маса', 'muscle mass', 'smm', 'смм', 'скелетни мисици'],
    adviceWorse: 'Мишићна маса опада: прогресивно оптерећење у тренингу снаге, довољно протеина и опоравка (сан).' },
  { id: 'visceralna', name: 'Висцерална маст', unit: 'ниво', kind: 'body', dir: 'down', refMax: 9, aliases: ['висцерална маст', 'висцерална масноца', 'visceral fat', 'виф'],
    adviceHigh: 'Висцерална маст повишена: редован аеробни рад умјереног интензитета уз тренинг снаге; исхрана.' },
  { id: 'voda', name: 'Укупна вода у тијелу', unit: '%', kind: 'body', dir: 'none', aliases: ['укупна вода', 'вода у тијелу', 'вода у телу', 'tbw', 'body water'] },
  { id: 'struk', name: 'Обим струка', unit: 'cm', kind: 'body', dir: 'down', aliases: ['обим струка', 'струк', 'waist'],
    adviceWorse: 'Обим струка расте: више аеробног рада и укупне дневне активности; размотрити исхрану.' },
  { id: 'kukovi', name: 'Обим кукова', unit: 'cm', kind: 'body', dir: 'none', aliases: ['обим кукова', 'кукови', 'hip'] },
  { id: 'grudi', name: 'Обим груди', unit: 'cm', kind: 'body', dir: 'none', aliases: ['обим груди', 'груди', 'chest'] },
  { id: 'nadlaktica', name: 'Обим надлактице', unit: 'cm', kind: 'body', dir: 'none', aliases: ['обим надлактице', 'надлактица', 'arm'] },
  { id: 'butina', name: 'Обим бутине', unit: 'cm', kind: 'body', dir: 'none', aliases: ['обим бутине', 'бутина', 'thigh'] },
  { id: 'pritisakS', name: 'Крвни притисак – систолни', unit: 'mmHg', kind: 'body', dir: 'range', refMin: 90, refMax: 129, med: true, aliases: ['систолни', 'систолицки', 'горњи притисак', 'systolic'],
    adviceHigh: 'Притисак повишен: избјегавати задржавање даха (Валсалва) и максимална оптерећења док љекар не процијени; предност умјереном аеробном раду; мјерити притисак прије тренинга.' },
  { id: 'pritisakD', name: 'Крвни притисак – дијастолни', unit: 'mmHg', kind: 'body', dir: 'range', refMin: 60, refMax: 84, med: true, aliases: ['дијастолни', 'дијастолицки', 'доњи притисак', 'diastolic'],
    adviceHigh: 'Дијастолни притисак повишен: умјерен интензитет, без задржавања даха; упутити љекару.' },
  { id: 'puls', name: 'Пулс у мировању', unit: 'отк/мин', kind: 'body', dir: 'down', refMin: 40, refMax: 100, aliases: ['пулс у мировању', 'пулс мировања', 'пулс', 'срцана фреквенција', 'resting heart rate', 'hr'],
    adviceWorse: 'Пулс у мировању расте: могућ замор или слабији опоравак — провјерити сан, стрес и обим тренинга; додати аеробни рад ниског интензитета.' },
  // --- кондиција ---
  { id: 'vo2', name: 'VO₂max', unit: 'ml/kg/min', kind: 'fitness', dir: 'up', aliases: ['во2мах', 'во2 мах', 'vo2max', 'vo2 max', 'аеробни капацитет'],
    adviceWorse: 'Аеробни капацитет опада: додати интервални и континуирани аеробни рад.' },
  { id: 'sklekovi', name: 'Склекови (макс. понављања)', unit: 'пон.', kind: 'fitness', dir: 'up', aliases: ['склекови', 'склек', 'push up', 'pushup'] },
  { id: 'cucnjevi', name: 'Чучњеви за 1 мин', unit: 'пон.', kind: 'fitness', dir: 'up', aliases: ['цуцњеви', 'цуцањ за', 'squat test'] },
  { id: 'plank', name: 'Пречка/планк – издржај', unit: 's', kind: 'fitness', dir: 'up', aliases: ['планк', 'plank', 'издрзај'] },
  { id: 'pretklon', name: 'Претклон у сједу (флексибилност)', unit: 'cm', kind: 'fitness', dir: 'up', aliases: ['претклон', 'sit and reach', 'флексибилност'],
    adviceWorse: 'Флексибилност опада: редовне вјежбе мобилности и истезања послије тренинга.' },
  // --- лабораторија ---
  { id: 'glukoza', name: 'Глукоза (наташте)', unit: 'mmol/L', kind: 'lab', dir: 'range', refMin: 3.9, refMax: 6.1, med: true, aliases: ['глукоза', 'гуц', 'glucose', 'глукоза у серуму', 'шецер', 'глу', 'glu', 'glukoza natašte', 'glukoza u krvi', 'гликемија'],
    adviceHigh: 'Глукоза повишена: редовна физичка активност (комбинација снаге и аеробног рада) помаже; упутити љекару.' },
  { id: 'hba1c', name: 'HbA1c', unit: '%', kind: 'lab', dir: 'range', refMin: 4, refMax: 5.6, med: true, aliases: ['хба1ц', 'hba1c', 'гликирани хемоглобин', 'гликозилирани хемоглобин', 'hb a1c', 'а1ц'],
    adviceHigh: 'HbA1c повишен: редовна активност и исхрана; упутити љекару.' },
  { id: 'holesterol', name: 'Укупни холестерол', unit: 'mmol/L', kind: 'lab', dir: 'range', refMax: 5.2, med: true, aliases: ['укупни холестерол', 'холестерол укупни', 'холестерол', 'cholesterol', 'холестерол тотал', 'хол', 'chol', 'укупни хол', 'холестерол укупан'],
    adviceHigh: 'Холестерол повишен: аеробни тренинг умјереног интензитета 150+ минута седмично и исхрана; упутити љекару.' },
  { id: 'ldl', name: 'LDL холестерол', unit: 'mmol/L', kind: 'lab', dir: 'range', refMax: 3.4, med: true, aliases: ['лдл холестерол', 'лдл-холестерол', 'холестерол лдл', 'холестерол-лдл', 'лдл-ц', 'лдл', 'ldl-c', 'ldl chol'],
    adviceHigh: 'LDL повишен: редован аеробни рад и исхрана; упутити љекару.' },
  { id: 'hdl', name: 'HDL холестерол', unit: 'mmol/L', kind: 'lab', dir: 'range', refMin: 1.0, med: true, aliases: ['хдл холестерол', 'хдл-холестерол', 'холестерол хдл', 'холестерол-хдл', 'хдл-ц', 'хдл', 'hdl-c', 'hdl chol'],
    adviceLow: 'HDL низак: редован аеробни тренинг помаже да HDL расте; упутити љекару.' },
  { id: 'trigliceridi', name: 'Триглицериди', unit: 'mmol/L', kind: 'lab', dir: 'range', refMax: 1.7, med: true, aliases: ['триглицериди', 'triglycerides', 'тгл', 'триг', 'trig', 'tg', 'триацилглицероли'],
    adviceHigh: 'Триглицериди повишени: аеробни рад, мање шећера и алкохола; упутити љекару.' },
  { id: 'hemoglobin', name: 'Хемоглобин', unit: 'g/L', kind: 'lab', dir: 'range', refMin: 120, refMax: 170, med: true, aliases: ['хемоглобин', 'хгб', 'hgb', 'hemoglobin', 'хб', 'hb'],
    adviceLow: 'Хемоглобин низак: могућ бржи замор и слабија издржљивост — прилагодити интензитет; упутити љекару.' },
  { id: 'eritrociti', name: 'Еритроцити', unit: '×10¹²/L', kind: 'lab', dir: 'range', refMin: 3.8, refMax: 5.8, med: true, aliases: ['еритроцити', 'рбц', 'rbc', 'ер', 'eri'] },
  { id: 'leukociti', name: 'Леукоцити', unit: '×10⁹/L', kind: 'lab', dir: 'range', refMin: 4, refMax: 10, med: true, aliases: ['леукоцити', 'wbc', 'вбц', 'ле', 'le', 'леук'],
    adviceHigh: 'Леукоцити повишени: могућа инфекција/упала — смањити интензитет док љекар не процијени.' },
  { id: 'gvozdje', name: 'Гвожђе', unit: 'µmol/L', kind: 'lab', dir: 'range', refMin: 10, refMax: 30, med: true, aliases: ['гвоздје', 'гвозђе', 'серумско гвоздје', 'fe', 'iron'],
    adviceLow: 'Гвожђе ниско: могућ замор и пад издржљивости; упутити љекару.' },
  { id: 'feritin', name: 'Феритин', unit: 'µg/L', kind: 'lab', dir: 'range', refMin: 15, refMax: 300, med: true, aliases: ['феритин', 'ferritin', 'ферр', 'ferr'],
    adviceLow: 'Феритин низак (залихе гвожђа): могућ замор — прилагодити обим тренинга; упутити љекару.' },
  { id: 'vitd', name: 'Витамин D (25-OH)', unit: 'nmol/L', kind: 'lab', dir: 'range', refMin: 75, refMax: 250, med: true, aliases: ['витамин д', 'вит д', '25-ох', '25 ох витамин д', 'vitamin d', '25(ох)', 'вит. д', 'вит д3', 'витамин д3', '25-oh-d', '25(oh)d', '25-хидроксивитамин д'],
    adviceLow: 'Витамин D низак: може утицати на опоравак, снагу и кости; упутити љекару ради надокнаде.' },
  { id: 'b12', name: 'Витамин B12', unit: 'pmol/L', kind: 'lab', dir: 'range', refMin: 145, refMax: 570, med: true, aliases: ['витамин б12', 'б12', 'vitamin b12', 'кобаламин'],
    adviceLow: 'B12 низак: могућ замор; упутити љекару.' },
  { id: 'crp', name: 'CRP', unit: 'mg/L', kind: 'lab', dir: 'range', refMax: 5, med: true, aliases: ['црп', 'ц-реактивни протеин', 'ц реактивни протеин', 'crp'],
    adviceHigh: 'CRP повишен (знак упале): смањити интензитет док љекар не процијени.' },
  { id: 'tsh', name: 'TSH', unit: 'mIU/L', kind: 'lab', dir: 'range', refMin: 0.4, refMax: 4.0, med: true, aliases: ['тсх', 'tsh', 'тиреостимулисуци'],
    adviceHigh: 'TSH ван опсега: штитна жлијезда утиче на енергију и тјелесну масу; упутити љекару.',
    adviceLow: 'TSH ван опсега: штитна жлијезда утиче на пулс и енергију; упутити љекару.' },
  { id: 'kreatinin', name: 'Креатинин', unit: 'µmol/L', kind: 'lab', dir: 'range', refMin: 50, refMax: 110, med: true, aliases: ['креатинин', 'creatinine', 'креа', 'crea'],
    adviceHigh: 'Креатинин повишен: може бити и посљедица интензивног тренинга или суплемената; упутити љекару.' },
  { id: 'urea', name: 'Уреа', unit: 'mmol/L', kind: 'lab', dir: 'range', refMin: 2.5, refMax: 7.5, med: true, aliases: ['уреа', 'urea', 'уре', 'bun'] },
  { id: 'mokracna', name: 'Мокраћна киселина', unit: 'µmol/L', kind: 'lab', dir: 'range', refMin: 150, refMax: 420, med: true, aliases: ['мокрацна киселина', 'урична киселина', 'uric acid', 'мк', 'acid uric', 'урати'] },
  { id: 'ck', name: 'Креатин киназа (CK)', unit: 'U/L', kind: 'lab', dir: 'range', refMax: 200, med: true, aliases: ['креатин киназа', 'цк', 'ck', 'цпк', 'cpk', 'ck-nac'],
    adviceHigh: 'CK повишен: често послије тешког тренинга, али и знак оштећења мишића — смањити оптерећење неколико дана; упутити љекару ако је много висок.' },
  { id: 'ast', name: 'AST', unit: 'U/L', kind: 'lab', dir: 'range', refMax: 40, med: true, aliases: ['аст', 'ast', 'сгот', 'got'] },
  { id: 'alt', name: 'ALT', unit: 'U/L', kind: 'lab', dir: 'range', refMax: 41, med: true, aliases: ['алт', 'alt', 'сгпт', 'gpt'] },
];
export const PARAM = Object.fromEntries(PARAMS.map((p) => [p.id, p]));

/** Кључ параметра за поређење кроз различите налазе */
export const paramKey = (v) => (v.paramId && PARAM[v.paramId] ? v.paramId : 'custom:' + normSearch(v.name || '').trim());
export const paramName = (v) => (v.paramId && PARAM[v.paramId] ? PARAM[v.paramId].name : v.name || '?');

/* ------------------------------------------------------------------ */
/* Препознавање вриједности из текста налаза                            */
/* ------------------------------------------------------------------ */
const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
const toNum = (s) => Number(String(s).replace(',', '.'));
const UNIT_RE = /(mmol\/l|µmol\/l|μmol\/l|umol\/l|nmol\/l|pmol\/l|g\/dl|g\/l|mg\/dl|mg\/l|ng\/ml|µg\/l|μg\/l|ug\/l|miu\/l|mu\/l|iu\/l|u\/l|mmhg|kg\/m2|kg\/m²|kg|cm|%)/i;
const ALIAS_INDEX = PARAMS.flatMap((p) => p.aliases.map((a) => ({ p, a: normSearch(a) }))).sort((x, y) => y.a.length - x.a.length);
const isLetter = (ch) => !!ch && /[\p{L}]/u.test(ch);

/**
 * Тражи познате параметре у залијепљеном тексту (нпр. копирано из PDF налаза).
 * Враћа [{paramId, name, unit, value, refMin, refMax, line}] — корисник провјерава прије чувања.
 */
export function parseFindingText(text) {
  const out = [];
  const used = new Set();
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const n = normSearch(line);
    let hit = null;
    for (const { p, a } of ALIAS_INDEX) {
      if (used.has(p.id)) continue;
      let i = n.indexOf(a);
      while (i >= 0 && (isLetter(n[i - 1]) || isLetter(n[i + a.length]))) i = n.indexOf(a, i + 1);
      if (i >= 0) { hit = { p, end: i + a.length }; break; }
    }
    if (!hit) continue;
    // „Витамин D 25-OH 62“: ознака 25-OH није вриједност
    const rest = n.slice(hit.end).replace(/^[\s:(]*25\s*[-(]?\s*ох\)?/, '');
    const m = rest.match(new RegExp(String.raw`(?:^|[^\d.,])` + NUM));
    if (!m) continue;
    const value = toNum(m[1]);
    const after = rest.slice(m.index + m[0].length);
    let refMin = null, refMax = null, r;
    if ((r = after.match(new RegExp(NUM + String.raw`\s*[-–—]\s*` + NUM)))) { refMin = toNum(r[1]); refMax = toNum(r[2]); }
    else if ((r = after.match(new RegExp(String.raw`(?:<|≤|до)\s*` + NUM)))) refMax = toNum(r[1]);
    else if ((r = after.match(new RegExp(String.raw`(?:>|≥|изнад|од)\s*` + NUM)))) refMin = toNum(r[1]);
    const u = line.match(UNIT_RE);
    used.add(hit.p.id);
    out.push({ paramId: hit.p.id, name: hit.p.name, unit: u ? normUnit(u[1]) : hit.p.unit, value, refMin, refMax, line });
  }
  return out;
}
function normUnit(u) {
  const l = u.toLowerCase().replace('μ', 'µ').replace('umol', 'µmol').replace('ug/', 'µg/');
  const MAP = { 'mmol/l': 'mmol/L', 'µmol/l': 'µmol/L', 'nmol/l': 'nmol/L', 'pmol/l': 'pmol/L', 'g/l': 'g/L', 'g/dl': 'g/dL', 'mg/dl': 'mg/dL', 'mg/l': 'mg/L', 'ng/ml': 'ng/mL', 'µg/l': 'µg/L', 'miu/l': 'mIU/L', 'mu/l': 'mIU/L', 'iu/l': 'IU/L', 'u/l': 'U/L', mmhg: 'mmHg', 'kg/m2': 'kg/m²', 'kg/m²': 'kg/m²' };
  return MAP[l] || u;
}

/* ------------------------------------------------------------------ */
/* Оцјена и поређење                                                    */
/* ------------------------------------------------------------------ */
/** Ефективни опсег: са налаза, иначе оријентациони из каталога */
export function effRef(v) {
  const p = PARAM[v.paramId];
  const hasOwn = v.refMin !== null && v.refMin !== undefined || v.refMax !== null && v.refMax !== undefined;
  if (hasOwn) return { min: v.refMin ?? null, max: v.refMax ?? null, own: true };
  return { min: p?.refMin ?? null, max: p?.refMax ?? null, own: false };
}
/** 'low' | 'ok' | 'high' | null (нема опсега или вриједности) */
export function refStatus(value, ref) {
  if (value === null || value === undefined || !ref || (ref.min === null && ref.max === null)) return null;
  if (ref.min !== null && value < ref.min) return 'low';
  if (ref.max !== null && value > ref.max) return 'high';
  return 'ok';
}
const distToRange = (v, ref) => (ref.min !== null && v < ref.min ? ref.min - v : ref.max !== null && v > ref.max ? v - ref.max : 0);

/** Смјер за тјелесну масу према циљу клијента */
export function goalDir(goal) {
  const g = normSearch(goal || '');
  if (g.includes('смањ') || g.includes('мрсављ') || g.includes('скидањ')) return 'down';
  if (g.includes('мисиц') || g.includes('масе') && g.includes('повец')) return 'up';
  return 'none';
}

/**
 * Оцјена промјене: 'better' | 'worse' | 'same' | 'neutral'.
 * Промјена мања од 1 % сматра се истом.
 */
export function judge(dir, prev, cur, ref) {
  if (prev === null || prev === undefined || cur === null || cur === undefined) return 'neutral';
  const d = cur - prev;
  if (Math.abs(d) <= Math.max(Math.abs(prev), 1e-9) * 0.01) return 'same';
  if (dir === 'down') return d < 0 ? 'better' : 'worse';
  if (dir === 'up') return d > 0 ? 'better' : 'worse';
  if (dir === 'range' && ref && (ref.min !== null || ref.max !== null)) {
    const a = distToRange(prev, ref), b = distToRange(cur, ref);
    if (a === b) return 'same';
    return b < a ? 'better' : 'worse';
  }
  return 'neutral';
}

const liveF = (f) => f && !f.deleted && isValidDate(f.date);
const sortF = (fs) => fs.filter(liveF).sort((a, b) => (a.date + a.createdAt).localeCompare(b.date + b.createdAt));

/** Временска серија сваког параметра: Map(key → [{date, value, unit, ref, findingId}]) */
export function paramSeries(findings) {
  const m = new Map();
  for (const f of sortF(findings)) {
    for (const v of f.values || []) {
      if (v.value === null || v.value === undefined || Number.isNaN(v.value)) continue;
      const k = paramKey(v);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push({ date: f.date, value: v.value, unit: v.unit || '', ref: effRef(v), findingId: f.id, name: paramName(v), paramId: v.paramId || null });
    }
  }
  return m;
}

/**
 * Поређење. Без fromId/toId: за сваки параметар посљедња вриједност наспрам претходне.
 * Са fromId и toId: само вриједности из та два налаза.
 * Враћа редове {key, name, unit, prev, cur, delta, refStatus, verdict, ref, comparable}.
 */
export function compareFindings(findings, { goal = '', fromId = null, toId = null } = {}) {
  const rows = [];
  if (fromId && toId) {
    const all = sortF(findings);
    const A = all.find((f) => f.id === fromId), B = all.find((f) => f.id === toId);
    if (!A || !B) return rows;
    const [a, b] = A.date + A.createdAt <= B.date + B.createdAt ? [A, B] : [B, A];
    const am = new Map((a.values || []).filter((v) => v.value !== null && v.value !== undefined).map((v) => [paramKey(v), v]));
    for (const v of b.values || []) {
      if (v.value === null || v.value === undefined) continue;
      const k = paramKey(v), pv = am.get(k);
      rows.push(makeRow(k, paramName(v), pv ? { date: a.date, value: pv.value, unit: pv.unit } : null, { date: b.date, value: v.value, unit: v.unit, ref: effRef(v), paramId: v.paramId }, goal));
    }
    return rows;
  }
  for (const [k, pts] of paramSeries(findings)) {
    const cur = pts[pts.length - 1], prev = pts.length > 1 ? pts[pts.length - 2] : null;
    rows.push(makeRow(k, cur.name, prev, cur, goal));
  }
  return rows;
}
function makeRow(key, name, prev, cur, goal) {
  const p = PARAM[cur.paramId];
  const dir = p ? (p.dir === 'goal' ? goalDir(goal) : p.dir) : 'none';
  const comparable = !!prev && (prev.unit || '') === (cur.unit || '');
  const ref = cur.ref || effRef(cur);
  return {
    key, name, unit: cur.unit || '', paramId: cur.paramId || null, med: !!p?.med,
    prev: prev ? { date: prev.date, value: prev.value } : null,
    cur: { date: cur.date, value: cur.value },
    delta: comparable ? cur.value - prev.value : null,
    ref, refStatus: refStatus(cur.value, ref),
    verdict: comparable ? judge(dir, prev.value, cur.value, ref) : 'neutral',
    comparable, unitChanged: !!prev && !comparable,
  };
}

/**
 * Напомене за рад на основу поређења.
 * Враћа { improved:[текст], toWork:[текст], notes:[савјет], medical:boolean }.
 */
export function buildNotes(rows, fmt = (n) => String(n)) {
  const improved = [], toWork = [], notes = new Set();
  let medical = false;
  for (const r of rows) {
    const p = PARAM[r.paramId];
    const ch = r.prev && r.comparable ? `${fmt(r.prev.value)} → ${fmt(r.cur.value)} ${r.unit}`.trim() : `${fmt(r.cur.value)} ${r.unit}`.trim();
    if (r.verdict === 'better') improved.push(`${r.name}: ${ch}`);
    const out = r.refStatus === 'high' || r.refStatus === 'low';
    if (r.verdict === 'worse' || out) {
      const why = [];
      if (r.verdict === 'worse') why.push('погоршање');
      if (out) why.push(r.refStatus === 'high' ? 'изнад опсега' : 'испод опсега');
      toWork.push(`${r.name}: ${ch} (${why.join(', ')})`);
      if (p) {
        const a = out ? (r.refStatus === 'high' ? p.adviceHigh : p.adviceLow) : null;
        const w = r.verdict === 'worse' ? p.adviceWorse || (p.dir === 'down' || (p.dir === 'range' && r.refStatus === 'high') ? p.adviceHigh : p.adviceLow) : null;
        if (a) notes.add(a); else if (w) notes.add(w);
      }
      if (out && r.med) medical = true;
    }
  }
  return { improved, toWork, notes: [...notes], medical };
}

export function validateFinding(f) {
  const e = {};
  if (!f.clientId) e.clientId = 'Недостаје клијент.';
  if (!isValidDate(f.date)) e.date = 'Неисправан датум налаза.';
  if (!FINDING_KINDS[f.kind]) e.kind = 'Непозната врста налаза.';
  if (!Array.isArray(f.values)) e.values = 'Неисправне вриједности.';
  else f.values.forEach((v, i) => {
    if (!v || typeof v !== 'object') { e.values = `Вриједност #${i + 1} није исправна.`; return; }
    if (!v.paramId && !(v.name || '').trim()) e.values = `Вриједност #${i + 1}: унесите назив параметра.`;
    for (const k of ['value', 'refMin', 'refMax']) {
      const x = v[k];
      if (x !== null && x !== undefined && (typeof x !== 'number' || !Number.isFinite(x))) e.values = `${paramName(v)}: поље мора бити број.`;
    }
  });
  return e;
}
