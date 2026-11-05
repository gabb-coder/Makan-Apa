import { describe, expect, it } from 'vitest';
import { allocate, balances, billTotals, formatRM, itemSubtotals, parsePct, parseRM, settleUp, shares } from './money';

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

  it('adds service charge, then SST on top, like a Malaysian receipt', () => {
    const items = [{ name: 'Nasi lemak', cents: 1000, people: ['a'] }];
    expect(billTotals(items, 10, 6)).toEqual({ subtotal: 1000, service: 100, sst: 66, total: 1166 });
    expect(billTotals(items, 0, 0).total).toBe(1000);
  });

  it('splits itemised bills by what each person had, shared items included', () => {
    const items = [
      { name: 'Chicken rice', cents: 1200, people: ['a'] },
      { name: 'Laksa', cents: 1500, people: ['b'] },
      { name: 'Teh tarik jug', cents: 900, people: ['a', 'b', 'c'] },
    ];
    expect(Object.fromEntries(itemSubtotals(items))).toEqual({ a: 1500, b: 1800, c: 300 });
    const total = billTotals(items, 10, 6).total;
    const each = shares({ paid_by: 'a', amount_cents: total, split_between: ['a', 'b', 'c'], items, service_pct: 10, sst_pct: 6 });
    expect([...each.values()].reduce((n, c) => n + c, 0)).toBe(total);
    expect(Object.fromEntries(each)).toEqual({ a: 1749, b: 2099, c: 350 });
  });

  it('allocates to the sen with the biggest remainders', () => {
    expect(Object.fromEntries(allocate(100, new Map([['a', 1], ['b', 1], ['c', 1]])))).toEqual({ a: 34, b: 33, c: 33 });
    expect(allocate(100, new Map([['a', 0]])).size).toBe(0);
  });

  it('reads percentages', () => {
    expect(parsePct('6')).toBe(6);
    expect(parsePct('6.5%')).toBe(6.5);
    expect(parsePct('')).toBe(0);
    expect(parsePct('31')).toBeNull();
    expect(parsePct('x')).toBeNull();
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

describe('kitty', () => {
  it('keeps kitty bills out of debts and takes shares off each person’s part', async () => {
    const { balances, kitty } = await import('./money');
    const bills = [
      { paid_by: 'a', amount_cents: 3000, split_between: ['a', 'b', 'c'], from_kitty: true },
      { paid_by: 'b', amount_cents: 1000, split_between: ['a', 'b'] },
    ];
    expect(Object.fromEntries(balances(bills, []))).toEqual({ b: 500, a: -500 });
    const k = kitty(bills, [
      { member_id: 'a', amount_cents: 2000 },
      { member_id: 'b', amount_cents: 2000 },
    ]);
    expect(k.total).toBe(1000);
    expect(Object.fromEntries(k.each)).toEqual({ a: 1000, b: 1000, c: -1000 });
  });
});

describe('treats, birthdays and guests', () => {
  it('charges a guest to whoever brought them', async () => {
    const { shares, guestKey } = await import('./money');
    const bill = { paid_by: 'a', amount_cents: 3000, split_between: ['a', 'b'], items: [
      { name: '', cents: 1000, people: ['a'] },
      { name: '', cents: 1000, people: ['b'] },
      { name: '', cents: 1000, people: [guestKey('b', 1)] },
    ] };
    expect(Object.fromEntries(shares(bill))).toEqual({ a: 1000, b: 2000 });
  });
  it('spreads the birthday person’s share over everyone else', async () => {
    const { shares } = await import('./money');
    const bill = { paid_by: 'a', amount_cents: 3000, split_between: ['a', 'b', 'c'], birthday: 'c' };
    expect(Object.fromEntries(shares(bill))).toEqual({ a: 1500, b: 1500, c: 0 });
    const items = { paid_by: 'a', amount_cents: 4000, split_between: [], birthday: 'c', items: [
      { name: '', cents: 1000, people: ['a'] },
      { name: '', cents: 3000, people: ['b'] },
      { name: '', cents: 1000, people: ['c'] },
    ] };
    // 4000 total: a had 1/5, b 3/5, c 1/5 (800); c's 800 splits 1:3 between a and b
    expect(Object.fromEntries(shares(items))).toEqual({ a: 1000, b: 3000, c: 0 });
  });
  it('a treat leaves nobody owing', async () => {
    const { balances } = await import('./money');
    expect([...balances([{ paid_by: 'a', amount_cents: 3000, split_between: ['a', 'b'], treat: true }], []).values()].every((v) => v === 0)).toBe(true);
  });

  it('still charges a birthday person for the guest they brought, and the payer covers them if nobody else ate', async () => {
    const { shares } = await import('./money');
    const bill = {
      paid_by: 'a',
      amount_cents: 1500,
      split_between: ['b'],
      birthday: 'b',
      items: [
        { name: 'Cake', cents: 1000, people: ['b'] },
        { name: 'Guest’s noodles', cents: 500, people: ['b+1'] },
      ],
    };
    expect(Object.fromEntries(shares(bill))).toEqual({ b: 500, a: 1000 });
  });
});
