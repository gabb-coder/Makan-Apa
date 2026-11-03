import { describe, expect, it } from 'vitest';
import { badgesFor } from './badges';
import type { DayEntryRow } from './supabase';

const day = (date: string, food: string, decider = 'me') =>
  ({ id: date, room_id: 'r', entry_date: date, meal: 'lunch', decider_id: decider, status: 'accepted', custom_food: food, food_option_id: null, method: 'direct', created_at: '' }) as DayEntryRow;

describe('badges', () => {
  it('earns a streak and counts progress towards the rest', () => {
    const foods = ['Laksa', 'Sushi', 'Pizza', 'Nasi Lemak', 'Ramen', 'Laksa'];
    const entries = foods.map((f, i) => day(`2026-11-0${i + 1}`, f));
    const badges = badgesFor({ meId: 'me', entries, vetoes: [], bills: [], settlements: [] });
    const byId = Object.fromEntries(badges.map((x) => [x.id, x]));
    expect(byId.streak5.earned).toBe(true);
    expect(byId.streak10.value).toBe(5);
    expect(byId.tried10.value).toBe(5);
    expect(byId.decided10.value).toBe(6);
    expect(badges[0].earned).toBe(true);
  });

  it('only gives Settles up when you owe nothing', () => {
    const bills = [{ day_entry_id: 'x', room_id: 'r', paid_by: 'wei', amount_cents: 2000, split_between: ['wei', 'me'], updated_at: '' }];
    const half = [{ id: 's', room_id: 'r', from_member: 'me', to_member: 'wei', amount_cents: 500, created_at: '' }];
    const all = [{ ...half[0], amount_cents: 1000 }];
    const settled = (s: typeof half) => badgesFor({ meId: 'me', entries: [], vetoes: [], bills, settlements: s }).find((x) => x.id === 'settled')!.earned;
    expect(settled(half)).toBe(false);
    expect(settled(all)).toBe(true);
  });
});
