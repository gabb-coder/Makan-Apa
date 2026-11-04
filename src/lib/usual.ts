import { entryFood, type Food } from './foods';
import { isGuest } from './money';
import type { DayEntryRow, MealBillRow } from './supabase';

/** What someone had last time: a line from an old bill. */
export interface Usual {
  name: string;
  cents: number;
}

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

/**
 * Everyone's usual at a place: their own line (just them, with a name) on the latest bill at
 * the same place or for the same food. `keys` are today's place and food names; `entries` newest
 * first. Today's own bill (`skipEntryId`) doesn't count.
 */
export function usualsAt(keys: (string | null | undefined)[], entries: DayEntryRow[], bills: MealBillRow[], foodsById: Map<string, Food>, skipEntryId?: string): Map<string, Usual> {
  const want = new Set(keys.map(norm).filter(Boolean));
  const out = new Map<string, Usual>();
  if (!want.size) return out;
  const billFor = new Map(bills.filter((b) => !b.event).map((b) => [b.day_entry_id, b]));
  const sorted = [...entries].sort((a, b) => b.entry_date.localeCompare(a.entry_date));
  for (const e of sorted) {
    if (e.id === skipEntryId || e.status !== 'accepted') continue;
    const here = [norm(e.meet_place), norm(entryFood(e, foodsById)?.name)].some((k) => k && want.has(k));
    if (!here) continue;
    for (const item of billFor.get(e.id)?.items ?? []) {
      const [who] = item.people;
      if (item.people.length !== 1 || isGuest(who) || !item.name.trim() || out.has(who)) continue;
      out.set(who, { name: item.name.trim(), cents: item.cents });
    }
  }
  return out;
}
