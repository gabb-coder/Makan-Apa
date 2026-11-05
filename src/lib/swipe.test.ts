import { describe, expect, it } from 'vitest';
import { dealFoods, tallySwipes } from './swipe';
import type { SwipeRow } from './supabase';

const s = (member_id: string, choice: number, yes: boolean, round = 1): SwipeRow => ({ day_entry_id: 'd', member_id, round, choice, yes, created_at: '' });

describe('swipe to match', () => {
  it('puts what everyone liked first, then the most yeses', () => {
    const swipes = [s('a', 0, true), s('a', 1, true), s('a', 2, false), s('b', 0, false), s('b', 1, true), s('b', 2, true)];
    const r = tallySwipes(['Pizza', 'Mamak', 'Sushi'], swipes, 1, ['a', 'b']);
    expect(r.ranked.map((x) => [x.name, x.yes, x.everyone])).toEqual([
      ['Mamak', 2, true],
      ['Pizza', 1, false],
      ['Sushi', 1, false],
    ]);
    expect(r.allDone).toBe(true);
  });

  it('only counts this round, and knows who has finished', () => {
    const swipes = [s('a', 0, true, 0), s('a', 1, true, 0), s('a', 0, false), s('b', 0, true), s('b', 1, true)];
    const r = tallySwipes(['Pizza', 'Mamak'], swipes, 1, ['a', 'b']);
    expect([...r.finished]).toEqual(['b']);
    expect(r.allDone).toBe(false);
    expect(r.ranked[0]).toMatchObject({ name: 'Mamak', yes: 1 });
  });

  it('deals different foods, as many as asked for', () => {
    const foods = ['A', 'B', 'C', 'D', 'E'].map((name) => ({ name }));
    const dealt = dealFoods(foods, 3, () => 1);
    expect(dealt).toHaveLength(3);
    expect(new Set(dealt.map((f) => f.name)).size).toBe(3);
    expect(dealFoods(foods, 9, () => 1)).toHaveLength(5);
  });
});
