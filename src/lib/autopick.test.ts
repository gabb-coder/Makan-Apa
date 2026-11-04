import { describe, expect, it } from 'vitest';
import { autoPhase, pickFood, pickTime } from '../../supabase/functions/_shared/autopick';

const food = (id: string, extra: Partial<{ diet: string[]; price: number }> = {}) => ({ id, name: id, diet: extra.diet ?? [], price: extra.price ?? null });

describe('auto-decide', () => {
  it('nudges at 11:30, picks from 12:00, and gives up after lunch', () => {
    expect(autoPhase('lunch', 11 * 60 + 29)).toBeNull();
    expect(autoPhase('lunch', 11 * 60 + 30)).toBe('nudge');
    expect(autoPhase('lunch', 12 * 60)).toBe('pick');
    expect(autoPhase('lunch', 15 * 60)).toBeNull();
    expect(autoPhase('dinner', 18 * 60 + 45)).toBe('nudge');
    expect(autoPhase('dinner', 19 * 60 + 5)).toBe('pick');
    expect(pickTime('lunch')).toBe('12:00');
    expect(pickTime('dinner')).toBe('19:00');
  });

  it('skips vetoed foods and ones that clash with someone', () => {
    const foods = [food('Pork Noodles', { diet: ['pork'] }), food('Nasi Lemak'), food('Chicken Rice'), food('Sushi'), food('Steak', { price: 3 })];
    const people = [{ diet: ['halal'], budget: null }, { diet: [], budget: 2 }];
    const picks = new Set<string>();
    for (let r = 0; r < 1; r += 0.05) picks.add(pickFood(foods, people, new Set(['sushi']), new Map(), r)!.name);
    expect([...picks].sort()).toEqual(['Chicken Rice', 'Nasi Lemak']);
  });

  it('makes foods eaten lately much less likely', () => {
    const foods = [food('A'), food('B')];
    const daysSince = new Map([['A', 1]]);
    let a = 0;
    for (let r = 0; r < 1; r += 0.01) if (pickFood(foods, [], new Set(), daysSince, r)!.id === 'A') a++;
    expect(a).toBeLessThan(15);
  });

  it('picks nothing when everything is vetoed', () => {
    expect(pickFood([food('A')], [], new Set(['a']), new Map(), 0.5)).toBeNull();
  });
});
