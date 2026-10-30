import { describe, expect, it } from 'vitest';
import type { Food } from './foods';
import { availableMonths, bestNoRepeatStreak, monthLabel, monthStats } from './stats';
import type { DayEntryRow, MemberRow, VetoRow } from './supabase';

const meal = (date: string, key: string) => ({ key, entry: { entry_date: date } as DayEntryRow });

describe('bestNoRepeatStreak', () => {
  it.each([
    ['empty', [], 0],
    ['one meal', [meal('2026-10-01', 'a')], 1],
    ['all different', [meal('2026-10-01', 'a'), meal('2026-10-02', 'b'), meal('2026-10-03', 'c')], 3],
    ['a b a c d', [meal('2026-10-01', 'a'), meal('2026-10-02', 'b'), meal('2026-10-03', 'a'), meal('2026-10-04', 'c'), meal('2026-10-05', 'd')], 4],
    ['a gap breaks it', [meal('2026-10-01', 'a'), meal('2026-10-02', 'b'), meal('2026-10-04', 'c'), meal('2026-10-05', 'd'), meal('2026-10-06', 'e')], 3],
    ['same food twice', [meal('2026-10-01', 'a'), meal('2026-10-02', 'a')], 1],
    ['a b c b a', [meal('2026-10-01', 'a'), meal('2026-10-02', 'b'), meal('2026-10-03', 'c'), meal('2026-10-04', 'b'), meal('2026-10-05', 'a')], 3],
  ])('%s', (_, meals, want) => {
    expect(bestNoRepeatStreak(meals)).toBe(want);
  });
});

describe('monthStats', () => {
  const members: MemberRow[] = [
    { id: 'g', room_id: 'r', name: 'Gabriel', color: '#CC3F17', sort_order: 0, created_at: '1' },
    { id: 'a', room_id: 'r', name: 'Alex', color: '#2F6FD6', sort_order: 1, created_at: '2' },
  ];
  const foods = new Map<string, Food>(
    ['Nasi', 'Ramen', 'Pizza'].map((name) => [
      name.toLowerCase(),
      { id: name.toLowerCase(), name, tags: name === 'Nasi' ? ['rice', 'cheap'] : ['other'], icon: 'rice', color: 'leaf', isActive: true, daysSinceEaten: null },
    ]),
  );
  const entry = (date: string, foodId: string | null, decider: string, status: DayEntryRow['status'] = 'accepted'): DayEntryRow => ({
    id: date,
    room_id: 'r',
    entry_date: date,
    decider_id: decider,
    food_option_id: foodId,
    custom_food: null,
    method: 'direct',
    status,
    created_at: '',
  });
  const entries = [
    entry('2026-10-01', 'nasi', 'g'),
    entry('2026-10-02', 'ramen', 'a'),
    entry('2026-10-03', 'nasi', 'g'),
    entry('2026-10-04', null, 'a', 'pending'),
    entry('2026-09-30', 'pizza', 'g'),
  ];
  const vetoes: VetoRow[] = [
    { id: 'v1', day_entry_id: '2026-10-02', member_id: 'g', rejected_food: 'Pizza', created_at: '' },
    { id: 'v2', day_entry_id: '2026-09-30', member_id: 'a', rejected_food: 'Ramen', created_at: '' },
  ];
  const stats = monthStats('2026-10', entries, vetoes, members, foods);

  it('counts only accepted meals in the month', () => {
    expect(stats.meals.map((m) => m.entry.entry_date)).toEqual(['2026-10-03', '2026-10-02', '2026-10-01']);
  });

  it('works out the streak, deciders, most eaten, vetoes and tags', () => {
    expect(stats.bestStreak).toBe(2);
    expect(stats.deciders.map((d) => [d.member.name, d.count])).toEqual([['Gabriel', 2], ['Alex', 1]]);
    expect(stats.mostEaten.map((r) => [r.name, r.count])).toEqual([['Nasi', 2], ['Ramen', 1]]);
    expect(stats.vetoes).toHaveLength(1);
    expect(stats.vetoesByMember.map((v) => [v.member.name, v.count])).toEqual([['Gabriel', 1]]);
    expect(stats.meals.find((m) => m.entry.entry_date === '2026-10-02')?.vetoes).toHaveLength(1);
    expect(stats.tags[0]).toEqual({ tag: 'cheap', count: 2 });
  });

  it('lists months with entries plus the current one, newest first', () => {
    expect(availableMonths(entries, '2026-11-02')).toEqual(['2026-11', '2026-10', '2026-09']);
    expect(monthLabel('2026-10', '2026')).toBe('October');
    expect(monthLabel('2025-10', '2026')).toBe('October 2025');
  });
});
