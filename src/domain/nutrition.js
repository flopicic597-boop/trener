// Исхрана: збир макронутријената, прилагођавање јеловника клијенту и мјере „руком“.
import { FOOD } from '../data/foods.js';

/** Макронутријенти ставке [idНамирнице, грама] */
export function itemMacros(foodId, g) {
  const f = FOOD[foodId];
  if (!f || !(g > 0)) return { kcal: 0, p: 0, c: 0, f: 0 };
  const k = g / 100;
  return { kcal: f.kcal * k, p: f.p * k, c: f.c * k, f: f.f * k };
}
const addM = (a, b) => ({ kcal: a.kcal + b.kcal, p: a.p + b.p, c: a.c + b.c, f: a.f + b.f });
const ZERO = { kcal: 0, p: 0, c: 0, f: 0 };

/** Збир за оброк или цио дан: meals = [{ items: [[id, g], …] }] */
export function mealTotals(meal) { return meal.items.reduce((a, [id, g]) => addM(a, itemMacros(id, g)), ZERO); }
export function dayTotals(meals) { return meals.reduce((a, m) => addM(a, mealTotals(m)), ZERO); }

/** Протеинска намирница = више од 40 % енергије из протеина */
export const isProteinFood = (id) => { const f = FOOD[id]; return !!f && f.kcal > 0 && (f.p * 4) / f.kcal > 0.4; };

/**
 * Прилагођава јеловник циљу: протеинске намирнице множи са a, остале са b, тако да
 * дан има тражене kcal и протеине. Ако тражени однос није изводљив (a или b ван 0,4–3),
 * множи све једнако по kcal (протеини онда одступају, што се приказује).
 * Грамаже се заокружују на 5 g (комади на пола комада).
 */
export function scaleMeals(meals, { kcal, protein }) {
  let Kp = 0, Pp = 0, Ko = 0, Po = 0;
  for (const m of meals) for (const [id, g] of m.items) {
    const x = itemMacros(id, g);
    if (isProteinFood(id)) { Kp += x.kcal; Pp += x.p; } else { Ko += x.kcal; Po += x.p; }
  }
  const K = Kp + Ko;
  const clamp = (x) => Math.min(3, Math.max(0.3, x));
  let a = kcal / K, b = a;
  if (protein > 0 && kcal > 0 && Kp > 0 && Ko > 0) {
    const det = Kp * Po - Pp * Ko; // a·Pp + b·Po = P ; a·Kp + b·Ko = K
    if (Math.abs(det) > 1e-6) {
      // тачно рјешење, или најближе изводљиво: ограничи a, па b подеси да kcal буду тачне
      a = clamp((kcal * Po - protein * Ko) / det);
      b = clamp((kcal - a * Kp) / Ko);
    }
  }
  const round = (id, g) => { const f = FOOD[id]; if (f?.piece && g >= f.piece * 0.75) return Math.max(f.piece / 2, Math.round(g / (f.piece / 2)) * (f.piece / 2)); return Math.max(5, Math.round(g / 5) * 5); };
  const out = meals.map((m) => ({ ...m, items: m.items.map(([id, g]) => [id, round(id, g * (isProteinFood(id) ? a : b))]) }));
  const totals = dayTotals(out);
  const exact = !(protein > 0) || (totals.p >= protein * 0.92 && totals.p <= protein * 1.15); // мало више протеина није проблем
  return { meals: out, totals, factors: { protein: a, other: b }, exact };
}

/** Циљеви дана за план и клијента */
export function planTargets(plan, { tdee, kg }) {
  if (!(tdee > 0) || !(kg > 0)) return null;
  const kcal = Math.round((tdee * plan.kcalFactor) / 10) * 10;
  const protein = Math.round(kg * plan.proteinPerKg);
  return { kcal, protein };
}

/**
 * Мјере руком по оброку (за клијенте који не мјере храну): длан ≈ 20–25 g протеина,
 * шака угљених хидрата ≈ 20–25 g, песница поврћа, палац масти ≈ 7–10 g.
 */
export function handPortions({ protein, kcal, mealsPerDay = 4, fatPct = 0.28 }) {
  if (!(protein > 0) || !(kcal > 0) || !(mealsPerDay > 0)) return null;
  const fat = (kcal * fatPct) / 9;
  const carbs = Math.max(0, (kcal - protein * 4 - fat * 9) / 4);
  const r = (x) => Math.max(0.5, Math.round(x * 2) / 2);
  return { palms: r(protein / 22 / mealsPerDay), cupped: r(carbs / 25 / mealsPerDay), fists: r(1.5), thumbs: r(fat / 8 / mealsPerDay), fat: Math.round(fat), carbs: Math.round(carbs) };
}

/** Највиши ниво поста у јеловнику (0 вода … 3 мрсно) */
export const mealsFastLevel = (meals) => Math.max(0, ...meals.flatMap((m) => m.items.map(([id]) => FOOD[id]?.fast ?? 3)));
