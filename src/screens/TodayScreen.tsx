import { Avatar } from '../components/Avatar';
import { shortDate } from '../lib/dates';
import type { MemberRow, RoomRow } from '../lib/supabase';

interface Props {
  room: RoomRow;
  me: MemberRow;
  members: MemberRow[];
  onOpenSettings: () => void;
  onSpin: () => void;
}

/** Today header from the mockup. The decider card and rotation arrive in Phase 4. */
export function TodayScreen({ room, me, members, onOpenSettings, onSpin }: Props) {
  const fullDate = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: room.timezone }).format(
    new Date(),
  );
  return (
    <main className="screen" style={{ gap: 18 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="eyebrow" title={shortDate(new Date(), room.timezone)}>
            {fullDate}
          </span>
          <h1 className="title">
            Makan <span style={{ color: 'var(--accent)' }}>apa?</span>
          </h1>
        </div>
        <button
          type="button"
          className="press"
          aria-label={`Room ${room.code}, open settings`}
          onClick={onOpenSettings}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            height: 44,
            flexShrink: 0,
            padding: '0 14px',
            borderRadius: 999,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--ink)',
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '0.06em',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="9" cy="8" r="3.5" />
            <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
            <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.2c2.1.7 3.5 2.8 3.5 5.8" />
          </svg>
          {room.code}
        </button>
      </header>

      <section className="card fade-up" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span className="section-label">In this room · {members.length}</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {members.map((m) => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar name={m.name} color={m.color} />
              <span style={{ fontSize: 14, fontWeight: 700 }}>{m.id === me.id ? 'You' : m.name}</span>
            </div>
          ))}
        </div>
        {members.length < 2 && (
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--muted)' }}>
            Share code <strong style={{ color: 'var(--ink)', letterSpacing: '0.08em' }}>{room.code}</strong> so your kaki can join.
          </p>
        )}
      </section>

      <section className="card fade-up" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, animationDelay: '0.12s' }}>
        <span className="section-label">Coming in Phase 4</span>
        <p style={{ margin: 0, color: 'var(--muted)', lineHeight: 1.5 }}>Today's decider card, “Up next” and recent meals.</p>
        <button type="button" className="btn btn--primary press" onClick={onSpin}>
          Spin the wheel
        </button>
      </section>
    </main>
  );
}
