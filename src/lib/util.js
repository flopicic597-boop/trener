// Опште помоћне функције без зависности од интерфејса или базе.

export function uid() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
  // резервни генератор (стари прегледачи без randomUUID)
  const b = new Uint8Array(16);
  (globalThis.crypto || { getRandomValues: (a) => a.map(() => Math.floor(Math.random() * 256)) }).getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const nowIso = () => new Date().toISOString();

/* ---------- датуми (локални календарски дан у облику ГГГГ-ММ-ДД) ---------- */
const pad = (n) => String(n).padStart(2, '0');
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const today = () => isoDate(new Date());
export const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return isoDate(d); };
export const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);
export const isValidDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && isoDate(parseDate(s)) === s;
export const isValidTime = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
/** Понедјељак седмице којој датум припада */
export const weekStart = (s) => { const d = parseDate(s); const w = (d.getDay() + 6) % 7; d.setDate(d.getDate() - w); return isoDate(d); };
export const monthStart = (s) => s.slice(0, 8) + '01';

export const MONTHS = ['јануар', 'фебруар', 'март', 'април', 'мај', 'јун', 'јул', 'август', 'септембар', 'октобар', 'новембар', 'децембар'];
export const MONTHS_CAP = MONTHS.map((m) => m[0].toUpperCase() + m.slice(1));
export const DAYS_SHORT = ['Пон', 'Уто', 'Сри', 'Чет', 'Пет', 'Суб', 'Нед'];
export const DAYS_LONG = ['понедјељак', 'уторак', 'сриједа', 'четвртак', 'петак', 'субота', 'недјеља'];

/** 12.11.2026. */
export const fmtDate = (s) => { if (!s) return '—'; const [y, m, d] = s.split('-'); return `${d}.${m}.${y}.`; };
export const fmtDateShort = (s) => { if (!s) return '—'; const [, m, d] = s.split('-'); return `${d}.${m}.`; };
export const fmtDateLong = (s) => { const d = parseDate(s); return `${DAYS_LONG[(d.getDay() + 6) % 7]}, ${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()}.`; };
export const fmtDateTime = (iso) => {
  if (!iso) return 'никад';
  const d = new Date(iso);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}. у ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/* ---------- бројеви: прихвата зарез и тачку ---------- */
/**
 * Парсира кориснички унос. Празан унос враћа null (недостајућа вриједност, није нула).
 * Неисправан унос враћа NaN.
 */
export function parseNum(input) {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') return Number.isFinite(input) ? input : NaN;
  const s = String(input).trim().replace(/\s+/g, '').replace(',', '.');
  if (s === '') return null;
  if (!/^-?\d*\.?\d+$|^-?\d+\.$/.test(s)) return NaN;
  return Number(s);
}

/** Формат са децималним зарезом; null → '' */
export function fmtNum(n, maxDec = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return '';
  const r = Math.round(n * 10 ** maxDec) / 10 ** maxDec;
  return String(r).replace('.', ',');
}

/** Трајање у секундама → „1:30“ или „45 с“ */
export function fmtDuration(sec) {
  if (sec === null || sec === undefined) return '';
  if (sec < 60) return `${fmtNum(sec)} с`;
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return `${m}:${pad(s)} мин`;
}

/** Парсира трајање: „90“ (сек.), „1:30“, „1,5м“ */
export function parseDuration(input) {
  if (input === null || input === undefined) return null;
  const s = String(input).trim().toLowerCase().replace(',', '.');
  if (s === '') return null;
  let m;
  if ((m = s.match(/^(\d+):([0-5]?\d)$/))) return Number(m[1]) * 60 + Number(m[2]);
  if ((m = s.match(/^(\d+(?:\.\d+)?)\s*(m|м|мин|min)$/))) return Math.round(Number(m[1]) * 60);
  if ((m = s.match(/^(\d+(?:\.\d+)?)\s*(s|с|сек|sec)?$/))) return Number(m[1]);
  return NaN;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Нормализација за претрагу (ћирилица/латиница, без дијакритике) */
const LAT2CYR = [['dž', 'џ'], ['lj', 'љ'], ['nj', 'њ'], ['a', 'а'], ['b', 'б'], ['v', 'в'], ['g', 'г'], ['d', 'д'], ['đ', 'ђ'], ['dj', 'ђ'], ['e', 'е'], ['ž', 'ж'], ['z', 'з'], ['i', 'и'], ['j', 'ј'], ['k', 'к'], ['l', 'л'], ['m', 'м'], ['n', 'н'], ['o', 'о'], ['p', 'п'], ['r', 'р'], ['s', 'с'], ['t', 'т'], ['ć', 'ћ'], ['u', 'у'], ['f', 'ф'], ['h', 'х'], ['c', 'ц'], ['č', 'ч'], ['š', 'ш']];
export function normSearch(s) {
  let t = String(s || '').toLowerCase();
  for (const [l, c] of LAT2CYR) t = t.split(l).join(c);
  return t.replace(/ђ/g, 'дј').replace(/[ћч]/g, 'ц').replace(/ж/g, 'з').replace(/ш/g, 'с');
}

export function debounce(fn, ms) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.cancel = () => clearTimeout(t);
  return d;
}

export function sortBy(arr, key) {
  const f = typeof key === 'function' ? key : (x) => x[key];
  return [...arr].sort((a, b) => { const x = f(a), y = f(b); return x < y ? -1 : x > y ? 1 : 0; });
}

/** Цио број са размаком за хиљаде: 78 565 */
export const fmtInt = (n) => (n === null || n === undefined || Number.isNaN(n) ? '' : String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '));
