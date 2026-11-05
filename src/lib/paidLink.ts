/** "I've paid" on a payback nudge opens the app with ?paid=<member id>:<sen>, kept here until Bills opens. */
export const PENDING_PAID_KEY = 'makan.pendingPaid';

/** Kept as "<room id>|<member id>:<sen>"; only good in that room. */
export function parsePaid(value: string | null, roomId: string): { to: string; cents: number } | null {
  const m = value?.match(/^([0-9a-f-]{36})\|([0-9a-f-]{36}):(\d{1,8})$/i);
  if (!m || m[1] !== roomId) return null;
  const cents = Number(m[3]);
  return cents > 0 ? { to: m[2], cents } : null;
}
