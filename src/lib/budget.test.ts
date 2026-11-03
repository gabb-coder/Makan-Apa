import { describe, expect, it } from 'vitest';
import { budgetState } from './budget';

describe('budgetState', () => {
  it('gives a heads-up from 80% and says when you are over', () => {
    expect(budgetState(10000, 30000)).toEqual({ pct: 33, level: 'ok', left: 20000 });
    expect(budgetState(24000, 30000)).toEqual({ pct: 80, level: 'warn', left: 6000 });
    expect(budgetState(30000, 30000).level).toBe('warn');
    expect(budgetState(31200, 30000)).toEqual({ pct: 104, level: 'over', left: -1200 });
  });
});
