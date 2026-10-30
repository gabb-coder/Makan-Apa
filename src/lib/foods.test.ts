import { describe, expect, it } from 'vitest';
import {
  customFood,
  entryFood,
  filterByTags,
  isRecent,
  joinNames,
  lastEatenLabel,
  popularTags,
  weightedPick,
  wheelWeight,
  type Food,
} from './foods';
import type { DayEntryRow } from './supabase';

const food = (name: string, tags: string[] = [], daysSinceEaten: number | null = null): Food => ({
  id: name.toLowerCase(),
  name,
  tags,
  icon: 'rice',
  color: 'leaf',
  isActive: true,
  daysSinceEaten,
});

describe('wheelWeight (recently-eaten penalty)', () => {
  it('follows the spec: never eaten is 1, otherwise days/7 clamped to [0.1, 1]', () => {
    expect(wheelWeight(food('A', [], null))).toBe(1);
    expect(wheelWeight(food('A', [], 0))).toBe(0.1);
    expect(wheelWeight(food('A', [], 3))).toBeCloseTo(3 / 7);
    expect(wheelWeight(food('A', [], 7))).toBe(1);
    expect(wheelWeight(food('A', [], 30))).toBe(1);
  });
});

describe('weightedPick', () => {
  it('picks by cumulative weight', () => {
    const items = [1, 3]; // 25% / 75%
    expect(weightedPick(items, (x) => x, () => 0.2)).toBe(0);
    expect(weightedPick(items, (x) => x, () => 0.3)).toBe(1);
    expect(weightedPick(items, (x) => x, () => 0.999)).toBe(1);
  });

  it('roughly matches the weights over many draws', () => {
    let seed = 42;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const counts = [0, 0];
    for (let i = 0; i < 10_000; i++) counts[weightedPick([1, 9], (x) => x, rand)]++;
    expect(counts[0] / 10_000).toBeGreaterThan(0.08);
    expect(counts[0] / 10_000).toBeLessThan(0.12);
  });
});

describe('labels and filters', () => {
  it('describes when a food was last eaten', () => {
    expect([null, 0, 1, 3, 7, 20, 90].map(lastEatenLabel)).toEqual([
      'Not yet',
      'Today',
      'Yesterday',
      '3 days ago',
      '1 week ago',
      '2 weeks ago',
      '3 months ago',
    ]);
  });

  it('marks foods from the last 3 days as recent', () => {
    expect(isRecent(food('A', [], 3))).toBe(true);
    expect(isRecent(food('A', [], 4))).toBe(false);
    expect(isRecent(food('A', [], null))).toBe(false);
  });

  it('joins names the way people say them', () => {
    expect(joinNames([])).toBe('');
    expect(joinNames(['A'])).toBe('A');
    expect(joinNames(['A', 'B'])).toBe('A and B');
    expect(joinNames(['A', 'B', 'C'], 'or')).toBe('A, B or C');
  });

  it('filters by tags with AND by default and OR when asked', () => {
    const foods = [food('Nasi', ['rice', 'cheap']), food('Ramen', ['noodles']), food('Chicken', ['rice'])];
    expect(filterByTags(foods, ['rice', 'cheap'], 'and').map((f) => f.name)).toEqual(['Nasi']);
    expect(filterByTags(foods, ['cheap', 'noodles'], 'or').map((f) => f.name)).toEqual(['Nasi', 'Ramen']);
    expect(filterByTags(foods, [], 'and')).toHaveLength(3);
  });

  it('ranks tags by how often they are used', () => {
    expect(popularTags([food('A', ['rice', 'cheap']), food('B', ['rice']), food('C', ['noodles'])])).toEqual(['rice', 'cheap', 'noodles']);
  });
});

describe('entryFood', () => {
  const entry = (patch: Partial<DayEntryRow>): DayEntryRow => ({
    id: 'e',
    room_id: 'r',
    entry_date: '2026-10-30',
    decider_id: 'm',
    food_option_id: null,
    custom_food: null,
    method: 'direct',
    status: 'accepted',
    created_at: '',
    ...patch,
  });
  const pool = new Map([['nasi', food('Nasi')]]);

  it('resolves pool foods, typed foods and deleted foods', () => {
    expect(entryFood(entry({ food_option_id: 'nasi' }), pool)?.name).toBe('Nasi');
    expect(entryFood(entry({ custom_food: 'nasi' }), pool)?.name).toBe('Nasi');
    expect(entryFood(entry({ custom_food: 'Laksa' }), pool)?.name).toBe('Laksa');
    expect(entryFood(entry({ food_option_id: 'gone' }), pool)?.name).toBe('A deleted food');
    expect(entryFood(entry({}), pool)).toBeNull();
  });

  it('gives typed foods a stable colour', () => {
    expect(customFood('Laksa').color).toBe(customFood('laksa').color);
  });
});
