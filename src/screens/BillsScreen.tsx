import { useMemo, useState } from 'react';
import { BillSheet, PayDetailsCard, SettleUpCard } from '../components/Bills';
import { KittyCard } from '../components/Kitty';
import { entryFood, type Food } from '../lib/foods';
import { t } from '../lib/i18n';
import { formatRM, shares } from '../lib/money';
import { dayMonthLabel } from '../lib/rotation';
import { roomTitle } from '../lib/session';
import type { DayEntryRow, MemberRow, RoomRow } from '../lib/supabase';
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
  const [open, setOpen] = useState<{ id: string; food: string; away: ReadonlySet<string>; guests: { hostId: string; count: number }[] } | null>(null);
  const [shown, setShown] = useState(PAGE);
  const foodsById = useMemo(() => new Map(foods.map((f) => [f.id, f])), [foods]);
  const nameOf = (id: string) => (id === me.id ? t('You') : (members.find((m) => m.id === id)?.name ?? t('Someone')));

  // Decided meals, newest first (dinner before lunch on the same day).
  const meals = entries
    .filter((e) => e.status === 'accepted')
    .sort((a, b) => b.entry_date.localeCompare(a.entry_date) || (b.meal ?? 'lunch').localeCompare(a.meal ?? 'lunch'));

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
          roomName={roomTitle(room)}
          bills={extras.bills}
          settlements={extras.settlements}
          members={members}
          meId={me.id}
          onRecord={async (p) => {
            await extras.recordPayment(p);
            onToast(t('Payment recorded.'));
          }}
          onUndo={extras.removePayment}
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
              const food = entryFood(e, foodsById)?.name ?? t('A deleted food');
              const bill = extras.bills.find((b) => b.day_entry_id === e.id);
              const myShare = bill ? shares(bill).get(me.id) : undefined;
              const when = room.meals === 'both' ? `${dayMonthLabel(e.entry_date)} · ${(e.meal ?? 'lunch') === 'dinner' ? t('Dinner') : t('Lunch')}` : dayMonthLabel(e.entry_date);
              return (
                <button
                  key={e.id}
                  type="button"
                  className="press"
                  onClick={() => setOpen({ id: e.id, food, away: attendance.awayOn(e.entry_date, e.meal ?? 'lunch'), guests: attendance.guestsOn(e.entry_date, e.meal ?? 'lunch') })}
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

      {open && (
        <BillSheet dayEntryId={open.id} foodName={open.food} members={members} meId={me.id} extras={extras} away={open.away} guests={open.guests} kittyKeeper={room.kitty_keeper} onSaved={(removed) => onToast(removed ? t('Bill removed.') : t('Bill saved.'))} onClose={() => setOpen(null)} />
      )}
    </main>
  );
}
