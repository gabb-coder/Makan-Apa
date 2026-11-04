import { useCallback, useEffect, useRef, useState } from 'react';
import { locale, t } from '../lib/i18n';
import { formatRM } from '../lib/money';
import { loadRoomSummaries, type RoomSummary } from '../lib/roomSummaries';
import { knownRooms, knownRoomTitle, leaveRoom, roomTitle, type KnownRoom } from '../lib/session';
import { MoneyCard, RoomActionsSheet, TodayCard } from '../components/HomeCards';
import { RoomIcon } from '../components/RoomIcon';
import { shareInvite } from '../lib/invite';
import { disableReminders, notifiedMembers, notifyRoom } from '../lib/push';
import { storage } from '../lib/storage';
import { lastSeen, markSeen } from '../lib/seen';
import { loadYourMonth, type MonthSummary } from '../lib/yourMonth';
import { budgetState, firstTimeAt, monthlyBudget } from '../lib/budget';
import { usePhotoUrl } from '../components/MealSocial';
import { supabase, type Meal } from '../lib/supabase';

interface Props {
  onOpen: (roomId: string) => void;
  onNew: () => void;
  onJoin: () => void;
  onToast: (message: string) => void;
  /** After leaving the last room on this phone. */
  onNoRooms: () => void;
  /** You & this phone: food needs, DuitNow, language, notifications. */
  onProfile: () => void;
}

const PINNED_KEY = 'makan.pinnedRooms';
function loadPinned(): string[] {
  try {
    const list = JSON.parse(storage.get(PINNED_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Long press: open the room's actions instead of the room. */
function useLongPress(onLong: () => void, ms = 500) {
  const timer = useRef<number | undefined>(undefined);
  const fired = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const cancel = () => {
    window.clearTimeout(timer.current);
    start.current = null;
  };
  return {
    fired,
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        fired.current = false;
        start.current = { x: e.clientX, y: e.clientY };
        timer.current = window.setTimeout(() => {
          fired.current = true;
          navigator.vibrate?.(15);
          onLong();
        }, ms);
      },
      onPointerMove: (e: React.PointerEvent) => {
        if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) cancel();
      },
      onPointerUp: cancel,
      onPointerLeave: cancel,
      onPointerCancel: cancel,
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    },
  };
}


export function statusText(s: RoomSummary): string {
  const st = s.status;
  const text = (() => {
    switch (st.kind) {
      case 'your-turn':
        return t('Your turn to choose');
      case 'choosing':
        return t('{name} is choosing', { name: st.decider });
      case 'sent':
        return t('You picked {food}, waiting for the others', { food: st.food });
      case 'answer':
        return t('{name} picked {food}. Accept or veto?', { name: st.decider, food: st.food });
      case 'decided':
        return t('Decided: {food}', { food: st.food });
      case 'secret':
        return st.mine ? t('Secret picks: {n} of {total} in', { n: st.picked, total: st.total }) : t('Make your secret pick ({n} of {total} in)', { n: st.picked, total: st.total });
      case 'out':
        return t('You’re out today');
      case 'off':
        return st.holiday ? t('Public holiday: {name}', { name: t(st.holiday) }) : t('Day off: no turns today');
    }
  })();
  return s.room.meals === 'both' ? `${s.meal === 'dinner' ? t('Dinner') : t('Lunch')} · ${text}` : text;
}

function extrasText(s: RoomSummary): string[] {
  const out: string[] = [];
  if (s.tapau) out.push(s.tapau.mine ? t('Your tapau run is open') : t('{name} is doing a tapau run', { name: s.tapau.runner }));
  if (s.balance < 0) out.push(t('You owe {amount}', { amount: formatRM(s.balance) }));
  else if (s.balance > 0) out.push(t("You're owed {amount}", { amount: formatRM(s.balance) }));
  return out;
}

/** The main menu: every room on this phone, like a list of group chats. */
export function HomeScreen({ onOpen, onNew, onJoin, onToast, onNoRooms, onProfile }: Props) {
  const [known, setKnown] = useState<KnownRoom[]>(knownRooms);
  const [pinned, setPinned] = useState<string[]>(loadPinned);
  const [notified, setNotified] = useState<Set<string> | null>(null);
  const [actionsFor, setActionsFor] = useState<RoomSummary | null>(null);
  const [month, setMonth] = useState<MonthSummary | null>(null);
  useEffect(() => {
    loadYourMonth().then((m) => {
      setMonth(m);
      // The budget heads-up, once per month per level.
      const budget = monthlyBudget();
      if (!m || !budget) return;
      const state = budgetState(m.spent, budget);
      if (firstTimeAt(m.month, state.level))
        onToast(
          state.level === 'over'
            ? t('You’re {amount} over this month’s food budget.', { amount: formatRM(-state.left) })
            : t('Heads-up: you’ve used {pct}% of this month’s food budget.', { pct: state.pct }),
        );
    }, () => {});
  }, [known]);
  const [summaries, setSummaries] = useState<RoomSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const load = useCallback(() => {
    void notifiedMembers()
      .then(setNotified)
      .catch(() => {});
    loadRoomSummaries().then(
      (s) => {
        // Rooms this phone hasn't tracked yet start as seen, so nothing old shows as new.
        for (const x of s) if (!lastSeen(x.room.id)) markSeen(x.room.id);
        setSummaries(s);
        setError(null);
      },
      (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    );
  }, []);
  const soon = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(load, 400);
  }, [load]);

  useEffect(() => {
    load();
    const ids = known.map((k) => k.roomId);
    const filter = `room_id=in.(${ids.join(',')})`;
    const channel = ids.length
      ? supabase
          .channel('home')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'day_entries', filter }, soon)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'meal_bills', filter }, soon)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'settlements', filter }, soon)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'tapau_runs', filter }, soon)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance', filter }, soon)
          .subscribe()
      : null;
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    const every = window.setInterval(load, 60_000);
    return () => {
      if (channel) supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(every);
      window.clearTimeout(timer.current);
    };
  }, [known, load, soon]);

  // Pinned rooms first, then rooms that need you, then the most recently opened.
  const rank = (roomId: string, needsYou: boolean) => (pinned.includes(roomId) ? 2 : 0) + (needsYou ? 1 : 0);
  const rows: { known: KnownRoom; summary: RoomSummary | null }[] = summaries
    ? [...summaries].sort((a, b) => rank(b.room.id, b.needsYou) - rank(a.room.id, a.needsYou)).map((s) => ({ known: s.known, summary: s }))
    : [...known].sort((a, b) => rank(b.roomId, false) - rank(a.roomId, false)).map((k) => ({ known: k, summary: null }));

  const togglePinOff = (roomId: string) => {
    const next = pinned.filter((id) => id !== roomId);
    setPinned(next);
    storage.set(PINNED_KEY, JSON.stringify(next));
  };
  const togglePin = (roomId: string) => {
    const next = pinned.includes(roomId) ? pinned.filter((id) => id !== roomId) : [roomId, ...pinned];
    setPinned(next);
    storage.set(PINNED_KEY, JSON.stringify(next));
  };
  const setOut = async (s: RoomSummary, meal: Meal, out: boolean) => {
    const { error: err } = await supabase
      .from('attendance')
      .upsert({ room_id: s.room.id, entry_date: s.date, meal, member_id: s.meId, status: out ? 'out' : 'in', updated_at: new Date().toISOString() });
    if (err) throw new Error(err.message);
    load();
  };
  const guard = async (fn: () => Promise<void>, ok?: string) => {
    try {
      await fn();
      if (ok) onToast(ok);
    } catch (e) {
      onToast(e instanceof Error ? e.message : t('Something went wrong. Try again.'));
    }
  };
  const waiting = summaries?.filter((s) => s.needsYou).length ?? 0;

  return (
    <div className="app">
      <main className="screen" style={{ gap: 16 }}>
        <header style={{ display: 'flex', flexDirection: 'column', gap: 2, position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, right: 0, display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="press"
              onClick={onProfile}
              style={{ display: 'flex', alignItems: 'center', gap: 6, height: 44, padding: '0 14px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 14, fontWeight: 700 }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21a8 8 0 0 1 16 0" />
              </svg>
              {t('You')}
            </button>
            <AddRoomMenu onNew={onNew} onJoin={onJoin} />
          </div>
          <span className="eyebrow">
            {new Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'short' }).format(new Date())}
          </span>
          <h1 className="title">
            Makan <span style={{ color: 'var(--accent-text)' }}>apa?</span>
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 15, color: 'var(--ink-2)' }}>
            {summaries === null
              ? t('Your rooms')
              : waiting === 0
                ? t('Nothing needs you right now.')
                : waiting === 1
                  ? t('{n} room needs you.', { n: waiting })
                  : t('{n} rooms need you.', { n: waiting })}
          </p>
        </header>

        {summaries && summaries.length > 1 && (
          <TodayCard
            summaries={summaries}
            onSkip={(s, meal) =>
              guard(() => setOut(s, meal, true), t('Skipped {meal} in {room}.', { meal: (meal === 'dinner' ? t('Dinner') : t('Lunch')).toLowerCase(), room: roomTitle(s.room) }))
            }
          />
        )}
        {summaries && (
          <MoneyCard
            summaries={summaries}
            onToast={onToast}
            onPaid={(s, p) =>
              guard(async () => {
                const { error: err } = await supabase.from('settlements').insert({ ...p, room_id: s.room.id });
                if (err) throw new Error(err.message);
                load();
              }, t('Payment recorded.'))
            }
          />
        )}

        {month && <BudgetCard spent={month.spent} onProfile={onProfile} />}

        <section aria-labelledby="rooms-label" style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
          <h2 id="rooms-label" className="section-label" style={{ margin: 0 }}>
            {rows.length === 1 ? t('{n} room', { n: rows.length }) : t('{n} rooms', { n: rows.length })}
          </h2>
          {rows.length === 0 ? (
            <div className="card" style={{ padding: 16, fontSize: 14, color: 'var(--ink-2)' }}>
              {t('No rooms yet. Tap + to create one for each group you eat with, or join one with a code.')}
            </div>
          ) : (
            <ul className="card" style={{ margin: 0, padding: 0, listStyle: 'none', overflow: 'hidden' }}>
              {rows.map(({ known: k, summary: s }, i) => {
                const title = s ? roomTitle(s.room) : knownRoomTitle(k);
                const extras = s ? extrasText(s) : [];
                return (
                  <RoomRow
                    key={k.roomId}
                    first={i === 0}
                    title={title}
                    onOpen={() => onOpen(k.roomId)}
                    onActions={s ? () => setActionsFor(s) : undefined}
                  >
                      <RoomIcon title={title} code={k.code} emoji={s?.room.emoji} color={s?.room.color} />
                      <span style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                          <span style={{ fontSize: 16, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexGrow: 1, minWidth: 0 }}>
                            {pinned.includes(k.roomId) && (
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" role="img" aria-label={t('Pinned')} style={{ marginRight: 5, color: 'var(--muted)', verticalAlign: '-1px' }}>
                                <path d="M14 3l7 7-3 1-4 4 1 5-2 1-4-5-5 5-1-1 5-5-5-4 1-2 5 1 4-4z" />
                              </svg>
                            )}
                            {title}
                          </span>
                          {s?.lastActivity && s.lastActivity > (lastSeen(k.roomId) ?? '') && (
                            <span className="badge" style={{ background: 'var(--accent)', color: '#fff', flexShrink: 0 }}>
                              {t('New')}
                            </span>
                          )}
                          <span style={{ fontSize: 12, color: 'var(--muted)', flexShrink: 0 }}>
                            {s ? (s.members.length === 1 ? t('{n} person', { n: 1 }) : t('{n} people', { n: s.members.length })) : k.code}
                          </span>
                        </span>
                        <span
                          style={{
                            fontSize: 14,
                            fontWeight: s?.needsYou ? 700 : 500,
                            color: s?.needsYou ? 'var(--ink)' : 'var(--ink-2)',
                            lineHeight: 1.35,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {s ? statusText(s) : error ? t('Tap to open') : t('Loading…')}
                        </span>
                        {extras.length > 0 && (
                          <span style={{ fontSize: 12, fontWeight: 600, color: s && s.balance < 0 ? 'var(--accent-text)' : 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {extras.join(' · ')}
                          </span>
                        )}
                      </span>
                      {s?.needsYou && (
                        <span aria-label={t('Needs you')} role="img" style={{ width: 12, height: 12, borderRadius: 999, background: 'var(--accent)', flexShrink: 0 }} />
                      )}
                  </RoomRow>
                );
              })}
            </ul>
          )}
          {error && <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>{t("Couldn't load what's happening in your rooms. {error}", { error })}</p>}
        </section>

        {month && month.meals > 0 && (
          <section aria-labelledby="month-label" className="card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
            <h2 id="month-label" className="section-label" style={{ margin: 0 }}>
              {t('Your {month}', { month: new Intl.DateTimeFormat(locale(), { month: 'long', timeZone: 'UTC' }).format(new Date(`${month.month}-01T00:00:00Z`)) })}
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
              {(
                [
                  [String(month.meals), month.meals === 1 ? t('meal') : t('meals')],
                  [String(month.foods), month.foods === 1 ? t('different food') : t('different foods')],
                  [formatRM(month.spent), t('your share')],
                ] as const
              ).map(([n, label]) => (
                <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n}</span>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</span>
                </div>
              ))}
            </div>
            {!!month.photos?.length && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
                {month.photos.map((path) => (
                  <MonthPhoto key={path} path={path} />
                ))}
              </div>
            )}
            {month.top && month.top.count > 1 && (
              <span style={{ fontSize: 14, color: 'var(--ink-2)' }}>
                {month.rooms > 1
                  ? t('Most eaten: {food} ({n}×), across {rooms} rooms.', { food: month.top.name, n: month.top.count, rooms: month.rooms })
                  : t('Most eaten: {food} ({n}×).', { food: month.top.name, n: month.top.count })}
              </span>
            )}
          </section>
        )}

        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--muted)', textAlign: 'center', paddingBottom: 12 }}>
          {t('One room for each group you eat with: classmates, office, family. Each room has its own turns, food list and bills.')}
        </p>
      </main>
      {actionsFor && (
        <RoomActionsSheet
          summary={actionsFor}
          pinned={pinned.includes(actionsFor.room.id)}
          notified={notified ? notified.has(actionsFor.meId) : null}
          onPin={() => togglePin(actionsFor.room.id)}
          onNotify={(on) =>
            guard(async () => {
              if (on) await notifyRoom(actionsFor.meId);
              else await disableReminders(actionsFor.meId);
              setNotified(await notifiedMembers());
            }, on ? t('Notifications on for {room}.', { room: roomTitle(actionsFor.room) }) : t('{room} muted on this phone.', { room: roomTitle(actionsFor.room) }))
          }
          onInvite={() =>
            guard(async () => {
              const msg = await shareInvite(actionsFor.room.code, actionsFor.room.name);
              if (msg) onToast(msg);
            })
          }
          onOut={(out) => guard(() => setOut(actionsFor, actionsFor.meal, out))}
          onLeave={() =>
            guard(async () => {
              const s = actionsFor;
              void disableReminders(s.meId).catch(() => {});
              await leaveRoom(s.room.id);
              togglePinOff(s.room.id);
              const left = knownRooms();
              if (!left.length) return onNoRooms();
              setKnown(left);
              setSummaries((cur) => cur?.filter((x) => x.room.id !== s.room.id) ?? null);
            }, t('You left {room}.', { room: roomTitle(actionsFor.room) }))
          }
          onClose={() => setActionsFor(null)}
        />
      )}
    </div>
  );
}

/** The + at the top right: opens a small menu to create a room or join one with a code. */
function AddRoomMenu({ onNew, onJoin }: { onNew: () => void; onJoin: () => void }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  }, []);
  useEffect(() => {
    if (!open) return;
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  const item = (ref: React.Ref<HTMLButtonElement> | undefined, icon: React.ReactNode, label: string, hint: string, onClick: () => void) => (
    <button
      ref={ref}
      type="button"
      role="menuitem"
      className="row press"
      onClick={() => {
        close(false);
        onClick();
      }}
      style={{ minHeight: 64, padding: '10px 14px' }}
    >
      <span aria-hidden="true" style={{ width: 38, height: 38, borderRadius: 12, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'var(--accent-tint)', color: 'var(--accent-ink)' }}>
        {icon}
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{label}</span>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>{hint}</span>
      </span>
    </button>
  );
  const svg = (children: React.ReactNode) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={button}
        type="button"
        className="press"
        aria-label={t('New room')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? 'add-room-menu' : undefined}
        onClick={() => (open ? close() : setOpen(true))}
        style={{ width: 44, height: 44, borderRadius: 999, border: 'none', display: 'grid', placeItems: 'center', background: 'var(--accent)', color: '#fff' }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true" style={{ transition: 'transform 0.2s var(--ease-out)', transform: open ? 'rotate(45deg)' : 'none' }}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
      {open && (
        <>
          <div aria-hidden="true" onClick={() => close()} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
          <div id="add-room-menu" role="menu" aria-label={t('New room')} className="add-menu">
            {item(
              first,
              svg(
                <>
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M20 8v6M23 11h-6" />
                </>,
              ),
              t('Create a new room'),
              t('Start one for a new group'),
              onNew,
            )}
            {item(
              undefined,
              svg(
                <>
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <path d="M10 17l5-5-5-5M15 12H3" />
                </>,
              ),
              t('Join a room with a code'),
              t('Use the code a friend sent you'),
              onJoin,
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** A room in the list: tap to open, long-press or ⋯ for its actions. */
function RoomRow({ first, title, onOpen, onActions, children }: { first: boolean; title: string; onOpen: () => void; onActions?: () => void; children: React.ReactNode }) {
  const press = useLongPress(() => onActions?.());
  return (
    <li style={{ borderTop: first ? 'none' : '1px solid var(--divider)', display: 'flex', alignItems: 'stretch' }}>
      <button
        type="button"
        className="press"
        {...(onActions ? press.handlers : {})}
        onClick={() => {
          if (press.fired.current) return;
          onOpen();
        }}
        style={{ flexGrow: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 4px 12px 16px', border: 'none', background: 'none', color: 'var(--ink)', textAlign: 'left', minHeight: 72, WebkitTouchCallout: 'none', userSelect: 'none' }}
      >
        {children}
      </button>
      {onActions && (
        <button type="button" className="press" aria-label={t('More for {room}', { room: title })} onClick={onActions} style={{ width: 44, flexShrink: 0, border: 'none', background: 'none', color: 'var(--muted)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="12" cy="5" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="12" cy="19" r="1.8" />
          </svg>
        </button>
      )}
    </li>
  );
}

function MonthPhoto({ path }: { path: string }) {
  const url = usePhotoUrl(path);
  return <div style={{ aspectRatio: '1', borderRadius: 12, overflow: 'hidden', background: 'var(--track)' }}>{url && <img src={url} alt={t('Meal photo')} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}</div>;
}

/** This month's spending against the budget set on You & this phone. */
function BudgetCard({ spent, onProfile }: { spent: number; onProfile: () => void }) {
  const budget = monthlyBudget();
  if (!budget) return null;
  const { pct, level, left } = budgetState(spent, budget);
  const color = level === 'over' ? 'var(--danger)' : level === 'warn' ? 'var(--warn)' : 'var(--success)';
  return (
    <section aria-labelledby="budget-card-label" className="card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <h2 id="budget-card-label" className="section-label" style={{ margin: 0 }}>
          {t('Food budget')}
        </h2>
        <button type="button" className="press" onClick={onProfile} style={{ minHeight: 32, border: 'none', background: 'none', padding: 0, fontSize: 13, fontWeight: 700, color: 'var(--accent-text)' }}>
          {t('Change')}
        </button>
      </div>
      <span style={{ fontSize: 15, fontWeight: 700 }}>{t('{spent} of {budget}', { spent: formatRM(spent), budget: formatRM(budget) })}</span>
      <div role="progressbar" aria-label={t('Food budget used')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(pct, 100)} style={{ height: 10, borderRadius: 999, background: 'var(--bar-track)', overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', borderRadius: 999, background: color, transition: 'width 0.6s var(--ease-out)' }} />
      </div>
      <span style={{ fontSize: 13, fontWeight: level === 'ok' ? 500 : 700, color: level === 'ok' ? 'var(--muted)' : color }}>
        {level === 'over'
          ? t('{amount} over budget this month.', { amount: formatRM(-left) })
          : level === 'warn'
            ? t('Heads-up: {pct}% used, {amount} left this month.', { pct, amount: formatRM(left) })
            : t('{amount} left this month.', { amount: formatRM(left) })}
      </span>
    </section>
  );
}
