import { describe, expect, it } from 'vitest';
import { paybackNudge, type DatedBill } from '../../supabase/functions/_shared/payback';
import { mealList, mealLabel, message } from '../../supabase/functions/_shared/messages';

const bill = (id: string, date: string, paid_by = 'wei', amount_cents = 3000): DatedBill => ({ id, date, at: Date.parse(`${date}T05:00:00Z`), paid_by, amount_cents, split_between: ['wei', 'alex', 'sam'] });

describe('payback nudges', () => {
  it('waits three days after the meal before the first nudge', () => {
    const bills = [bill('b1', '2026-11-03')];
    expect(paybackNudge('alex', bills, [], '2026-11-05')).toBeNull();
    const n = paybackNudge('alex', bills, [], '2026-11-06');
    expect(n?.owed).toEqual([{ from_member: 'alex', to_member: 'wei', amount_cents: 1000 }]);
    expect(n?.bills.map((b) => b.id)).toEqual(['b1']);
  });

  it('names only the meals since everyone was last square, newest first', () => {
    const bills = [bill('old', '2026-10-20'), bill('a', '2026-10-30'), bill('b', '2026-11-02')];
    const payments = [
      { from_member: 'alex', to_member: 'wei', amount_cents: 1000, at: Date.parse('2026-10-21T00:00:00Z') },
      { from_member: 'sam', to_member: 'wei', amount_cents: 1000, at: Date.parse('2026-10-21T01:00:00Z') },
    ];
    expect(paybackNudge('alex', bills, payments, '2026-11-05')?.bills.map((b) => b.id)).toEqual(['b', 'a']);
  });

  it('leaves out whoever paid, and anyone who owes nothing', () => {
    expect(paybackNudge('wei', [bill('b1', '2026-11-01')], [], '2026-11-05')).toBeNull();
    const paid = [{ from_member: 'alex', to_member: 'wei', amount_cents: 1000, at: Date.parse('2026-11-02T00:00:00Z') }];
    expect(paybackNudge('alex', [bill('b1', '2026-11-01')], paid, '2026-11-05')).toBeNull();
  });

  it('says which meals, with an I’ve paid prompt when there’s one person to pay', () => {
    const meals = mealList([mealLabel('Nasi Lemak', '2026-11-03', 'en'), mealLabel('Mamak', '2026-11-02', 'en')], 'en');
    expect(meals).toBe('Nasi Lemak (Tue 3 Nov) and Mamak (Mon 2 Nov)');
    expect(message({ type: 'nudge', to: 'Wei', amount: 'RM15.00', several: false, meals, canMarkPaid: true })).toEqual({
      title: 'You owe Wei RM15.00',
      body: 'For Nasi Lemak (Tue 3 Nov) and Mamak (Mon 2 Nov). Tap I’ve paid once you’ve sent it.',
    });
    expect(mealList(['A', 'B', 'C', 'D'], 'en')).toBe('A, B and 2 more');
  });
});
