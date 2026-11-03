import { describe, expect, it } from 'vitest';
import { daysBetween, todayIn } from './dates';

describe('dates', () => {
  it('counts whole days between calendar dates', () => {
    expect(daysBetween('2026-10-30', '2026-10-30')).toBe(0);
    expect(daysBetween('2026-10-30', '2026-11-02')).toBe(3);
    expect(daysBetween('2026-11-02', '2026-10-30')).toBe(-3);
  });

  it("uses the room's timezone for today", () => {
    const lateUtc = new Date('2026-10-30T20:00:00Z'); // 4am on the 31st in KL
    expect(todayIn('Asia/Kuala_Lumpur', lateUtc)).toBe('2026-10-31');
    expect(todayIn('Europe/London', lateUtc)).toBe('2026-10-30');
  });
});

describe('mealNow', () => {
  it('switches to dinner at 6pm in rooms that decide both', async () => {
    const { mealNow } = await import('./dates');
    // 17:59 and 18:00 in Kuala Lumpur (UTC+8)
    expect(mealNow('both', 'Asia/Kuala_Lumpur', new Date('2026-11-04T09:59:00Z'))).toBe('lunch');
    expect(mealNow('both', 'Asia/Kuala_Lumpur', new Date('2026-11-04T10:00:00Z'))).toBe('dinner');
    expect(mealNow('lunch', 'Asia/Kuala_Lumpur', new Date('2026-11-04T12:00:00Z'))).toBe('lunch');
  });
});
