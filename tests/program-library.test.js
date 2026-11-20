import { describe, it, expect } from 'vitest';
import { PROGRAM_LIBRARY, LIB_CATEGORIES, dayToItems } from '../src/data/program-library.js';
import { BUILTIN_EXERCISES } from '../src/data/exercises-seed.js';
import { validateSet, normalizeTempo } from '../src/domain/rules.js';

const exMap = new Map(BUILTIN_EXERCISES.map((e) => [e.id, e]));

describe('библиотека програма', () => {
  it('свака категорија има планове, id-ови су јединствени', () => {
    for (const [c] of LIB_CATEGORIES) expect(PROGRAM_LIBRARY.some((p) => p.cat === c), c).toBe(true);
    expect(new Set(PROGRAM_LIBRARY.map((p) => p.id)).size).toBe(PROGRAM_LIBRARY.length);
  });
  it('вјежбе постоје и врста одговара (вријеме/понављања)', () => {
    for (const p of PROGRAM_LIBRARY) for (const d of p.dayList) for (const x of d.items) {
      const ex = exMap.get(x.id);
      expect(ex, `${p.id}/${d.name}: ${x.id}`).toBeTruthy();
      expect(ex.type === 'time', `${p.id}/${d.name}: ${ex.name}`).toBe(x.sec != null);
      if (x.tempo) expect(normalizeTempo(x.tempo), x.tempo).not.toBe(false);
    }
  });
  it('ставке пролазе провјеру серија', () => {
    for (const p of PROGRAM_LIBRARY) for (const d of p.dayList) for (const it of dayToItems(d, exMap)) {
      expect(it.sets.length).toBeGreaterThan(0);
      for (const s of it.sets) expect(validateSet(s)).toEqual({});
    }
  });
  it('сви текстови имају опис, принципе и прогресију', () => {
    for (const p of PROGRAM_LIBRARY) {
      for (const k of ['name', 'goal', 'days', 'progression', 'level']) expect(p[k], p.id + '.' + k).toBeTruthy();
      expect(p.principles.length).toBeGreaterThan(1);
    }
  });
});
