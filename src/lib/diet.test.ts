import { describe, expect, it } from 'vitest';
import { clashes, clashText, needsLabel, spotSuitability, suitsEveryone, whoClashes } from './diet';

const alex = { name: 'Alex', diet: ['halal'], budget: null };
const wei = { name: 'Wei', diet: ['vegetarian'], budget: 1 };
const sam = { name: 'Sam', diet: [], budget: null };

describe('clashes', () => {
  it('rules out pork for halal and no-pork, and beef for no-beef', () => {
    expect(clashes({ diet: ['pork'], price: null }, alex)).toEqual(['halal']);
    expect(clashes({ diet: ['pork'], price: null }, { diet: ['no-pork'], budget: null })).toEqual(['no pork']);
    expect(clashes({ diet: ['beef'], price: null }, { diet: ['no-beef'], budget: null })).toEqual(['no beef']);
    expect(clashes({ diet: [], price: null }, alex)).toEqual([]);
  });

  it('needs a vegetarian mark for vegetarians, and respects budgets', () => {
    expect(clashes({ diet: [], price: 2 }, wei)).toEqual(['vegetarian', 'budget']);
    expect(clashes({ diet: ['vegetarian'], price: 1 }, wei)).toEqual([]);
    expect(clashes({ diet: ['vegetarian'], price: null }, wei)).toEqual([]);
  });
});

describe('room helpers', () => {
  it('says who a food is not for', () => {
    const found = whoClashes({ diet: ['pork'], price: 2 }, [alex, wei, sam]);
    expect(found.map((f) => f.member.name)).toEqual(['Alex', 'Wei']);
    expect(clashText(found)).toBe('Not for Alex and Wei');
    expect(clashText(found.slice(0, 1))).toBe('Not for Alex (halal)');
    expect(suitsEveryone({ diet: ['vegetarian', 'halal'], price: 1 }, [alex, wei, sam])).toBe(true);
  });

  it('describes needs and spots', () => {
    expect(needsLabel(wei)).toBe('Vegetarian · Under RM15');
    expect(needsLabel(sam)).toBeNull();
    expect(spotSuitability({ diet: 'pork', price: 1 })).toEqual({ diet: ['pork'], price: 1 });
  });
});
