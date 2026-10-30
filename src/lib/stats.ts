import { daysBetween } from './dates';
import { entryFood, type Food } from './foods';
import type { DayEntryRow, MemberRow, VetoRow } from './supabase';

/** YYYY-MM for a YYYY-MM-DD date. */
export function monthKey(date: string): string {
  return date.slice(0, 7);
}

/** "October", or "October 2025" when it isn't `currentYear`. */
export function monthLabel(key: string, currentYear?: string): string {
  const d = new Date(`${key}-01T00:00:00Z`);
  const month = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' }).format(d);
  return currentYear && key.slice(0, 4) !== currentYear ? `${month} ${key.slice(0, 4)}` : month;
}

/** Months with any day entry, plus the current one, newest first. */
export function availableMonths(entries: DayEntryRow[], today: string): string[] {
  const keys = new Set(entries.map((e) => monthKey(e.entry_date)));
  keys.add(monthKey(today));
  return [...keys].sort().reverse();
}

export interface Meal {
  entry: DayEntryRow;
  food: Food;
  /** Same key for the same food, whether picked from the pool or typed in. */
  key: string;
  vetoes: VetoRow[];
}

export interface Ranked {
  key: string;
  name: string;
  food: Food | null;
  count: number;
}

export interface MonthStats {
  /** Accepted meals in the month, newest first. */
  meals: Meal[];
  bestStreak: number;
  vetoes: VetoRow[];
  vetoesByMember: { member: MemberRow; count: number }[];
  deciders: { member: MemberRow; count: number }[];
  mostEaten: Ranked[];
  mostVetoed: Ranked[];
  tags: { tag: string; count: number }[];
}

function foodKey(entry: DayEntryRow, food: Food): string {
  return entry.food_option_id ?? `custom:${food.name.toLowerCase()}`;
}

function rank<T>(items: T[], keyOf: (t: T) => string, describe: (t: T) => Omit<Ranked, 'count'>): Ranked[] {
  const counts = new Map<string, Ranked>();
  for (const item of items) {
    const key = keyOf(item);
    const hit = counts.get(key);
    if (hit) hit.count++;
    else counts.set(key, { ...describe(item), count: 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * Longest run of back-to-back days with an accepted meal where no food repeats.
 * `meals` must be oldest first.
 */
export function bestNoRepeatStreak(meals: Pick<Meal, 'key' | 'entry'>[]): number {
  let best = 0;
  let start = 0;
  const lastSeen = new Map<string, number>();
  for (let i = 0; i < meals.length; i++) {
    if (i > 0 && daysBetween(meals[i - 1].entry.entry_date, meals[i].entry.entry_date) !== 1) start = i;
    const seen = lastSeen.get(meals[i].key);
    if (seen !== undefined && seen >= start) start = seen + 1;
    lastSeen.set(meals[i].key, i);
    best = Math.max(best, i - start + 1);
  }
  return best;
}

export function monthStats(
  month: string,
  entries: DayEntryRow[],
  vetoes: VetoRow[],
  members: MemberRow[],
  foodsById: Map<string, Food>,
): MonthStats {
  const inMonth = entries.filter((e) => monthKey(e.entry_date) === month);
  const entryIds = new Set(inMonth.map((e) => e.id));
  const monthVetoes = vetoes.filter((v) => entryIds.has(v.day_entry_id));

  const meals: Meal[] = [];
  for (const entry of inMonth) {
    if (entry.status !== 'accepted') continue;
    const food = entryFood(entry, foodsById);
    if (!food) continue;
    meals.push({ entry, food, key: foodKey(entry, food), vetoes: monthVetoes.filter((v) => v.day_entry_id === entry.id) });
  }
  meals.sort((a, b) => b.entry.entry_date.localeCompare(a.entry.entry_date));

  const byMember = (count: (m: MemberRow) => number) =>
    members.map((member) => ({ member, count: count(member) })).filter((x) => x.count > 0);

  const tagCounts = new Map<string, number>();
  for (const meal of meals) for (const t of meal.food.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);

  return {
    meals,
    bestStreak: bestNoRepeatStreak([...meals].reverse()),
    vetoes: monthVetoes,
    vetoesByMember: byMember((m) => monthVetoes.filter((v) => v.member_id === m.id).length),
    deciders: byMember((m) => meals.filter((x) => x.entry.decider_id === m.id).length),
    mostEaten: rank(meals, (m) => m.key, (m) => ({ key: m.key, name: m.food.name, food: m.food })),
    mostVetoed: rank(
      monthVetoes,
      (v) => v.rejected_food.toLowerCase(),
      (v) => ({
        key: v.rejected_food.toLowerCase(),
        name: v.rejected_food,
        food: [...foodsById.values()].find((f) => f.name.toLowerCase() === v.rejected_food.toLowerCase()) ?? null,
      }),
    ),
    tags: [...tagCounts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)),
  };
}
