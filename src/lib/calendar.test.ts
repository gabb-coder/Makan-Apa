import { describe, expect, it } from 'vitest';
import { eatingDaysBetween, EVERY_DAY, holidayOn, isEatingDay, nextEatingDay, offsetKeeping, turnIndex, WEEKDAYS, type Rotation } from './calendar';

const weekdays = { days: WEEKDAYS, holidays: true };

describe('eating calendar', () => {
  it('knows weekends and Selangor public holidays', () => {
    expect(isEatingDay('2026-11-04', weekdays)).toBe(true); // Wednesday
    expect(isEatingDay('2026-11-07', weekdays)).toBe(false); // Saturday
    expect(holidayOn('2026-11-09', weekdays)).toBe('Deepavali (in lieu)');
    expect(isEatingDay('2026-11-09', weekdays)).toBe(false);
    expect(isEatingDay('2026-11-09', { days: WEEKDAYS, holidays: false })).toBe(true);
    expect(holidayOn('2026-11-09', { days: WEEKDAYS, holidays: false })).toBeNull();
  });

  it('counts eating days, whole weeks and holidays included', () => {
    expect(eatingDaysBetween('2026-11-02', '2026-11-09', { days: WEEKDAYS, holidays: false })).toBe(5);
    expect(eatingDaysBetween('2026-11-02', '2026-11-16', weekdays)).toBe(9); // Deepavali Monday off
    expect(eatingDaysBetween('2026-11-16', '2026-11-02', weekdays)).toBe(-9);
    expect(eatingDaysBetween('2026-11-02', '2026-11-05', { days: EVERY_DAY, holidays: false })).toBe(3);
    // Matches counting one day at a time over a long stretch
    let slow = 0;
    for (let d = new Date('2026-01-01T00:00:00Z'); d < new Date('2027-12-31T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) {
      if (isEatingDay(d.toISOString().slice(0, 10), weekdays)) slow++;
    }
    expect(eatingDaysBetween('2026-01-01', '2027-12-31', weekdays)).toBe(slow);
  });

  it('finds the next eating day', () => {
    expect(nextEatingDay('2026-11-07', weekdays)).toBe('2026-11-10'); // Sat → past Deepavali Monday
    expect(nextEatingDay('2026-11-04', weekdays)).toBe('2026-11-04');
    expect(nextEatingDay('2026-11-04', weekdays, true)).toBe('2026-11-05');
  });

  it('keeps whoever is next up when the eating days change', () => {
    const daily: Rotation = { start: '2026-10-30', offset: 0, cal: { days: EVERY_DAY, holidays: false } };
    const today = '2026-11-04';
    const before = turnIndex(daily, today);
    const offset = offsetKeeping(daily, weekdays, today);
    const after: Rotation = { ...daily, offset, cal: weekdays };
    expect(turnIndex(after, today)).toBe(before);
    // and then one turn per weekday: Thu, Fri, Mon
    expect(turnIndex(after, '2026-11-05')).toBe(before + 1);
    expect(turnIndex(after, '2026-11-10')).toBe(before + 3);
  });
});
