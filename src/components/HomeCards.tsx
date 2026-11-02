import { useEffect, useState } from 'react';
import { t, tNodes } from '../lib/i18n';
import { formatRM } from '../lib/money';
import type { MealStatus, RoomSummary } from '../lib/roomSummaries';
import { roomTitle } from '../lib/session';
import type { Meal } from '../lib/supabase';

/** "Nasi Lemak", "your turn", "Alex is choosing"… for one room's meal, short. */
function mealLine(st: MealStatus): string {
  switch (st.kind) {
    case 'decided':
      return st.food;
    case 'your-turn':
      return t('your turn to choose');
    case 'choosing':
      return t('{name} is choosing', { name: st.decider });
    case 'sent':
      return t('you picked {food}, waiting', { food: st.food });
    case 'answer':
      return t('{name} picked {food}', { name: st.decider, food: st.food });
    case 'secret':
      return st.mine ? t('secret picks, {n} of {total} in', { n: st.picked, total: st.total }) : t('make your secret pick');
    case 'out':
      return t('you’re out');
  }
}

/**
 * Where you're eating today, across every room: each meal, and the rooms you're down for. Down
 * for the same meal in two rooms? Skip one with a tap.
 */
export function TodayCard({ summaries, onSkip }: { summaries: RoomSummary[]; onSkip: (s: RoomSummary, meal: Meal) => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const meals: Meal[] = summaries.some((s) => s.meals.some((m) => m.meal === 'dinner')) ? ['lunch', 'dinner'] : ['lunch'];
  return (
    <section aria-labelledby="today-label" className="card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12, flexShrink: 0 }}>
      <h2 id="today-label" className="section-label" style={{ margin: 0 }}>
        {t('Today')}
      </h2>
      {meals.map((meal) => {
        const rows = summaries.flatMap((s) => s.meals.filter((m) => m.meal === meal).map((m) => ({ s, st: m.status })));
        const going = rows.filter((r) => r.st.kind !== 'out');
        const clash = going.length > 1;
        return (
          <div key={meal} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 800 }}>{meal === 'dinner' ? t('Dinner') : t('Lunch')}</span>
            {going.length === 0 ? (
              <span style={{ fontSize: 14, color: 'var(--muted)' }}>{t('You’re out everywhere.')}</span>
            ) : (
              going.map(({ s, st }) => (
                <div key={s.room.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                  <span style={{ flexGrow: 1, minWidth: 0, lineHeight: 1.4 }}>
                    {tNodes('{room}: {what}', { room: <b>{roomTitle(s.room)}</b>, what: mealLine(st) })}
                  </span>
                  {clash && (
                    <button
                      type="button"
                      className="btn btn--secondary press"
                      disabled={busy !== null}
                      onClick={async () => {
                        setBusy(`${s.room.id}:${meal}`);
                        try {
                          await onSkip(s, meal);
                        } finally {
                          setBusy(null);
                        }
                      }}
                      aria-label={t('Skip {meal} in {room}', { meal: meal === 'dinner' ? t('Dinner') : t('Lunch'), room: roomTitle(s.room) })}
                      style={{ height: 34, padding: '0 12px', fontSize: 13, flexShrink: 0 }}
                    >
                      {busy === `${s.room.id}:${meal}` ? t('Saving…') : t('Skip')}
                    </button>
                  )}
                </div>
              ))
            )}
            {clash && (
              <span style={{ fontSize: 12, color: 'var(--accent-text)', fontWeight: 600 }}>
                {t('You’re down for this in {n} rooms. Skip the ones you’re not going to.', { n: going.length })}
              </span>
            )}
          </div>
        );
      })}
    </section>
  );
}

/** What you owe and are owed in every room, with DuitNow to copy and Mark paid right here. */
export function MoneyCard({
  summaries,
  onPaid,
  onToast,
}: {
  summaries: RoomSummary[];
  onPaid: (s: RoomSummary, p: { from_member: string; to_member: string; amount_cents: number }) => Promise<void>;
  onToast: (m: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const owe = summaries.flatMap((s) => s.debts.filter((p) => p.from_member === s.meId).map((p) => ({ s, p })));
  const owed = summaries.flatMap((s) => s.debts.filter((p) => p.to_member === s.meId).map((p) => ({ s, p })));
  const oweTotal = owe.reduce((n, x) => n + x.p.amount_cents, 0);
  const owedTotal = owed.reduce((n, x) => n + x.p.amount_cents, 0);
  useEffect(() => {
    if (!owe.length && !owed.length) setOpen(false);
  }, [owe.length, owed.length]);
  if (!owe.length && !owed.length) return null;
  const rooms = new Set([...owe, ...owed].map((x) => x.s.room.id)).size;
  const who = (s: RoomSummary, id: string) => s.members.find((m) => m.id === id);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onToast(t('Copied {text}', { text }));
    } catch {
      onToast(t("Couldn't copy. {text}", { text }));
    }
  };

  return (
    <section aria-labelledby="money-label" className="card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 0, border: 'none', background: 'none', color: 'inherit', textAlign: 'left', minHeight: 44 }}
      >
        <span style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span id="money-label" className="section-label">
            {rooms === 1 ? t('Money · {n} room', { n: rooms }) : t('Money · {n} rooms', { n: rooms })}
          </span>
          <span style={{ fontSize: 16, fontWeight: 800 }}>
            {oweTotal > 0 && <span style={{ color: 'var(--accent-text)' }}>{t('You owe {amount}', { amount: formatRM(oweTotal) })}</span>}
            {oweTotal > 0 && owedTotal > 0 && ' · '}
            {owedTotal > 0 && t("You're owed {amount}", { amount: formatRM(owedTotal) })}
          </span>
        </span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: 'var(--muted)' }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 10, borderTop: '1px solid var(--divider)' }}>
          {[...owe, ...owed].map(({ s, p }) => {
            const iOwe = p.from_member === s.meId;
            const other = who(s, iOwe ? p.to_member : p.from_member);
            const key = `${s.room.id}:${p.from_member}>${p.to_member}`;
            return (
              <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>{roomTitle(s.room)}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ flexGrow: 1, fontSize: 15 }}>
                    {iOwe
                      ? tNodes('You owe {name} {amount}', { name: <b>{other?.name ?? t('Someone')}</b>, amount: formatRM(p.amount_cents) })
                      : tNodes('{name} owes you {amount}', { name: <b>{other?.name ?? t('Someone')}</b>, amount: formatRM(p.amount_cents) })}
                  </span>
                  <button
                    type="button"
                    className="btn btn--secondary press"
                    disabled={busy !== null}
                    onClick={async () => {
                      setBusy(key);
                      try {
                        await onPaid(s, p);
                      } finally {
                        setBusy(null);
                      }
                    }}
                    style={{ height: 34, padding: '0 12px', fontSize: 13, flexShrink: 0 }}
                  >
                    {busy === key ? t('Saving…') : t('Mark paid')}
                  </button>
                </div>
                {iOwe && (other?.pay_duitnow || other?.pay_bank) && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {other.pay_duitnow && (
                      <button type="button" className="chip press" onClick={() => void copy(other.pay_duitnow!)} style={{ height: 32, padding: '0 10px', fontSize: 12 }}>
                        {t('Copy DuitNow {value}', { value: other.pay_duitnow })}
                      </button>
                    )}
                    {other.pay_bank && (
                      <button type="button" className="chip press" onClick={() => void copy(other.pay_bank!)} style={{ height: 32, padding: '0 10px', fontSize: 12 }}>
                        {t('Copy bank {value}', { value: other.pay_bank })}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** Long-press or ⋯ on a room: pin, mute, invite, out today, leave. */
export function RoomActionsSheet({
  summary,
  pinned,
  notified,
  onPin,
  onNotify,
  onInvite,
  onOut,
  onLeave,
  onClose,
}: {
  summary: RoomSummary;
  pinned: boolean;
  /** true: gets notifications; false: muted; null: notifications aren't on for this phone. */
  notified: boolean | null;
  onPin: () => void;
  onNotify: (on: boolean) => Promise<void>;
  onInvite: () => Promise<void>;
  onOut: (out: boolean) => Promise<void>;
  onLeave: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const isOut = summary.status.kind === 'out';
  const mealName = summary.meal === 'dinner' ? t('Dinner') : t('Lunch');
  const act = (fn: () => Promise<void>) => async () => {
    setBusy(true);
    try {
      await fn();
      onClose();
    } finally {
      setBusy(false);
    }
  };
  const item = (label: string, onClick: () => void, danger = false) => (
    <button type="button" className="row press" disabled={busy} onClick={onClick} style={{ minHeight: 52, fontSize: 16, fontWeight: 600, color: danger ? 'var(--danger)' : 'var(--ink)' }}>
      {label}
    </button>
  );

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="room-actions-title" onClick={(e) => e.stopPropagation()}>
        <div aria-hidden="true" style={{ width: 40, height: 5, borderRadius: 999, background: 'var(--border-strong)', alignSelf: 'center' }} />
        <h2 id="room-actions-title" className="title title--sm" style={{ fontSize: 22 }}>
          {roomTitle(summary.room)}
        </h2>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: 'none' }}>
          {item(pinned ? t('Unpin') : t('Pin to top'), () => {
            onPin();
            onClose();
          })}
          {item(notified === true ? t('Mute notifications') : notified === false ? t('Unmute notifications') : t('Turn on notifications'), act(() => onNotify(notified !== true)))}
          {item(t('Share invite'), act(onInvite))}
          {item(isOut ? t("I'm in for {meal} after all", { meal: mealName.toLowerCase() }) : t("I'm out for {meal} today", { meal: mealName.toLowerCase() }), act(() => onOut(!isOut)))}
          {confirmLeave
            ? item(t('Tap again to leave {room}', { room: roomTitle(summary.room) }), act(onLeave), true)
            : item(t('Leave room'), () => setConfirmLeave(true), true)}
        </div>
        <button type="button" className="btn btn--secondary press" onClick={onClose} style={{ height: 48 }}>
          {t('Cancel')}
        </button>
      </div>
    </div>
  );
}
