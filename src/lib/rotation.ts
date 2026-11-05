import { EVERY_DAY, turnIndex, WEEKDAYS, type EatCalendar, type Rotation } from './calendar';
import { locale } from './i18n';
import type { Meal, MemberRow, RoomRow } from './supabase';

/** YYYY-MM-DD plus `n` days. */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** e.g. "Sat 31" for a YYYY-MM-DD date ("Sab 31", "31日周六"). Pass 'en-GB' for English whatever the app language. */
export function dayLabel(date: string, loc = locale()): string {
  const d = new Date(`${date}T00:00:00Z`);
  // Chinese puts the day first with its own suffix, so let Intl lay it out.
  if (loc.startsWith('zh')) return new Intl.DateTimeFormat(loc, { weekday: 'short', day: 'numeric', timeZone: 'UTC' }).format(d);
  const wd = new Intl.DateTimeFormat(loc, { weekday: 'short', timeZone: 'UTC' }).format(d);
  return `${wd} ${d.getUTCDate()}`;
}

/** e.g. "Fri 30 Oct" for a YYYY-MM-DD date ("Jum 30 Okt", "10月30日周五"). */
export function dayMonthLabel(date: string, loc = locale()): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (loc.startsWith('zh')) return new Intl.DateTimeFormat(loc, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d);
  const month = new Intl.DateTimeFormat(loc, { month: 'short', timeZone: 'UTC' }).format(d);
  return `${dayLabel(date, loc)} ${month}`;
}

/** The room's calendar: which days it eats together, and whether it skips public holidays. */
export function calendarOf(room: Pick<RoomRow, 'eat_days' | 'skip_holidays' | 'fixed_days'>): EatCalendar {
  const fixed = Object.keys(room.fixed_days ?? {}).map(Number);
  return { days: room.eat_days ?? EVERY_DAY, holidays: room.skip_holidays ?? false, ...(fixed.length ? { fixed } : {}) };
}

/** How the room's turns run. */
export function rotationOf(room: Pick<RoomRow, 'rotation_start' | 'rotation_offset' | 'eat_days' | 'skip_holidays' | 'fixed_days'>): Rotation {
  return { start: room.rotation_start, offset: room.rotation_offset ?? 0, cal: calendarOf(room) };
}

export { WEEKDAYS };

/**
 * Who decides on `date`: members sorted by sort_order, one eating day each from the rotation
 * start (SPEC.md section 6). Days the room doesn't eat together don't use a turn: on one, this
 * is whoever's up on the next eating day.
 */
export function deciderFor(members: MemberRow[], rot: Rotation, date: string, meal: Meal = 'lunch', away?: ReadonlySet<string>): MemberRow | null {
  if (members.length === 0) return null;
  const sorted = [...members].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
  const n = sorted.length;
  // Dinner goes to the next person along, so nobody decides both meals.
  const i = (((turnIndex(rot, date) + (meal === 'dinner' ? 1 : 0)) % n) + n) % n;
  // Someone who's out today is skipped: the next person along who's in decides instead.
  for (let k = 0; k < n; k++) {
    const m = sorted[(i + k) % n];
    if (!away?.has(m.id)) return m;
  }
  return sorted[i];
}
