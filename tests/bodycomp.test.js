import { describe, it, expect } from 'vitest';
import { navyFat, rfmFat, bmiFat, leeMuscle, ffmi, fatClass, bodyComposition } from '../src/domain/bodycomp.js';

describe('састав тијела', () => {
  it('метод морнарице (мушкарац 180 cm, струк 85, врат 38 ≈ 16 %)', () => {
    expect(navyFat({ sex: 'm', heightCm: 180, waistCm: 85, neckCm: 38 })).toBeCloseTo(16.1, 0);
  });
  it('метод морнарице (жена 165 cm, струк 72, кукови 98, врат 32 ≈ 27 %)', () => {
    const v = navyFat({ sex: 'f', heightCm: 165, waistCm: 72, hipCm: 98, neckCm: 32 });
    expect(v).toBeGreaterThan(24); expect(v).toBeLessThan(30);
  });
  it('недостајући подаци дају null', () => {
    expect(navyFat({ sex: 'f', heightCm: 165, waistCm: 72, neckCm: 32 })).toBeNull();
    expect(navyFat({ sex: '', heightCm: 165, waistCm: 72, neckCm: 32 })).toBeNull();
    expect(rfmFat({ sex: 'm', heightCm: 180 })).toBeNull();
  });
  it('RFM и BMI формуле', () => {
    expect(rfmFat({ sex: 'm', heightCm: 180, waistCm: 90 })).toBeCloseTo(24, 5);
    expect(rfmFat({ sex: 'f', heightCm: 160, waistCm: 80 })).toBeCloseTo(36, 5);
    expect(bmiFat({ sex: 'm', heightCm: 180, weightKg: 81, age: 30 })).toBeCloseTo(1.2 * 25 + 6.9 - 10.8 - 5.4, 5);
  });
  it('мишићна маса по Lee 2000 (оба модела)', () => {
    const s = leeMuscle({ sex: 'm', heightCm: 180, weightKg: 80, age: 30 });
    expect(s.method).toBe('lee-simple'); expect(s.kg).toBeCloseTo(0.244 * 80 + 7.8 * 1.8 - 0.098 * 30 + 6.6 - 3.3, 5);
    const g = leeMuscle({ sex: 'm', heightCm: 180, weightKg: 80, age: 30, armCm: 33, thighCm: 56, calfCm: 38, tricepsMm: 10, thighMm: 14, calfMm: 9 });
    expect(g.method).toBe('lee-girth'); expect(g.kg).toBeGreaterThan(25); expect(g.kg).toBeLessThan(45);
  });
  it('FFMI и категорије', () => {
    expect(ffmi(64, 180).normalized).toBeCloseTo(64 / 3.24, 5);
    expect(fatClass('m', 12).label).toBe('Спортиста');
    expect(fatClass('f', 35).tone).toBe('bad');
  });
  it('редослијед тачности: калипер прије обима', () => {
    const r = bodyComposition({ sex: 'm', age: 30, heightCm: 180, weightKg: 80, waistCm: 85, neckCm: 38, caliperPct: 14 });
    expect(r.best.id).toBe('caliper'); expect(r.methods.map((m) => m.id)).toEqual(['caliper', 'navy', 'rfm', 'bmi']);
    expect(r.fatKg).toBeCloseTo(11.2, 5); expect(r.musclePct).toBeGreaterThan(35);
  });
});
