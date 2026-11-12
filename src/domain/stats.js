// Обрачуни за графиконе и напредак. Чисте функције (без базе и интерфејса) — лако се тестирају.
// Правила:
//  * Недостајућа вриједност (null) никад се не третира као нула.
//  * Обим = Σ (понављања × кг) само за ЗАВРШЕНЕ серије вјежби са СПОЉНИМ оптерећењем.
//  * Планиране и незавршене серије не улазе у резултат; вјежбе на вријеме и са сопственом
//    тежином се не рачунају у обим.
import { addDays, daysBetween, weekStart, monthStart, fmtDateShort, MONTHS, fmtNum, parseDate } from '../lib/util.js';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const live = (r) => r && !r.deleted;

/** Обим једне серије или null ако се не рачуна */
export function setVolume(set, exercise) {
  if (!exercise || exercise.type !== 'load') return null;
  if (!set || set.done !== 1 || set.deleted) return null;
  if (!isNum(set.reps) || !isNum(set.weightKg) || set.reps <= 0 || set.weightKg <= 0) return null;
  return set.reps * set.weightKg;
}

/** Збир обима за листу серија; null ако нема ниједне серије која се рачуна */
export function totalVolume(sets, exMap) {
  let sum = 0, n = 0;
  for (const s of sets) {
    const v = setVolume(s, exMap.get ? exMap.get(s.exerciseId) : exMap[s.exerciseId]);
    if (v !== null) { sum += v; n++; }
  }
  return n ? Math.round(sum * 100) / 100 : null;
}

export function inRange(date, from, to) {
  return (!from || date >= from) && (!to || date <= to);
}

/** Претходни период исте дужине: [from-len, from-1] */
export function previousPeriod(from, to) {
  const len = daysBetween(from, to) + 1;
  return { from: addDays(from, -len), to: addDays(from, -1), days: len };
}

/** Серија тачака {date, value} за поље сесије (mood, sleep) — само постојеће вриједности */
export function sessionSeries(sessions, field, from, to) {
  return sessions
    .filter((s) => live(s) && inRange(s.date, from, to) && isNum(s[field]))
    .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))
    .map((s) => ({ date: s.date, value: s[field], sessionId: s.id }));
}

/** Број завршених тренинга по седмици ('week') или мјесецу ('month') у периоду */
export function completedPerBucket(sessions, unit, from, to) {
  const keyOf = unit === 'month' ? monthStart : weekStart;
  const buckets = new Map();
  let k = keyOf(from);
  while (k <= to) {
    buckets.set(k, 0);
    if (unit === 'month') { const d = parseDate(k); d.setMonth(d.getMonth() + 1); k = monthStart(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`); }
    else k = addDays(k, 7);
  }
  for (const s of sessions) {
    if (!live(s) || s.status !== 'done' || !inRange(s.date, from, to)) continue;
    const key = keyOf(s.date);
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  return [...buckets.entries()].map(([key, count]) => ({
    key,
    count,
    label: unit === 'month' ? `${MONTHS[parseDate(key).getMonth()].slice(0, 3)} ${key.slice(2, 4)}` : fmtDateShort(key),
  }));
}

/**
 * Резултати изабране вјежбе по тренингу (само завршене серије).
 * Враћа [{date, sessionId, maxWeight, repsAtMax, totalReps, maxReps, maxDuration, volume, setsDone}]
 */
export function exerciseSeries(sessions, sets, exercise, from, to) {
  const sessById = new Map(sessions.filter(live).map((s) => [s.id, s]));
  const by = new Map();
  for (const st of sets) {
    if (!live(st) || st.exerciseId !== exercise.id || st.done !== 1) continue;
    const s = sessById.get(st.sessionId);
    if (!s || s.status === 'skipped' || !inRange(s.date, from, to)) continue;
    if (!by.has(s.id)) by.set(s.id, { date: s.date, time: s.time || '', sessionId: s.id, maxWeight: null, repsAtMax: null, totalReps: null, maxReps: null, maxDuration: null, volume: null, setsDone: 0 });
    const r = by.get(s.id);
    r.setsDone++;
    if (isNum(st.reps)) { r.totalReps = (r.totalReps || 0) + st.reps; r.maxReps = Math.max(r.maxReps ?? 0, st.reps); }
    if (isNum(st.durationSec)) r.maxDuration = Math.max(r.maxDuration ?? 0, st.durationSec);
    if (isNum(st.weightKg) && st.weightKg > 0) {
      if (r.maxWeight === null || st.weightKg > r.maxWeight || (st.weightKg === r.maxWeight && (st.reps ?? 0) > (r.repsAtMax ?? 0))) {
        r.maxWeight = st.weightKg; r.repsAtMax = isNum(st.reps) ? st.reps : null;
      }
    }
    const v = setVolume(st, exercise);
    if (v !== null) r.volume = Math.round(((r.volume || 0) + v) * 100) / 100;
  }
  return [...by.values()].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

/** Сажетак периода за поређење */
export function periodSummary(sessions, sets, exMap, from, to) {
  const ss = sessions.filter((s) => live(s) && inRange(s.date, from, to));
  const done = ss.filter((s) => s.status === 'done');
  const avg = (arr) => (arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100 : null);
  const moods = ss.map((s) => s.mood).filter(isNum);
  const sleeps = ss.map((s) => s.sleep).filter(isNum);
  const ids = new Set(ss.filter((s) => s.status !== 'skipped').map((s) => s.id));
  const vol = totalVolume(sets.filter((x) => live(x) && ids.has(x.sessionId)), exMap);
  return {
    from, to,
    sessions: ss.length,
    completed: done.length,
    completedDates: done.map((s) => s.date).sort(),
    moodAvg: avg(moods), moodN: moods.length,
    sleepAvg: avg(sleeps), sleepN: sleeps.length,
    volume: vol,
  };
}

function collect(sessions, sets, from, to) {
  const sess = new Map(sessions.filter((s) => live(s) && s.status !== 'skipped' && inRange(s.date, from, to)).map((s) => [s.id, s]));
  const out = new Map(); // exerciseId -> {sets:[], sessions:Set}
  for (const st of sets) {
    if (!live(st) || st.done !== 1 || !sess.has(st.sessionId)) continue;
    if (!out.has(st.exerciseId)) out.set(st.exerciseId, { sets: [], sessions: new Set() });
    const o = out.get(st.exerciseId);
    o.sets.push(st); o.sessions.add(st.sessionId);
  }
  return out;
}

const kg = (n) => `${fmtNum(n)} кг`;

/**
 * Конкретне промјене између два периода за исту вјежбу.
 * Пореди само упоредиво: исту тежину при истом броју понављања и обрнуто,
 * максимум понављања (сопствена тежина без додатка) или трајања (вјежбе на вријеме).
 * Никад не закључује „напредак“ из збира килограма.
 */
export function progressFindings(sessions, sets, exMap, cur, prev) {
  const a = collect(sessions, sets, prev.from, prev.to);
  const b = collect(sessions, sets, cur.from, cur.to);
  const findings = [];
  for (const [exId, B] of b) {
    const A = a.get(exId);
    const ex = exMap.get ? exMap.get(exId) : exMap[exId];
    if (!A || !ex) continue;
    const basis = { prevSessions: A.sessions.size, curSessions: B.sessions.size };
    const items = [];
    if (ex.type === 'load') {
      // највећа тежина за исти број понављања
      const byReps = (arr) => { const m = new Map(); for (const s of arr) if (isNum(s.reps) && s.reps > 0 && isNum(s.weightKg) && s.weightKg > 0) m.set(s.reps, Math.max(m.get(s.reps) ?? 0, s.weightKg)); return m; };
      const ra = byReps(A.sets), rb = byReps(B.sets);
      for (const [reps, w2] of [...rb.entries()].sort((x, y) => y[0] - x[0])) {
        if (!ra.has(reps)) continue;
        const w1 = ra.get(reps), d = Math.round((w2 - w1) * 100) / 100;
        items.push({ dir: d > 0 ? 'up' : d < 0 ? 'down' : 'same', text: `${reps} понављања: ${kg(w1)} → ${kg(w2)}${d ? ` (${d > 0 ? '+' : ''}${fmtNum(d)} кг)` : ' (без промјене)'}` });
      }
      // највише понављања при истој тежини
      const byW = (arr) => { const m = new Map(); for (const s of arr) if (isNum(s.reps) && s.reps > 0 && isNum(s.weightKg) && s.weightKg > 0) m.set(s.weightKg, Math.max(m.get(s.weightKg) ?? 0, s.reps)); return m; };
      const wa = byW(A.sets), wb = byW(B.sets);
      for (const [w, r2] of [...wb.entries()].sort((x, y) => y[0] - x[0])) {
        if (!wa.has(w)) continue;
        const r1 = wa.get(w);
        if (r1 === r2) continue; // иста комбинација је већ покривена изнад
        items.push({ dir: r2 > r1 ? 'up' : 'down', text: `${kg(w)}: ${r1} → ${r2} понављања` });
      }
    } else if (ex.type === 'bw') {
      const mx = (arr) => arr.filter((s) => isNum(s.reps) && !(s.weightKg > 0)).reduce((m, s) => Math.max(m ?? 0, s.reps), null);
      const r1 = mx(A.sets), r2 = mx(B.sets);
      if (r1 !== null && r2 !== null) items.push({ dir: r2 > r1 ? 'up' : r2 < r1 ? 'down' : 'same', text: `највише понављања у серији: ${r1} → ${r2}` });
    } else if (ex.type === 'time') {
      const mx = (arr) => arr.filter((s) => isNum(s.durationSec)).reduce((m, s) => Math.max(m ?? 0, s.durationSec), null);
      const t1 = mx(A.sets), t2 = mx(B.sets);
      if (t1 !== null && t2 !== null) items.push({ dir: t2 > t1 ? 'up' : t2 < t1 ? 'down' : 'same', text: `најдуже трајање: ${fmtNum(t1)} с → ${fmtNum(t2)} с` });
    }
    if (items.length) findings.push({ exerciseId: exId, name: ex.name, type: ex.type, basis, items: items.slice(0, 3) });
  }
  return findings.sort((x, y) => x.name.localeCompare(y.name, 'sr'));
}
