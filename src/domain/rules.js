// Пословна правила: статуси, подразумијеване изборне вриједности и валидација.
import { isValidDate, isValidTime } from '../lib/util.js';
import { CATEGORIES } from '../data/exercises-seed.js';

export const STATUS = {
  planned: 'Планиран',
  active: 'У току',
  done: 'Завршен',
  skipped: 'Прескочен',
};
export const STATUS_ORDER = ['planned', 'active', 'done', 'skipped'];
export const MOOD_LABEL = { 1: 'Веома лоше', 2: 'Лоше', 3: 'Осредње', 4: 'Добро', 5: 'Одлично' };

export const DEFAULT_OPTIONS = {
  id: 'settings',
  restPresets: [30, 45, 60, 90, 120, 180],
  tempoPresets: ['3-1-1-0', '2-0-1-0', '3-0-1-0', '4-1-1-0', '2-1-2-0', '1-0-1-0', '2-0-X-0'],
  sleepPresets: [5, 6, 6.5, 7, 7.5, 8, 8.5, 9],
  durationPresets: [30, 45, 60, 90, 300, 600, 1200],
  goalPresets: ['Смањење тјелесне масе', 'Повећање снаге', 'Повећање мишићне масе', 'Рехабилитација', 'Општа кондиција', 'Припрема за такмичење'],
  categories: [...CATEGORIES],
  membershipMonths: 1,     // подразумијевано трајање плаћеног периода (мјесеци)
  membershipPrice: null,   // подразумијевани износ (€), празно = без приједлога
  membershipWarnDays: 7,   // колико дана прије истека се приказује упозорење
};

export const TEMPO_HELP =
  'Темпо има четири фазе у секундама: 1) спуштање (ексцентрична фаза), 2) пауза у доњем положају, ' +
  '3) подизање (концентрична фаза), 4) пауза у горњем положају. Нпр. 3–1–1–0: три секунде спуштање, ' +
  'једна секунда пауза доле, једна секунда подизање, без паузе горе. „X“ значи експлозивно.';

/** Нормализује темпо у облик „3-1-1-0“. Враћа null за празно, NaN-маркер (false) за неисправно. */
export function normalizeTempo(input) {
  if (input === null || input === undefined) return null;
  const s = String(input).trim().toUpperCase();
  if (s === '') return null;
  let parts = s.split(/[\s\-–—/.,:]+/).filter(Boolean);
  if (parts.length === 1 && /^[0-9X]{4}$/.test(parts[0])) parts = parts[0].split('');
  if (parts.length !== 4 || !parts.every((p) => /^(\d{1,2}|X)$/.test(p))) return false;
  return parts.join('-');
}
export const fmtTempo = (t) => (t ? t.split('-').join('–') : '');

const nonNeg = (v) => v === null || v === undefined || (typeof v === 'number' && Number.isFinite(v) && v >= 0);

export function validateMood(v) {
  if (v === null || v === undefined) return null;
  return Number.isInteger(v) && v >= 1 && v <= 5 ? null : 'Расположење мора бити цио број од 1 до 5.';
}
export function validateSleep(v) {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'number' || Number.isNaN(v)) return 'Сан мора бити број (нпр. 7,5).';
  return v >= 0 && v <= 24 ? null : 'Сан мора бити између 0 и 24 сата.';
}
export function validateNonNeg(v, label, { max = 100000, integer = false } = {}) {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'number' || Number.isNaN(v)) return `${label}: унесите број.`;
  if (v < 0) return `${label}: вриједност не може бити негативна.`;
  if (v > max) return `${label}: вриједност је превелика (највише ${max}).`;
  if (integer && !Number.isInteger(v)) return `${label}: унесите цио број.`;
  return null;
}

export function validateClient(c) {
  const e = {};
  if (!c.firstName || !c.firstName.trim()) e.firstName = 'Унесите име.';
  if (!c.lastName || !c.lastName.trim()) e.lastName = 'Унесите презиме.';
  if (c.startDate && !isValidDate(c.startDate)) e.startDate = 'Неисправан датум.';
  if (c.email && !/^\S+@\S+\.\S+$/.test(c.email)) e.email = 'Неисправна е-пошта.';
  return e;
}

export function validateSession(s) {
  const e = {};
  if (!s.clientId) e.clientId = 'Недостаје клијент.';
  if (!isValidDate(s.date)) e.date = 'Неисправан датум.';
  if (s.time && !isValidTime(s.time)) e.time = 'Вријеме у облику ЧЧ:ММ.';
  if (!STATUS[s.status]) e.status = 'Непознат статус.';
  const m = validateMood(s.mood); if (m) e.mood = m;
  const sl = validateSleep(s.sleep); if (sl) e.sleep = sl;
  return e;
}

export const SET_NUM_FIELDS = {
  reps: { label: 'Понављања', max: 1000, integer: true },
  planReps: { label: 'План понављања', max: 1000, integer: true },
  weightKg: { label: 'Оптерећење', max: 1000 },
  planWeightKg: { label: 'План оптерећења', max: 1000 },
  durationSec: { label: 'Трајање', max: 86400 },
  planDurationSec: { label: 'План трајања', max: 86400 },
  restSec: { label: 'Пауза', max: 3600 },
};

export function validateSet(s) {
  const e = {};
  for (const [k, o] of Object.entries(SET_NUM_FIELDS)) {
    const m = validateNonNeg(s[k], o.label, o);
    if (m) e[k] = m;
  }
  if (s.tempo !== null && s.tempo !== undefined && normalizeTempo(s.tempo) === false) e.tempo = 'Темпо у облику 3-1-1-0.';
  return e;
}

export function validateExercise(x) {
  const e = {};
  if (!x.name || !x.name.trim()) e.name = 'Унесите назив вјежбе.';
  if (!['load', 'bw', 'time'].includes(x.type)) e.type = 'Изаберите врсту вјежбе.';
  return e;
}

export { nonNeg };
