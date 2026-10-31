import { useEffect } from 'react';
import { addDays, dayLabel, deciderFor } from '../lib/rotation';
import { hostOf, knownRooms, roomTitle } from '../lib/session';
import type { MemberRow, RoomRow } from '../lib/supabase';
import { Avatar, HostBadge } from './Avatar';

interface Props {
  room: RoomRow;
  me: MemberRow;
  members: MemberRow[];
  online: Set<string>;
  todayDeciderId: string | null;
  today: string;
  onClose: () => void;
  onInvite: () => void;
  onSettings: () => void;
  onSwitchRoom: (roomId: string) => void;
  onAddRoom: () => void;
}

/** When each member decides next, e.g. "Decides tomorrow". */
function nextTurn(member: MemberRow, members: MemberRow[], room: RoomRow, today: string, todayDeciderId: string | null): string {
  if (member.id === todayDeciderId) return 'Deciding today';
  for (let i = 1; i <= members.length; i++) {
    const date = addDays(today, i);
    if (deciderFor(members, room.rotation_start, date)?.id === member.id) {
      return i === 1 ? 'Decides tomorrow' : `Decides ${dayLabel(date)}`;
    }
  }
  return '';
}

export function OnlineDot({ size = 12 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute',
        right: -1,
        bottom: -1,
        width: size,
        height: size,
        borderRadius: 999,
        background: '#2FB36B',
        boxShadow: '0 0 0 2px var(--surface)',
      }}
    />
  );
}

export function PeopleSheet({ room, me, members, online, todayDeciderId, today, onClose, onInvite, onSettings, onSwitchRoom, onAddRoom }: Props) {
  const otherRooms = knownRooms().filter((r) => r.roomId !== room.id);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const hereNow = members.filter((m) => online.has(m.id)).length;
  const host = hostOf(members);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="people-title" onClick={(e) => e.stopPropagation()}>
        <div aria-hidden="true" style={{ width: 40, height: 5, borderRadius: 999, background: 'var(--border-strong)', alignSelf: 'center' }} />
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="eyebrow">
              {roomTitle(room)} · {hereNow} here now
            </span>
            <h2 id="people-title" className="title title--sm" style={{ fontSize: 24 }}>
              {members.length} {members.length === 1 ? 'person' : 'people'} in this room
            </h2>
          </div>
          <button type="button" className="icon-btn press" aria-label="Close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <ul className="card" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {members.map((m, i) => {
            const here = online.has(m.id);
            const turn = nextTurn(m, members, room, today, todayDeciderId);
            return (
              <li
                key={m.id}
                className="row"
                style={{ padding: '12px 14px', animation: `slideIn 0.45s ${(i * 0.05).toFixed(2)}s cubic-bezier(0.2, 0.8, 0.2, 1) both` }}
              >
                <span style={{ position: 'relative', flexShrink: 0 }}>
                  <Avatar name={m.name} color={m.color} size={40} />
                  {here && <OnlineDot />}
                </span>
                <div style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ fontSize: 16, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                    {m.id === me.id && m.id !== host?.id && (
                      <span className="badge" style={{ background: 'var(--accent-tint)', color: 'var(--accent-ink)' }}>
                        You
                      </span>
                    )}
                    {m.id === host?.id && <HostBadge you={m.id === me.id} />}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                    {[here ? 'Here now' : null, turn].filter(Boolean).join(' · ') || 'Away'}
                  </span>
                </div>
                {m.id === todayDeciderId && (
                  <span className="badge" style={{ background: 'var(--accent)', color: '#FFFFFF', flexShrink: 0 }}>
                    Today
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          <button type="button" className="btn btn--primary press" onClick={onInvite}>
            Invite someone
          </button>
          <button type="button" className="btn btn--secondary press" onClick={onSettings}>
            Room settings
          </button>
        </div>
        <p style={{ margin: 0, textAlign: 'center', fontSize: 12, color: 'var(--muted)' }}>A green dot means they have Makan apa? open right now.</p>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 12, borderTop: '1px solid var(--divider)' }}>
          <span className="section-label">{otherRooms.length ? 'Your other rooms' : 'Another group?'}</span>
          {otherRooms.map((r) => (
            <button key={r.roomId} type="button" className="row press" onClick={() => onSwitchRoom(r.roomId)} style={{ borderRadius: 14, background: 'var(--bg)' }}>
              <span style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1, textAlign: 'left' }}>
                <span style={{ fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                  Code {r.code} · you're {r.name}
                </span>
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)', flexShrink: 0 }}>Switch</span>
            </button>
          ))}
          <button type="button" className="btn btn--secondary press" onClick={onAddRoom}>
            Join or create another room
          </button>
        </section>
      </div>
    </div>
  );
}
