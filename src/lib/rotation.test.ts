import { describe, expect, it } from 'vitest';
import { addDays, dayLabel, dayMonthLabel, deciderFor } from './rotation';
import type { MemberRow } from './supabase';
import { EVERY_DAY, WEEKDAYS } from './calendar';

const rot = (start: string, days = EVERY_DAY, holidays = false, offset = 0) => ({ start, offset, cal: { days, holidays } });

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
    expect(days.map((d) => deciderFor(members, rot('2026-10-30'), d)?.id)).toEqual(['gabriel', 'alex', 'sam', 'gabriel']);
  });

  it('wraps correctly for dates before the rotation start', () => {
    expect(deciderFor(members, rot('2026-10-30'), '2026-10-29')?.id).toBe('sam');
  });

  it('breaks sort_order ties by join time', () => {
    const tied = [member('later', 0, '2026-01-02T00:00:00Z'), member('first', 0, '2026-01-01T00:00:00Z')];
    expect(deciderFor(tied, rot('2026-10-30'), '2026-10-30')?.id).toBe('first');
  });

  it('skips people who are out today', () => {
    expect(deciderFor(members, rot('2026-10-30'), '2026-10-30', 'lunch', new Set(['gabriel']))?.id).toBe('alex');
    expect(deciderFor(members, rot('2026-10-30'), '2026-11-01', 'lunch', new Set(['sam']))?.id).toBe('gabriel');
    // Everyone out: the rotation stands.
    expect(deciderFor(members, rot('2026-10-30'), '2026-10-30', 'lunch', new Set(['gabriel', 'alex', 'sam']))?.id).toBe('gabriel');
  });

  it('returns null for an empty room', () => {
    expect(deciderFor([], rot('2026-10-30'), '2026-10-30')).toBeNull();
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

describe('dinner rotation', () => {
  it('gives dinner to the next person, so nobody decides both', () => {
    const ms = [member('a', 0), member('b', 1), member('c', 2)];
    expect(deciderFor(ms, rot('2026-10-01'), '2026-10-01')?.id).toBe('a');
    expect(deciderFor(ms, rot('2026-10-01'), '2026-10-01', 'dinner')?.id).toBe('b');
    expect(deciderFor(ms, rot('2026-10-01'), '2026-10-03', 'dinner')?.id).toBe('a');
  });
});

describe('eating days', () => {
  const members = [member('gabriel', 0), member('alex', 1), member('sam', 2)];

  it('skips weekends: Friday then Monday, no turn used on Saturday or Sunday', () => {
    // Fri 30 Oct 2026, then Mon 2 Nov
    const r = rot('2026-10-30', WEEKDAYS);
    expect(['2026-10-30', '2026-11-02', '2026-11-03'].map((d) => deciderFor(members, r, d)?.id)).toEqual(['gabriel', 'alex', 'sam']);
    // A weekend day shows whoever's up next
    expect(deciderFor(members, r, '2026-10-31')?.id).toBe('alex');
  });

  it('skips public holidays when the room does', () => {
    // Mon 9 Nov 2026 is Deepavali (in lieu): Fri 6 → Tue 10
    const withHolidays = rot('2026-11-06', WEEKDAYS, true);
    expect(deciderFor(members, withHolidays, '2026-11-10')?.id).toBe('alex');
    const without = rot('2026-11-06', WEEKDAYS, false);
    expect(deciderFor(members, without, '2026-11-10')?.id).toBe('sam');
  });
});

