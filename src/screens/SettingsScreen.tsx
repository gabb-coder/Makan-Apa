import { useEffect, useMemo, useState } from 'react';
import { Avatar, HostBadge } from '../components/Avatar';
import { isIOS, isStandalone, useInstallPrompt } from '../lib/install';
import { shareInvite } from '../lib/invite';
import { NEARBY_LABEL } from '../lib/nearby';
import { nearbyPref, soundPref, themePref, usePref, type ThemePref } from '../lib/prefs';
import { disableReminders, enableReminders, pushSupport, reminderStatus } from '../lib/push';
import { hostOf, MEMBER_COLORS, ROOM_NAME_MAX, roomTitle } from '../lib/session';
import type { MemberRow, RoomRow } from '../lib/supabase';
import type { MemberPatch, RoomPatch } from '../lib/useRoomData';

interface Props {
  room: RoomRow;
  me: MemberRow;
  members: MemberRow[];
  updateRoom: (patch: RoomPatch) => Promise<void>;
  updateMember: (id: string, patch: MemberPatch) => Promise<void>;
  moveMember: (id: string, delta: -1 | 1) => Promise<void>;
  removeMember: (id: string) => Promise<void>;
  deleteRoom: () => Promise<void>;
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

export function SettingsScreen({ room, me, members, updateRoom, updateMember, moveMember, removeMember, deleteRoom, onBack, onLeave, onToast }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const host = hostOf(members);
  const iAmHost = host?.id === me.id;

  // Host renames the room; saved when the field loses focus.
  const [roomNameDraft, setRoomNameDraft] = useState(room.name ?? '');
  useEffect(() => setRoomNameDraft(room.name ?? ''), [room.name]);
  const saveRoomName = () => {
    const next = roomNameDraft.trim() || null;
    if (next !== (room.name ?? null)) attempt(() => updateRoom({ name: next }), next ? 'Room renamed.' : 'Room name removed.');
  };
  const zones = useMemo(() => timeZones(room.timezone), [room.timezone]);
  const theme = usePref(themePref);
  const sound = usePref(soundPref);
  const nearby = usePref(nearbyPref);
  const install = useInstallPrompt();
  const installed = isStandalone();

  const attempt = async (fn: () => Promise<void>, ok?: string) => {
    try {
      await fn();
      if (ok) onToast(ok);
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Could not save that change.');
    }
  };

  const copy = (text: string, ok: string) =>
    attempt(async () => {
      await navigator.clipboard.writeText(text);
    }, ok);

  const share = () =>
    attempt(async () => {
      const message = await shareInvite(room.code, room.name);
      if (message) onToast(message);
    });

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
          <span className="eyebrow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {roomTitle(room)}
          </span>
          <h1 className="title title--sm">Settings</h1>
        </div>
      </header>

      <section className="card fade-up" style={cardStyle}>
        <span className="section-label">Room</span>
        {iAmHost ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label htmlFor="room-name-setting" className="field-label">
              Room name
            </label>
            <input
              id="room-name-setting"
              className="input"
              placeholder="e.g. Sunway lunch gang"
              maxLength={ROOM_NAME_MAX}
              value={roomNameDraft}
              onChange={(e) => setRoomNameDraft(e.target.value)}
              onBlur={saveRoomName}
              onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
            />
          </div>
        ) : (
          room.name && <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, overflowWrap: 'anywhere' }}>{room.name}</span>
        )}
        <span className="field-label" style={{ marginBottom: -6 }}>
          Code
        </span>
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
          {members.length > 1 && (
            <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>
              {iAmHost
                ? 'You’re the host: tap someone’s name to rename them, change their colour or remove them from the room.'
                : `${host?.name ?? 'The host'} is the host and can remove people from the room.`}
            </span>
          )}
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
                        flexWrap: 'wrap',
                        gap: '2px 8px',
                        padding: 0,
                        border: 'none',
                        background: 'none',
                        color: 'inherit',
                        textAlign: 'left',
                      }}
                    >
                      <span style={{ maxWidth: '100%', fontSize: 16, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.name}
                      </span>
                      {m.id === me.id && m.id !== host?.id && (
                        <span className="badge" style={{ background: 'var(--accent-tint)', color: 'var(--accent-ink)' }}>
                          You
                        </span>
                      )}
                      {m.id === host?.id && <HostBadge you={m.id === me.id} />}
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
                {editing && iAmHost && m.id !== me.id && (
                  <button
                    type="button"
                    className="btn btn--danger press"
                    data-armed={confirmRemove === m.id}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      if (confirmRemove !== m.id) return setConfirmRemove(m.id);
                      setConfirmRemove(null);
                      setEditingId(null);
                      attempt(() => removeMember(m.id), `${m.name} removed from the room.`);
                    }}
                    style={{ order: 2, marginLeft: 26, height: 40, fontSize: 14 }}
                  >
                    {confirmRemove === m.id ? `Tap again to remove ${m.name}` : `Remove ${m.name} from the room`}
                  </button>
                )}
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span id="mode-label" style={{ fontSize: 15, fontWeight: 700 }}>How we decide</span>
          <div className="segmented" role="group" aria-labelledby="mode-label">
            {(
              [
                ['decider', 'Decider picks'],
                ['secret', 'Secret picks'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={room.decision_mode === value}
                onClick={() => room.decision_mode !== value && attempt(() => updateRoom({ decision_mode: value }))}
              >
                {label}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>
            {room.decision_mode === 'secret'
              ? 'Everyone picks in secret. Once everyone’s in, the picks are revealed and the wheel spins among them. No vetoes.'
              : 'Today’s decider picks or spins, and everyone else can accept or veto.'}
          </span>
        </div>

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

      <section className="card fade-up" style={{ ...cardStyle, animationDelay: '0.24s' }}>
        <span className="section-label">This phone</span>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span id="appearance-label" style={{ fontSize: 15, fontWeight: 700 }}>Appearance</span>
          <div className="segmented" role="group" aria-labelledby="appearance-label" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            {(
              [
                ['system', 'System'],
                ['light', 'Light'],
                ['dark', 'Dark'],
              ] as [ThemePref, string][]
            ).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={theme === value} onClick={() => themePref.set(value)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44, cursor: 'pointer' }}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>Wheel sounds</span>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>A tick per slice and a chime on landing</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={sound === 'on'}
            onChange={(e) => soundPref.set(e.target.checked ? 'on' : 'off')}
            className="switch"
          />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44, cursor: 'pointer' }}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>Food ideas near {NEARBY_LABEL}</span>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>Places around Bandar Sunway on Today and with each result</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="switch"
            checked={nearby === 'on'}
            onChange={(e) => nearbyPref.set(e.target.checked ? 'on' : 'off')}
          />
        </label>

        <ReminderSetting room={room} me={me} onToast={onToast} />

        {!installed && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4, borderTop: '1px solid var(--divider)' }}>
            <span style={{ fontSize: 15, fontWeight: 700, paddingTop: 10 }}>Add to Home Screen</span>
            {install.available ? (
              <>
                <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>Open Makan apa? like an app, full screen.</span>
                <button
                  type="button"
                  className="btn btn--primary press"
                  onClick={async () => {
                    if (await install.prompt()) onToast('Added. Look for Makan apa? on your home screen.');
                  }}
                >
                  Install app
                </button>
              </>
            ) : isIOS() ? (
              <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>
                In Safari, tap{' '}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Share" style={{ verticalAlign: '-2px' }}>
                  <path d="M12 3v12M7.5 7.5L12 3l4.5 4.5" />
                  <path d="M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8" />
                </svg>{' '}
                Share, then <strong style={{ color: 'var(--ink)' }}>Add to Home Screen</strong>.
              </span>
            ) : (
              <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>
                Open your browser menu and choose <strong style={{ color: 'var(--ink)' }}>Install app</strong> or{' '}
                <strong style={{ color: 'var(--ink)' }}>Add to Home screen</strong>.
              </span>
            )}
          </div>
        )}
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
        {iAmHost && (
          <>
            <button
              type="button"
              className="btn btn--danger press"
              data-armed={confirmDelete}
              style={{ marginTop: 8 }}
              onClick={() => (confirmDelete ? attempt(deleteRoom) : setConfirmDelete(true))}
            >
              {confirmDelete ? 'Tap again to delete everything' : 'Delete this room for everyone'}
            </button>
            <p style={{ margin: 0, textAlign: 'center', fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>
              Host only. Removes the food list, history and members for good.
            </p>
          </>
        )}
      </section>
    </main>
  );
}

const REMINDER_HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 6am to 10pm

function hourLabel(h: number): string {
  const suffix = h < 12 ? 'am' : 'pm';
  return `${h % 12 === 0 ? 12 : h % 12}:00 ${suffix}`;
}

/** Daily push reminder for this phone (sent by the send-reminders Edge Function). */
function ReminderSetting({ room, me, onToast }: { room: RoomRow; me: MemberRow; onToast: (m: string) => void }) {
  const support = pushSupport();
  const [status, setStatus] = useState<{ hour: number } | null | 'loading'>('loading');
  const [hour, setHour] = useState(11);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    reminderStatus(me.id).then(
      (s) => {
        if (!live) return;
        setStatus(s);
        if (s) setHour(s.hour);
      },
      () => live && setStatus(null),
    );
    return () => {
      live = false;
    };
  }, [me.id]);

  const on = status !== 'loading' && status !== null;
  const what = room.decision_mode === 'secret' ? 'to make your secret pick' : 'when it’s your turn to choose';

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      onToast(ok);
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Could not change reminders.');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (next: boolean) =>
    run(
      async () => {
        if (next) {
          await enableReminders(me.id, hour);
          setStatus({ hour });
        } else {
          await disableReminders();
          setStatus(null);
        }
      },
      next ? `Reminders on. We'll nudge you at ${hourLabel(hour)}.` : 'Reminders off on this phone.',
    );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44, cursor: support === 'ok' ? 'pointer' : 'default' }}>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>Daily reminder</span>
          <span style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--muted)' }}>
            {support === 'ok'
              ? `A notification ${what}, if it’s not decided yet.`
              : support === 'needs-install'
                ? 'On iPhone, add Makan apa? to your Home Screen first (below), then turn this on from there.'
                : 'This browser can’t show notifications.'}
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          className="switch"
          checked={on}
          disabled={support !== 'ok' || busy || status === 'loading'}
          onChange={(e) => toggle(e.target.checked)}
        />
      </label>
      {on && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <label htmlFor="reminder-hour" style={{ fontSize: 14, fontWeight: 600 }}>
            Remind me at
          </label>
          <select
            id="reminder-hour"
            className="input"
            value={hour}
            disabled={busy}
            onChange={(e) => {
              const h = Number(e.target.value);
              setHour(h);
              run(async () => {
                await enableReminders(me.id, h);
                setStatus({ hour: h });
              }, `Reminder moved to ${hourLabel(h)}.`);
            }}
            style={{ width: 'auto', height: 44 }}
          >
            {REMINDER_HOURS.map((h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </select>
        </div>
      )}
      {on && (
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Times are in the room’s timezone ({room.timezone.replace(/_/g, ' ')}).</span>
      )}
    </div>
  );
}
