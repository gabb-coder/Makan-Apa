import { shortDate } from '../lib/dates';
import { useEffect, useState } from 'react';
import { locale, t } from '../lib/i18n';
import { meetupIcs, openIcs } from '../lib/ics';
import { formatRM } from '../lib/money';
import { roomTitle } from '../lib/session';
import type { EventRow, MemberRow, RoomRow, Rsvp } from '../lib/supabase';
import type { EventsApi } from '../lib/useEvents';
import type { RoomExtras } from '../lib/useRoomExtras';
import { zonedTime } from '../lib/vote';
import { BillSheet } from './Bills';
import { Lifts } from './Lifts';

const RSVPS: { key: Rsvp; label: () => string }[] = [
  { key: 'yes', label: () => t('Going') },
  { key: 'maybe', label: () => t('Maybe') },
  { key: 'no', label: () => t('Can’t') },
];

function whenText(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat(locale(), { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone }).format(new Date(iso));
}

/** Upcoming events on Today: a line each with your answer, and "Plan an event". */
export function EventsCard({ room, me, members, api, extras, onToast }: { room: RoomRow; me: MemberRow; members: MemberRow[]; api: EventsApi; extras: RoomExtras; onToast: (m: string) => void }) {
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const now = Date.now();
  // Upcoming, plus ones from the last two weeks that still have no bill.
  const shown = (api.events ?? []).filter((e) => Date.parse(e.starts_at) > now - 6 * 3600_000 || !extras.bills.some((b) => b.day_entry_id === e.id && b.event));
  const open = (api.events ?? []).find((e) => e.id === openId) ?? null;
  const going = (id: string) => api.rsvps.filter((r) => r.event_id === id && r.status === 'yes').length;
  const mine = (id: string) => api.rsvps.find((r) => r.event_id === id && r.member_id === me.id)?.status;

  return (
    <section aria-labelledby="events-label" className="card fade-up" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
      <h2 id="events-label" className="section-label" style={{ margin: 0 }}>
        {t('Events')}
      </h2>
      {shown.map((e) => (
        <button
          key={e.id}
          type="button"
          className="press"
          onClick={() => setOpenId(e.id)}
          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', border: 'none', borderTop: '1px solid var(--divider)', background: 'none', color: 'var(--ink)', textAlign: 'left' }}
        >
          <span aria-hidden="true" style={{ fontSize: 24 }}>
            🎉
          </span>
          <span style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 15, fontWeight: 800, overflowWrap: 'anywhere' }}>{e.title}</span>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>
              {whenText(e.starts_at, room.timezone)}
              {e.place && ` · ${e.place}`} · {t('{n} going', { n: going(e.id) })}
            </span>
          </span>
          <span className="badge" style={{ background: mine(e.id) === 'yes' ? 'var(--accent-tint)' : 'var(--bar-track)', color: mine(e.id) === 'yes' ? 'var(--accent-ink)' : 'var(--ink-2)', flexShrink: 0 }}>
            {mine(e.id) ? RSVPS.find((r) => r.key === mine(e.id))!.label() : t('Answer')}
          </span>
        </button>
      ))}
      <button type="button" className="btn btn--secondary press" onClick={() => setCreating(true)} style={{ height: 44 }}>
        {t('🎉 Plan an event')}
      </button>
      {creating && (
        <NewEventSheet
          room={room}
          onClose={() => setCreating(false)}
          onCreate={async (draft) => {
            const ev = await api.create(draft);
            setCreating(false);
            setOpenId(ev.id);
            onToast(t('{title} is on. Everyone’s been told.', { title: ev.title }));
          }}
        />
      )}
      {open && <EventSheet event={open} room={room} me={me} members={members} api={api} extras={extras} onToast={onToast} onClose={() => setOpenId(null)} />}
    </section>
  );
}

function NewEventSheet({ room, onClose, onCreate }: { room: RoomRow; onClose: () => void; onCreate: (e: Pick<EventRow, 'title' | 'starts_at' | 'place' | 'note'>) => Promise<void> }) {
  const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: room.timezone }).format(new Date(Date.now() + 86_400_000));
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(tomorrow);
  const [time, setTime] = useState('19:00');
  const [place, setPlace] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-event-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim() || !date || !time) return;
          setBusy(true);
          setError(null);
          try {
            await onCreate({ title, starts_at: zonedTime(date, time, room.timezone), place: place.trim() || null, note: note.trim() || null });
          } catch (err) {
            setError(err instanceof Error ? err.message : t('Something went wrong. Try again.'));
            setBusy(false);
          }
        }}
      >
        <h2 id="new-event-title" className="title title--sm" style={{ fontSize: 22 }}>
          {t('Plan an event')}
        </h2>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="field-label">{t('What’s happening?')}</span>
          <input id="event-title" className="input" maxLength={60} placeholder={t('e.g. Wei’s birthday dinner')} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 3, minWidth: 0 }}>
            <span className="field-label">{t('Date')}</span>
            <input id="event-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 2, minWidth: 0 }}>
            <span className="field-label">{t('Time')}</span>
            <input id="event-time" type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="field-label">
            {t('Where')} <span style={{ fontWeight: 500, color: 'var(--muted)' }}>{t('(optional)')}</span>
          </span>
          <input id="event-place" className="input" maxLength={80} placeholder={t('e.g. Sunway Pyramid')} value={place} onChange={(e) => setPlace(e.target.value)} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="field-label">
            {t('Note')} <span style={{ fontWeight: 500, color: 'var(--muted)' }}>{t('(optional)')}</span>
          </span>
          <input className="input" maxLength={300} placeholder={t('e.g. Bring RM20 for the cake')} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        {error && (
          <p role="alert" style={{ margin: 0, color: 'var(--danger)', fontSize: 14 }}>
            {error}
          </p>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn--secondary press" onClick={onClose} style={{ flex: 1 }}>
            {t('Cancel')}
          </button>
          <button type="submit" className="btn btn--primary press" disabled={busy || !title.trim()} style={{ flex: 2 }}>
            {t('Plan it')}
          </button>
        </div>
      </form>
    </div>
  );
}

/** One event: RSVP, who's coming, add to calendar, split its bill, cancel. */
function EventSheet({
  event,
  room,
  me,
  members,
  api,
  extras,
  onToast,
  onClose,
}: {
  event: EventRow;
  room: RoomRow;
  me: MemberRow;
  members: MemberRow[];
  api: EventsApi;
  extras: RoomExtras;
  onToast: (m: string) => void;
  onClose: () => void;
}) {
  const [billOpen, setBillOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const answers = api.rsvps.filter((r) => r.event_id === event.id);
  const mine = answers.find((r) => r.member_id === me.id)?.status;
  const nameOf = (id: string) => (id === me.id ? t('You') : (members.find((m) => m.id === id)?.name ?? t('Someone')));
  const listFor = (s: Rsvp) => answers.filter((r) => r.status === s).map((r) => nameOf(r.member_id));
  const bill = extras.bills.find((b) => b.day_entry_id === event.id && b.event);
  const going = new Set(answers.filter((r) => r.status !== 'no').map((r) => r.member_id));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !billOpen && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, billOpen]);
  const run = (fn: () => Promise<void>) => fn().catch((e: unknown) => onToast(e instanceof Error ? e.message : t('Something went wrong. Try again.')));

  return (
    <>
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="event-sheet-title" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="eyebrow">{roomTitle(room)}</span>
          <h2 id="event-sheet-title" className="title title--sm" style={{ fontSize: 24, overflowWrap: 'anywhere' }}>
            🎉 {event.title}
          </h2>
          <span style={{ fontSize: 15, fontWeight: 700 }}>
            {whenText(event.starts_at, room.timezone)}
            {event.place && ` · ${event.place}`}
          </span>
          {event.note && <span style={{ fontSize: 14, color: 'var(--ink-2)', overflowWrap: 'anywhere' }}>{event.note}</span>}
        </div>
        <div className="segmented" role="group" aria-label={t('Are you coming?')} style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          {RSVPS.map((r) => (
            <button key={r.key} type="button" aria-pressed={mine === r.key} onClick={() => run(() => api.rsvp(event.id, r.key))}>
              {r.label()}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14 }}>
          {(['yes', 'maybe', 'no'] as const).map((s) => {
            const who = listFor(s);
            if (!who.length) return null;
            return (
              <span key={s}>
                <b>{RSVPS.find((r) => r.key === s)!.label()}:</b> {who.join(', ')}
              </span>
            );
          })}
          {answers.length === 0 && <span style={{ color: 'var(--muted)' }}>{t('Nobody’s answered yet.')}</span>}
        </div>
        <Lifts roomId={room.id} me={me} members={members} trip={{ eventId: event.id }} onError={onToast} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button
            type="button"
            className="btn btn--secondary press"
            onClick={() => openIcs(meetupIcs({ uid: `event-${event.id}`, title: event.title, start: event.starts_at, minutes: 120, place: event.place, description: event.note ?? t('Planned on Makan apa?') }), 'makan-apa-event.ics')}
          >
            {t('Add to calendar')}
          </button>
          <button type="button" className="btn btn--secondary press" onClick={() => setBillOpen(true)}>
            {bill ? t('Bill: {amount}', { amount: formatRM(bill.amount_cents) }) : t('Split the bill')}
          </button>
        </div>
        {(event.created_by === me.id || !event.created_by) && (
          <button
            type="button"
            className="btn btn--danger press"
            data-armed={confirmCancel}
            onClick={() => {
              if (!confirmCancel) return setConfirmCancel(true);
              run(async () => {
                await api.remove(event.id);
                onToast(t('{title} cancelled.', { title: event.title }));
                onClose();
              });
            }}
          >
            {confirmCancel ? (bill ? t('Tap again: the event and its bill go') : t('Tap again to cancel the event')) : t('Cancel event')}
          </button>
        )}
        <button type="button" className="btn btn--primary press" onClick={onClose}>
          {t('Done')}
        </button>
      </div>
    </div>
      {billOpen && (
        <BillSheet
          dayEntryId={event.id}
          foodName={event.title}
          when={shortDate(new Date(event.starts_at))}
          forEvent
          members={members}
          meId={me.id}
          extras={extras}
          away={new Set(members.filter((m) => going.size > 0 && !going.has(m.id)).map((m) => m.id))}
          kittyKeeper={room.kitty_keeper}
          onSaved={(removed) => onToast(removed ? t('Bill removed.') : t('Bill saved. See who owes what in Bills.'))}
          onClose={() => setBillOpen(false)}
        />
      )}
    </>
  );
}
