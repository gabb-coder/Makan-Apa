import { describe, expect, it } from 'vitest';
import { summarize } from './roomSummaries';
import type { DayEntryRow, MemberRow, RoomRow } from './supabase';

const room = (id: string, extra: Partial<RoomRow> = {}) =>
  ({ id, code: id.toUpperCase().padEnd(6, 'X'), name: id, timezone: 'Asia/Kuala_Lumpur', rotation_start: '2026-11-02', decision_mode: 'decider', meals: 'lunch', veto_limit: 1, ...extra }) as RoomRow;
const member = (id: string, roomId: string, sort_order: number) =>
  ({ id, room_id: roomId, name: id, color: '#000', sort_order, created_at: '2026-01-01T00:00:00Z', diet: [], budget: null }) as MemberRow;
const known = (roomId: string, memberId: string) => ({ roomId, memberId, code: roomId, name: memberId });
const empty = { foods: [], bills: [], settlements: [], picks: [], attendance: [], runs: [] };
const today = () => '2026-11-02';

describe('room summaries', () => {
  const rooms = [room('lunch'), room('family')];
  const members = [member('wei', 'lunch', 0), member('alex', 'lunch', 1), member('wei2', 'family', 1), member('mum', 'family', 0)];

  it('says whose turn it is, and flags rooms that need you', () => {
    const s = summarize([known('lunch', 'wei'), known('family', 'wei2')], { ...empty, rooms, members, entries: [] }, today);
    expect(s[0].status).toEqual({ kind: 'your-turn' });
    expect(s[0].needsYou).toBe(true);
    expect(s[1].status).toEqual({ kind: 'choosing', decider: 'mum' });
    expect(s[1].needsYou).toBe(false);
  });

  it('shows a pick to answer, a decided meal, and what you owe', () => {
    const entries = [
      { id: 'e1', room_id: 'lunch', entry_date: '2026-11-02', meal: 'lunch', decider_id: 'alex', status: 'proposed', custom_food: 'Laksa', food_option_id: null },
      { id: 'e2', room_id: 'family', entry_date: '2026-11-02', meal: 'lunch', decider_id: 'mum', status: 'accepted', custom_food: 'Dim sum', food_option_id: null },
    ] as DayEntryRow[];
    const bills = [{ day_entry_id: 'e2', room_id: 'family', paid_by: 'mum', amount_cents: 4000, split_between: ['mum', 'wei2'], updated_at: '' }];
    const s = summarize([known('lunch', 'wei'), known('family', 'wei2')], { ...empty, rooms, members, entries, bills }, today);
    expect(s[0].status).toEqual({ kind: 'answer', decider: 'alex', food: 'Laksa' });
    expect(s[1].status).toEqual({ kind: 'decided', food: 'Dim sum' });
    expect(s[1].balance).toBe(-2000);
    expect(s[1].needsYou).toBe(true);
  });

  it('passes the turn on when the decider is out', () => {
    const attendance = [{ room_id: 'lunch', entry_date: '2026-11-02', meal: 'lunch', member_id: 'wei', status: 'out' }];
    const s = summarize([known('lunch', 'alex')], { ...empty, rooms, members, entries: [], attendance }, today);
    expect(s[0].status).toEqual({ kind: 'your-turn' });
  });

  it('covers both meals in rooms that decide dinner too, and lists who owes whom', () => {
    const both = [room('lunch', { meals: 'both' }), room('family')];
    const entries = [{ id: 'd1', room_id: 'lunch', entry_date: '2026-11-02', meal: 'dinner', decider_id: 'alex', status: 'accepted', custom_food: 'Ramen', food_option_id: null }] as DayEntryRow[];
    const bills = [{ day_entry_id: 'd1', room_id: 'lunch', paid_by: 'alex', amount_cents: 3000, split_between: ['alex', 'wei'], updated_at: '' }];
    const s = summarize([known('lunch', 'wei')], { ...empty, rooms: both, members, entries, bills }, today);
    expect(s[0].meals.map((m) => m.meal)).toEqual(['lunch', 'dinner']);
    expect(s[0].meals[1].status).toEqual({ kind: 'decided', food: 'Ramen' });
    expect(s[0].debts).toEqual([{ from_member: 'wei', to_member: 'alex', amount_cents: 1500 }]);
  });
});
