/** The bill messages sent to the group chat: when, what, and who to transfer the money to. */
import { t } from './i18n';
import { balances, formatRM, settleUp, shares, unsettled } from './money';
import type { MealBillRow, MemberRow, SettlementRow } from './supabase';

type Payee = Pick<MemberRow, 'id' | 'name' | 'pay_duitnow' | 'pay_bank'>;

/** "DuitNow 012-345 6789 · Maybank 1234" for whoever's being paid, if they've added them. */
function howToPay(m: Payee | undefined): string | null {
  if (!m) return null;
  const how = [m.pay_duitnow && `${t('DuitNow')} ${m.pay_duitnow}`, m.pay_bank].filter(Boolean).join(' · ');
  return how || null;
}

/** "Transfer to Gabriel", how to pay them, then each person and their amount. */
function transferBlock(to: Payee | undefined, from: { name: string; cents: number }[]): string[] {
  const lines = [t('Transfer to {name}', { name: to?.name ?? t('Someone') })];
  const how = howToPay(to);
  if (how) lines.push(how);
  for (const f of from) lines.push(`• ${f.name} ${formatRM(f.cents)}`);
  return lines;
}

/** One meal's bill: its date and food, the total, and what everyone transfers to whoever paid. */
export function mealBillMessage(bill: MealBillRow, members: Payee[], label: string): string {
  const byId = new Map(members.map((m) => [m.id, m]));
  const name = (id: string) => byId.get(id)?.name ?? t('Someone');
  const lines = [`🧾 ${label}`, t('Total {amount}', { amount: formatRM(bill.amount_cents) }), ''];
  if (bill.from_kitty) {
    lines.push(t('Paid from the kitty: nothing to transfer.'));
  } else if (bill.treat) {
    lines.push(t('🎉 {name}’s treat: nothing to transfer.', { name: name(bill.paid_by) }));
  } else {
    const from = [...shares(bill)]
      .filter(([id, cents]) => id !== bill.paid_by && cents > 0)
      .map(([id, cents]) => ({ name: name(id), cents }));
    if (from.length) lines.push(...transferBlock(byId.get(bill.paid_by), from));
    else lines.push(t('Nothing to transfer.'));
  }
  return lines.join('\n');
}

/** When a bill or payback happened, for putting them in order. */
const at = (x: { updated_at?: string; created_at?: string }) => Date.parse(x.updated_at ?? x.created_at ?? '') || 0;

/** The bills still being paid back: the ones after the last time everyone was all square. */
export const unsettledBills = (bills: MealBillRow[], settlements: SettlementRow[]): MealBillRow[] => unsettled(bills, settlements, at, at);

/**
 * Settling up across meals: the meals it's for, then who transfers what to whom, grouped by
 * whoever's being paid so everyone can see where their money goes.
 */
export function settleUpMessage(bills: MealBillRow[], settlements: SettlementRow[], members: Payee[], labelOf: (bill: MealBillRow) => string | null): string {
  const byId = new Map(members.map((m) => [m.id, m]));
  const name = (id: string) => byId.get(id)?.name ?? t('Someone');
  const plan = settleUp(balances(bills, settlements));
  if (!plan.length) return t("Everyone's settled up.");
  const meals = unsettledBills(bills, settlements)
    .sort((a, b) => at(b) - at(a))
    .map(labelOf)
    .filter((l): l is string => !!l);
  const lines: string[] = [];
  const MAX = 5;
  for (const l of meals.slice(0, MAX)) lines.push(`🧾 ${l}`);
  if (meals.length > MAX) lines.push(meals.length - MAX === 1 ? t('…and 1 more meal') : t('…and {n} more meals', { n: meals.length - MAX }));
  for (const to of [...new Set(plan.map((p) => p.to_member))]) {
    if (lines.length) lines.push('');
    lines.push(
      ...transferBlock(
        byId.get(to),
        plan.filter((p) => p.to_member === to).map((p) => ({ name: name(p.from_member), cents: p.amount_cents })),
      ),
    );
  }
  return lines.join('\n');
}

/** A WhatsApp link that opens a chat with this message ready to send. */
export const whatsAppLink = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;
