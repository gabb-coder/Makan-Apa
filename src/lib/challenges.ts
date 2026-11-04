import { tk } from './i18n';
import type { DayEntryRow } from './supabase';

export interface Challenge {
  key: 'new' | 'norepeat' | 'decided';
  /** English, shown with t(). */
  title: string;
  progress: number;
  goal: number;
  done: boolean;
  /** Can't be done this week any more (a repeat happened). */
  failed: boolean;
}

const keyOf = (e: DayEntryRow) => e.food_option_id ?? `custom:${(e.custom_food ?? '').toLowerCase()}`;

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The Monday of the week `date` is in. */
export function weekStart(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}

/** This week's challenges (Monday to `upTo`), from the room's agreed meals. */
export function challengesFor(entries: DayEntryRow[], upTo: string, monday = weekStart(upTo)): Challenge[] {
  const meals = entries.filter((e) => e.status === 'accepted' && (e.food_option_id || e.custom_food));
  const week = meals.filter((e) => e.entry_date >= monday && e.entry_date <= upTo);
  const before = new Set(meals.filter((e) => e.entry_date >= addDays(monday, -30) && e.entry_date < monday).map(keyOf));
  const keys = week.map(keyOf);
  const fresh = new Set(keys.filter((k) => !before.has(k))).size;
  const repeat = new Set(keys).size < keys.length;
  return [
    { key: 'new', title: tk('Try 2 foods you haven’t had in a month'), progress: Math.min(fresh, 2), goal: 2, done: fresh >= 2, failed: false },
    { key: 'norepeat', title: tk('4 meals, no repeats'), progress: repeat ? 0 : Math.min(keys.length, 4), goal: 4, done: !repeat && keys.length >= 4, failed: repeat },
    { key: 'decided', title: tk('Decide 5 meals together'), progress: Math.min(week.length, 5), goal: 5, done: week.length >= 5, failed: false },
  ];
}

/** Past weeks (not this one) where every challenge was done. */
export function weeksAllDone(entries: DayEntryRow[], today: string): number {
  const dates = entries.filter((e) => e.status === 'accepted').map((e) => e.entry_date).sort();
  if (!dates.length) return 0;
  let count = 0;
  const thisWeek = weekStart(today);
  for (let monday = weekStart(dates[0]); monday < thisWeek; monday = addDays(monday, 7)) {
    if (challengesFor(entries, addDays(monday, 6), monday).every((c) => c.done)) count++;
  }
  return count;
}
