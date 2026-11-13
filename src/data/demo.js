// Пробни подаци. Сви записи имају demo: 1 и уклањају се једним дугметом,
// без утицаја на стварне клијенте. Имена су из узора.
import { uid, today, addDays, parseDate } from '../lib/util.js';

function rng(seed) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const r25 = (x) => Math.round(x / 2.5) * 2.5;

const TPL = {
  gornji: { name: 'Горњи дио тијела', items: [['ex-e3', 4, 8, 60], ['ex-e5', 4, 10, 50], ['ex-e4', 3, 10, 35], ['ex-e14', 3, 12, 45], ['ex-e11', 3, 12, 20]] },
  donji: { name: 'Доњи дио тијела', items: [['ex-e1', 4, 8, 70], ['ex-e8', 3, 10, 60], ['ex-e7', 3, 12, 14], ['ex-e18', 3, 12, 120], ['ex-e12', 3, 't45', 0]] },
  celo: { name: 'Цијело тијело', items: [['ex-e2', 4, 6, 90], ['ex-e9', 3, 10, 22], ['ex-e6', 3, 6, 0], ['ex-e13', 3, 12, 60], ['ex-e16', 1, 't900', 0]] },
};

const CLIENTS = [
  { firstName: 'Марко', lastName: 'Петровић', goal: 'Смањење тјелесне масе', note: 'Пробни клијент.', plan: [0, 2, 4], tpl: ['gornji', 'donji', 'celo'], f: 1 },
  { firstName: 'Јелена', lastName: 'Николић', goal: 'Повећање снаге', note: 'Пробни клијент.', plan: [1, 3], tpl: ['donji', 'gornji'], f: 0.55 },
  { firstName: 'Стефан', lastName: 'Јовановић', goal: 'Рехабилитација', note: 'Пробни клијент. Избјегавати аксијално оптерећење.', plan: [1, 4], tpl: ['celo', 'gornji'], f: 0.8 },
];

export function buildDemo(now = today()) {
  const t = new Date().toISOString();
  const base = { createdAt: t, updatedAt: t, deleted: 0, demo: 1 };
  const out = { clients: [], programs: [], sessions: [], sessionExercises: [], sets: [], payments: [], findings: [] };
  const progIds = {};
  for (const [k, tpl] of Object.entries(TPL)) {
    const id = uid(); progIds[k] = id;
    out.programs.push({
      ...base, id, name: tpl.name + ' (пробни)', clientId: null, note: '', archived: 0,
      items: tpl.items.map(([exerciseId, n, reps, kg]) => ({
        id: uid(), exerciseId, note: '',
        sets: Array.from({ length: n }, () => (typeof reps === 'string'
          ? { reps: null, weightKg: null, durationSec: Number(reps.slice(1)), tempo: null, restSec: 60 }
          : { reps, weightKg: kg || null, durationSec: null, tempo: '3-1-1-0', restSec: 90 })),
      })),
    });
  }
  CLIENTS.forEach((c, ci) => {
    const R = rng(ci * 977 + 13);
    const cid = uid();
    const start = addDays(now, -56);
    out.clients.push({ ...base, id: cid, firstName: c.firstName, lastName: c.lastName, startDate: start, goal: c.goal, note: c.note, phone: '', email: '', archived: 0 });
    // чланарина: мјесечне уплате од почетка; трећи клијент није продужио (истекла), други истиче ускоро
    const months = ci === 2 ? 1 : 2;
    for (let mI = 0; mI < months; mI++) {
      const from = addDays(start, mI * 30 + (ci === 1 ? 4 : 0)), to = addDays(from, 29);
      out.payments.push({ ...base, id: uid(), clientId: cid, paidDate: from, amount: 35, periodFrom: from, periodTo: to, method: mI % 2 ? 'bank' : 'cash', note: '' });
    }
    // мјерења тијела на почетку и послије 7 седмица
    const m0 = { tezina: [92, 68, 81][ci], mast: [29, 24, 21][ci], misici: [33, 26, 34][ci], struk: [101, 74, 88][ci], puls: [78, 66, 70][ci] };
    const dm = { tezina: [-4.2, 0.6, -0.8][ci], mast: [-2.4, -1.1, 0.7][ci], misici: [0.4, 1.0, -0.3][ci], struk: [-5, 0, -1][ci], puls: [-6, -3, 4][ci] };
    const UNIT = { tezina: 'kg', mast: '%', misici: 'kg', struk: 'cm', puls: 'отк/мин' };
    const NAME = { tezina: 'Тјелесна маса', mast: 'Тјелесна маст', misici: 'Мишићна маса', struk: 'Обим струка', puls: 'Пулс у мировању' };
    [0, 49].forEach((off, k) => out.findings.push({ ...base, id: uid(), clientId: cid, date: addDays(start, off), kind: 'body', title: k ? 'Контролно мјерење' : 'Иницијално мјерење', text: '', note: '',
      values: Object.keys(m0).map((pid) => ({ id: uid(), paramId: pid, name: NAME[pid], unit: UNIT[pid], value: Math.round((m0[pid] + (k ? dm[pid] : 0)) * 10) / 10, refMin: null, refMax: null })) }));
    if (ci === 0) out.findings.push({ ...base, id: uid(), clientId: cid, date: addDays(start, 3), kind: 'lab', title: 'Биохемија', text: '', note: 'Пробни налаз.',
      values: [{ id: uid(), paramId: 'glukoza', name: 'Глукоза (наташте)', unit: 'mmol/L', value: 6.4, refMin: 3.9, refMax: 6.1 }, { id: uid(), paramId: 'holesterol', name: 'Укупни холестерол', unit: 'mmol/L', value: 5.9, refMin: null, refMax: 5.2 }] });
    let n = 0;
    for (let d = 0; d <= 57; d++) {
      const date = addDays(start, d);
      const dow = (parseDate(date).getDay() + 6) % 7;
      const idx = c.plan.indexOf(dow);
      if (idx < 0) continue;
      const key = c.tpl[n++ % c.tpl.length];
      const tpl = TPL[key];
      const future = date > now;
      const isToday = date === now;
      const skipped = !future && !isToday && R() > 0.88;
      const sid = uid();
      const prog = d / 56;
      out.sessions.push({
        ...base, id: sid, clientId: cid, date, time: ['08:00', '17:30', '19:00'][ci], programId: progIds[key], programName: TPL[key].name + ' (пробни)',
        status: future || isToday ? 'planned' : skipped ? 'skipped' : 'done',
        mood: future || isToday || skipped ? null : (R() > 0.12 ? 2 + Math.floor(R() * 4) : null),
        sleep: future || isToday || skipped ? null : (R() > 0.15 ? Math.round((6 + R() * 2.5) * 2) / 2 : null),
        note: skipped ? 'Отказао због обавеза.' : '',
      });
      tpl.items.forEach(([exerciseId, nSets, reps, kg], pos) => {
        const seid = uid();
        out.sessionExercises.push({ ...base, id: seid, sessionId: sid, clientId: cid, exerciseId, position: pos, note: '' });
        for (let s = 0; s < nSets; s++) {
          const isTime = typeof reps === 'string';
          const planKg = kg ? r25(kg * c.f) : null;
          const done = !future && !isToday && !skipped && R() > 0.06;
          const actKg = kg ? r25(kg * c.f * (0.85 + 0.2 * prog)) : null;
          out.sets.push({
            ...base, id: uid(), sessionId: sid, sessionExerciseId: seid, clientId: cid, exerciseId, position: s,
            planReps: isTime ? null : reps, planWeightKg: planKg, planDurationSec: isTime ? Number(reps.slice(1)) : null,
            reps: done && !isTime ? reps - (R() > 0.8 ? 1 : 0) : null,
            weightKg: done ? actKg : null,
            durationSec: done && isTime ? Number(reps.slice(1)) + Math.round(prog * 15) : null,
            tempo: isTime ? null : '3-1-1-0', restSec: isTime ? 60 : 90, done: done ? 1 : 0, note: '',
          });
        }
      });
    }
  });
  return out;
}

export async function loadDemo(db) {
  const d = buildDemo();
  await db.transaction('rw', ['clients', 'programs', 'sessions', 'sessionExercises', 'sets', 'payments', 'findings'].map((t) => db.table(t)), async () => {
    for (const [t, rows] of Object.entries(d)) await db.table(t).bulkAdd(rows);
  });
  return d;
}
