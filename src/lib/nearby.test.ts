import { describe, expect, it } from 'vitest';
import { STARTER_PACK } from './foods';
import { ICONS, COLOR_KEYS } from './palette';
import { distanceKm, formatDistance, mapsNearUrl } from './geo';
import { clockIn, dayHoursLabel, openLabel, openState, timeLabel } from './hours';
import { AREA_CENTRES, SUNWAY_SPOTS, byDistance, isNearSunway, spotDetails, spotOpenNow, priceLabel, spotMapsUrl, spotsFor, spotsOfTheDay } from './nearby';

describe('Sunway spots data', () => {
  it('has unique ids and only icons and colours the food list accepts', () => {
    expect(new Set(SUNWAY_SPOTS.map((s) => s.id)).size).toBe(SUNWAY_SPOTS.length);
    for (const s of SUNWAY_SPOTS) {
      expect(ICONS).toContain(s.icon);
      expect(COLOR_KEYS).toContain(s.color);
      expect(s.tags.every((t) => t === t.toLowerCase())).toBe(true);
    }
  });
});

describe('spotsFor', () => {
  const names = (food: { name: string; tags: string[] }) => spotsFor(food).map((s) => s.name);

  it('suggests places for every starter food', () => {
    for (const f of STARTER_PACK) expect(spotsFor(f).length).toBeGreaterThan(0);
  });

  it('prefers the longest dish-name match', () => {
    expect(names({ name: 'Chicken Rice', tags: [] })[0]).toBe('Garlic Roasted Chicken Rice');
    expect(names({ name: 'Nasi Lemak', tags: ['rice'] })).toContain('Lai Kong');
  });

  it('puts a spot picked by name first', () => {
    expect(names({ name: 'Q Bistro', tags: [] })[0]).toBe('Q Bistro');
  });

  it('returns nothing for an unknown dish with no tags', () => {
    expect(spotsFor({ name: 'Zzz', tags: [] })).toEqual([]);
  });
});

describe('spot helpers', () => {
  it('builds Maps searches without mixing areas', () => {
    const q = (id: string) => decodeURIComponent(spotMapsUrl(SUNWAY_SPOTS.find((s) => s.id === id)!).split('query=')[1]);
    expect(q('campus-cafeterias')).toBe('The Galley & Fresco Sunway University');
    expect(q('q-bistro')).toBe('Q Bistro SS15 Subang Jaya');
  });

  it('labels prices in ringgit', () => {
    expect([1, 2, 3].map((p) => priceLabel(p as 1 | 2 | 3))).toEqual(['Under RM15', 'RM15–50', 'RM50+']);
  });

  it('shuffles the same way all day and differently the next day', () => {
    const ids = (d: string) => spotsOfTheDay(d).map((s) => s.id).join();
    expect(ids('2026-10-30')).toBe(ids('2026-10-30'));
    expect(ids('2026-10-30')).not.toBe(ids('2026-10-31'));
    expect(spotsOfTheDay('2026-10-30')).toHaveLength(SUNWAY_SPOTS.length);
  });
});

describe('distances', () => {
  const campus = { lat: 3.0672, lng: 101.6036 };

  it('measures straight-line km', () => {
    // Sunway University to SS15 LRT is roughly 1.9 km.
    expect(distanceKm(campus, { lat: 3.0758, lng: 101.5861 })).toBeGreaterThan(1.7);
    expect(distanceKm(campus, { lat: 3.0758, lng: 101.5861 })).toBeLessThan(2.2);
    expect(distanceKm(campus, campus)).toBe(0);
  });

  it('formats short and long distances', () => {
    expect(formatDistance(0.02)).toBe('100 m');
    expect(formatDistance(0.44)).toBe('400 m');
    expect(formatDistance(1.26)).toBe('1.3 km');
    expect(formatDistance(23.4)).toBe('23 km');
  });

  it('gives every spot area a centre', () => {
    for (const s of SUNWAY_SPOTS) expect(AREA_CENTRES[s.area]).toBeDefined();
  });

  it('sorts spots nearest first', () => {
    const inSS15 = { lat: 3.0768, lng: 101.5875 };
    const sorted = byDistance(SUNWAY_SPOTS, inSS15);
    expect(sorted[0].area).toBe('SS15 Subang Jaya');
    expect(sorted.at(-1)!.area).not.toBe('SS15 Subang Jaya');
    expect(sorted).toHaveLength(SUNWAY_SPOTS.length);
  });

  it('knows when you are away from Sunway', () => {
    expect(isNearSunway(campus)).toBe(true);
    expect(isNearSunway({ lat: 3.1579, lng: 101.7116 })).toBe(false); // KLCC
  });

  it('builds a Google Maps search around you', () => {
    expect(mapsNearUrl('nasi lemak', campus)).toBe('https://www.google.com/maps/search/nasi%20lemak/@3.06720,101.60360,15z');
  });
});

describe('opening hours', () => {
  const week = ['11:00-22:00', '', '11:00-22:00', '11:00-22:00', '11:00-22:00', '15:00-03:00', '10:00-14:00,17:00-22:00'];

  it('knows open, closed and when it opens next', () => {
    expect(openLabel(openState(week, { day: 0, minute: 12 * 60 }), { day: 0 })).toBe('Open · till 10pm');
    expect(openLabel(openState(week, { day: 0, minute: 23 * 60 }), { day: 0 })).toBe('Closed · opens Wed 11am');
    expect(openLabel(openState(week, { day: 2, minute: 9 * 60 }), { day: 2 })).toBe('Closed · opens 11am');
    expect(openLabel(openState(week, { day: 6, minute: 15 * 60 }), { day: 6 })).toBe('Closed · opens 5pm');
  });

  it('handles ranges past midnight', () => {
    // Saturday 3pm–3am: still open at 1am on Sunday.
    expect(openState(week, { day: 6, minute: 60 })).toEqual({ open: true, allDay: false, closesAt: 180 });
    expect(openLabel(openState(week, { day: 5, minute: 23 * 60 }), { day: 5 })).toBe('Open · till 3am');
  });

  it('labels 24-hour places and day summaries', () => {
    const always = Array(7).fill('00:00-24:00');
    expect(openLabel(openState(always, { day: 3, minute: 4 * 60 }), { day: 3 })).toBe('Open 24 hours');
    expect(dayHoursLabel('10:00-14:00,17:30-22:00')).toBe('10am–2pm, 5:30pm–10pm');
    expect(dayHoursLabel('')).toBe('Closed');
    expect(timeLabel(0)).toBe('midnight');
  });

  it('reads the clock in Malaysia', () => {
    // 2026-10-31 is a Saturday; 04:30 UTC is 12:30pm in Kuala Lumpur.
    expect(clockIn('Asia/Kuala_Lumpur', new Date('2026-10-31T04:30:00Z'))).toEqual({ day: 5, minute: 12 * 60 + 30 });
  });

  it('has well-formed hours and pins inside Bandar Sunway / SS15 for every listed spot', () => {
    for (const s of SUNWAY_SPOTS) {
      const d = spotDetails(s);
      if (d.hours) {
        expect(d.hours).toHaveLength(7);
        for (const day of d.hours) expect(day).toMatch(/^$|^(\d\d:\d\d-\d\d:\d\d)(,\d\d:\d\d-\d\d:\d\d)*$/);
      }
      if (d.at) {
        expect(d.at.lat).toBeGreaterThan(3.055);
        expect(d.at.lat).toBeLessThan(3.085);
        expect(d.at.lng).toBeGreaterThan(101.58);
        expect(d.at.lng).toBeLessThan(101.62);
      }
    }
    expect(spotOpenNow(SUNWAY_SPOTS.find((s) => s.id === 'q-bistro')!, new Date('2026-10-31T04:30:00Z'))?.open).toBe(true);
  });
});
