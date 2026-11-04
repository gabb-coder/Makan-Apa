import { describe, expect, it } from 'vitest';
import { queuesNow } from './queues';
import { decodeFoods, encodeFoods } from './foodShare';
import { usualsAt } from './usual';
import { maskMystery, mysteryHidden } from './mystery';
import type { DayEntryRow, MealBillRow } from './supabase';
import type { Food } from './foods';

const entry = (id: string, date: string, extra: Partial<DayEntryRow> = {}): DayEntryRow => ({
  id, room_id: 'r', entry_date: date, decider_id: 'wei', food_option_id: null, custom_food: 'Chicken Rice', method: 'direct', status: 'accepted', meal: 'lunch', created_at: '', ...extra,
});

describe('queue reports', () => {
  it('shows the newest fresh report per place, and how many', () => {
    const now = Date.parse('2026-11-04T04:30:00Z');
    const at = (min: number) => new Date(now - min * 60_000).toISOString();
    const q = queuesNow(
      [
        { id: '1', spot_id: 'a', level: 'long', created_at: at(20) },
        { id: '2', spot_id: 'a', level: 'short', created_at: at(4) },
        { id: '3', spot_id: 'b', level: 'none', created_at: at(45) },
      ],
      now,
    );
    expect(q.get('a')).toEqual({ level: 'short', minutesAgo: 4, reports: 2 });
    expect(q.has('b')).toBe(false); // too old
  });
});

describe('sharing a food list', () => {
  it('round-trips through a link, cleaning anything odd', () => {
    const foods = [
      { name: 'Nasi Lemak', tags: ['rice', 'malay'], icon: 'rice' as const, color: 'leaf' as const, diet: ['halal'], price: 1 },
      { name: '拉面 Ramen', tags: ['noodles'], icon: 'bowl' as const, color: 'mustard' as const },
    ];
    const back = decodeFoods(encodeFoods(foods))!;
    expect(back.map((f) => f.name)).toEqual(['Nasi Lemak', '拉面 Ramen']);
    expect(back[0]).toMatchObject({ tags: ['rice', 'malay'], diet: ['halal'], price: 1 });
    expect(decodeFoods('not-a-list')).toBeNull();
    expect(decodeFoods(btoa(JSON.stringify([{ n: 'X', i: 'bomb', c: 'neon', p: 99 }])))![0]).toMatchObject({ icon: 'rice', color: 'leaf', price: null });
  });
});

describe('usuals', () => {
  it('finds each person’s own line on the latest bill at the same place or food', () => {
    const entries = [entry('old', '2026-10-28', { meet_place: 'Lai Kong' }), entry('newer', '2026-11-02'), entry('today', '2026-11-04')];
    const bill = (id: string, items: { name: string; cents: number; people: string[] }[]): MealBillRow => ({ day_entry_id: id, room_id: 'r', paid_by: 'wei', amount_cents: 0, split_between: [], items, updated_at: '' });
    const bills = [
      bill('old', [{ name: 'Roast chicken rice', cents: 1100, people: ['wei'] }, { name: 'Wantan', cents: 600, people: ['alex'] }]),
      bill('newer', [{ name: 'Steamed chicken rice', cents: 1000, people: ['wei'] }, { name: 'Shared veg', cents: 800, people: ['wei', 'alex'] }]),
    ];
    const u = usualsAt(['Lai Kong', 'Chicken Rice'], entries, bills, new Map<string, Food>(), 'today');
    expect(u.get('wei')).toEqual({ name: 'Steamed chicken rice', cents: 1000 });
    expect(u.get('alex')).toEqual({ name: 'Wantan', cents: 600 });
  });
});

describe('mystery meals', () => {
  const e = entry('m', '2026-11-04', { mystery: true, meet_at: '2026-11-04T04:30:00Z' });
  it('hides the food from everyone but the decider until the meet-up', () => {
    const before = Date.parse('2026-11-04T04:00:00Z');
    expect(mysteryHidden(e, 'alex', '2026-11-04', before)).toBe(true);
    expect(mysteryHidden(e, 'wei', '2026-11-04', before)).toBe(false);
    expect(mysteryHidden(e, 'alex', '2026-11-04', Date.parse('2026-11-04T04:31:00Z'))).toBe(false);
    expect(mysteryHidden({ ...e, mystery_revealed: true }, 'alex', '2026-11-04', before)).toBe(false);
    expect(mysteryHidden(e, 'alex', '2026-11-05', before)).toBe(false); // the next day
    expect(maskMystery(e, 'alex', '2026-11-04', before)).toMatchObject({ food_option_id: null, mystery_hidden: true });
  });
});
