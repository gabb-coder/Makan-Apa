import { describe, expect, it } from 'vitest';
import { SUNWAY_SPOTS } from './nearby';
import { passport } from './passport';
import type { DayEntryRow } from './supabase';

const e = (date: string, food: string, meet: string | null = null): DayEntryRow => ({
  id: date + food, room_id: 'r', entry_date: date, decider_id: 'a', food_option_id: null, custom_food: food, method: 'direct', status: 'accepted', meal: 'lunch', meet_place: meet, created_at: '',
});

describe('passport', () => {
  it('stamps places eaten at, by food name or meet-up place', () => {
    const [a, b] = SUNWAY_SPOTS;
    const stamps = passport([e('2026-11-01', a.name), e('2026-11-03', a.name.toUpperCase()), e('2026-11-02', 'Mamak', b.name), e('2026-11-04', 'Somewhere else')], new Map(), SUNWAY_SPOTS);
    expect(stamps.map((s) => [s.spot.id, s.count, s.last])).toEqual([
      [a.id, 2, '2026-11-03'],
      [b.id, 1, '2026-11-02'],
    ]);
  });
});
