import { describe, expect, it } from 'vitest';
import type { DayEntryRow } from './supabase';
import { summarizeMonth } from './yourMonth';

const e = (id: string, room: string, date: string, food: string) =>
  ({ id, room_id: room, entry_date: date, meal: 'lunch', status: 'accepted', custom_food: food, food_option_id: null, decider_id: 'x', method: 'direct', created_at: '' }) as DayEntryRow;

describe('your month', () => {
  it('counts meals you were in for across rooms, the favourite and your share of bills', () => {
    const entries = [e('1', 'a', '2026-11-02', 'Laksa'), e('2', 'b', '2026-11-02', 'Laksa'), e('3', 'a', '2026-11-03', 'Sushi'), e('4', 'a', '2026-10-30', 'Pizza')];
    const away = [{ room_id: 'a', entry_date: '2026-11-03', meal: 'lunch', member_id: 'meA' }];
    const bills = [{ day_entry_id: '1', room_id: 'a', paid_by: 'wei', amount_cents: 3000, split_between: ['wei', 'meA'], updated_at: '' }];
    const s = summarizeMonth('2026-11', entries, away, bills, new Map(), new Map([['a', 'meA'], ['b', 'meB']]));
    expect(s.meals).toBe(2);
    expect(s.top).toEqual({ name: 'Laksa', count: 2 });
    expect(s.foods).toBe(1);
    expect(s.spent).toBe(1500);
    expect(s.rooms).toBe(2);
  });
});
