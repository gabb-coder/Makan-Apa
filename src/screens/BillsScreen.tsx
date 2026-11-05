import { useEffect, useMemo, useState } from 'react';
import { BillSheet, PaidBackSheet, PayDetailsCard, SettleUpCard } from '../components/Bills';
import { PENDING_PAID_KEY, parsePaid } from '../lib/paidLink';
import { storage } from '../lib/storage';
import { KittyCard } from '../components/Kitty';
import { entryFood, type Food } from '../lib/foods';
import { t } from '../lib/i18n';
import { balances, formatRM, settleUp, shares } from '../lib/money';
import { dayMonthLabel } from '../lib/rotation';
import { roomTitle } from '../lib/session';
import { supabase, type DayEntryRow, type MealBillRow, type MemberRow, type RoomRow } from '../lib/supabase';
import { shortDate } from '../lib/dates';
import type { MemberPatch } from '../lib/useRoomData';
import { updateEverywhere } from '../lib/profile';
import type { RoomExtras } from '../lib/useRoomExtras';
import type { AttendanceApi } from '../lib/useAttendance';

interface Props {
  room: RoomRow;
  me: MemberRow;
  members: MemberRow[];
  entries: DayEntryRow[];
  /** Every food, archived included. */
  foods: Food[];
  extras: RoomExtras;
  updateMember: (id: string, patch: MemberPatch) => Promise<void>;
  onToast: (message: string) => void;
  /** Who was out for each meal, left off new bills. */
  attendance: AttendanceApi;
}

const PAGE = 10;

/** Who owes whom, the meals to add bills to, and how to pay you back. */
export function BillsScreen({ room, me, members, entries, foods, extras, updateMember, onToast, attendance }: Props) {
  const [open, setOpen] = useState<{ id: string; food: string; when: string; away: ReadonlySet<string>; guests: { hostId: string; count: number }[]; event?: boolean } | null>(null);
  // Event bills (a dinner out, a birthday) live here too, named after their event.
  const eventBills = extras.bills.filter((b) => b.event);
  const eventIds = eventBills.map((b) => b.day_entry_id).join(',');
  const [eventInfo, setEventInfo] = useState<Map<string, { title: string; starts_at: string }>>(new Map());
  useEffect(() => {
    if (!eventIds) return;
    void supabase
      .from('events')
      .select('id, title, starts_at')
      .in('id', eventIds.split(','))
      .then(({ data }) => data && setEventInfo(new Map((data as { id: string; title: string; starts_at: string }[]).map((e) => [e.id, e]))));
  }, [eventIds]);
  const [shown, setShown] = useState(PAGE);
  // "I've paid" on a payback nudge lands here, ready to mark it paid.
  const [paying, setPaying] = useState<{ to: MemberRow | null; cents: number | null } | null>(null);
  useEffect(() => {
    const p = parsePaid(storage.get(PENDING_PAID_KEY), room.id);
    storage.remove(PENDING_PAID_KEY);
    const to = p && members.find((m) => m.id === p.to);
    if (p && to && to.id !== me.id) setPaying({ to, cents: p.cents });
  }, []);
  // What I owe each person right now, for the payment sheet's hint.
  const owedTo = extras.bills.length
    ? new Map(settleUp(balances(extras.bills, extras.settlements)).filter((p) => p.from_member === me.id).map((p) => [p.to_member, p.amount_cents]))
    : null;
  const foodsById = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);
  const nameOf = (id: string) => (id === me.id ? t('You') : (members.find((m) => m.id === id)?.name ?? t('Someone')));

  // Decided meals, newest first (dinner before lunch on the same day).
  const meals = entries
    .filter((e) => e.status === 'accepted')
    .sort((a, b) => b.entry_date.localeCompare(a.entry_date) || (b.meal ?? 'lunch').localeCompare(a.meal ?? 'lunch'));
  const whenOf = (e: DayEntryRow) => (room.meals === 'both' ? `${dayMonthLabel(e.entry_date)} · ${(e.meal ?? 'lunch') === 'dinner' ? t('Dinner') : t('Lunch')}` : dayMonthLabel(e.entry_date));
  const foodOf = (e: DayEntryRow) => entryFood(e, foodsById)?.name ?? t('A deleted food');
  const entriesById = new Map(entries.map((e) => [e.id, e]));
  /** "Thu 5 Nov · Mamak", for the message to the group. */
  const labelOf = (bill: MealBillRow) => {
    if (bill.event) {
      const ev = eventInfo.get(bill.day_entry_id);
      return ev ? `${shortDate(new Date(ev.starts_at))} · ${ev.title}` : null;
    }
    const e = entriesById.get(bill.day_entry_id);
    return e ? `${whenOf(e)} · ${foodOf(e)}` : null;
  };

  return (
    <main className="screen" style={{ gap: 14 }}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span className="eyebrow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {roomTitle(room)}
        </span>
        <h1 className="title">{t('Bills')}</h1>
      </header>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
        <span className="section-label">{t('Settle up')}</span>
        <SettleUpCard
          labelOf={labelOf}
          bills={extras.bills}
          settlements={extras.settlements}
          members={members}
          meId={me.id}
          onRecord={async (p) => {
            await extras.recordPayment(p);
            onToast(t('Payment recorded.'));
          }}
          onUndo={extras.removePayment}
          onRecordOther={() => setPaying({ to: null, cents: null })}
          onToast={onToast}
        />
      </section>

      {(room.kitty_keeper || extras.topUps.length > 0) && (
        <section aria-labelledby="kitty-label" style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
          <h2 id="kitty-label" className="section-label" style={{ margin: 0 }}>
            {t('Group kitty')}
          </h2>
          <KittyCard room={room} me={me} members={members} extras={extras} onToast={onToast} />
        </section>
      )}

      <section style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
        <span className="section-label">{t('Meals')}</span>
        {meals.length === 0 ? (
          <div className="card" style={{ padding: 16, fontSize: 14, color: 'var(--ink-2)' }}>
            {t('Once a meal is decided, it shows up here so you can split its bill.')}
          </div>
        ) : (
          <div className="card" style={{ padding: '4px 0', display: 'flex', flexDirection: 'column' }}>
            {meals.slice(0, shown).map((e, i) => {
              const food = foodOf(e);
              const bill = extras.bills.find((b) => b.day_entry_id === e.id);
              // A treat costs you nothing, so there's no "yours" to show.
              const myShare = bill && !bill.treat ? shares(bill).get(me.id) : undefined;
              const when = whenOf(e);
              return (
                <button
                  key={e.id}
                  type="button"
                  className="press"
                  onClick={() => setOpen({ id: e.id, food, when, away: attendance.awayOn(e.entry_date, e.meal ?? 'lunch'), guests: attendance.guestsOn(e.entry_date, e.meal ?? 'lunch') })}
                  aria-label={bill ? t('{food}, {when}: edit bill', { food, when }) : t('{food}, {when}: add bill', { food, when })}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    minHeight: 60,
                    padding: '8px 16px',
                    border: 'none',
                    borderTop: i ? '1px solid var(--divider)' : 'none',
                    background: 'none',
                    textAlign: 'left',
                    color: 'var(--ink)',
                  }}
                >
                  <span style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{food}</span>
                    <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                      {when}
                      {bill && ` · ${bill.from_kitty ? t('from the kitty') : bill.treat ? t('{name} treated 🎉', { name: nameOf(bill.paid_by) }) : t('{name} paid', { name: nameOf(bill.paid_by) })}`}
                      {bill?.receipt_path && ` · ${t('receipt')}`}
                    </span>
                  </span>
                  {bill ? (
                    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                      <span style={{ fontSize: 15, fontWeight: 800 }}>{formatRM(bill.amount_cents)}</span>
                      {myShare !== undefined && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{t('yours {amount}', { amount: formatRM(myShare) })}</span>}
                    </span>
                  ) : (
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent-text)', flexShrink: 0 }}>{t('Add bill')}</span>
                  )}
                </button>
              );
            })}
            {meals.length > shown && (
              <button
                type="button"
                className="press"
                onClick={() => setShown((n) => n + PAGE)}
                style={{ minHeight: 48, border: 'none', borderTop: '1px solid var(--divider)', background: 'none', color: 'var(--accent-text)', fontWeight: 700, fontSize: 14 }}
              >
                {t('Show more')}
              </button>
            )}
          </div>
        )}
      </section>

      {eventBills.length > 0 && (
        <section aria-labelledby="event-bills-label" style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
          <h2 id="event-bills-label" className="section-label" style={{ margin: 0 }}>
            {t('Events')}
          </h2>
          <div className="card" style={{ padding: '4px 0', display: 'flex', flexDirection: 'column' }}>
            {eventBills.map((b, i) => {
              const ev = eventInfo.get(b.day_entry_id);
              const title = ev?.title ?? t('An event');
              const when = ev ? shortDate(new Date(ev.starts_at)) : '';
              const mine = !b.treat ? shares(b).get(me.id) : undefined;
              return (
                <button
                  key={b.day_entry_id}
                  type="button"
                  className="press"
                  onClick={() => setOpen({ id: b.day_entry_id, food: title, when, away: new Set(), guests: [], event: true })}
                  aria-label={t('{food}, {when}: edit bill', { food: title, when })}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 60, padding: '8px 16px', border: 'none', borderTop: i ? '1px solid var(--divider)' : 'none', background: 'none', textAlign: 'left', color: 'var(--ink)' }}
                >
                  <span style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🎉 {title}</span>
                    <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                      {when}
                      {` · ${b.from_kitty ? t('from the kitty') : b.treat ? t('{name} treated 🎉', { name: nameOf(b.paid_by) }) : t('{name} paid', { name: nameOf(b.paid_by) })}`}
                    </span>
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                    <span style={{ fontSize: 15, fontWeight: 800 }}>{formatRM(b.amount_cents)}</span>
                    {mine !== undefined && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{t('yours {amount}', { amount: formatRM(mine) })}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0, paddingBottom: 8 }}>
        <span className="section-label">{t('How kaki can pay you')}</span>
        <PayDetailsCard
          key={`${me.pay_duitnow}|${me.pay_bank}`}
          me={me}
          onSave={async (patch) => {
            // The same DuitNow for every room you're in.
            await updateEverywhere(patch);
            await updateMember(me.id, patch);
            onToast(t('Payment details saved in all your rooms.'));
          }}
        />
      </section>

      {paying && (
        <PaidBackSheet
          to={paying.to}
          members={members}
          meId={me.id}
          cents={paying.cents}
          owedTo={owedTo}
          onConfirm={async (toId, cents) => {
            await extras.recordPayment({ from_member: me.id, to_member: toId, amount_cents: cents });
            onToast(t('Payment recorded.'));
          }}
          onClose={() => setPaying(null)}
        />
      )}
      {open && (
        <BillSheet dayEntryId={open.id} forEvent={open.event} foodName={open.food} when={open.when} members={members} meId={me.id} extras={extras} away={open.away} guests={open.guests} kittyKeeper={room.kitty_keeper} onSaved={(removed) => onToast(removed ? t('Bill removed.') : t('Bill saved.'))} onClose={() => setOpen(null)} />
      )}
    </main>
  );
}
