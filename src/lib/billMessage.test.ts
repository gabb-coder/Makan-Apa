import { describe, expect, it } from 'vitest';
import { mealBillMessage, settleUpMessage, unsettledBills } from './billMessage';
import type { MealBillRow, SettlementRow } from './supabase';

const members = [
  { id: 'g', name: 'Gabriel', pay_duitnow: '012-345 6789', pay_bank: 'Maybank 1234' },
  { id: 'a', name: 'Alex', pay_duitnow: null, pay_bank: null },
  { id: 'w', name: 'Wei', pay_duitnow: null, pay_bank: null },
];
const bill = (id: string, paid_by: string, amount_cents: number, at: string, extra: Partial<MealBillRow> = {}): MealBillRow => ({
  day_entry_id: id,
  room_id: 'r',
  paid_by,
  amount_cents,
  split_between: ['g', 'a', 'w'],
  updated_at: at,
  ...extra,
});
const paid = (from_member: string, to_member: string, amount_cents: number, created_at: string): SettlementRow => ({ id: created_at, room_id: 'r', from_member, to_member, amount_cents, created_at });

describe('bill messages', () => {
  it('a meal: its date and food, and who to transfer to — no room name, no "owes"', () => {
    const text = mealBillMessage(bill('d1', 'g', 3000, '2026-11-05T05:00:00Z'), members, 'Thu 5 Nov · Mamak');
    expect(text).toBe(['🧾 Thu 5 Nov · Mamak', 'Total RM30.00', '', 'Transfer to Gabriel', 'DuitNow 012-345 6789 · Maybank 1234', '• Alex RM10.00', '• Wei RM10.00'].join('\n'));
    expect(text).not.toMatch(/owes/);
  });

  it('a treat or a kitty bill has nothing to transfer', () => {
    expect(mealBillMessage(bill('d1', 'g', 3000, 'x', { treat: true }), members, 'Thu 5 Nov · Mamak')).toContain('Gabriel’s treat: nothing to transfer.');
    expect(mealBillMessage(bill('d1', 'g', 3000, 'x', { from_kitty: true }), members, 'Thu 5 Nov · Mamak')).toContain('Paid from the kitty: nothing to transfer.');
  });

  it('settling up lists only the meals since everyone was last square, grouped by who gets paid', () => {
    const bills = [bill('old', 'g', 3000, '2026-11-02T05:00:00Z'), bill('new', 'g', 1500, '2026-11-05T05:00:00Z'), bill('wei', 'w', 600, '2026-11-05T06:00:00Z')];
    const settlements = [paid('a', 'g', 1000, '2026-11-03T05:00:00Z'), paid('w', 'g', 1000, '2026-11-03T06:00:00Z')];
    expect(unsettledBills(bills, settlements).map((b) => b.day_entry_id)).toEqual(['new', 'wei']);
    const labels: Record<string, string> = { old: 'Mon 2 Nov · Nasi lemak', new: 'Thu 5 Nov · Mamak', wei: 'Thu 5 Nov · Teh tarik' };
    const text = settleUpMessage(bills, settlements, members, (b) => labels[b.day_entry_id]);
    expect(text).toContain('🧾 Thu 5 Nov · Mamak');
    expect(text).toContain('🧾 Thu 5 Nov · Teh tarik');
    expect(text).not.toContain('Nasi lemak');
    expect(text).toContain('Transfer to Gabriel\nDuitNow 012-345 6789 · Maybank 1234\n• Alex');
    expect(text).not.toMatch(/owes|Room/);
  });

  it('says so when everyone is square', () => {
    expect(settleUpMessage([bill('d', 'g', 3000, 'a')], [paid('a', 'g', 1000, 'b'), paid('w', 'g', 1000, 'c')], members, () => 'x')).toBe("Everyone's settled up.");
  });
});
