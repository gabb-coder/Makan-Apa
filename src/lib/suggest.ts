import { tk } from './i18n';
import { wheelWeight, type Food } from './foods';

/** A food to suggest and why, with each reason as a translation key and its values. */
export interface Suggestion {
  food: Food;
  reasons: { key: string; vars?: Record<string, string | number> }[];
}

export interface SuggestInput {
  /** Foods that can be picked today (active, not vetoed). */
  foods: Food[];
  /** Foods that suit everyone's diet and budget. */
  suits: (food: Food) => boolean;
  /** Raining now or soon, and which foods you can get under cover. */
  wet?: boolean;
  covered?: (food: Food) => boolean;
}

/**
 * Every food scored, best first: the wheel's own odds (not eaten lately, liked by the room),
 * leaning hard on suiting everyone, and on staying dry when it rains. Deterministic, so
 * "another idea" walks down the same list.
 */
export function suggestions({ foods, suits, wet = false, covered = () => false }: SuggestInput): Suggestion[] {
  const scored = foods.map((food) => {
    const fits = suits(food);
    const dry = wet && covered(food);
    const score = wheelWeight(food) * (fits ? 1 : 0.25) * (dry ? 1.6 : 1);
    const reasons: Suggestion['reasons'] = [];
    if (food.daysSinceEaten === null) reasons.push({ key: tk('You haven’t had it yet') });
    else if (food.daysSinceEaten >= 14) reasons.push({ key: tk('Not had in {n} days'), vars: { n: food.daysSinceEaten } });
    if ((food.netRating ?? 0) > 0) reasons.push({ key: tk('The room liked it ({n} 👍)'), vars: { n: food.netRating! } });
    if (fits) reasons.push({ key: tk('Suits everyone’s diet and budget') });
    if (dry) reasons.push({ key: tk('You can get it without getting wet') });
    return { food, reasons, score };
  });
  return scored.sort((a, b) => b.score - a.score || a.food.name.localeCompare(b.food.name)).map(({ food, reasons }) => ({ food, reasons }));
}
