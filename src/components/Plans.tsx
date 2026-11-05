import { meetupIcs, openIcs } from '../lib/ics';
import { useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../lib/i18n';
import { addDays, dayMonthLabel } from '../lib/rotation';
import type { Attendance, Meal, MemberRow, VoteRow } from '../lib/supabase';
import { clockTime, tally, zonedTime } from '../lib/vote';
import { Avatar } from './Avatar';

const CLOSE_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

/** Re-render every `ms`, for countdowns. */
function useNow(ms: number): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

/** The next quarter hour at least 15 minutes away, as HH:MM in the room's time. */
function soonest(timeZone: string): string {
  const at = Date.now() + 15 * 60_000;
  const [h, m] = clockTime(new Date(at).toISOString(), timeZone).split(':').map(Number);
  const q = Math.ceil(m / 15) * 15;
  const hh = (h + Math.floor(q / 60)) % 24;
  return `${String(hh).padStart(2, '0')}:${String(q % 60).padStart(2, '0')}`;
}

function untilText(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min > 59) return t('in {h}h {m}m', { h: Math.floor(min / 60), m: min % 60 });
  if (min > 0) return t('in {n} min', { n: min });
  if (min > -5) return t('now');
  return t('{n} min ago', { n: -min });
}

/**
 * Once decided: when you're heading out and where to meet. Anyone can set it; everyone gets a
 * "leaving soon" alert, and anyone running late can say so.
 */
export function MeetupCard({
  meetAt,
  place,
  today,
  timeZone,
  places,
  late,
  myStatus,
  onSave,
  onLate,
  calendar,
  warning,
  extra,
  waitingOn,
}: {
  /** Only someone else can set it (a mystery's decider): their name, and no editing here. */
  waitingOn?: string;
  /** Shown under a set meet-up, e.g. lifts. */
  extra?: React.ReactNode;
  /** E.g. the meet-up place looks closed at that time. */
  warning?: string | null;
  /** For "Add to calendar": the event's id, title and notes. */
  calendar?: { uid: string; title: string; description?: string };
  meetAt: string | null;
  place: string | null;
  today: string;
  timeZone: string;
  /** Suggestions for where to meet. */
  places: string[];
  /** Who's said they're running late. */
  late: MemberRow[];
  myStatus: Attendance;
  onSave: (meetAt: string | null, place: string | null) => Promise<void>;
  onLate: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(!meetAt && !waitingOn);
  const [time, setTime] = useState(() => (meetAt ? clockTime(meetAt, timeZone) : soonest(timeZone)));
  const [where, setWhere] = useState(place ?? '');
  const [busy, setBusy] = useState(false);
  const now = useNow(30_000);
  useEffect(() => {
    setEditing(!meetAt && !waitingOn);
    if (meetAt) setTime(clockTime(meetAt, timeZone));
    setWhere(place ?? '');
  }, [meetAt, place, timeZone]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  if (!meetAt && waitingOn) {
    return (
      <section aria-labelledby="meet-label" className="card fade-up" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
        <h2 id="meet-label" className="section-label" style={{ margin: 0 }}>
          {t('Meet-up')}
        </h2>
        <span style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.45 }}>{t('{name} will say when and where to meet.', { name: waitingOn })}</span>
      </section>
    );
  }

  if (editing) {
    return (
      <section aria-labelledby="meet-label" className="card fade-up" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
        <h2 id="meet-label" className="section-label" style={{ margin: 0 }}>
          {t('Heading out together?')}
        </h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 148, flexShrink: 0 }}>
            <span className="field-label">{t('Leaving at')}</span>
            <input type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} style={{ height: 44, padding: '0 10px' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flexGrow: 1, minWidth: 0 }}>
            <span className="field-label">{t('Meet at')}</span>
            <input className="input" maxLength={60} placeholder={t('e.g. the lobby')} value={where} onChange={(e) => setWhere(e.target.value)} style={{ height: 44 }} />
          </label>
        </div>
        {places.length > 0 && (
          <div className="chip-row" style={{ flexWrap: 'wrap', margin: 0, padding: 0 }}>
            {places.slice(0, 4).map((p) => (
              <button key={p} type="button" className="chip press" aria-pressed={where === p} onClick={() => setWhere(p)} style={{ height: 34, padding: '0 12px', fontSize: 13 }}>
                {p}
              </button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          {meetAt && (
            <button type="button" className="btn btn--secondary press" disabled={busy} onClick={() => setEditing(false)} style={{ flex: 1, height: 44 }}>
              {t('Cancel')}
            </button>
          )}
          <button
            type="button"
            className="btn btn--primary press"
            disabled={busy || !time}
            onClick={() => run(() => onSave(zonedTime(today, time, timeZone), where))}
            style={{ flex: 2, height: 44 }}
          >
            {t('Set meet-up')}
          </button>
        </div>
      </section>
    );
  }

  const ms = Date.parse(meetAt!) - now;
  return (
    <section aria-labelledby="meet-label" className="card fade-up" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <h2 id="meet-label" className="section-label" style={{ margin: 0 }}>
          {t('Meet-up')}
        </h2>
        <span style={{ fontSize: 13, fontWeight: 700, color: ms > 0 && ms < 15 * 60_000 ? 'var(--accent-text)' : 'var(--muted)' }}>{untilText(ms)}</span>
      </div>
      <span style={{ fontSize: 20, fontWeight: 800 }}>
        {place ? t('Leaving {time} · {place}', { time: clockTime(meetAt!, timeZone), place }) : t('Leaving {time}', { time: clockTime(meetAt!, timeZone) })}
      </span>
      {warning && (
        <span role="status" style={{ fontSize: 13, fontWeight: 700, color: 'var(--danger)', lineHeight: 1.45 }}>
          {warning}
        </span>
      )}
      {late.length > 0 && (
        <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
          {late.length === 1 ? t('{names} is running late', { names: late[0].name }) : t('{names} are running late', { names: late.map((m) => m.name).join(', ') })}
        </span>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        {myStatus !== 'late' && myStatus !== 'out' && (
          <button type="button" className="btn btn--secondary press" disabled={busy} onClick={() => run(onLate)} style={{ flex: 1, height: 40, fontSize: 14 }}>
            {t('I’m running late')}
          </button>
        )}
        {!waitingOn && (
          <button type="button" className="btn btn--secondary press" disabled={busy} onClick={() => setEditing(true)} style={{ flex: 1, height: 40, fontSize: 14 }}>
            {t('Change')}
          </button>
        )}
      </div>
      {calendar && ms > 0 && (
        <button
          type="button"
          className="press"
          onClick={() => openIcs(meetupIcs({ ...calendar, start: meetAt!, place }))}
          style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6, minHeight: 40, padding: 0, border: 'none', background: 'none', fontSize: 14, fontWeight: 700, color: 'var(--accent-text)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4" />
          </svg>
          {t('Add to calendar')}
        </button>
      )}
      {extra}
    </section>
  );
}

/** A quick vote in progress: tap an option; it settles when everyone's in or time's up. */
export function VoteCard({
  options,
  votes,
  voters,
  me,
  isDecider,
  endsAt,
  onVote,
  onSettle,
  onCancel,
  onError,
}: {
  options: string[];
  votes: VoteRow[];
  /** People who are in today: they're the ones voting. */
  voters: MemberRow[];
  me: MemberRow;
  isDecider: boolean;
  endsAt: string | null;
  onVote: (choice: number) => Promise<void>;
  onSettle: (winner: string) => Promise<unknown>;
  onCancel: () => Promise<void>;
  onError: (m: string) => void;
}) {
  const now = useNow(1000);
  const ids = voters.map((m) => m.id);
  const r = tally(options, votes, ids, endsAt, now);
  const mine = votes.find((v) => v.member_id === me.id)?.choice ?? null;
  const settled = useRef(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  useEffect(() => {
    if (!r.over || settled.current) return;
    settled.current = true;
    // Nobody voted: nothing to settle, so it goes back to the decider rather than to option 1.
    (r.voted === 0 ? onCancel() : onSettle(options[r.winner])).catch((e: unknown) => {
      settled.current = false;
      onError(e instanceof Error ? e.message : String(e));
    });
  }, [r.over, r.winner]);
  const left = endsAt ? Math.max(0, Date.parse(endsAt) - now) : 0;
  const mm = Math.floor(left / 60_000);
  const ss = String(Math.floor((left % 60_000) / 1000)).padStart(2, '0');

  return (
    <section aria-labelledby="vote-label" className="card fade-up" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <h2 id="vote-label" className="title title--sm" style={{ fontSize: 22, margin: 0 }}>
          {t('Quick vote')}
        </h2>
        <span role="timer" aria-live="off" style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent-text)', fontVariantNumeric: 'tabular-nums' }}>
          {r.over ? t('Done') : `${mm}:${ss}`}
        </span>
      </div>
      <span style={{ fontSize: 13, color: 'var(--muted)' }}>{t('{n} of {total} voted. Ties go to the first option; if nobody votes, it goes back to the decider.', { n: r.voted, total: ids.length })}</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {options.map((o, i) => {
          const who = voters.filter((m) => votes.some((v) => v.member_id === m.id && v.choice === i));
          const share = ids.length ? (r.counts[i] / ids.length) * 100 : 0;
          return (
            <button
              key={o}
              type="button"
              className="press"
              aria-pressed={mine === i}
              disabled={r.over}
              onClick={() => onVote(i).catch((e: unknown) => onError(e instanceof Error ? e.message : String(e)))}
              style={{
                position: 'relative',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                minHeight: 52,
                padding: '0 14px',
                borderRadius: 14,
                border: `2px solid ${mine === i ? 'var(--accent)' : 'var(--border)'}`,
                background: 'var(--surface)',
                color: 'var(--ink)',
                textAlign: 'left',
              }}
            >
              <span aria-hidden="true" style={{ position: 'absolute', inset: 0, width: `${share}%`, background: 'var(--accent-tint)', transition: 'width 0.4s ease' }} />
              <span style={{ position: 'relative', flexGrow: 1, fontSize: 16, fontWeight: 700 }}>{o}</span>
              <span aria-hidden="true" style={{ position: 'relative', display: 'flex' }}>
                {who.slice(0, 4).map((m, k) => (
                  <span key={m.id} style={{ marginLeft: k ? -6 : 0 }}>
                    <Avatar name={m.name} color={m.color} size={22} style={{ boxShadow: '0 0 0 2px var(--surface)' }} />
                  </span>
                ))}
              </span>
              <span style={{ position: 'relative', fontSize: 15, fontWeight: 800, minWidth: 18, textAlign: 'right' }}>{r.counts[i]}</span>
            </button>
          );
        })}
      </div>
      {isDecider && !r.over && (
        <button
          type="button"
          className="press"
          onClick={() => {
            if (!confirmCancel) return setConfirmCancel(true);
            onCancel().catch((e: unknown) => onError(e instanceof Error ? e.message : String(e)));
          }}
          style={{ minHeight: 40, border: 'none', background: 'none', color: confirmCancel ? 'var(--danger)' : 'var(--muted)', fontSize: 14, fontWeight: confirmCancel ? 700 : 600 }}
        >
          {confirmCancel ? t('Tap again to call off the vote') : t('Call off the vote')}
        </button>
      )}
    </section>
  );
}

/** The decider picks 2–3 options and how long the vote lasts. */
export function VoteSheet({ foods, onStart, onClose }: { foods: string[]; onStart: (options: string[], minutes: number) => Promise<void>; onClose: () => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [minutes, setMinutes] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const shuffle = () => {
    const pool = [...foods].sort(() => Math.random() - 0.5);
    setPicked(pool.slice(0, Math.min(3, pool.length)));
  };
  const toggle = (f: string) => setPicked((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : cur.length >= 3 ? cur : [...cur, f]));

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="vote-sheet-title" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '90dvh', overflowY: 'auto' }}>
        <div aria-hidden="true" style={{ width: 40, height: 5, borderRadius: 999, background: 'var(--border-strong)', alignSelf: 'center', flexShrink: 0 }} />
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <h2 id="vote-sheet-title" className="title title--sm" style={{ fontSize: 24 }}>
            {t('Put it to a vote')}
          </h2>
          <button type="button" className="icon-btn press" aria-label={t('Close')} onClick={onClose}>
            {CLOSE_ICON}
          </button>
        </header>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-2)' }}>{t('Pick 2 or 3 options. Everyone taps one; the most votes wins.')}</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="field-label">{t('{n} of 3 picked', { n: picked.length })}</span>
          <button type="button" onClick={shuffle} style={{ minHeight: 36, border: 'none', background: 'none', color: 'var(--accent-text)', fontWeight: 700, fontSize: 14 }}>
            {t('Pick 3 for me')}
          </button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {foods.map((f) => (
            <button key={f} type="button" className="chip press" aria-pressed={picked.includes(f)} onClick={() => toggle(f)} disabled={!picked.includes(f) && picked.length >= 3}>
              {f}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span id="vote-mins" className="field-label">{t('Voting closes in')}</span>
          <div className="segmented" role="group" aria-labelledby="vote-mins" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            {[5, 10, 15].map((n) => (
              <button key={n} type="button" aria-pressed={minutes === n} onClick={() => setMinutes(n)}>
                {t('{n} min', { n })}
              </button>
            ))}
          </div>
        </div>
        {error && (
          <p role="alert" style={{ margin: 0, fontSize: 14, color: 'var(--danger)' }}>
            {error}
          </p>
        )}
        <button
          type="button"
          className="btn btn--primary press"
          disabled={busy || picked.length < 2}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await onStart(picked, minutes);
              onClose();
            } catch (e) {
              setError(e instanceof Error ? e.message : t('Could not save.'));
              setBusy(false);
            }
          }}
          style={{ height: 52, flexShrink: 0 }}
        >
          {t('Start the vote')}
        </button>
      </div>
    </div>
  );
}

/** The next two weeks: say which days you're out ahead of time (leave, exams, holidays). */
export function PlanAheadSheet({
  today,
  meals,
  statusOf,
  onSet,
  onClose,
}: {
  today: string;
  meals: Meal[];
  statusOf: (date: string, meal: Meal) => Attendance;
  onSet: (date: string, meal: Meal, status: Attendance) => Promise<void>;
  onClose: () => void;
}) {
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(today, i)), [today]);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="plan-title" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '90dvh', overflowY: 'auto' }}>
        <div aria-hidden="true" style={{ width: 40, height: 5, borderRadius: 999, background: 'var(--border-strong)', alignSelf: 'center', flexShrink: 0 }} />
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <h2 id="plan-title" className="title title--sm" style={{ fontSize: 24 }}>
            {t('Plan ahead')}
          </h2>
          <button type="button" className="icon-btn press" aria-label={t('Close')} onClick={onClose}>
            {CLOSE_ICON}
          </button>
        </header>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-2)' }}>{t('Tap the days you’re away. You’re skipped as decider and left off bills those days.')}</p>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {days.map((d, i) => (
            <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 52, borderTop: i ? '1px solid var(--divider)' : 'none' }}>
              <span style={{ flexGrow: 1, fontSize: 15, fontWeight: 600 }}>{i === 0 ? t('Today') : i === 1 ? t('Tomorrow') : dayMonthLabel(d)}</span>
              {meals.map((meal) => {
                const out = statusOf(d, meal) === 'out';
                const key = `${d}:${meal}`;
                return (
                  <button
                    key={meal}
                    type="button"
                    className="chip press"
                    aria-pressed={out}
                    disabled={busy === key}
                    aria-label={t('{day} {meal}: {state}', { day: dayMonthLabel(d), meal: meal === 'dinner' ? t('Dinner') : t('Lunch'), state: out ? t('away') : t('in') })}
                    onClick={async () => {
                      setBusy(key);
                      try {
                        await onSet(d, meal, out ? 'in' : 'out');
                      } finally {
                        setBusy(null);
                      }
                    }}
                    style={{ height: 36, padding: '0 12px', fontSize: 13 }}
                  >
                    {meals.length > 1 ? `${meal === 'dinner' ? t('Dinner') : t('Lunch')}: ` : ''}
                    {out ? t('Away') : t('In')}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <button type="button" className="btn btn--primary press" onClick={onClose} style={{ height: 48, flexShrink: 0 }}>
          {t('Done')}
        </button>
      </div>
    </div>
  );
}
