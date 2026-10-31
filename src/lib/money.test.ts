import { describe, expect, it } from 'vitest';
import { balances, formatRM, parseRM, settleUp, shares } from './money';

describe('money', () => {
  it('formats and parses ringgit', () => {
    expect(formatRM(1250)).toBe('RM12.50');
    expect(parseRM('12.5')).toBe(1250);
    expect(parseRM('RM 1,200')).toBe(120000);
    expect(parseRM('12.345')).toBeNull();
    expect(parseRM('0')).toBeNull();
    expect(parseRM('abc')).toBeNull();
  });

  it('splits bills to the sen', () => {
    expect([...shares({ paid_by: 'a', amount_cents: 1000, split_between: ['a', 'b', 'c'] }).values()]).toEqual([334, 333, 333]);
  });

  it('works out who owes whom, and settles in few payments', () => {
    const bills = [
      { paid_by: 'wei', amount_cents: 3000, split_between: ['wei', 'alex', 'sam'] },
      { paid_by: 'alex', amount_cents: 1200, split_between: ['wei', 'alex'] },
    ];
    const net = balances(bills, []);
    expect(Object.fromEntries(net)).toEqual({ wei: 1400, alex: -400, sam: -1000 });
    expect(settleUp(net)).toEqual([
      { from_member: 'sam', to_member: 'wei', amount_cents: 1000 },
      { from_member: 'alex', to_member: 'wei', amount_cents: 400 },
    ]);
    // Once Sam pays Wei back, only Alex owes.
    const after = balances(bills, [{ from_member: 'sam', to_member: 'wei', amount_cents: 1000 }]);
    expect(settleUp(after)).toEqual([{ from_member: 'alex', to_member: 'wei', amount_cents: 400 }]);
  });
});
