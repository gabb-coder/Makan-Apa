import { describe, expect, it } from 'vitest';
import { customFood } from './foods';
import { suggestions } from './suggest';

const food = (name: string, daysSinceEaten: number | null, netRating = 0) => ({ ...customFood(name), daysSinceEaten, netRating });

describe('suggestions', () => {
  it('puts long-unseen, liked foods that suit everyone first, with reasons', () => {
    const list = suggestions({
      foods: [food('Ramen', 1), food('Thai', 21, 2), food('Pizza', null)],
      suits: (f) => f.name !== 'Pizza',
    });
    expect(list[0].food.name).toBe('Thai');
    expect(list[0].reasons.map((r) => r.key)).toEqual(['Not had in {n} days', 'The room liked it ({n} 👍)', 'Suits everyone’s diet and budget']);
    expect(list.at(-1)!.food.name).toBe('Ramen');
  });
  it('leans towards staying dry in the rain', () => {
    const list = suggestions({ foods: [food('Mamak', 10), food('Sushi', 10)], suits: () => true, wet: true, covered: (f) => f.name === 'Sushi' });
    expect(list[0].food.name).toBe('Sushi');
  });
});
