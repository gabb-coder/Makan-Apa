import { useCallback, useEffect, useRef, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { locale, t } from '../lib/i18n';
import { formatRM } from '../lib/money';
import { loadRoomSummaries, type RoomSummary } from '../lib/roomSummaries';
import { knownRooms, knownRoomTitle, MEMBER_COLORS, roomTitle, type KnownRoom } from '../lib/session';
import { supabase } from '../lib/supabase';

interface Props {
  onOpen: (roomId: string) => void;
  onNew: () => void;
  onJoin: () => void;
}

/** A steady colour per room, from its code. */
function roomColor(code: string): string {
  let h = 0;
  for (const c of code) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return MEMBER_COLORS[h % MEMBER_COLORS.length];
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
export function HomeScreen({ onOpen, onNew, onJoin }: Props) {
  const [known] = useState<KnownRoom[]>(knownRooms);
  const [summaries, setSummaries] = useState<RoomSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const load = useCallback(() => {
    loadRoomSummaries().then(
      (s) => {
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

  // Rooms that need you first, then the most recently opened.
  const rows: { known: KnownRoom; summary: RoomSummary | null }[] = summaries
    ? [...summaries].sort((a, b) => Number(b.needsYou) - Number(a.needsYou)).map((s) => ({ known: s.known, summary: s }))
    : known.map((k) => ({ known: k, summary: null }));
  const waiting = summaries?.filter((s) => s.needsYou).length ?? 0;

  return (
    <div className="app">
      <main className="screen" style={{ gap: 16 }}>
        <header style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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

        <section aria-labelledby="rooms-label" style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
          <h2 id="rooms-label" className="section-label" style={{ margin: 0 }}>
            {rows.length === 1 ? t('{n} room', { n: rows.length }) : t('{n} rooms', { n: rows.length })}
          </h2>
          {rows.length === 0 ? (
            <div className="card" style={{ padding: 16, fontSize: 14, color: 'var(--ink-2)' }}>
              {t('No rooms yet. Create one for each group you eat with, or join one with a code.')}
            </div>
          ) : (
            <ul className="card" style={{ margin: 0, padding: 0, listStyle: 'none', overflow: 'hidden' }}>
              {rows.map(({ known: k, summary: s }, i) => {
                const title = s ? roomTitle(s.room) : knownRoomTitle(k);
                const extras = s ? extrasText(s) : [];
                return (
                  <li key={k.roomId} style={{ borderTop: i ? '1px solid var(--divider)' : 'none' }}>
                    <button
                      type="button"
                      className="press"
                      onClick={() => onOpen(k.roomId)}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', border: 'none', background: 'none', color: 'var(--ink)', textAlign: 'left', minHeight: 72 }}
                    >
                      <Avatar name={title} color={roomColor(k.code)} size={46} />
                      <span style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                          <span style={{ fontSize: 16, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexGrow: 1, minWidth: 0 }}>{title}</span>
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
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {error && <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>{t("Couldn't load what's happening in your rooms. {error}", { error })}</p>}
        </section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
          <button type="button" className="btn btn--primary press" onClick={onNew} style={{ height: 52 }}>
            {t('Create a new room')}
          </button>
          <button type="button" className="btn btn--secondary press" onClick={onJoin} style={{ height: 50 }}>
            {t('Join a room with a code')}
          </button>
        </div>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--muted)', textAlign: 'center', paddingBottom: 12 }}>
          {t('One room for each group you eat with: classmates, office, family. Each room has its own turns, food list and bills.')}
        </p>
      </main>
    </div>
  );
}
