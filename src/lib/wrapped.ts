import { passport } from './passport';
import { monthStats } from './stats';
import type { Food } from './foods';
import type { Spot } from './nearby';
import type { DayEntryRow, MealBillRow, MemberRow, VetoRow } from './supabase';

/** A month's or a year's story for a room: what it ate, who decided, where, and what it spent. */
export interface Wrapped {
  /** "2026-11" or "2026". */
  period: string;
  meals: number;
  foods: number;
  top: { name: string; count: number } | null;
  topDecider: { name: string; count: number } | null;
  mostVetoed: { name: string; count: number } | null;
  vetoes: number;
  streak: number;
  places: number;
  topPlace: { name: string; count: number } | null;
  /** Everything the room's bills came to, in sen. */
  spent: number;
  topPayer: { name: string; cents: number } | null;
}

export function wrapped(
  period: string,
  entries: DayEntryRow[],
  vetoes: VetoRow[],
  members: MemberRow[],
  foodsById: Map<string, Food>,
  bills: MealBillRow[],
  spots: Spot[],
  nameOf: (id: string) => string,
): Wrapped {
  const stats = monthStats(period, entries, vetoes, members, foodsById);
  const inPeriod = entries.filter((e) => e.entry_date.startsWith(period));
  const ids = new Set(inPeriod.map((e) => e.id));
  const stamps = passport(inPeriod, foodsById, spots);
  // Kitty bills were already paid into the pot, so they'd count twice.
  const periodBills = bills.filter((b) => ids.has(b.day_entry_id) && !b.from_kitty);
  const paid = new Map<string, number>();
  for (const b of periodBills) paid.set(b.paid_by, (paid.get(b.paid_by) ?? 0) + b.amount_cents);
  const payer = [...paid].sort((a, b) => b[1] - a[1])[0];
  const decider = [...stats.deciders].sort((a, b) => b.count - a.count)[0];
  return {
    period,
    meals: stats.meals.length,
    foods: stats.mostEaten.length,
    top: stats.mostEaten[0] ? { name: stats.mostEaten[0].name, count: stats.mostEaten[0].count } : null,
    topDecider: decider ? { name: nameOf(decider.member.id), count: decider.count } : null,
    mostVetoed: stats.mostVetoed[0] ? { name: stats.mostVetoed[0].name, count: stats.mostVetoed[0].count } : null,
    vetoes: stats.vetoes.length,
    streak: stats.bestStreak,
    places: stamps.length,
    topPlace: stamps[0] ? { name: stamps[0].spot.name, count: stamps[0].count } : null,
    spent: periodBills.reduce((n, b) => n + b.amount_cents, 0),
    topPayer: payer ? { name: nameOf(payer[0]), cents: payer[1] } : null,
  };
}
