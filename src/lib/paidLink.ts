/** "I've paid" on a payback nudge opens the app with ?paid=<member id>:<sen>, kept here until Bills opens. */
export const PENDING_PAID_KEY = 'makan.pendingPaid';

export function parsePaid(value: string | null): { to: string; cents: number } | null {
  const m = value?.match(/^([0-9a-f-]{36}):(\d{1,8})$/i);
  if (!m) return null;
  const cents = Number(m[2]);
  return cents > 0 ? { to: m[1], cents } : null;
}
