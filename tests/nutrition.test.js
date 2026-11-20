import { describe, it, expect } from 'vitest';
import { FOODS, FOOD } from '../src/data/foods.js';
import { DIET_PLANS, DIET_CATS, DIET_GOALS } from '../src/data/nutrition-plans.js';
import { SUPPLEMENTS, EVIDENCE } from '../src/data/supplements.js';
import { dayTotals, scaleMeals, planTargets, mealsFastLevel, handPortions, itemMacros } from '../src/domain/nutrition.js';

describe('намирнице', () => {
  it('енергија одговара макронутријентима (4/4/9 kcal, ±15 %)', () => {
    for (const f of FOODS) {
      const est = f.p * 4 + f.c * 4 + f.f * 9;
      expect(Math.abs(est - f.kcal) / f.kcal, f.name).toBeLessThan(f.kcal < 60 ? 0.3 : 0.15); // поврће: влакна у угљеним хидратима
    }
  });
  it('јединствени id-ови и ниво поста 0–3', () => {
    expect(new Set(FOODS.map((f) => f.id)).size).toBe(FOODS.length);
    for (const f of FOODS) expect([0, 1, 2, 3]).toContain(f.fast);
  });
});

describe('планови исхране', () => {
  it('све намирнице постоје, посни планови немају мрсне намирнице', () => {
    for (const p of DIET_PLANS) {
      for (const m of p.meals) for (const [id, g] of m.items) { expect(FOOD[id], `${p.id}: ${id}`).toBeTruthy(); expect(g).toBeGreaterThan(0); }
      expect(mealsFastLevel(p.meals), p.id).toBeLessThanOrEqual(p.fast);
      if (p.cat === 'posno') expect(p.fast).toBeLessThan(3);
      expect(DIET_GOALS[p.goal]).toBeTruthy();
      expect(DIET_CATS.map(([k]) => k)).toContain(p.cat);
    }
  });
  it('свака категорија има план за мишиће и за смањење масти', () => {
    for (const [cat] of DIET_CATS) for (const g of ['gain', 'loss']) expect(DIET_PLANS.some((p) => p.cat === cat && p.goal === g), cat + g).toBe(true);
  });
  it('прилагођавање погађа kcal (±5 %) и протеине за клијенте од 50 до 110 kg', () => {
    for (const p of DIET_PLANS) for (const [kg, tdee] of [[50, 1600], [60, 2000], [75, 2600], [95, 3200], [110, 3600]]) {
      const t = planTargets(p, { tdee, kg });
      const s = scaleMeals(p.meals, t);
      expect(Math.abs(s.totals.kcal - t.kcal) / t.kcal, `${p.id} ${kg}kg kcal`).toBeLessThan(0.05);
      expect(s.exact, `${p.id} ${kg}kg протеини ${Math.round(s.totals.p)}/${t.protein}`).toBe(true);
      for (const m of s.meals) for (const [, g] of m.items) expect(g).toBeGreaterThan(0);
    }
  });
  it('збир дана', () => {
    expect(itemMacros('ovas', 100).kcal).toBe(379);
    expect(dayTotals([{ items: [['ovas', 50], ['banana', 100]] }]).kcal).toBeCloseTo(189.5 + 89, 5);
  });
  it('мјере руком', () => {
    const h = handPortions({ protein: 160, kcal: 2400, mealsPerDay: 4 });
    expect(h.palms).toBeGreaterThanOrEqual(1.5); expect(h.palms).toBeLessThanOrEqual(2);
    expect(h.carbs).toBeGreaterThan(200);
  });
});

describe('суплементи', () => {
  it('сваки има ниво доказа и упозорење', () => {
    for (const s of SUPPLEMENTS) { expect(EVIDENCE[s.ev], s.id).toBeTruthy(); expect(s.caution, s.id).toBeTruthy(); expect(s.posno, s.id).toBeTruthy(); }
  });
});
