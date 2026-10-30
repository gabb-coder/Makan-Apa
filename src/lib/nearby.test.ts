import { describe, expect, it } from 'vitest';
import { STARTER_PACK } from './foods';
import { ICONS, COLOR_KEYS } from './palette';
import { distanceKm, formatDistance, mapsNearUrl } from './geo';
import { AREA_CENTRES, SUNWAY_SPOTS, byDistance, isNearSunway, priceLabel, spotMapsUrl, spotsFor, spotsOfTheDay } from './nearby';

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
