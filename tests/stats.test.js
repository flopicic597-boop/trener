import { describe, it, expect } from 'vitest';
import { setVolume, totalVolume, previousPeriod, progressFindings, sessionSeries, completedPerBucket, exerciseSeries, periodSummary } from '../src/domain/stats.js';
import { parseNum, parseDuration } from '../src/lib/util.js';
import { normalizeTempo, validateSleep, validateMood } from '../src/domain/rules.js';

const exMap = new Map([
  ['sq', { id: 'sq', name: 'Чучањ', type: 'load' }],
  ['pu', { id: 'pu', name: 'Згибови', type: 'bw' }],
  ['pl', { id: 'pl', name: 'Планк', type: 'time' }],
]);
const set = (o) => ({ id: Math.random().toString(36), deleted: 0, done: 1, reps: null, weightKg: null, durationSec: null, planReps: null, planWeightKg: null, ...o });

describe('обрачун обима', () => {
  it('рачуна понављања × кг само за завршене серије са спољним оптерећењем', () => {
    const sets = [
      set({ exerciseId: 'sq', reps: 8, weightKg: 60 }), // 480
      set({ exerciseId: 'sq', reps: 6, weightKg: 62.5 }), // 375
      set({ exerciseId: 'sq', reps: 8, weightKg: 70, done: 0 }), // незавршена — не улази
      set({ exerciseId: 'sq', reps: null, weightKg: null, planReps: 8, planWeightKg: 80, done: 0 }), // само план — не улази
      set({ exerciseId: 'pu', reps: 10, weightKg: 10 }), // сопствена тежина — не улази
      set({ exerciseId: 'pl', durationSec: 60, weightKg: 20 }), // на вријеме — не улази
      set({ exerciseId: 'sq', reps: 5, weightKg: 100, deleted: 1 }), // обрисана — не улази
    ];
    expect(totalVolume(sets, exMap)).toBe(855);
  });
  it('недостајућа тежина или понављања нису нула него се прескачу', () => {
    expect(setVolume(set({ exerciseId: 'sq', reps: 8, weightKg: null }), exMap.get('sq'))).toBeNull();
    expect(totalVolume([set({ exerciseId: 'sq', reps: 8, weightKg: null })], exMap)).toBeNull();
  });
  it('децимална тежина', () => {
    expect(totalVolume([set({ exerciseId: 'sq', reps: 3, weightKg: 22.5 })], exMap)).toBe(67.5);
  });
});

describe('уноси бројева', () => {
  it('прихвата зарез и тачку, празно је null', () => {
    expect(parseNum('7,5')).toBe(7.5);
    expect(parseNum('7.5')).toBe(7.5);
    expect(parseNum(' 62,5 ')).toBe(62.5);
    expect(parseNum('')).toBeNull();
    expect(Number.isNaN(parseNum('abc'))).toBe(true);
    expect(Number.isNaN(parseNum('1,2,3'))).toBe(true);
  });
  it('трајање', () => {
    expect(parseDuration('1:30')).toBe(90);
    expect(parseDuration('45')).toBe(45);
    expect(parseDuration('1,5м')).toBe(90);
    expect(parseDuration('')).toBeNull();
  });
  it('темпо и валидација', () => {
    expect(normalizeTempo('3–1–1–0')).toBe('3-1-1-0');
    expect(normalizeTempo('3110')).toBe('3-1-1-0');
    expect(normalizeTempo('2 0 x 0')).toBe('2-0-X-0');
    expect(normalizeTempo('3-1-1')).toBe(false);
    expect(validateSleep(7.5)).toBeNull();
    expect(validateSleep(25)).not.toBeNull();
    expect(validateSleep(-1)).not.toBeNull();
    expect(validateMood(0)).not.toBeNull();
    expect(validateMood(5)).toBeNull();
    expect(validateMood(null)).toBeNull();
  });
});

describe('периоди и графикони', () => {
  it('претходни период исте дужине', () => {
    expect(previousPeriod('2026-11-01', '2026-11-30')).toEqual({ from: '2026-10-02', to: '2026-10-31', days: 30 });
  });
  it('серије без недостајућих вриједности', () => {
    const ss = [{ id: 'a', date: '2026-11-01', mood: 4, sleep: null, deleted: 0 }, { id: 'b', date: '2026-11-02', mood: null, sleep: 7.5, deleted: 0 }];
    expect(sessionSeries(ss, 'mood').map((p) => p.value)).toEqual([4]);
    expect(sessionSeries(ss, 'sleep').map((p) => p.value)).toEqual([7.5]);
  });
  it('завршени тренинзи по седмици', () => {
    const ss = [
      { id: 'a', date: '2026-11-02', status: 'done', deleted: 0 },
      { id: 'b', date: '2026-11-04', status: 'done', deleted: 0 },
      { id: 'c', date: '2026-11-05', status: 'skipped', deleted: 0 },
      { id: 'd', date: '2026-11-10', status: 'done', deleted: 0 },
    ];
    const r = completedPerBucket(ss, 'week', '2026-11-02', '2026-11-15');
    expect(r.map((x) => x.count)).toEqual([2, 1]);
    const m = completedPerBucket(ss, 'month', '2026-10-01', '2026-11-30');
    expect(m.map((x) => x.count)).toEqual([0, 3]);
  });
});

describe('напредак', () => {
  const sessions = [
    { id: 'p1', date: '2026-10-05', status: 'done', deleted: 0 },
    { id: 'c1', date: '2026-11-05', status: 'done', deleted: 0 },
  ];
  it('пореди тежину при истом броју понављања', () => {
    const sets = [
      set({ sessionId: 'p1', exerciseId: 'sq', reps: 8, weightKg: 60 }),
      set({ sessionId: 'c1', exerciseId: 'sq', reps: 8, weightKg: 65 }),
    ];
    const f = progressFindings(sessions, sets, exMap, { from: '2026-11-01', to: '2026-11-30' }, { from: '2026-10-01', to: '2026-10-31' });
    expect(f).toHaveLength(1);
    expect(f[0].items[0].dir).toBe('up');
    expect(f[0].items[0].text).toContain('8 понављања: 60 кг → 65 кг');
    expect(f[0].basis).toEqual({ prevSessions: 1, curSessions: 1 });
  });
  it('без упоредивих података нема закључка (већи збир кг није напредак)', () => {
    const sets = [
      set({ sessionId: 'p1', exerciseId: 'sq', reps: 5, weightKg: 60 }),
      set({ sessionId: 'c1', exerciseId: 'sq', reps: 10, weightKg: 80 }),
      set({ sessionId: 'c1', exerciseId: 'sq', reps: 10, weightKg: 80 }),
    ];
    const f = progressFindings(sessions, sets, exMap, { from: '2026-11-01', to: '2026-11-30' }, { from: '2026-10-01', to: '2026-10-31' });
    expect(f).toHaveLength(0);
  });
  it('сажетак периода и серија за вјежбу', () => {
    const sets = [set({ sessionId: 'c1', exerciseId: 'sq', reps: 8, weightKg: 65 }), set({ sessionId: 'c1', exerciseId: 'sq', reps: 6, weightKg: 70 })];
    const s = periodSummary(sessions, sets, exMap, '2026-11-01', '2026-11-30');
    expect(s.completed).toBe(1);
    expect(s.volume).toBe(65 * 8 + 70 * 6);
    expect(s.moodAvg).toBeNull();
    const es = exerciseSeries(sessions, sets, exMap.get('sq'));
    expect(es[0]).toMatchObject({ maxWeight: 70, repsAtMax: 6, totalReps: 14 });
  });
});
