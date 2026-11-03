import { describe, expect, it } from 'vitest';
import { clockTime, tally, zonedTime } from './vote';

const v = (member_id: string, choice: number) => ({ day_entry_id: 'e', member_id, choice, created_at: '' });

describe('quick vote', () => {
  it('counts votes from people who are in, and is over when they have all voted', () => {
    const r = tally(['Laksa', 'Sushi'], [v('a', 1), v('b', 1), v('out', 0)], ['a', 'b', 'c'], null);
    expect(r.counts).toEqual([0, 2]);
    expect(r.winner).toBe(1);
    expect(r.over).toBe(false);
    expect(tally(['Laksa', 'Sushi'], [v('a', 1), v('b', 0), v('c', 0)], ['a', 'b', 'c'], null).winner).toBe(0);
  });

  it('breaks ties with the first option, and ends when time is up', () => {
    const r = tally(['Laksa', 'Sushi', 'Pizza'], [v('a', 2), v('b', 1)], ['a', 'b', 'c'], '2026-11-03T04:00:00Z', Date.parse('2026-11-03T04:00:01Z'));
    expect(r.winner).toBe(1);
    expect(r.over).toBe(true);
    expect(r.timeUp).toBe(true);
  });
});

describe('meet-up times', () => {
  it('turns a local time in the room into a moment, and back', () => {
    const iso = zonedTime('2026-11-03', '12:30', 'Asia/Kuala_Lumpur');
    expect(iso).toBe('2026-11-03T04:30:00.000Z');
    expect(clockTime(iso, 'Asia/Kuala_Lumpur')).toBe('12:30');
  });
});
