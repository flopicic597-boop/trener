import { describe, it, expect } from 'vitest';
import { ageAt, bodyDensity, siri, caliperResult, avgSite, bmi, whr, whtr, bmr, nutritionTargets, karvonen, e1rm, personalRecords, e1rmSeries, acwr, sessionLoad, setsByCategory, attendance } from '../src/domain/assessment.js';

describe('узраст', () => {
  it('рачуна пуне године', () => {
    expect(ageAt('1990-06-15', '2026-06-14')).toBe(35);
    expect(ageAt('1990-06-15', '2026-06-15')).toBe(36);
    expect(ageAt('', '2026-06-15')).toBeNull();
  });
});

describe('калипер', () => {
  it('Jackson-Pollock 3, мушкарац (ручно израчунат примјер)', () => {
    // Σ = 12 + 25 + 18 = 55 mm, 35 год: BD = 1,10938 − 0,0008267·55 + 0,0000016·55² − 0,0002574·35 = 1,0597425
    const bd = bodyDensity('jp3', 'm', 35, { chest: 12, abdomen: 25, thigh: 18 });
    expect(bd).toBeCloseTo(1.0597425, 6);
    expect(siri(bd)).toBeCloseTo(17.09, 1);
  });
  it('JP7 и DW4 дају реалне вриједности; JP3 жена користи трицепс/кук/бутину', () => {
    const s = { chest: 10, midaxillary: 12, triceps: 14, subscapular: 15, abdomen: 22, suprailiac: 16, thigh: 18, biceps: 6 };
    const jp7 = siri(bodyDensity('jp7', 'm', 30, s));
    const dw4 = siri(bodyDensity('dw4', 'm', 30, s));
    expect(jp7).toBeGreaterThan(10); expect(jp7).toBeLessThan(20);
    expect(dw4).toBeGreaterThan(10); expect(dw4).toBeLessThan(25);
    const f = siri(bodyDensity('jp3', 'f', 28, { triceps: 18, suprailiac: 14, thigh: 25 }));
    expect(f).toBeGreaterThan(18); expect(f).toBeLessThan(28);
  });
  it('недостаје набор, пол или узраст → нема резултата (није нула)', () => {
    expect(bodyDensity('jp3', 'm', 35, { chest: 12, abdomen: 25 })).toBeNull();
    expect(bodyDensity('jp3', '', 35, { chest: 12, abdomen: 25, thigh: 18 })).toBeNull();
    expect(bodyDensity('jp3', 'm', null, { chest: 12, abdomen: 25, thigh: 18 })).toBeNull();
  });
  it('маса масти и немасна маса; просјек поновљених мјерења', () => {
    const r = caliperResult({ protocol: 'jp3', sex: 'm', age: 35, sitesMm: { chest: 12, abdomen: 25, thigh: 18 }, weightKg: 80 });
    expect(r.sum).toBe(55);
    expect(r.fatKg).toBeCloseTo(80 * r.fatPct / 100, 6);
    expect(r.leanKg + r.fatKg).toBeCloseTo(80, 6);
    expect(avgSite([12, 13, null])).toBe(12.5);
    expect(avgSite([])).toBeNull();
  });
});

describe('антропометрија и исхрана', () => {
  it('BMI, WHR, WHtR', () => {
    expect(bmi(80, 180)).toBeCloseTo(24.69, 2);
    expect(whr(90, 100)).toBeCloseTo(0.9, 5);
    expect(whtr(90, 180)).toBeCloseTo(0.5, 5);
    expect(bmi(80, null)).toBeNull();
  });
  it('Mifflin-St Jeor и дневни циљеви', () => {
    expect(bmr('m', 80, 180, 30)).toBe(1780);
    expect(bmr('f', 60, 165, 30)).toBeCloseTo(1320.25, 2);
    const t = nutritionTargets({ sex: 'm', kg: 80, cm: 180, age: 30, activity: 1.55, goalDir: 'down' });
    expect(t.tdee).toBeCloseTo(2759, 0);
    expect(t.kcal).toBeCloseTo(2759 * 0.85, 0);
    expect(t.protein[0]).toBeCloseTo(144, 5);
  });
  it('Karvonen пулсне зоне', () => {
    const k = karvonen(40, 60);
    expect(k.max).toBe(180);
    expect(k.zones[0]).toMatchObject({ from: 120, to: 132 });
    expect(k.zones[4].to).toBe(180);
    expect(karvonen(40, null)).toBeNull();
  });
});

describe('1RM, рекорди, оптерећење, присуство', () => {
  const sessions = new Map([['s1', { id: 's1', date: '2026-10-01' }], ['s2', { id: 's2', date: '2026-10-08' }]]);
  const sets = [
    { sessionId: 's1', exerciseId: 'ex', weightKg: 100, reps: 5, done: 1 },
    { sessionId: 's2', exerciseId: 'ex', weightKg: 105, reps: 3, done: 1 },
    { sessionId: 's2', exerciseId: 'ex', weightKg: 110, reps: 1, done: 0 }, // није завршена
  ];
  it('Epley 1RM и рекорди', () => {
    expect(e1rm(100, 5)).toBeCloseTo(116.67, 2);
    expect(e1rm(100, 1)).toBe(100);
    expect(e1rm(100, 20)).toBeNull();
    const [r] = personalRecords(sets, sessions);
    expect(r.best1rm).toBeCloseTo(116.67, 2);
    expect(r.best1rmDate).toBe('2026-10-01');
    expect(r).toMatchObject({ bestKg: 105, bestKgReps: 3, bestKgDate: '2026-10-08' });
    expect(e1rmSeries(sets, sessions, 'ex').map((p) => p.x)).toEqual(['2026-10-01', '2026-10-08']);
  });
  it('sRPE и ACWR тек послије 3 седмице података', () => {
    expect(sessionLoad({ status: 'done', rpe: 7, durationMin: 60 })).toBe(420);
    expect(sessionLoad({ status: 'planned', rpe: 7, durationMin: 60 })).toBeNull();
    const mk = (date, rpe = 6) => ({ date, status: 'done', rpe, durationMin: 60 });
    expect(acwr([mk('2026-11-10'), mk('2026-11-12')], '2026-11-14')).toBeNull();
    const steady = ['2026-10-20', '2026-10-27', '2026-11-03', '2026-11-10'].map((d) => mk(d));
    expect(acwr(steady, '2026-11-14').level).toBe('ok');
    const spike = [...steady, mk('2026-11-11', 9), mk('2026-11-12', 9), mk('2026-11-13', 9)];
    expect(acwr(spike, '2026-11-14').level).toBe('high');
  });
  it('серије по мишићној групи и присуство', () => {
    const exMap = new Map([['ex', { category: 'Ноге' }]]);
    expect(setsByCategory(sets, exMap, sessions, '2026-10-01', '2026-10-31')).toEqual({ 'Ноге': 2 });
    const ses = [
      { date: '2026-11-03', status: 'done' }, { date: '2026-11-05', status: 'skipped' }, { date: '2026-11-10', status: 'done' },
      { date: '2026-11-18', status: 'done' }, { date: '2026-11-20', status: 'planned' },
    ];
    const a = attendance(ses, '2026-11-01', '2026-11-30', '2026-11-19');
    expect(a).toMatchObject({ done: 3, skipped: 1, pct: 0.75, streak: 3 });
  });
});

import { compareFindings } from '../src/domain/findings.js';
describe('методе мјерења', () => {
  it('% масти калипером се не пореди са % масти са ваге', () => {
    const t = '2026-01-01T00:00:00.000Z';
    const fs = [
      { id: 'a', date: '2026-10-01', createdAt: t, deleted: 0, values: [{ paramId: 'mast', value: 20, unit: '%', computed: 1, method: 'caliper' }] },
      { id: 'b', date: '2026-11-01', createdAt: t, deleted: 0, values: [{ paramId: 'mast', value: 26, unit: '%' }] },
      { id: 'c', date: '2026-11-15', createdAt: t, deleted: 0, values: [{ paramId: 'mast', value: 18.5, unit: '%', computed: 1, method: 'caliper' }] },
    ];
    const rows = Object.fromEntries(compareFindings(fs).map((r) => [r.key, r]));
    expect(rows['mast@caliper']).toMatchObject({ name: 'Тјелесна маст (калипер)', delta: -1.5, verdict: 'better' });
    expect(rows.mast).toMatchObject({ prev: null });
  });
});
