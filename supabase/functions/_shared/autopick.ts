// Auto-decide: when the wheel steps in for a decider who hasn't picked, and what it picks.
// Pure functions, used by send-reminders and tested from src/lib/autopick.test.ts.

export type Meal = 'lunch' | 'dinner';

/** Minutes after midnight (room's time): nudge the decider, the wheel picks, and when it stops trying. */
export const AUTO_WINDOWS: Record<Meal, { nudge: number; pick: number; until: number }> = {
  lunch: { nudge: 11 * 60 + 30, pick: 12 * 60, until: 15 * 60 },
  dinner: { nudge: 18 * 60 + 30, pick: 19 * 60, until: 21 * 60 + 30 },
};

/** "12:00" for a meal's pick time. */
export function pickTime(meal: Meal): string {
  const m = AUTO_WINDOWS[meal].pick;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** What's due now for a meal: a nudge, the wheel's pick, or nothing. */
export function autoPhase(meal: Meal, minutes: number): 'nudge' | 'pick' | null {
  const w = AUTO_WINDOWS[meal];
  if (minutes < w.nudge || minutes >= w.until) return null;
  return minutes >= w.pick ? 'pick' : 'nudge';
}

export interface PickFood {
  id: string;
  name: string;
  diet: string[] | null;
  price: number | null;
}
export interface PickPerson {
  diet: string[] | null;
  budget: number | null;
}

/** Same rule as the app (src/lib/diet.ts): does a food suit this person? */
function suits(food: PickFood, person: PickPerson): boolean {
  const marks = food.diet ?? [];
  const needs = person.diet ?? [];
  if ((needs.includes('halal') || needs.includes('no-pork')) && marks.includes('pork')) return false;
  if (needs.includes('no-beef') && marks.includes('beef')) return false;
  if (needs.includes('vegetarian') && !marks.includes('vegetarian')) return false;
  if (person.budget && food.price && food.price > person.budget) return false;
  return true;
}

/**
 * The wheel's pick: foods that suit everyone who's in (all of them if fewer than two do), minus
 * today's vetoes, with foods eaten lately much less likely, like the app's wheel.
 * `daysSince` maps a food id to days since the room last ate it; `random` is in [0, 1).
 */
export function pickFood(foods: PickFood[], people: PickPerson[], vetoed: Set<string>, daysSince: Map<string, number>, random: number): PickFood | null {
  const open = foods.filter((f) => !vetoed.has(f.name.toLowerCase()));
  const suiting = open.filter((f) => people.every((p) => suits(f, p)));
  const pool = suiting.length >= 2 ? suiting : open;
  if (!pool.length) return null;
  const weight = (f: PickFood) => {
    const d = daysSince.get(f.id);
    if (d === undefined) return 3;
    if (d <= 2) return 0.25;
    return 1 + Math.min(d, 14) / 7;
  };
  const total = pool.reduce((n, f) => n + weight(f), 0);
  let r = random * total;
  for (const f of pool) {
    r -= weight(f);
    if (r < 0) return f;
  }
  return pool[pool.length - 1];
}
