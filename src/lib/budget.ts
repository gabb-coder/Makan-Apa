import { parseRM } from './money';
import { storage } from './storage';

const KEY = 'makan.monthlyBudget';
const WARNED_KEY = 'makan.budgetWarned';

/** This phone's monthly food budget, in sen, or null when none is set. */
export function monthlyBudget(): number | null {
  const n = Number(storage.get(KEY));
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** "300" or "RM 300.50" → saved; "" clears it. Returns false if it isn't an amount. */
export function setMonthlyBudget(text: string): boolean {
  if (!text.trim()) {
    storage.remove(KEY);
    return true;
  }
  const cents = parseRM(text);
  if (cents === null) return false;
  storage.set(KEY, String(cents));
  return true;
}

export type BudgetLevel = 'ok' | 'warn' | 'over';

/** How far into the budget your share of this month's bills is: a heads-up from 80%. */
export function budgetState(spent: number, budget: number): { pct: number; level: BudgetLevel; left: number } {
  const pct = Math.round((spent / budget) * 100);
  return { pct, level: spent > budget ? 'over' : pct >= 80 ? 'warn' : 'ok', left: budget - spent };
}

/** True the first time a month reaches this level on this phone, so the heads-up shows once. */
export function firstTimeAt(month: string, level: BudgetLevel): boolean {
  if (level === 'ok') return false;
  const mark = `${month}:${level}`;
  const seen = (storage.get(WARNED_KEY) ?? '').split(',');
  if (seen.includes(mark)) return false;
  storage.set(WARNED_KEY, [...seen.filter((s) => s.startsWith(month)), mark].join(','));
  return true;
}
