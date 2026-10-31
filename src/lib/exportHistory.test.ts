import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: {} }));

const { exportFileName, historySheet } = await import('./exportHistory');
import type { Food } from './foods';
import type { DayEntryRow, MemberRow, RoomRow, SecretPickRow, VetoRow } from './supabase';

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
  const sheet = historySheet({ room, entries, vetoes, picks, members, foodsById });

  it('lists agreed days oldest first', () => {
    expect(sheet.rows.map((r) => r[0])).toEqual([{ date: '2026-10-28' }, { date: '2026-10-29' }, { date: '2026-10-30' }, { date: '2026-11-01' }]);
    expect(sheet.name).toBe('Sunway lunch gang');
  });

  it('says who chose, how, and what was vetoed', () => {
    expect(sheet.rows[0]).toEqual([{ date: '2026-10-28' }, 'Wed', 'Nasi Lemak', '', 'Wei', 'Picked from the list', '', 'Pizza (Alex)', 'Rice, Malay']);
    expect(sheet.rows[1].slice(2, 6)).toEqual(['Gold Chilli', 'SS15 Subang Jaya', 'Removed member', 'Picked from the list']);
    expect(sheet.rows[2].slice(2, 6)).toEqual(['Mamak', '', 'Alex', 'Spun the wheel']);
  });

  it('credits whoever suggested the winning secret pick', () => {
    expect(sheet.rows[3].slice(4, 7)).toEqual(['Everyone', 'Secret picks, then the wheel', 'Alex']);
  });
});

describe('exportFileName', () => {
  it('uses the room name, or the code', () => {
    expect(exportFileName(room, '2026-10-31', 'xlsx')).toBe('makan-apa-sunway-lunch-gang-history-2026-10-31.xlsx');
    expect(exportFileName({ name: null, code: 'K7M2QX' }, '2026-10-31', 'csv')).toBe('makan-apa-k7m2qx-history-2026-10-31.csv');
  });
});
