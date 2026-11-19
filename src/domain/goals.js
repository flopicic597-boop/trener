// Циљеви клијента са роком: напредак и процјена да ли се стиже на вријеме.
import { isValidDate, daysBetween } from '../lib/util.js';

export const GOAL_KINDS = { param: 'Мјерење (нпр. тјелесна маса, % масти, струк)', e1rm: 'Снага: процијењени 1RM вјежбе', manual: 'Други циљ (ручно праћење)' };

/**
 * cur: тренутна вриједност (из мјерења, 1RM или ручно). Враћа
 * {pct (0..1+), reached, daysLeft, expectedPct, onTrack (true/false/null)}.
 */
export function goalProgress(g, cur, day) {
  const start = g.startValue, target = g.target;
  if (!(typeof start === 'number' && typeof target === 'number') || start === target || cur === null || cur === undefined) {
    return { pct: null, reached: !!g.done, daysLeft: isValidDate(g.deadline) ? daysBetween(day, g.deadline) : null, expectedPct: null, onTrack: null };
  }
  const pct = (cur - start) / (target - start);
  const reached = !!g.done || pct >= 1;
  let expectedPct = null, onTrack = null, daysLeft = null;
  if (isValidDate(g.deadline) && isValidDate(g.startDate)) {
    const total = daysBetween(g.startDate, g.deadline), gone = daysBetween(g.startDate, day);
    daysLeft = daysBetween(day, g.deadline);
    expectedPct = total > 0 ? Math.min(1, Math.max(0, gone / total)) : 1;
    onTrack = reached ? true : pct >= expectedPct - 0.1;
  }
  return { pct, reached, daysLeft, expectedPct, onTrack };
}

export function validateGoal(g) {
  const e = {};
  if (!g.clientId) e.clientId = 'Недостаје клијент.';
  if (!(g.title || '').trim()) e.title = 'Унесите назив циља.';
  if (!GOAL_KINDS[g.kind]) e.kind = 'Непозната врста циља.';
  if (g.kind === 'param' && !g.paramId) e.paramId = 'Изаберите параметар.';
  if (g.kind === 'e1rm' && !g.exerciseId) e.exerciseId = 'Изаберите вјежбу.';
  for (const k of ['startValue', 'target', 'manualValue']) if (g[k] !== null && g[k] !== undefined && !(typeof g[k] === 'number' && Number.isFinite(g[k]))) e[k] = 'Вриједност мора бити број.';
  if (g.deadline && !isValidDate(g.deadline)) e.deadline = 'Неисправан рок.';
  if (!isValidDate(g.startDate)) e.startDate = 'Неисправан датум почетка.';
  return e;
}
