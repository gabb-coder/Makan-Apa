import { describe, expect, it } from 'vitest';
import { allergensIn } from './allergens';

describe('allergensIn', () => {
  it('reads Malaysian menu names', () => {
    expect(allergensIn('Satay ayam (10 sticks)')).toContain('nuts');
    expect(allergensIn('Nasi lemak ayam goreng')).toEqual(['spicy']);
    expect(allergensIn('Char kway teow with prawns')).toContain('seafood');
    expect(allergensIn('Cheese naan')).toEqual(['dairy', 'gluten']);
    expect(allergensIn('Roti telur')).toEqual(['egg', 'gluten']);
    expect(allergensIn('Plain rice')).toEqual([]);
  });
});
