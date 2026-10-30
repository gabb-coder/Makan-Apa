import { useMemo, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { MEMBER_COLORS } from '../lib/session';
import type { MemberRow, RoomRow } from '../lib/supabase';
import type { MemberPatch, RoomPatch } from '../lib/useRoomData';

interface Props {
  room: RoomRow;
  me: MemberRow;
  members: MemberRow[];
  updateRoom: (patch: RoomPatch) => Promise<void>;
  updateMember: (id: string, patch: MemberPatch) => Promise<void>;
  moveMember: (id: string, delta: -1 | 1) => Promise<void>;
  onBack: () => void;
  onLeave: () => void;
  onToast: (message: string) => void;
}

const VETO_MAX = 3;

function timeZones(current: string): string[] {
  let zones: string[] = [];
  try {
    zones = Intl.supportedValuesOf('timeZone');
  } catch {
    zones = ['Asia/Kuala_Lumpur', 'Asia/Singapore', 'Asia/Jakarta', 'Asia/Bangkok', 'Asia/Hong_Kong', 'Asia/Tokyo', 'Australia/Sydney', 'Europe/London', 'America/New_York'];
  }
  return zones.includes(current) ? zones : [current, ...zones];
}

const cardStyle = { padding: 16, display: 'flex', flexDirection: 'column', gap: 14 } as const;

export function SettingsScreen({ room, me, members, updateRoom, updateMember, moveMember, onBack, onLeave, onToast }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [confirmLeave, setConfirmLeave] = useState(false);
  const zones = useMemo(() => timeZones(room.timezone), [room.timezone]);

  const attempt = async (fn: () => Promise<void>, ok?: string) => {
    try {
      await fn();
      if (ok) onToast(ok);
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Could not save that change.');
    }
  };

  const inviteUrl = `${window.location.origin}${window.location.pathname}?join=${room.code}`;

  const copy = (text: string, ok: string) =>
    attempt(async () => {
      await navigator.clipboard.writeText(text);
    }, ok);

  const share = async () => {
    const text = `Join my Makan apa? room. Code: ${room.code}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Makan apa?', text, url: inviteUrl });
      } catch {
        /* user closed the share sheet */
      }
    } else {
      copy(`${text}\n${inviteUrl}`, 'Invite link copied.');
    }
  };

  const startEdit = (m: MemberRow) => {
    setEditingId(m.id);
    setDraftName(m.name);
  };

  const saveName = (m: MemberRow) => {
    const name = draftName.trim();
    setEditingId(null);
    if (name && name !== m.name) attempt(() => updateMember(m.id, { name }));
  };

  return (
    <main className="screen" style={{ gap: 16 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="button" className="icon-btn press" aria-label="Back" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="eyebrow">Room {room.code}</span>
          <h1 className="title title--sm">Settings</h1>
        </div>
      </header>

      <section className="card fade-up" style={cardStyle}>
        <span className="section-label">Room code</span>
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 40,
            fontWeight: 800,
            letterSpacing: '0.14em',
            lineHeight: 1,
          }}
        >
          {room.code}
        </span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          <button type="button" className="btn btn--secondary press" onClick={() => copy(room.code, 'Room code copied.')}>
            Copy code
          </button>
          <button type="button" className="btn btn--primary press" onClick={share}>
            Share invite
          </button>
        </div>
      </section>

      <section className="card fade-up" style={{ ...cardStyle, animationDelay: '0.08s' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="section-label">Members · decider order</span>
          <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>
            The top person decides on the rotation start date, then it goes down the list, one day each.
          </span>
        </div>
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {members.map((m, i) => {
            const editing = editingId === m.id;
            return (
              <li key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '6px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 16, fontSize: 13, fontWeight: 700, color: 'var(--muted)', textAlign: 'center' }}>{i + 1}</span>
                  <Avatar name={editing ? draftName : m.name} color={m.color} size={36} />
                  {editing ? (
                    <form
                      style={{ flexGrow: 1, minWidth: 0 }}
                      onSubmit={(e) => {
                        e.preventDefault();
                        saveName(m);
                      }}
                    >
                      <label htmlFor={`member-${m.id}`} className="sr-only">Name</label>
                      <input
                        id={`member-${m.id}`}
                        className="input"
                        autoFocus
                        maxLength={24}
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        onBlur={() => saveName(m)}
                        style={{ height: 44 }}
                      />
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEdit(m)}
                      aria-label={`Edit ${m.name}`}
                      style={{
                        flexGrow: 1,
                        minWidth: 0,
                        minHeight: 44,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: 0,
                        border: 'none',
                        background: 'none',
                        color: 'inherit',
                        textAlign: 'left',
                      }}
                    >
                      <span style={{ fontSize: 16, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.name}
                      </span>
                      {m.id === me.id && (
                        <span className="badge" style={{ background: 'var(--accent-tint)', color: 'var(--accent-ink)' }}>
                          You
                        </span>
                      )}
                    </button>
                  )}
                  <div style={{ display: 'flex', gap: 4 }}>
                    {(
                      [
                        [-1, 'up', 'M6 15l6-6 6 6'],
                        [1, 'down', 'M6 9l6 6 6-6'],
                      ] as const
                    ).map(([delta, label, d]) => {
                      const disabled = delta === -1 ? i === 0 : i === members.length - 1;
                      return (
                        <button
                          key={label}
                          type="button"
                          className="icon-btn press"
                          aria-label={`Move ${m.name} ${label}`}
                          disabled={disabled}
                          style={{ opacity: disabled ? 0.35 : 1 }}
                          onClick={() => attempt(() => moveMember(m.id, delta))}
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d={d} />
                          </svg>
                        </button>
                      );
                    })}
                  </div>
                </div>
                {editing && (
                  <div role="group" aria-label={`${m.name}'s colour`} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingLeft: 26 }}>
                    {MEMBER_COLORS.map((c) => {
                      const on = m.color.toUpperCase() === c.toUpperCase();
                      return (
                        <button
                          key={c}
                          type="button"
                          className="press"
                          aria-label={c}
                          aria-pressed={on}
                          // Keep focus off the name input's blur until the colour is saved.
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => attempt(() => updateMember(m.id, { color: c }))}
                          style={{
                            width: 32,
                            height: 32,
                            padding: 0,
                            border: 'none',
                            borderRadius: 999,
                            background: c,
                            boxShadow: on ? '0 0 0 2px var(--surface), 0 0 0 4px var(--ink)' : 'none',
                          }}
                        />
                      );
                    })}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        {members.length < 2 && (
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--accent-ink)' }}>
            Waiting for your kaki to join with code {room.code}.
          </p>
        )}
      </section>

      <section className="card fade-up" style={{ ...cardStyle, animationDelay: '0.16s' }}>
        <span className="section-label">Rules</span>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>Vetoes per day</span>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>For each person who isn't deciding</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              className="icon-btn press"
              aria-label="Fewer vetoes"
              disabled={room.veto_limit <= 0}
              style={{ opacity: room.veto_limit <= 0 ? 0.35 : 1, fontSize: 20, fontWeight: 700 }}
              onClick={() => attempt(() => updateRoom({ veto_limit: room.veto_limit - 1 }))}
            >
              −
            </button>
            <span aria-live="polite" style={{ minWidth: 24, textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 800 }}>
              {room.veto_limit}
            </span>
            <button
              type="button"
              className="icon-btn press"
              aria-label="More vetoes"
              disabled={room.veto_limit >= VETO_MAX}
              style={{ opacity: room.veto_limit >= VETO_MAX ? 0.35 : 1, fontSize: 20, fontWeight: 700 }}
              onClick={() => attempt(() => updateRoom({ veto_limit: room.veto_limit + 1 }))}
            >
              +
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label htmlFor="rotation-start" className="field-label">Rotation start date</label>
          <input
            id="rotation-start"
            type="date"
            className="input"
            value={room.rotation_start}
            onChange={(e) => e.target.value && attempt(() => updateRoom({ rotation_start: e.target.value }))}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label htmlFor="timezone" className="field-label">Timezone</label>
          <select
            id="timezone"
            className="input"
            value={room.timezone}
            onChange={(e) => attempt(() => updateRoom({ timezone: e.target.value }))}
          >
            {zones.map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>Decides when “today” starts for the rotation.</span>
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 8 }}>
        <button
          type="button"
          className="btn btn--danger press"
          data-armed={confirmLeave}
          onClick={() => (confirmLeave ? onLeave() : setConfirmLeave(true))}
        >
          {confirmLeave ? 'Tap again to leave this room' : 'Leave room on this phone'}
        </button>
        <p style={{ margin: 0, textAlign: 'center', fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>
          You stay in the rotation. Rejoin any time with code {room.code} and the same name.
        </p>
      </section>
    </main>
  );
}
