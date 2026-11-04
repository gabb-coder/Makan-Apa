import { describe, expect, it } from 'vitest';
import { challengesFor, weekStart, weeksAllDone } from './challenges';
import type { DayEntryRow } from './supabase';

const e = (date: string, food: string, meal: 'lunch' | 'dinner' = 'lunch'): DayEntryRow => ({
  id: `${date}-${meal}`, room_id: 'r', entry_date: date, decider_id: 'a', food_option_id: null, custom_food: food, method: 'direct', status: 'accepted', meal, created_at: '',
});

describe('weekly challenges', () => {
  it('weeks start on Monday', () => {
    expect(weekStart('2026-11-04')).toBe('2026-11-02'); // Wednesday
    expect(weekStart('2026-11-08')).toBe('2026-11-02'); // Sunday
    expect(weekStart('2026-11-09')).toBe('2026-11-09');
  });
  it('tracks new foods, repeats and meals decided', () => {
    const entries = [e('2026-10-20', 'Mamak'), e('2026-11-02', 'Mamak'), e('2026-11-03', 'Thai'), e('2026-11-04', 'Sushi')];
    const [fresh, norepeat, decided] = challengesFor(entries, '2026-11-04');
    expect(fresh).toMatchObject({ progress: 2, done: true });
    expect(norepeat).toMatchObject({ progress: 3, done: false, failed: false });
    expect(decided).toMatchObject({ progress: 3, done: false });
    const withRepeat = challengesFor([...entries, e('2026-11-04', 'Thai', 'dinner')], '2026-11-04');
    expect(withRepeat[1]).toMatchObject({ failed: true, done: false });
  });
  it('counts past weeks where everything was done', () => {
    const week = ['Mamak', 'Thai', 'Sushi', 'Ramen', 'Pizza'].map((f, i) => e(`2026-10-2${6 + Math.floor(i / 2)}`, f, i % 2 ? 'dinner' : 'lunch'));
    expect(weeksAllDone(week, '2026-11-04')).toBe(1);
  });
});
