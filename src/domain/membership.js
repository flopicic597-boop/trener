// Чланарина: обрачун периода и статус (без базе и интерфејса — лако се тестира).
import { addDays, addMonths, daysBetween, isValidDate } from '../lib/util.js';

export const PAY_METHODS = { cash: 'Готовина', bank: 'Уплата на рачун', card: 'Картица', other: 'Друго' };

/** Подразумијевани крај периода: почетак + N мјесеци − 1 дан (нпр. 12.11. → 11.12.) */
export const periodEnd = (from, months = 1) => addDays(addMonths(from, months), -1);

/**
 * Приједлог периода за нову уплату. Ако клијент има важећу или будућу чланарину,
 * нова почиње дан након истека (уплата унапријед); иначе од датума уплате.
 */
export function suggestPeriod(payments, paidDate, months = 1) {
  const lastTo = latestTo(payments);
  const from = lastTo && lastTo >= paidDate ? addDays(lastTo, 1) : paidDate;
  return { from, to: periodEnd(from, months) };
}

const live = (p) => p && !p.deleted;
export const latestTo = (payments) => payments.filter(live).reduce((m, p) => (p.periodTo && (!m || p.periodTo > m) ? p.periodTo : m), null);

/**
 * Статус чланарине на дан `day`:
 *  none     — нема ниједне уплате
 *  active   — плаћено, истиче за више од warnDays дана
 *  expiring — истиче за 0..warnDays дана
 *  expired  — истекла (daysOver дана)
 *  future   — уплаћено само за период који тек почиње
 */
export function membershipStatus(payments, day, warnDays = 7) {
  const ps = payments.filter(live).filter((p) => isValidDate(p.periodFrom) && isValidDate(p.periodTo));
  if (!ps.length) return { state: 'none' };
  const to = latestTo(ps);
  const current = ps.find((p) => p.periodFrom <= day && p.periodTo >= day);
  const lastPaid = ps.reduce((m, p) => (!m || p.paidDate > m.paidDate ? p : m), null);
  if (to < day) return { state: 'expired', to, daysOver: daysBetween(to, day), lastPaid };
  if (!current) {
    const next = ps.filter((p) => p.periodFrom > day).sort((a, b) => a.periodFrom.localeCompare(b.periodFrom))[0];
    return { state: 'future', from: next.periodFrom, to, lastPaid };
  }
  const daysLeft = daysBetween(day, to);
  return { state: daysLeft <= warnDays ? 'expiring' : 'active', to, daysLeft, lastPaid };
}

/** Кратак текст и боја за приказ статуса */
export function statusLabel(s, fmt) {
  switch (s.state) {
    case 'none': return { text: 'Нема уплата', cls: 'muted' };
    case 'expired': return { text: `Истекла ${fmt(s.to)} (прије ${s.daysOver} ${dana(s.daysOver)})`, cls: 'bad' };
    case 'future': return { text: `Плаћено од ${fmt(s.from)}`, cls: 'warn' };
    case 'expiring': return { text: s.daysLeft === 0 ? `Истиче данас (${fmt(s.to)})` : `Истиче ${fmt(s.to)} (за ${s.daysLeft} ${dana(s.daysLeft)})`, cls: 'warn' };
    default: return { text: `Плаћено до ${fmt(s.to)}`, cls: 'ok' };
  }
}
export const dana = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'дан' : 'дана');

export function validatePayment(p) {
  const e = {};
  if (!p.clientId) e.clientId = 'Недостаје клијент.';
  if (!isValidDate(p.paidDate)) e.paidDate = 'Неисправан датум уплате.';
  if (!isValidDate(p.periodFrom)) e.periodFrom = 'Неисправан почетак периода.';
  if (!isValidDate(p.periodTo)) e.periodTo = 'Неисправан крај периода.';
  if (isValidDate(p.periodFrom) && isValidDate(p.periodTo) && p.periodTo < p.periodFrom) e.periodTo = 'Крај периода је прије почетка.';
  if (p.amount !== null && p.amount !== undefined && (typeof p.amount !== 'number' || !Number.isFinite(p.amount) || p.amount < 0 || p.amount > 100000)) e.amount = 'Износ мора бити број од 0 до 100000.';
  if (p.method && !PAY_METHODS[p.method]) e.method = 'Непознат начин плаћања.';
  return e;
}

/* ------------------------------------------------------------------ */
/* Пакети тренинга (нпр. 12 тренинга): одбројавање одржаних тренинга     */
/* ------------------------------------------------------------------ */
/**
 * Одржани тренинзи клијента (статус „завршен“) се распоређују на пакете редом по датуму почетка:
 * тренинг пада у први пакет који је почео до тог дана и још није потрошен.
 * Враћа [{pkg, used, remaining, lastDate, state: 'active'|'low'|'used'|'future'}].
 */
export function packageStatus(packages, sessions, day, lowAt = 2) {
  const pk = packages.filter((p) => p && !p.deleted).slice().sort((a, b) => (a.startDate + a.createdAt).localeCompare(b.startDate + b.createdAt));
  const out = pk.map((p) => ({ pkg: p, used: 0, remaining: p.total, lastDate: null }));
  const done = sessions.filter((s) => !s.deleted && s.status === 'done').sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  for (const s of done) {
    const slot = out.find((o) => o.pkg.startDate <= s.date && o.used < o.pkg.total);
    if (slot) { slot.used++; slot.remaining--; slot.lastDate = s.date; }
  }
  for (const o of out) o.state = o.pkg.startDate > day ? 'future' : o.remaining <= 0 ? 'used' : o.remaining <= lowAt ? 'low' : 'active';
  return out;
}

export function validatePackage(p) {
  const e = {};
  if (!p.clientId) e.clientId = 'Недостаје клијент.';
  if (!(Number.isInteger(p.total) && p.total >= 1 && p.total <= 500)) e.total = 'Број тренинга: цио број од 1 до 500.';
  if (!isValidDate(p.startDate)) e.startDate = 'Неисправан датум почетка.';
  if (p.price !== null && p.price !== undefined && !(typeof p.price === 'number' && p.price >= 0 && p.price <= 100000)) e.price = 'Цијена мора бити број.';
  return e;
}

/** Приход по мјесецима (уплате чланарине + пакети по датуму уплате/почетка): [{x:'ГГГГ-ММ', y}] */
export function monthlyIncome(payments, packages, months = 12, today) {
  const keys = []; const [y, m] = today.split('-').map(Number);
  for (let i = months - 1; i >= 0; i--) { const d = new Date(y, m - 1 - i, 1); keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); }
  const sum = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const p of payments) if (!p.deleted && p.amount > 0 && sum[p.paidDate?.slice(0, 7)] !== undefined) sum[p.paidDate.slice(0, 7)] += p.amount;
  for (const p of packages) { const d = p.paidDate || p.startDate; if (!p.deleted && p.price > 0 && sum[d?.slice(0, 7)] !== undefined) sum[d.slice(0, 7)] += p.price; }
  return keys.map((k) => ({ x: k, y: sum[k] }));
}
