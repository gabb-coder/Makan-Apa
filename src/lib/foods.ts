import type { FoodColor, FoodIconName } from './palette';

export interface Food {
  id: string;
  name: string;
  tags: string[];
  icon: FoodIconName;
  color: FoodColor;
  /** Days since this food was last accepted; null if never eaten. */
  daysSinceEaten: number | null;
}

/** Hard-coded starter list for Phase 1, matching the mockups. Replaced by Supabase in Phase 2. */
export const STARTER_FOODS: Food[] = [
  { id: 'nasi-lemak', name: 'Nasi Lemak', tags: ['rice', 'cheap', 'malay'], icon: 'rice', color: 'leaf', daysSinceEaten: 4 },
  { id: 'ramen', name: 'Ramen', tags: ['noodles', 'japanese'], icon: 'bowl', color: 'mustard', daysSinceEaten: 2 },
  { id: 'chicken-rice', name: 'Chicken Rice', tags: ['rice', 'cheap'], icon: 'rice', color: 'peach', daysSinceEaten: 1 },
  { id: 'pizza', name: 'Pizza', tags: ['western', 'sharing'], icon: 'pizza', color: 'tomato', daysSinceEaten: 7 },
  { id: 'mixed-rice', name: 'Mixed Rice', tags: ['rice', 'cheap'], icon: 'rice', color: 'sky', daysSinceEaten: 3 },
  { id: 'sushi', name: 'Sushi', tags: ['japanese'], icon: 'sushi', color: 'plum', daysSinceEaten: null },
  { id: 'burger', name: 'Burger', tags: ['western', 'takeaway'], icon: 'burger', color: 'sand', daysSinceEaten: 6 },
  { id: 'mamak', name: 'Mamak', tags: ['cheap', 'late night'], icon: 'cup', color: 'teal', daysSinceEaten: 5 },
];

/** Eaten within this many days counts as "Recent" (badge and wheel note). */
export const RECENT_DAYS = 3;

export function isRecent(food: Food): boolean {
  return food.daysSinceEaten !== null && food.daysSinceEaten <= RECENT_DAYS;
}

/** Recently-eaten penalty from the spec: never eaten = 1, otherwise days/7 clamped to [0.1, 1]. */
export function wheelWeight(food: Food): number {
  if (food.daysSinceEaten === null) return 1;
  return Math.max(0.1, Math.min(1, food.daysSinceEaten / 7));
}

/** Weighted random draw. Returns the index of the winner. */
export function weightedPick<T>(items: T[], weight: (item: T) => number, rand = Math.random): number {
  const weights = items.map(weight);
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return items.length - 1;
}

export function formatTag(tag: string): string {
  return tag.charAt(0).toUpperCase() + tag.slice(1);
}

/** "A", "A and B", "A, B and C". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function filterByTags(foods: Food[], tags: string[], mode: 'and' | 'or'): Food[] {
  if (tags.length === 0) return foods;
  return foods.filter((f) =>
    mode === 'and' ? tags.every((t) => f.tags.includes(t)) : tags.some((t) => f.tags.includes(t)),
  );
}
