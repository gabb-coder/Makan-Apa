import { useState } from 'react';
import { t } from '../lib/i18n';
import { formatRM } from '../lib/money';
import type { MealBillRow, MealRatingRow, MemberRow } from '../lib/supabase';

const THUMB_UP = 'M7 10v11H4V10h3zm2 11h8.3a2 2 0 0 0 2-1.6l1.3-6.5A2 2 0 0 0 18.6 10H14V5.5A2.5 2.5 0 0 0 11.5 3L9 10v11z';

function Thumb({ down = false }: { down?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true" style={down ? { transform: 'rotate(180deg)' } : undefined}>
      <path d={THUMB_UP} />
    </svg>
  );
}

/** "How was it?" with a thumbs up and down, and how the room voted. */
export function RatingRow({ entryId, ratings, meId, label = t('How was it?'), onRate }: { entryId: string; ratings: MealRatingRow[]; meId: string; label?: string; onRate: (rating: 1 | -1 | null) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const mine = ratings.find((r) => r.day_entry_id === entryId && r.member_id === meId)?.rating ?? null;
  const ups = ratings.filter((r) => r.day_entry_id === entryId && r.rating === 1).length;
  const downs = ratings.filter((r) => r.day_entry_id === entryId && r.rating === -1).length;
  const tap = async (value: 1 | -1) => {
    setBusy(true);
    try {
      await onRate(mine === value ? null : value);
    } finally {
      setBusy(false);
    }
  };
  const btn = (value: 1 | -1, count: number, name: string) => (
    <button
      type="button"
      className="chip press"
      aria-pressed={mine === value}
      aria-label={count ? t('{name}, {n} so far', { name, n: count }) : name}
      disabled={busy}
      onClick={() => void tap(value)}
      style={{ gap: 6, minWidth: 64, justifyContent: 'center' }}
    >
      <Thumb down={value === -1} />
      {count > 0 && <span>{count}</span>}
    </button>
  );
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-2)' }}>{label}</span>
      {btn(1, ups, t('Liked it'))}
      {btn(-1, downs, t('Not again'))}
    </div>
  );
}

/** "Who paid?" or "Wei paid RM42.00 · split 3 ways", opening the bill sheet (also on the Bills tab). */
export function BillLine({ bill, members, meId, onOpen }: { bill: MealBillRow | null; members: MemberRow[]; meId: string; onOpen: () => void }) {
  const nameOf = (id: string) => (id === meId ? t('You') : members.find((m) => m.id === id)?.name ?? t('Someone'));
  // Everyone on the bill's lines, guests included (or the even split, for older bills).
  const people = bill ? [...new Set(bill.items?.length ? bill.items.flatMap((i) => i.people) : bill.split_between)] : [];
  const split = people.length === 1 ? (people[0] === bill?.paid_by ? t('no split') : t('for 1 person')) : t('split {n} ways', { n: people.length });
  return (
    <button
      type="button"
      className="press"
      onClick={onOpen}
      style={{ alignSelf: 'center', minHeight: 44, padding: '0 12px', border: 'none', background: 'none', fontSize: 14, fontWeight: 700, color: bill ? 'var(--ink-2)' : 'var(--accent-text)' }}
    >
      {bill
        ? `${bill.from_kitty ? t('{amount} from the kitty', { amount: formatRM(bill.amount_cents) }) : bill.treat ? t('{name} treated everyone 🎉 ({amount})', { name: nameOf(bill.paid_by), amount: formatRM(bill.amount_cents) }) : t('{name} paid {amount}', { name: nameOf(bill.paid_by), amount: formatRM(bill.amount_cents) })} · ${split} · ${t('Edit')}`
        : t('Who paid? Split the bill')}
    </button>
  );
}
