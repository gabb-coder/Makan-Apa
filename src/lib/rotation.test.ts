import { describe, expect, it } from 'vitest';
import { addDays, dayLabel, dayMonthLabel, deciderFor } from './rotation';
import type { MemberRow } from './supabase';

const member = (id: string, sort_order: number, created_at = '2026-01-01T00:00:00Z'): MemberRow => ({
  id,
  room_id: 'r',
  name: id,
  color: '#000',
  diet: [],
  budget: null,
  sort_order,
  created_at,
});

describe('deciderFor', () => {
  const members = [member('sam', 2), member('gabriel', 0), member('alex', 1)];

  it('starts with the first member on the rotation start date and cycles by sort order', () => {
    const days = ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'];
    expect(days.map((d) => deciderFor(members, '2026-10-30', d)?.id)).toEqual(['gabriel', 'alex', 'sam', 'gabriel']);
  });

  it('wraps correctly for dates before the rotation start', () => {
    expect(deciderFor(members, '2026-10-30', '2026-10-29')?.id).toBe('sam');
  });

  it('breaks sort_order ties by join time', () => {
    const tied = [member('later', 0, '2026-01-02T00:00:00Z'), member('first', 0, '2026-01-01T00:00:00Z')];
    expect(deciderFor(tied, '2026-10-30', '2026-10-30')?.id).toBe('first');
  });

  it('returns null for an empty room', () => {
    expect(deciderFor([], '2026-10-30', '2026-10-30')).toBeNull();
  });
});

describe('date helpers', () => {
  it('adds days across month and year ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('formats short day labels', () => {
    expect(dayLabel('2026-10-31')).toBe('Sat 31');
    expect(dayMonthLabel('2026-10-30')).toBe('Fri 30 Oct');
  });
});
