import { entryFood, type Food } from './foods';
import type { Spot } from './nearby';
import type { DayEntryRow } from './supabase';

export interface Stamp {
  spot: Spot;
  count: number;
  /** Last time, YYYY-MM-DD. */
  last: string;
}

/**
 * Places the room has eaten at: meals whose food is a place on the map (a room spot added to the
 * food list, or a Sunway spot picked by name), or whose meet-up was at one. Most visited first.
 */
export function passport(entries: DayEntryRow[], foodsById: Map<string, Food>, spots: Spot[]): Stamp[] {
  const byName = new Map(spots.map((s) => [s.name.trim().toLowerCase(), s]));
  const stamps = new Map<string, Stamp>();
  for (const e of entries) {
    if (e.status !== 'accepted') continue;
    const names = [entryFood(e, foodsById)?.name, e.meet_place].filter((n): n is string => !!n);
    const spot = names.map((n) => byName.get(n.trim().toLowerCase())).find((s) => !!s);
    if (!spot) continue;
    const cur = stamps.get(spot.id);
    stamps.set(spot.id, { spot, count: (cur?.count ?? 0) + 1, last: cur && cur.last > e.entry_date ? cur.last : e.entry_date });
  }
  return [...stamps.values()].sort((a, b) => b.count - a.count || b.last.localeCompare(a.last));
}
