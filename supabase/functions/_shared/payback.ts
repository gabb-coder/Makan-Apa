// Who to nudge about paying someone back, and for which meals. Shared by send-reminders and
// its tests (src/lib/payback.test.ts).
import { balances, settleUp, shares, unsettled, type Bill, type Payment } from './money.ts';

/** Wait this many days after a meal before the first nudge, and between nudges. */
export const NUDGE_AFTER_DAYS = 3;

export interface DatedBill extends Bill {
  id: string;
  /** The day of the meal (or event), YYYY-MM-DD. */
  date: string;
  /** When the bill was saved, ms since 1970: puts bills and paybacks in order. */
  at: number;
}
export interface DatedPayment extends Payment {
  at: number;
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/**
 * What `member` still owes, and the meals it's for (newest first), once the oldest of those
 * meals is at least NUDGE_AFTER_DAYS old; null when there's nothing to nudge about yet.
 */
export function paybackNudge(member: string, bills: DatedBill[], payments: DatedPayment[], today: string): { owed: Payment[]; bills: DatedBill[] } | null {
  const owed = settleUp(balances(bills, payments)).filter((p) => p.from_member === member);
  if (!owed.length) return null;
  const mine = unsettled(bills, payments, (b) => b.at, (p) => p.at).filter((b) => b.paid_by !== member && (shares(b).get(member) ?? 0) > 0);
  if (!mine.length) return null;
  const oldest = mine.reduce((d, b) => (b.date < d ? b.date : d), mine[0].date);
  if (daysBetween(oldest, today) < NUDGE_AFTER_DAYS) return null;
  return { owed, bills: [...mine].sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at) };
}
