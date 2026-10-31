import { COLOR_KEYS, ICONS, type FoodColor, type FoodIconName } from './palette';
import type { DayEntryRow, FoodOptionRow } from './supabase';

export interface Food {
  id: string;
  name: string;
  tags: string[];
  icon: FoodIconName;
  color: FoodColor;
  isActive: boolean;
  /** Days since this food was last accepted; null if never eaten. */
  daysSinceEaten: number | null;
  /** halal, vegetarian, pork, beef (see diet.ts). */
  diet: string[];
  /** 1 under RM15, 2 RM15–50, 3 more; null if not set. */
  price: number | null;
}

/** Fields the user edits on a food. */
export type FoodDraft = Pick<Food, 'name' | 'tags' | 'icon' | 'color'> & Partial<Pick<Food, 'diet' | 'price'>>;

export function rowToFood(row: FoodOptionRow, daysSinceEaten: number | null): Food {
  return {
    id: row.id,
    name: row.name,
    tags: row.tags,
    icon: (ICONS as readonly string[]).includes(row.icon) ? (row.icon as FoodIconName) : 'rice',
    color: (COLOR_KEYS as string[]).includes(row.color) ? (row.color as FoodColor) : 'leaf',
    isActive: row.is_active,
    daysSinceEaten,
    diet: row.diet ?? [],
    price: row.price ?? null,
  };
}

/** The 8 mockup foods, offered when the food list is nearly empty. */
export const STARTER_PACK: FoodDraft[] = [
  { name: 'Nasi Lemak', tags: ['rice', 'cheap', 'malay'], icon: 'rice', color: 'leaf' },
  { name: 'Ramen', tags: ['noodles', 'japanese'], icon: 'bowl', color: 'mustard' },
  { name: 'Chicken Rice', tags: ['rice', 'cheap'], icon: 'rice', color: 'peach' },
  { name: 'Pizza', tags: ['western', 'sharing'], icon: 'pizza', color: 'tomato' },
  { name: 'Mixed Rice', tags: ['rice', 'cheap'], icon: 'rice', color: 'sky' },
  { name: 'Sushi', tags: ['japanese'], icon: 'sushi', color: 'plum' },
  { name: 'Burger', tags: ['western', 'takeaway'], icon: 'burger', color: 'sand' },
  { name: 'Mamak', tags: ['cheap', 'late night'], icon: 'cup', color: 'teal' },
];

/** Eaten within this many days counts as "Recent" (badge and wheel note). */
export const RECENT_DAYS = 3;

export function isRecent(food: Food): boolean {
  return food.daysSinceEaten !== null && food.daysSinceEaten <= RECENT_DAYS;
}

export function lastEatenLabel(days: number | null): string {
  if (days === null) return 'Not yet';
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return '1 week ago';
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
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

export function normalizeTag(tag: string): string {
  return tag.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function formatTag(tag: string): string {
  return tag.charAt(0).toUpperCase() + tag.slice(1);
}

/** Tags used across `foods`, most common first. */
export function popularTags(foods: Food[], limit = Infinity): string[] {
  const counts = new Map<string, number>();
  for (const f of foods) for (const t of f.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([t]) => t);
}

/** "A", "A and B", "A, B and C" (or "A, B or C"). */
export function joinNames(names: string[], conjunction: 'and' | 'or' = 'and'): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} ${conjunction} ${names[names.length - 1]}`;
}

export function filterByTags(foods: Food[], tags: string[], mode: 'and' | 'or'): Food[] {
  if (tags.length === 0) return foods;
  return foods.filter((f) =>
    mode === 'and' ? tags.every((t) => f.tags.includes(t)) : tags.some((t) => f.tags.includes(t)),
  );
}

/** Display stand-in for a typed-in food that isn't in the pool. */
export function customFood(name: string): Food {
  let hash = 0;
  for (const ch of name.toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return {
    id: `custom:${name.toLowerCase()}`,
    name,
    tags: [],
    icon: 'bowl',
    color: COLOR_KEYS[hash % COLOR_KEYS.length],
    isActive: true,
    daysSinceEaten: null,
    diet: [],
    price: null,
  };
}

/** The food a day entry points at, or null if it has none. */
export function entryFood(entry: DayEntryRow, foodsById: Map<string, Food>): Food | null {
  if (entry.food_option_id) return foodsById.get(entry.food_option_id) ?? customFood('A deleted food');
  if (entry.custom_food) {
    const lower = entry.custom_food.toLowerCase();
    return [...foodsById.values()].find((f) => f.name.toLowerCase() === lower) ?? customFood(entry.custom_food);
  }
  return null;
}

/** "once", "twice", "3 times". */
export function timesWord(n: number): string {
  return n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`;
}

export function mapsSearchUrl(food: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${food} near me`)}`;
}
