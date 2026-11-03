import type { VoteRow } from './supabase';

/**
 * Where a quick vote stands: votes per option, the leader (ties go to the option listed first,
 * which is the decider's order), and whether it's over (everyone who's in has voted, or time's up).
 */
export function tally(options: string[], votes: VoteRow[], voterIds: string[], endsAt: string | null, now = Date.now()) {
  const counts = options.map((_, i) => votes.filter((v) => v.choice === i && voterIds.includes(v.member_id)).length);
  const voted = new Set(votes.filter((v) => voterIds.includes(v.member_id)).map((v) => v.member_id));
  let winner = 0;
  counts.forEach((n, i) => {
    if (n > counts[winner]) winner = i;
  });
  const everyone = voterIds.length > 0 && voterIds.every((id) => voted.has(id));
  const timeUp = !!endsAt && now >= Date.parse(endsAt);
  return { counts, winner, voted: voted.size, over: everyone || timeUp, timeUp };
}

/** "12:30" for a time as HH:MM in the room's timezone. */
export function clockTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(new Date(iso));
}

/** How far `timeZone` is ahead of UTC at `when`, in ms. */
function offsetMs(timeZone: string, when: number): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(when));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second')) - when;
}

/** "2026-11-03" + "12:30" in Asia/Kuala_Lumpur → the moment as an ISO string. */
export function zonedTime(date: string, hhmm: string, timeZone: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, min);
  return new Date(guess - offsetMs(timeZone, guess)).toISOString();
}
