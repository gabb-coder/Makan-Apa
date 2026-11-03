import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: {} }));

const { exportFileName, historySheet } = await import('./exportHistory');
import type { Food } from './foods';
import type { DayEntryRow, MealBillRow, MealRatingRow, MemberRow, RoomRow, SecretPickRow, VetoRow } from './supabase';

const room = { id: 'r', code: 'K7M2QX', name: 'Sunway lunch gang' } as RoomRow;
const members = [
  { id: 'wei', name: 'Wei' },
  { id: 'alex', name: 'Alex' },
] as MemberRow[];
const food = (id: string, name: string, tags: string[] = []): Food => ({ id, name, tags, icon: 'rice', color: 'leaf', isActive: true, daysSinceEaten: null, diet: [], price: null });
const foodsById = new Map([
  ['f1', food('f1', 'Nasi Lemak', ['rice', 'malay'])],
  ['f2', food('f2', 'Gold Chilli')],
]);
const entry = (id: string, date: string, extra: Partial<DayEntryRow>): DayEntryRow =>
  ({ id, room_id: 'r', entry_date: date, decider_id: 'wei', food_option_id: null, custom_food: null, method: 'direct', status: 'accepted', meal: 'lunch', created_at: date, ...extra }) as DayEntryRow;

describe('historySheet', () => {
  const entries = [
    entry('e3', '2026-10-30', { decider_id: 'alex', custom_food: 'Mamak', method: 'wheel' }),
    entry('e1', '2026-10-28', { food_option_id: 'f1' }),
    entry('e2', '2026-10-29', { food_option_id: 'f2', decider_id: null }),
    entry('e4', '2026-10-31', { status: 'pending', food_option_id: 'f1' }),
    entry('e5', '2026-11-01', { food_option_id: 'f1', method: 'wheel' }),
  ];
  const vetoes = [{ id: 'v', day_entry_id: 'e1', member_id: 'alex', rejected_food: 'Pizza', created_at: 'x' }] as VetoRow[];
  const picks = [
    { id: 'p1', day_entry_id: 'e5', member_id: 'alex', food_text: 'nasi lemak', created_at: 'x' },
    { id: 'p2', day_entry_id: 'e5', member_id: 'wei', food_text: 'Pizza', created_at: 'x' },
  ] as SecretPickRow[];
  const ratings = [
    { day_entry_id: 'e3', member_id: 'wei', rating: 1, created_at: 'x' },
    { day_entry_id: 'e3', member_id: 'alex', rating: -1, created_at: 'x' },
  ] as MealRatingRow[];
  const bills = [{ day_entry_id: 'e3', room_id: 'r', paid_by: 'alex', amount_cents: 4250, split_between: ['wei', 'alex'], updated_at: 'x' }] as MealBillRow[];
  const sheet = historySheet({ room, entries, vetoes, picks, ratings, bills, members, foodsById });

  it('lists agreed days oldest first', () => {
    expect(sheet.rows.map((r) => r[0])).toEqual([{ date: '2026-10-28' }, { date: '2026-10-29' }, { date: '2026-10-30' }, { date: '2026-11-01' }]);
    expect(sheet.name).toBe('Sunway lunch gang');
  });

  it('says who chose, how, and what was vetoed', () => {
    expect(sheet.rows[0]).toEqual([{ date: '2026-10-28' }, 'Wed', 'Lunch', 'Nasi Lemak', '', 'Wei', 'Picked from the list', '', 'Pizza (Alex)', 'Rice, Malay', null, null, null, null, null]);
    expect(sheet.rows[1].slice(3, 7)).toEqual(['Gold Chilli', 'SS15 Subang Jaya', 'Removed member', 'Picked from the list']);
    expect(sheet.rows[2].slice(3, 7)).toEqual(['Mamak', '', 'Alex', 'Spun the wheel']);
  });

  it('includes ratings and who paid', () => {
    expect(sheet.rows[2].slice(10)).toEqual([1, 1, 'Alex', 42.5, 'Wei, Alex']);
  });

  it('credits whoever suggested the winning secret pick', () => {
    expect(sheet.rows[3].slice(5, 8)).toEqual(['Everyone', 'Secret picks, then the wheel', 'Alex']);
  });
});

describe('exportFileName', () => {
  it('uses the room name, or the code', () => {
    expect(exportFileName(room, '2026-10-31', 'xlsx')).toBe('makan-apa-sunway-lunch-gang-history-2026-10-31.xlsx');
    expect(exportFileName({ name: null, code: 'K7M2QX' }, '2026-10-31', 'csv')).toBe('makan-apa-k7m2qx-history-2026-10-31.csv');
  });
});

describe('moneySheet', () => {
  it('lists bills, payments and kitty top-ups with each person’s share', async () => {
    const { moneySheet } = await import('./exportHistory');
    const m = (id: string, name: string) => ({ id, name, room_id: 'r', color: '#000', sort_order: 0, diet: [], budget: null, created_at: '2026-10-01T00:00:00Z' });
    const sheet = moneySheet({
      room: { id: 'r', code: 'ABC123', name: 'Lunch gang', timezone: 'Asia/Kuala_Lumpur', rotation_start: '2026-10-01', veto_limit: 1, decision_mode: 'decider', meals: 'lunch', created_at: '' },
      members: [m('a', 'Wei'), m('b', 'Ali')],
      entries: [{ id: 'e1', room_id: 'r', entry_date: '2026-11-02', decider_id: 'a', food_option_id: null, custom_food: 'Mamak', method: 'direct', status: 'accepted', meal: 'lunch', created_at: '' }],
      bills: [{ day_entry_id: 'e1', room_id: 'r', paid_by: 'a', amount_cents: 3000, split_between: ['a', 'b'], from_kitty: true, updated_at: '2026-11-02T05:00:00Z' }],
      settlements: [{ id: 's1', room_id: 'r', from_member: 'b', to_member: 'a', amount_cents: 500, created_at: '2026-11-03T05:00:00Z' }],
      topUps: [{ id: 'k1', room_id: 'r', member_id: 'b', amount_cents: 5000, created_by: 'b', created_at: '2026-11-01T05:00:00Z' }],
      foodsById: new Map(),
    });
    expect(sheet.columns.map((c) => c.header)).toEqual(['Date', 'Type', 'Meal', 'Paid by / from', 'To', 'Amount (RM)', "Wei's share (RM)", "Ali's share (RM)"]);
    expect(sheet.rows.map((r) => r[1])).toEqual(['Kitty top-up', 'Bill (from the kitty)', 'Payment']);
    expect(sheet.rows[1]).toEqual([{ date: '2026-11-02' }, 'Bill (from the kitty)', 'Mamak', 'Kitty', '', 30, 15, 15]);
  });
});
