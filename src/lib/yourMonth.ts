import { todayIn } from './dates';
import { shares } from './money';
import { knownRooms } from './session';
import { supabase, type DayEntryRow, type MealBillRow } from './supabase';

export interface MonthSummary {
  /** "2026-11" */
  month: string;
  meals: number;
  foods: number;
  top: { name: string; count: number } | null;
  /** Your share of this month's bills, in sen. */
  spent: number;
  rooms: number;
}

/** What you ate and spent this month, across every room on this phone. Pure part, for tests. */
export function summarizeMonth(
  month: string,
  entries: DayEntryRow[],
  away: { room_id: string; entry_date: string; meal: string; member_id: string }[],
  bills: MealBillRow[],
  foodName: Map<string, string>,
  myMember: Map<string, string>,
): MonthSummary {
  const mine = entries.filter((e) => {
    if (e.status !== 'accepted' || !e.entry_date.startsWith(month)) return false;
    const me = myMember.get(e.room_id);
    return !away.some((a) => a.room_id === e.room_id && a.entry_date === e.entry_date && a.meal === (e.meal ?? 'lunch') && a.member_id === me);
  });
  const counts = new Map<string, number>();
  for (const e of mine) {
    const name = (e.food_option_id && foodName.get(e.food_option_id)) || e.custom_food || '';
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const top = [...counts].sort((a, b) => b[1] - a[1])[0];
  const monthIds = new Set(entries.filter((e) => e.entry_date.startsWith(month)).map((e) => e.id));
  const spent = bills.filter((b) => monthIds.has(b.day_entry_id)).reduce((n, b) => n + (shares(b).get(myMember.get(b.room_id) ?? '') ?? 0), 0);
  return { month, meals: mine.length, foods: counts.size, top: top ? { name: top[0], count: top[1] } : null, spent, rooms: new Set(mine.map((e) => e.room_id)).size };
}

export async function loadYourMonth(): Promise<MonthSummary | null> {
  const known = knownRooms();
  if (!known.length) return null;
  const month = todayIn().slice(0, 7);
  const ids = known.map((k) => k.roomId);
  const [entries, away, bills] = await Promise.all([
    supabase.from('day_entries').select('*').in('room_id', ids).gte('entry_date', `${month}-01`),
    supabase.from('attendance').select('room_id, entry_date, meal, member_id').in('room_id', ids).eq('status', 'out').gte('entry_date', `${month}-01`),
    supabase.from('meal_bills').select('*').in('room_id', ids),
  ]);
  const rows = (entries.data ?? []) as DayEntryRow[];
  const foodIds = [...new Set(rows.map((e) => e.food_option_id).filter((x): x is string => !!x))];
  const foods = foodIds.length ? await supabase.from('food_options').select('id, name').in('id', foodIds) : { data: [] };
  return summarizeMonth(
    month,
    rows,
    (away.data ?? []) as { room_id: string; entry_date: string; meal: string; member_id: string }[],
    (bills.data ?? []) as MealBillRow[],
    new Map(((foods.data ?? []) as { id: string; name: string }[]).map((f) => [f.id, f.name])),
    new Map(known.map((k) => [k.roomId, k.memberId])),
  );
}
