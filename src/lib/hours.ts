/**
 * Opening hours: a week of "HH:MM-HH:MM" ranges (Monday first, comma separated, '' closed),
 * checked against the time in Malaysia wherever the phone is.
 */

const DAY = 24 * 60;
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Monday = 0, and minutes since midnight, in the given time zone. */
export function clockIn(timeZone: string, now = new Date()): { day: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { day: WEEKDAYS.indexOf(get('weekday')), minute: Number(get('hour')) * 60 + Number(get('minute')) };
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** [start, end) in minutes; end is past 1440 when the range runs past midnight. */
export function ranges(day: string): [number, number][] {
  if (!day) return [];
  return day.split(',').map((r) => {
    const [a, b] = r.split('-').map(toMinutes);
    return [a, b <= a ? b + DAY : b];
  });
}

/** "10pm", "9:30am", "midnight". */
export function timeLabel(minute: number): string {
  const m = ((minute % DAY) + DAY) % DAY;
  if (m === 0) return 'midnight';
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${mm ? `:${String(mm).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`;
}

export type OpenState =
  | { open: true; allDay: boolean; closesAt: number | null }
  | { open: false; opensAt: { dayOffset: number; minute: number } | null };

export function openState(week: string[], at: { day: number; minute: number }): OpenState {
  const today = ranges(week[at.day]);
  const yesterday = ranges(week[(at.day + 6) % 7]);
  if (today.length === 1 && today[0][0] === 0 && today[0][1] === DAY && ranges(week[(at.day + 1) % 7])[0]?.[0] === 0)
    return { open: true, allDay: true, closesAt: null };
  for (const [, b] of yesterday) if (b > DAY && at.minute < b - DAY) return { open: true, allDay: false, closesAt: b - DAY };
  for (const [a, b] of today) if (at.minute >= a && at.minute < b) return { open: true, allDay: false, closesAt: b };
  for (let offset = 0; offset < 7; offset++) {
    const day = ranges(week[(at.day + offset) % 7]);
    const next = day.find(([a]) => offset > 0 || a > at.minute);
    if (next) return { open: false, opensAt: { dayOffset: offset, minute: next[0] } };
  }
  return { open: false, opensAt: null };
}

/** "Open · till 10pm", "Open 24 hours", "Closed · opens 11am", "Closed · opens Wed 1pm". */
export function openLabel(state: OpenState, at: { day: number }): string {
  if (state.open) return state.allDay ? 'Open 24 hours' : `Open · till ${timeLabel(state.closesAt ?? 0)}`;
  if (!state.opensAt) return 'Closed';
  const { dayOffset, minute } = state.opensAt;
  const when = dayOffset === 0 ? '' : dayOffset === 1 ? 'tomorrow ' : `${WEEKDAYS[(at.day + dayOffset) % 7]} `;
  return `Closed · opens ${when}${timeLabel(minute)}`;
}

/** "11am–10pm", "Closed", "Open 24 hours" for one day's ranges. */
export function dayHoursLabel(day: string): string {
  const r = ranges(day);
  if (!r.length) return 'Closed';
  if (r.length === 1 && r[0][0] === 0 && r[0][1] === DAY) return 'Open 24 hours';
  return r.map(([a, b]) => `${timeLabel(a)}–${timeLabel(b)}`).join(', ');
}
