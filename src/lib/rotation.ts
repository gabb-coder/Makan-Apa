import { daysBetween } from './dates';
import type { MemberRow } from './supabase';

/** YYYY-MM-DD plus `n` days. */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** e.g. "Sat 31" for a YYYY-MM-DD date. */
export function dayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const wd = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(d);
  return `${wd} ${d.getUTCDate()}`;
}

/** e.g. "Fri 30 Oct" for a YYYY-MM-DD date. */
export function dayMonthLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const month = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' }).format(d);
  return `${dayLabel(date)} ${month}`;
}

/**
 * Who decides on `date`: members sorted by sort_order, then
 * daysBetween(rotation_start, date) mod member count (SPEC.md section 6).
 */
export function deciderFor(members: MemberRow[], rotationStart: string, date: string): MemberRow | null {
  if (members.length === 0) return null;
  const sorted = [...members].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
  const n = sorted.length;
  const i = ((daysBetween(rotationStart, date) % n) + n) % n;
  return sorted[i];
}
