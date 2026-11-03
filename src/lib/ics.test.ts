import { describe, expect, it } from 'vitest';
import { meetupIcs } from './ics';

describe('meetupIcs', () => {
  it('writes a one-hour event with a 10-minute reminder', () => {
    const ics = meetupIcs({ uid: 'abc', title: 'Lunch: Mamak, with Lunch gang', start: '2026-11-04T04:30:00Z', place: 'Lobby; level 1', now: '2026-11-04T01:00:00Z' });
    expect(ics).toContain('DTSTART:20261104T043000Z');
    expect(ics).toContain('DTEND:20261104T053000Z');
    expect(ics).toContain('SUMMARY:Lunch: Mamak\\, with Lunch gang');
    expect(ics).toContain('LOCATION:Lobby\\; level 1');
    expect(ics).toContain('TRIGGER:-PT10M');
    expect(ics.split('\r\n')[0]).toBe('BEGIN:VCALENDAR');
  });
});
