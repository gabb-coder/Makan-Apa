import { useEffect, useState } from 'react';
import { t, tNodes } from '../lib/i18n';
import { balances, formatRM, parseRM, settleUp, shares } from '../lib/money';
import type { MealBillRow, MealRatingRow, MemberRow, SettlementRow } from '../lib/supabase';
import { Avatar } from './Avatar';

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

/** "Who paid?" or "Wei paid RM42.00 · split 3 ways", opening the bill sheet. */
export function BillLine({ bill, members, meId, onOpen }: { bill: MealBillRow | null; members: MemberRow[]; meId: string; onOpen: () => void }) {
  const nameOf = (id: string) => (id === meId ? t('You') : members.find((m) => m.id === id)?.name ?? t('Someone'));
  return (
    <button
      type="button"
      className="press"
      onClick={onOpen}
      style={{ alignSelf: 'center', minHeight: 44, padding: '0 12px', border: 'none', background: 'none', fontSize: 14, fontWeight: 700, color: bill ? 'var(--ink-2)' : 'var(--accent)' }}
    >
      {bill
        ? `${t('{name} paid {amount}', { name: nameOf(bill.paid_by), amount: formatRM(bill.amount_cents) })} · ${bill.split_between.length === 1 ? t('no split') : t('split {n} ways', { n: bill.split_between.length })} · ${t('Edit')}`
        : t('Who paid? Split the bill')}
    </button>
  );
}

interface BillSheetProps {
  foodName: string;
  bill: MealBillRow | null;
  members: MemberRow[];
  meId: string;
  onSave: (bill: { paid_by: string; amount_cents: number; split_between: string[] }) => Promise<void>;
  onRemove: () => Promise<void>;
  onClose: () => void;
}

export function BillSheet({ foodName, bill, members, meId, onSave, onRemove, onClose }: BillSheetProps) {
  const [paidBy, setPaidBy] = useState(bill?.paid_by ?? meId);
  const [amount, setAmount] = useState(bill ? (bill.amount_cents / 100).toFixed(2) : '');
  const [split, setSplit] = useState<string[]>(bill?.split_between ?? members.map((m) => m.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const cents = parseRM(amount);
  const each = cents && split.length ? shares({ paid_by: paidBy, amount_cents: cents, split_between: split }) : null;
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Could not save.'));
      setBusy(false);
    }
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bill-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (cents && split.length) void run(() => onSave({ paid_by: paidBy, amount_cents: cents, split_between: split }));
        }}
      >
        <div aria-hidden="true" style={{ width: 40, height: 5, borderRadius: 999, background: 'var(--border-strong)', alignSelf: 'center' }} />
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span className="eyebrow">{foodName}</span>
            <h2 id="bill-title" className="title title--sm" style={{ fontSize: 24 }}>
              {t('Who paid?')}
            </h2>
          </div>
          <button type="button" className="icon-btn press" aria-label={t('Close')} onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <legend className="field-label" style={{ padding: 0, marginBottom: 8 }}>{t('Paid by')}</legend>
          <div className="chip-row" style={{ flexWrap: 'wrap' }}>
            {members.map((m) => (
              <button key={m.id} type="button" className="chip press" aria-pressed={paidBy === m.id} onClick={() => setPaidBy(m.id)}>
                {m.id === meId ? t('You') : m.name}
              </button>
            ))}
          </div>
        </fieldset>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label htmlFor="bill-amount" className="field-label">{t('Total (RM)')}</label>
          <input
            id="bill-amount"
            className="input"
            inputMode="decimal"
            placeholder="42.00"
            autoFocus={!bill}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{ height: 52, fontSize: 20, fontWeight: 700 }}
          />
        </div>

        <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <legend className="field-label" style={{ padding: 0, marginBottom: 8 }}>{t('Split between')}</legend>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {members.map((m) => {
              const on = split.includes(m.id);
              return (
                <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => setSplit(on ? split.filter((id) => id !== m.id) : [...split, m.id])}
                    style={{ width: 20, height: 20, accentColor: 'var(--accent)' }}
                  />
                  <Avatar name={m.name} color={m.color} size={28} />
                  <span style={{ flexGrow: 1, fontSize: 15, fontWeight: 600 }}>{m.id === meId ? t('You') : m.name}</span>
                  <span style={{ fontSize: 14, color: 'var(--muted)' }}>{on && each ? formatRM(each.get(m.id) ?? 0) : ''}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {error && (
          <p role="alert" style={{ margin: 0, fontSize: 14, color: 'var(--danger)' }}>
            {error}
          </p>
        )}
        <button type="submit" className="btn btn--primary press" disabled={busy || !cents || !split.length} style={{ height: 52 }}>
          {t('Save')}
        </button>
        {bill && (
          <button type="button" className="btn btn--danger press" disabled={busy} onClick={() => void run(onRemove)}>
            {t('Remove bill')}
          </button>
        )}
      </form>
    </div>
  );
}

/** History: what everyone's owed, the payments that settle it, and recent paybacks. */
export function MoneyCard({
  bills,
  settlements,
  members,
  meId,
  onRecord,
  onUndo,
}: {
  bills: MealBillRow[];
  settlements: SettlementRow[];
  members: MemberRow[];
  meId: string;
  onRecord: (p: { from_member: string; to_member: string; amount_cents: number }) => Promise<void>;
  onUndo: (id: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  if (!bills.length) return null;
  const nameOf = (id: string) => (id === meId ? t('You') : members.find((m) => m.id === id)?.name ?? t('Someone'));
  const net = balances(bills, settlements);
  const plan = settleUp(net);
  const spent = bills.reduce((n, b) => n + b.amount_cents, 0);
  const recent = settlements.slice(-3).reverse();
  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
      <span className="section-label">{t('Money')}</span>
      <div className="card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>
          {bills.length === 1
            ? t('{amount} paid across {n} meal.', { amount: formatRM(spent), n: bills.length })
            : t('{amount} paid across {n} meals.', { amount: formatRM(spent), n: bills.length })}
        </span>
        {plan.length === 0 ? (
          <span style={{ fontSize: 15, fontWeight: 700 }}>{t("Everyone's settled up.")}</span>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {plan.map((p) => {
              const key = `${p.from_member}>${p.to_member}`;
              const owes = { from: <b>{nameOf(p.from_member)}</b>, to: <b>{nameOf(p.to_member)}</b>, amount: formatRM(p.amount_cents) };
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ flexGrow: 1, fontSize: 15 }}>
                    {p.from_member === meId
                      ? tNodes('{from} owe {to} {amount}', owes)
                      : tNodes('{from} owes {to} {amount}', owes)}
                  </span>
                  <button
                    type="button"
                    className="btn btn--secondary press"
                    disabled={busy !== null}
                    onClick={() => void act(key, () => onRecord(p))}
                    style={{ height: 36, padding: '0 12px', fontSize: 13, flexShrink: 0 }}
                  >
                    {busy === key ? t('Saving…') : t('Mark paid')}
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {recent.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 10, borderTop: '1px solid var(--divider)' }}>
            {recent.map((s) => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--muted)' }}>
                <span style={{ flexGrow: 1 }}>
                  {t('{from} paid {to} back {amount}', { from: nameOf(s.from_member), to: nameOf(s.to_member), amount: formatRM(s.amount_cents) })}
                </span>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void act(s.id, () => onUndo(s.id))}
                  style={{ minHeight: 36, border: 'none', background: 'none', color: 'var(--accent-text)', fontWeight: 700, fontSize: 13 }}
                >
                  {t('Undo')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
