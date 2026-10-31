export const DEFAULT_TZ = 'Asia/Kuala_Lumpur';

/** e.g. "Fri 30 Oct". */
export function shortDate(d: Date, timeZone = DEFAULT_TZ): string {
  const parts = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('weekday')} ${get('day')} ${get('month')}`;
}

/** Today's calendar date in `timeZone`, as YYYY-MM-DD. */
export function todayIn(timeZone = DEFAULT_TZ, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).format(now);
}

/** Whole days from date `a` to date `b` (both YYYY-MM-DD). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** The hour (0–23) right now in `timeZone`. */
export function localHour(timeZone = DEFAULT_TZ, now = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(now));
}
