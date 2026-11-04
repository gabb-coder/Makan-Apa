import { describe, expect, it } from 'vitest';
import { nextTurn } from './PeopleSheet';
import type { MemberRow, RoomRow } from '../lib/supabase';

const member = (id: string, sort_order: number): MemberRow => ({ id, room_id: 'r', name: id, color: '#000', diet: [], budget: null, sort_order, created_at: '2026-01-01T00:00:00Z' });
const members = ['jenn', 'elvis', 'bvs', 'bigji', 'gabriel'].map((id, i) => member(id, i));
// Weekdays with Selangor holidays; turn 0 (jenn) on Wed 4 Nov 2026, so Elvis has dinner that day.
const room = { rotation_start: '2026-11-04', rotation_offset: 0, eat_days: [1, 2, 3, 4, 5], skip_holidays: true } as RoomRow;

describe('people sheet turns', () => {
  it('after 6pm, follows on from tonight’s dinner decider without skipping a day', () => {
    // Dinner: Elvis tonight, then bvs Thu 5, bigji Fri 6, gabriel Tue 10 (Mon 9 is Deepavali in lieu)
    expect(nextTurn(members[2], members, room, '2026-11-04', 'elvis', 'dinner')).toBe('Decides tomorrow');
    expect(nextTurn(members[3], members, room, '2026-11-04', 'elvis', 'dinner')).toMatch(/Fri 6/);
    expect(nextTurn(members[4], members, room, '2026-11-04', 'elvis', 'dinner')).toMatch(/Tue 10/);
  });
  it('at lunch, follows the lunch turns', () => {
    expect(nextTurn(members[1], members, room, '2026-11-04', 'jenn', 'lunch')).toBe('Decides tomorrow');
  });
});
