import { tk } from './i18n';
import { balances } from './money';
import { bestNoRepeatStreak } from './stats';
import type { EatCalendar } from './calendar';
import { weeksAllDone } from './challenges';
import type { DayEntryRow, MealBillRow, SettlementRow, VetoRow } from './supabase';

export interface Badge {
  id: string;
  emoji: string;
  /** English, shown with t(). */
  title: string;
  description: string;
  /** Progress towards it; earned once value reaches target. */
  value: number;
  target: number;
  earned: boolean;
}

interface Input {
  meId: string;
  /** Every day entry in the room. */
  entries: DayEntryRow[];
  vetoes: VetoRow[];
  bills: MealBillRow[];
  settlements: SettlementRow[];
  /** Today in the room, for weekly challenges. */
  today?: string;
  /** The room's eating days: weekends off don't break a no-repeat streak. */
  cal?: EatCalendar;
}

/** Same food, whether picked from the list or typed in. */
const keyOf = (e: DayEntryRow) => e.food_option_id ?? `custom:${(e.custom_food ?? '').toLowerCase()}`;

/** Your badges in a room, earned first, from what the room has eaten and paid. */
export function badgesFor({ meId, entries, vetoes, bills, settlements, today = new Date().toISOString().slice(0, 10), cal }: Input): Badge[] {
  const meals = entries
    .filter((e) => e.status === 'accepted' && (e.food_option_id || e.custom_food))
    .sort((a, b) => a.entry_date.localeCompare(b.entry_date) || (a.meal ?? 'lunch').localeCompare(b.meal ?? 'lunch'));
  const streak = bestNoRepeatStreak(meals.map((entry) => ({ entry, key: keyOf(entry) })), cal);
  const tried = new Set(meals.map(keyOf)).size;
  const decided = meals.filter((e) => e.decider_id === meId).length;
  const paid = bills.filter((b) => b.paid_by === meId).length;
  const vetoed = vetoes.filter((v) => v.member_id === meId).length;
  const paidBack = settlements.filter((s) => s.from_member === meId).length;
  const owes = (balances(bills, settlements).get(meId) ?? 0) < 0;

  const b = (id: string, emoji: string, title: string, description: string, value: number, target: number, extra = true): Badge => ({
    id,
    emoji,
    title,
    description,
    value: Math.min(value, target),
    target,
    earned: value >= target && extra,
  });
  const list = [
    b('streak5', '🔥', tk('On a roll'), tk('5 days in a row with no repeats'), streak, 5),
    b('streak10', '🌶️', tk('Never the same'), tk('10 days in a row with no repeats'), streak, 10),
    b('tried10', '🧭', tk('Explorer'), tk('10 different foods eaten together'), tried, 10),
    b('tried25', '🗺️', tk('Food adventurer'), tk('25 different foods eaten together'), tried, 25),
    b('decided10', '🎯', tk('Decisive'), tk('You decided 10 meals'), decided, 10),
    b('paid5', '💳', tk('Big wallet'), tk('You paid 5 bills for the group'), paid, 5),
    b('settled', '🤝', tk('Settles up'), tk('Paid someone back, and owe nothing now'), paidBack, 1, !owes),
    b('veto3', '✋', tk('Tough crowd'), tk('Used 3 vetoes'), vetoed, 3),
    b('challenges3', '🏆', tk('Challenge champ'), tk('Every weekly challenge done, 3 weeks'), weeksAllDone(entries, today), 3),
  ];
  return list.sort((x, y) => Number(y.earned) - Number(x.earned));
}
