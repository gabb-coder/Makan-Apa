// Copy of src/lib/calendar.ts for the Edge Functions (Deno can't reach src/). Kept identical by
// src/lib/notify.test.ts; edit src/lib/calendar.ts and copy it here.
/**
 * Which days a room eats together, and whose turn it is. No imports: the Edge Functions use a
 * copy of this file (supabase/functions/_shared/calendar.ts).
 *
 * The turn goes down the member order one eating day at a time, so weekends a room doesn't eat
 * together and public holidays don't use anyone's turn.
 */

/** Days of the week a room eats together, 0 Sunday … 6 Saturday. */
export type EatDays = number[];

export const WEEKDAYS: EatDays = [1, 2, 3, 4, 5];
export const EVERY_DAY: EatDays = [0, 1, 2, 3, 4, 5, 6];

export interface EatCalendar {
  days: EatDays;
  /** Skip public holidays in Selangor (Sunway's state), national ones included. */
  holidays: boolean;
  /** Weekdays with a fixed lunch ("Friday is mamak"): eaten together, but nobody's turn. */
  fixed?: EatDays;
}

/** The days that use somebody's turn: eating days that aren't fixed days. */
export function turnCalendar(cal: EatCalendar): EatCalendar {
  return cal.fixed?.length ? { days: cal.days.filter((d) => !cal.fixed!.includes(d)), holidays: cal.holidays } : cal;
}

/**
 * Public holidays in Selangor, national ones included, with the days given in lieu. From the
 * Prime Minister's Department lists for 2026 and 2027. Dates marked * there can still move with
 * moon sightings; update them here when they're confirmed.
 */
export const HOLIDAYS: Record<string, string> = {
  '2026-01-01': 'New Year’s Day',
  '2026-02-01': 'Thaipusam',
  '2026-02-02': 'Thaipusam (in lieu)',
  '2026-02-17': 'Chinese New Year',
  '2026-02-18': 'Chinese New Year',
  '2026-03-07': 'Nuzul Al-Quran',
  '2026-03-20': 'Hari Raya Aidilfitri',
  '2026-03-21': 'Hari Raya Aidilfitri',
  '2026-03-22': 'Hari Raya Aidilfitri',
  '2026-03-23': 'Hari Raya Aidilfitri (in lieu)',
  '2026-05-01': 'Labour Day',
  '2026-05-27': 'Hari Raya Haji',
  '2026-05-31': 'Wesak Day',
  '2026-06-01': 'Agong’s Birthday',
  '2026-06-17': 'Awal Muharram',
  '2026-08-25': 'Maulidur Rasul',
  '2026-08-31': 'National Day',
  '2026-09-01': 'National Day (in lieu)',
  '2026-09-16': 'Malaysia Day',
  '2026-10-26': 'Sultan of Selangor’s Silver Jubilee',
  '2026-11-08': 'Deepavali',
  '2026-11-09': 'Deepavali (in lieu)',
  '2026-12-11': 'Sultan of Selangor’s Birthday',
  '2026-12-25': 'Christmas Day',
  '2027-01-01': 'New Year’s Day',
  '2027-01-22': 'Thaipusam',
  '2027-02-06': 'Chinese New Year',
  '2027-02-07': 'Chinese New Year',
  '2027-02-08': 'Chinese New Year (in lieu)',
  '2027-02-24': 'Nuzul Al-Quran',
  '2027-03-10': 'Hari Raya Aidilfitri',
  '2027-03-11': 'Hari Raya Aidilfitri',
  '2027-05-01': 'Labour Day',
  '2027-05-17': 'Hari Raya Haji',
  '2027-05-20': 'Wesak Day',
  '2027-06-06': 'Awal Muharram',
  '2027-06-07': 'Agong’s Birthday',
  '2027-06-08': 'Awal Muharram (in lieu)',
  '2027-08-15': 'Maulidur Rasul',
  '2027-08-16': 'Maulidur Rasul (in lieu)',
  '2027-08-31': 'National Day',
  '2027-09-16': 'Malaysia Day',
  '2027-10-28': 'Deepavali',
  '2027-12-11': 'Sultan of Selangor’s Birthday',
  '2027-12-25': 'Christmas Day',
};

const DAY = 86_400_000;
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
const shift = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** The public holiday on `date` (its English name), if the room skips them. */
export function holidayOn(date: string, cal: EatCalendar): string | null {
  return cal.holidays ? (HOLIDAYS[date] ?? null) : null;
}

/** Does the room eat together on `date`? */
export function isEatingDay(date: string, cal: EatCalendar): boolean {
  return cal.days.includes(weekday(date)) && !holidayOn(date, cal);
}

/** Eating days from `from` up to but not including `to`; negative when `to` comes first. */
export function eatingDaysBetween(from: string, to: string, cal: EatCalendar): number {
  if (to < from) return -eatingDaysBetween(to, from, cal);
  const span = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
  // Whole weeks at once, then the days left over one by one.
  let count = Math.floor(span / 7) * cal.days.length;
  for (let i = span - (span % 7); i < span; i++) if (cal.days.includes(weekday(shift(from, i)))) count++;
  if (cal.holidays) {
    for (const date of Object.keys(HOLIDAYS)) if (date >= from && date < to && cal.days.includes(weekday(date))) count--;
  }
  return count;
}

/** The first eating day on or after `date` (or after it, with `after`); null within a year if none. */
export function nextEatingDay(date: string, cal: EatCalendar, after = false): string | null {
  for (let i = after ? 1 : 0; i <= 366; i++) {
    const d = shift(date, i);
    if (isEatingDay(d, cal)) return d;
  }
  return null;
}

/** The next `n` eating days after `date`. */
export function eatingDaysAfter(date: string, cal: EatCalendar, n: number): string[] {
  const out: string[] = [];
  for (let d: string | null = date; out.length < n; ) {
    d = nextEatingDay(d, cal, true);
    if (!d) break;
    out.push(d);
  }
  return out;
}

/** How a room's turns run: from its start date, plus an offset kept when the days change. */
export interface Rotation {
  start: string;
  offset: number;
  cal: EatCalendar;
}

/**
 * The turn number on `date` (before wrapping round the members). Off days and fixed days use no
 * turn: they count as the next day that does.
 */
export function turnIndex(rot: Rotation, date: string): number {
  return rot.offset + eatingDaysBetween(rot.start, date, turnCalendar(rot.cal));
}

/**
 * The offset that keeps the turns where they were when the eating days change: whoever was next
 * up on or after `today` stays next up.
 */
export function offsetKeeping(before: Rotation, cal: EatCalendar, today: string): number {
  const turns = turnCalendar(cal);
  const ref = nextEatingDay(today, turns) ?? today;
  return turnIndex(before, ref) - eatingDaysBetween(before.start, ref, turns);
}
