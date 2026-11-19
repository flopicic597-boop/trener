import { describe, it, expect } from 'vitest';
import { ZONES, ZONE } from '../src/data/body-zones.js';
import { BUILTIN_EXERCISES } from '../src/data/exercises-seed.js';
import { suggestExercises, doseFromCue, planSets } from '../src/domain/prehab.js';

describe('атлас тијела: подаци', () => {
  const ids = new Set(BUILTIN_EXERCISES.map((e) => e.id));
  it('свака зона има комплетан опис и постојеће вјежбе', () => {
    expect(ZONES.length).toBeGreaterThanOrEqual(40);
    for (const z of ZONES) {
      for (const k of ['name', 'desc', 'func', 'issues', 'prehab', 'fact']) expect(z[k], `${z.id}.${k}`).toBeTruthy();
      expect(['muscle', 'skeleton', 'fascia']).toContain(z.layer);
      for (const x of z.ex) expect(ids.has(x), `${z.id} → ${x}`).toBe(true);
      expect(z.desc + z.fact).not.toMatch(/­/);
    }
  });
  it('свака вјежба превенције је везана за постојеће зоне', () => {
    const pre = BUILTIN_EXERCISES.filter((e) => e.prehab);
    expect(pre.length).toBe(43);
    for (const e of pre) { expect(e.zones.length).toBeGreaterThan(0); for (const z of e.zones) expect(ZONE[z], `${e.id} → ${z}`).toBeTruthy(); expect(e.note).toBeTruthy(); }
  });
});

describe('тренинг из обиљежених зона', () => {
  it('доза из упутства', () => {
    expect(doseFromCue('Лакат уз тијело; 2–3 × 12–15.')).toMatchObject({ setsLo: 2, setsHi: 3, repsLo: 12 });
    expect(doseFromCue('почните са 2 × 3–5.')).toMatchObject({ setsLo: 2, setsHi: 2, repsLo: 3 });
    expect(doseFromCue('задржаји 30–45 с.').sec).toBe(30);
    const nordic = BUILTIN_EXERCISES.find((e) => e.id === 'ex-p19');
    expect(planSets(nordic, false)).toHaveLength(2);
    expect(planSets(nordic, false)[0].reps).toBe(3);
  });
  it('бол → блажи план; без дупликата; ријешене ознаке се не рачунају', () => {
    const marks = [{ zone: 'knee', side: 'R', type: 'pain', active: 1 }, { zone: 'quads', side: 'R', type: 'focus', active: 1 }, { zone: 'hams', side: 'L', type: 'focus', active: 0 }];
    const s = suggestExercises(marks, BUILTIN_EXERCISES, { mode: 'prehab' });
    const ids = s.map((x) => x.exercise.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain('ex-p19'); // задња ложа је ријешена
    const step = s.find((x) => x.exercise.id === 'ex-p23');
    expect(step.zones).toEqual(['Кољено (десно)', 'Четвороглави мишић бутине (десно)']);
    expect(step.sets).toHaveLength(2); // блаже због бола
    const strength = suggestExercises([{ zone: 'quads', side: 'R', type: 'focus' }], BUILTIN_EXERCISES, { mode: 'strength' });
    expect(strength.some((x) => !x.exercise.prehab && x.exercise.category === 'Ноге')).toBe(true);
  });
});
