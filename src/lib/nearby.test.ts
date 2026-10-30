import { describe, expect, it } from 'vitest';
import { STARTER_PACK } from './foods';
import { ICONS, COLOR_KEYS } from './palette';
import { SUNWAY_SPOTS, priceLabel, spotMapsUrl, spotsFor, spotsOfTheDay } from './nearby';

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
