import { useEffect, useMemo, useState } from 'react';
import { Avatar, HostBadge } from '../components/Avatar';
import { RoomIcon, ROOM_EMOJIS, roomColor } from '../components/RoomIcon';
import { InviteQrSheet } from '../components/InviteQr';
import { shareInvite } from '../lib/invite';
import { locale, t, tk } from '../lib/i18n';
import { hostOf, letMemberRejoin, MEMBER_COLORS, ROOM_NAME_MAX, roomPins, roomTitle, setMyPin } from '../lib/session';
import { supabase, type MemberRow, type RoomRow } from '../lib/supabase';
import type { MemberPatch, RoomPatch } from '../lib/useRoomData';
import { useJoinRequests } from '../lib/useJoinRequests';
import { JoinRequestList } from '../components/JoinRequests';
import { isEatingDay, offsetKeeping, type EatCalendar } from '../lib/calendar';
import { calendarOf, rotationOf } from '../lib/rotation';
import { todayIn } from '../lib/dates';

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
  /** The main menu's You & this phone page. */
  onOpenProfile?: () => void;
  /** The room's food list, for fixed days. */
  foodNames?: string[];
}

const VETO_MAX = 3;

/** "Monday" for weekday 1, in the app's language. */
function weekdayName(wd: number): string {
  // 2026-11-01 was a Sunday.
  return new Intl.DateTimeFormat(locale(), { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 10, 1 + wd)));
}

/** "Mon" for weekday 1. */
function weekdayShort(wd: number): string {
  return new Intl.DateTimeFormat(locale(), { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 10, 1 + wd)));
}

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

export function SettingsScreen({ room, me, members, updateRoom, updateMember, moveMember, removeMember, deleteRoom, onBack, onLeave, onToast, onOpenProfile, foodNames = [] }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const host = hostOf(members, room.host_id);
  const iAmHost = host?.id === me.id;
  const [pins, setPins] = useState<Set<string> | null>(null);
  const joinRequests = useJoinRequests(room.id, iAmHost);
  const [confirmHost, setConfirmHost] = useState<string | null>(null);
  const refreshPins = () => roomPins(room.id).then(setPins, () => setPins(null));
  useEffect(() => {
    void refreshPins();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.id, members.length]);

  // Host renames the room; saved when the field loses focus.
  const [roomNameDraft, setRoomNameDraft] = useState(room.name ?? '');
  useEffect(() => setRoomNameDraft(room.name ?? ''), [room.name]);
  const saveRoomName = () => {
    const next = roomNameDraft.trim() || null;
    if (next !== (room.name ?? null)) attempt(() => updateRoom({ name: next }), next ? t('Room renamed.') : t('Room name removed.'));
  };
  const zones = useMemo(() => timeZones(room.timezone), [room.timezone]);

  // The kitty switch flips straight away; it goes back if saving fails.
  const [kittyFlip, setKittyFlip] = useState<boolean | null>(null);
  const kittyOn = kittyFlip ?? !!room.kitty_keeper;

  // New eating days keep whoever's next up where they were. If today just became a day off, a
  // day nobody has touched yet is cleared, so it shows as a day off straight away.
  const changeCalendar = (cal: EatCalendar) =>
    attempt(async () => {
      const today = todayIn(room.timezone);
      await updateRoom({ eat_days: cal.days, skip_holidays: cal.holidays, rotation_offset: offsetKeeping(rotationOf(room), cal, today) });
      if (!isEatingDay(today, cal)) {
        await supabase
          .from('day_entries')
          .delete()
          .eq('room_id', room.id)
          .eq('entry_date', today)
          .eq('status', 'pending')
          .is('food_option_id', null)
          .is('custom_food', null)
          .is('vote_options', null);
      }
    });

  const attempt = async (fn: () => Promise<void>, ok?: string) => {
    try {
      await fn();
      if (ok) onToast(ok);
    } catch (e) {
      onToast(e instanceof Error ? e.message : t('Could not save that change.'));
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
        <button type="button" className="icon-btn press" aria-label={t('Back')} onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="eyebrow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {roomTitle(room)}
          </span>
          <h1 className="title title--sm">{t('Settings')}</h1>
        </div>
      </header>

      <section className="card fade-up" style={cardStyle}>
        <span className="section-label">{t('Room')}</span>
        {iAmHost ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label htmlFor="room-name-setting" className="field-label">
              {t('Room name')}
            </label>
            <input
              id="room-name-setting"
              className="input"
              placeholder={t('e.g. Sunway lunch gang')}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="field-label">{t('Icon on the main menu')}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <RoomIcon title={roomTitle(room)} code={room.code} emoji={room.emoji} color={room.color} size={52} />
            <div role="group" aria-label={t('Colour')} style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {MEMBER_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={t('Colour {n}', { n: MEMBER_COLORS.indexOf(c) + 1 })}
                  aria-pressed={roomColor(room.code, room.color) === c}
                  onClick={() => attempt(() => updateRoom({ color: c }))}
                  style={{ width: 30, height: 30, borderRadius: 999, background: c, border: roomColor(room.code, room.color) === c ? '3px solid var(--ink)' : '2px solid var(--surface)', boxShadow: '0 0 0 1px var(--border)' }}
                />
              ))}
            </div>
          </div>
          <div role="group" aria-label={t('Emoji')} style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {ROOM_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                className="chip press"
                aria-pressed={room.emoji === e}
                aria-label={e}
                onClick={() => attempt(() => updateRoom({ emoji: room.emoji === e ? null : e }))}
                style={{ height: 40, width: 44, padding: 0, justifyContent: 'center', fontSize: 20 }}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
        <span className="field-label" style={{ marginBottom: -6 }}>
          {t('Code')}
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
          <button type="button" className="btn btn--secondary press" onClick={() => copy(room.code, t('Room code copied.'))}>
            {t('Copy code')}
          </button>
          <button type="button" className="btn btn--primary press" onClick={share}>
            {t('Share invite')}
          </button>
        </div>
        <button type="button" className="btn btn--secondary press" onClick={() => setQrOpen(true)}>
          {t('Show QR code to scan')}
        </button>
        {qrOpen && <InviteQrSheet code={room.code} title={roomTitle(room)} onClose={() => setQrOpen(false)} />}
      </section>

      <section className="card fade-up" style={{ ...cardStyle, animationDelay: '0.08s' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="section-label">{t('Members · decider order')}</span>
          <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>
            {t('The top person decides on the rotation start date, then it goes down the list, one eating day each.')}
          </span>
          {members.length > 1 && (
            <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>
              {iAmHost
                ? t('You’re the host: tap someone’s name to rename them, change their colour, make them host or remove them from the room.')
                : t('{name} is the host: they set the order and the rules, and can remove people from the room.', { name: host?.name ?? t('The host') })}
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
                      <label htmlFor={`member-${m.id}`} className="sr-only">{t('Name')}</label>
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
                      aria-label={t('Edit {name}', { name: m.name })}
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
                          {t('You')}
                        </span>
                      )}
                      {m.id === host?.id && <HostBadge you={m.id === me.id} />}
                    </button>
                  )}
                  {iAmHost && (
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
                          aria-label={delta === -1 ? t('Move {name} up', { name: m.name }) : t('Move {name} down', { name: m.name })}
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
                  )}
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
                      attempt(() => removeMember(m.id), t('{name} removed from the room.', { name: m.name }));
                    }}
                    style={{ order: 2, marginLeft: 26, height: 40, fontSize: 14 }}
                  >
                    {confirmRemove === m.id ? t('Tap again to remove {name}', { name: m.name }) : t('Remove {name} from the room', { name: m.name })}
                  </button>
                )}
                {editing && iAmHost && m.id !== me.id && (
                  <button
                    type="button"
                    className="btn btn--secondary press"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      if (confirmHost !== m.id) return setConfirmHost(m.id);
                      setConfirmHost(null);
                      setEditingId(null);
                      attempt(() => updateRoom({ host_id: m.id }), t('{name} is the host now.', { name: m.name }));
                    }}
                    style={{ order: 3, marginLeft: 26, height: 40, fontSize: 14 }}
                  >
                    {confirmHost === m.id ? t('Tap again to hand over to {name}', { name: m.name }) : t('Make {name} the host', { name: m.name })}
                  </button>
                )}
                {editing && iAmHost && m.id !== me.id && (
                  <div style={{ order: 3, marginLeft: 26, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <button
                      type="button"
                      className="btn btn--secondary press"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setEditingId(null);
                        attempt(async () => {
                          await letMemberRejoin(room.id, m.id);
                          await refreshPins();
                        }, t('{name} can rejoin on a new phone for the next 15 minutes.', { name: m.name }));
                      }}
                      style={{ height: 40, fontSize: 14 }}
                    >
                      {t('Let {name} rejoin on a new phone', { name: m.name })}
                    </button>
                    <span style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--muted)' }}>
                      {pins?.has(m.id) ? t('{name} has a PIN. This clears it.', { name: m.name }) : t('{name} has no PIN.', { name: m.name })}{' '}
                      {t("For 15 minutes, joining as {name} won't need one.", { name: m.name })}
                    </span>
                  </div>
                )}
                {editing && (
                  <div role="group" aria-label={t("{name}'s colour", { name: m.name })} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingLeft: 26 }}>
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
            {t('Waiting for your kaki to join with code {code}.', { code: room.code })}
          </p>
        )}
        <PinSetting
          roomId={room.id}
          me={me}
          hasPin={pins?.has(me.id) ?? null}
          onSaved={refreshPins}
          onToast={onToast}
        />
      </section>


      <section className="card fade-up" style={{ ...cardStyle, animationDelay: '0.12s' }} aria-labelledby="joining-label">
        <h2 id="joining-label" className="section-label" style={{ margin: 0 }}>
          {t('Who can join')}
        </h2>
        {iAmHost ? (
          <>
            <div className="segmented" role="group" aria-label={t('Who can join')} style={{ gridTemplateColumns: '1fr 1fr' }}>
              <button type="button" aria-pressed={!room.locked} onClick={() => room.locked && attempt(() => updateRoom({ locked: false }), t('Anyone with the code can join again.'))}>
                {t('Anyone with the code')}
              </button>
              <button type="button" aria-pressed={!!room.locked} onClick={() => !room.locked && attempt(() => updateRoom({ locked: true }), t('Room locked. New people will ask you first.'))}>
                {t('Ask me first')}
              </button>
            </div>
            <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>
              {room.locked
                ? t('New people ask to join and you let them in. People already in the room can still come back on a new phone.')
                : t('Anyone with the room code or invite link joins straight away. People you remove always need your OK to come back.')}
            </span>
            {joinRequests.requests.length > 0 && <JoinRequestList requests={joinRequests.requests} onAnswer={joinRequests.answer} onToast={onToast} />}
          </>
        ) : (
          <span style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--ink-2)' }}>
            {room.locked
              ? t('Locked: new people ask {name} (the host) to let them in.', { name: host?.name ?? t('the host') })
              : t('Anyone with the room code or invite link can join.')}
          </span>
        )}
      </section>

      <section className="card fade-up" style={{ ...cardStyle, animationDelay: '0.14s' }} aria-labelledby="kitty-setting-label">
        <h2 id="kitty-setting-label" className="section-label" style={{ margin: 0 }}>
          {t('Group kitty')}
        </h2>
        <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>
          {t('Everyone tops up a shared pot, say RM50 each, and meals are paid out of it instead of settling up after every lunch. The keeper holds the money.')}
        </span>
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44, cursor: iAmHost ? 'pointer' : 'default' }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>{t('Use a group kitty')}</span>
          <input
            type="checkbox"
            role="switch"
            className="switch"
            checked={kittyOn}
            disabled={!iAmHost || kittyFlip !== null}
            onChange={(e) => {
              const on = e.target.checked;
              setKittyFlip(on);
              // Whoever turns it on keeps it to start with; they can hand it to someone below.
              void attempt(
                () => updateRoom({ kitty_keeper: on ? me.id : null }),
                on ? t('Kitty on. It shows in Bills.') : t('Kitty off. Its history stays in Bills.'),
              ).finally(() => setKittyFlip(null));
            }}
          />
        </label>
        {room.kitty_keeper && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label htmlFor="kitty-keeper" className="field-label">
              {t('Kitty keeper')}
            </label>
            <select
              id="kitty-keeper"
              className="input"
              value={room.kitty_keeper}
              disabled={!iAmHost}
              onChange={(e) => {
                const keeper = members.find((m) => m.id === e.target.value);
                if (keeper) attempt(() => updateRoom({ kitty_keeper: keeper.id }), t('{name} keeps the kitty now.', { name: keeper.id === me.id ? t('You') : keeper.name }));
              }}
            >
              {members
                .filter((m) => !m.left_at || m.id === room.kitty_keeper)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id === me.id ? t('{name} (you)', { name: m.name }) : m.name}
                  </option>
                ))}
            </select>
          </div>
        )}
        {!iAmHost && <span style={{ fontSize: 13, color: 'var(--muted)' }}>{t('Only {name}, the host, can change this.', { name: host?.name ?? t('the host') })}</span>}
      </section>

      <section className="card fade-up" style={{ ...cardStyle, animationDelay: '0.16s' }}>
        <span className="section-label">{t('Rules')}</span>
        {!iAmHost && <span style={{ fontSize: 13, color: 'var(--muted)', marginTop: -6 }}>{t('Only {name}, the host, can change these.', { name: host?.name ?? t('the host') })}</span>}
        <fieldset disabled={!iAmHost} style={{ border: 'none', margin: 0, padding: 0, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span id="meals-label" style={{ fontSize: 15, fontWeight: 700 }}>{t('Meals to decide')}</span>
            <div className="segmented" role="group" aria-labelledby="meals-label">
              {(
                [
                  ['lunch', tk('Lunch only')],
                  ['both', tk('Lunch and dinner')],
                ] as const
              ).map(([value, label]) => (
                <button key={value} type="button" aria-pressed={room.meals === value} onClick={() => room.meals !== value && attempt(() => updateRoom({ meals: value }))}>
                  {t(label)}
                </button>
              ))}
            </div>
            <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>
              {room.meals === 'both'
                ? t('Each day has a lunch and a dinner decision. Dinner goes to the next person in the order, so nobody decides both.')
                : t('One decision a day. Turn on dinner to decide both meals.')}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span id="mode-label" style={{ fontSize: 15, fontWeight: 700 }}>{t('How we decide')}</span>
            <div className="segmented" role="group" aria-labelledby="mode-label">
              {(
                [
                  ['decider', tk('Decider picks')],
                  ['secret', tk('Secret picks')],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={room.decision_mode === value}
                  onClick={() => room.decision_mode !== value && attempt(() => updateRoom({ decision_mode: value }))}
                >
                  {t(label)}
                </button>
              ))}
            </div>
            <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>
              {room.decision_mode === 'secret'
                ? t('Everyone picks in secret. Once everyone’s in, the picks are revealed and the wheel spins among them. No vetoes.')
                : t('Today’s decider picks or spins, and everyone else can accept or veto.')}
            </span>
          </div>

          {room.decision_mode !== 'secret' && (
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44, cursor: 'pointer' }}>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 15, fontWeight: 700 }}>{t('Let the wheel decide if nobody has')}</span>
                <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>
                  {room.meals === 'both'
                    ? t('The decider gets a nudge at 11:30 (6:30pm for dinner). Nothing picked by 12:00 (7pm)? The wheel picks, and everyone can still accept or veto.')
                    : t('The decider gets a nudge at 11:30. Nothing picked by 12:00? The wheel picks, and everyone can still accept or veto.')}
                </span>
              </span>
              <input
                type="checkbox"
                role="switch"
                className="switch"
                checked={room.auto_decide !== false}
                onChange={(e) => attempt(() => updateRoom({ auto_decide: e.target.checked }))}
              />
            </label>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>{t('Vetoes per day')}</span>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>{t("For each person who isn't deciding")}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                type="button"
                className="icon-btn press"
                aria-label={t('Fewer vetoes')}
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
                aria-label={t('More vetoes')}
                disabled={room.veto_limit >= VETO_MAX}
                style={{ opacity: room.veto_limit >= VETO_MAX ? 0.35 : 1, fontSize: 20, fontWeight: 700 }}
                onClick={() => attempt(() => updateRoom({ veto_limit: room.veto_limit + 1 }))}
              >
                +
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span id="eat-days-label" style={{ fontSize: 15, fontWeight: 700 }}>{t('Days we eat together')}</span>
            <div className="chip-row" role="group" aria-labelledby="eat-days-label" style={{ flexWrap: 'wrap' }}>
              {([1, 2, 3, 4, 5, 6, 0] as const).map((wd) => {
                const cal = calendarOf(room);
                const on = cal.days.includes(wd);
                return (
                  <button
                    key={wd}
                    type="button"
                    className="chip press"
                    aria-pressed={on}
                    aria-label={weekdayName(wd)}
                    // At least one day stays on.
                    disabled={on && cal.days.length === 1}
                    onClick={() => changeCalendar({ ...cal, days: on ? cal.days.filter((d) => d !== wd) : [...cal.days, wd].sort() })}
                  >
                    {weekdayShort(wd)}
                  </button>
                );
              })}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44, cursor: 'pointer' }}>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 15, fontWeight: 600 }}>{t('Skip public holidays')}</span>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>{t('Selangor’s, national ones included.')}</span>
              </span>
              <input type="checkbox" role="switch" className="switch" checked={calendarOf(room).holidays} onChange={(e) => changeCalendar({ ...calendarOf(room), holidays: e.target.checked })} />
            </label>
            <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>{t('Other days have no turns, so nobody’s turn is used up. Anyone can still decide to eat together on one.')}</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>{t('Fixed days')}</span>
            <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>{t('A food you always have on a weekday, like mamak on Fridays. That lunch decides itself; nobody has to choose.')}</span>
            {([1, 2, 3, 4, 5, 6, 0] as const).map((wd) => {
              const fixed = room.fixed_days ?? {};
              const value = fixed[String(wd)] ?? '';
              return (
                <label key={wd} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44 }}>
                  <span style={{ width: 96, fontSize: 14, fontWeight: 600 }}>{weekdayName(wd)}</span>
                  <select
                    className="input"
                    value={value}
                    onChange={(e) => {
                      const next = { ...fixed };
                      if (e.target.value) next[String(wd)] = e.target.value;
                      else delete next[String(wd)];
                      attempt(() => updateRoom({ fixed_days: next }), e.target.value ? t('{day}: {food}, every week.', { day: weekdayName(wd), food: e.target.value }) : undefined);
                    }}
                    style={{ flexGrow: 1, height: 40 }}
                  >
                    <option value="">{t('Decide as usual')}</option>
                    {[...new Set([...(value ? [value] : []), ...foodNames])].map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
          </div>

          <details className="advanced">
            <summary style={{ minHeight: 44, display: 'flex', alignItems: 'center', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>{t('Advanced')}</summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 6 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label htmlFor="rotation-start" className="field-label">{t('Rotation start date')}</label>
            <input
              id="rotation-start"
              type="date"
              className="input"
              value={room.rotation_start}
              onChange={(e) => e.target.value && attempt(() => updateRoom({ rotation_start: e.target.value, rotation_offset: 0 }))}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label htmlFor="timezone" className="field-label">{t('Timezone')}</label>
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
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>{t('Decides when “today” starts for the rotation.')}</span>
          </div>
            </div>
          </details>
        </fieldset>
      </section>

      <section className="card fade-up" style={{ ...cardStyle, animationDelay: '0.24s' }}>
        <span className="section-label">{t('You & this phone')}</span>
        <span style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--ink-2)' }}>
          {t('Your food needs, DuitNow, language, notifications and more are set once for all your rooms.')}
        </span>
        {onOpenProfile && (
          <button type="button" className="btn btn--secondary press" onClick={onOpenProfile} style={{ height: 44 }}>
            {t('Open You & this phone')}
          </button>
        )}
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 8 }}>
        <button
          type="button"
          className="btn btn--danger press"
          data-armed={confirmLeave}
          onClick={() => (confirmLeave ? onLeave() : setConfirmLeave(true))}
        >
          {confirmLeave ? t('Tap again to leave this room') : t('Leave room')}
        </button>
        <p style={{ margin: 0, textAlign: 'center', fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>
          {t('You’re taken out of the turns and Who’s in. Your old meals and bills stay. Rejoin any time with code {code} and the same name.', { code: room.code })}
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
              {confirmDelete ? t('Tap again to delete everything') : t('Delete this room for everyone')}
            </button>
            <p style={{ margin: 0, textAlign: 'center', fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>
              {t('Host only. Removes the food list, history and members for good.')}
            </p>
          </>
        )}
      </section>
    </main>
  );
}

/** Your PIN: needed to continue as you on another phone, so the room code alone isn't enough. */
function PinSetting({ roomId, me, hasPin, onSaved, onToast }: { roomId: string; me: MemberRow; hasPin: boolean | null; onSaved: () => Promise<void>; onToast: (m: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async (next: string | null) => {
    setBusy(true);
    try {
      await setMyPin(roomId, next);
      await onSaved();
      setEditing(false);
      setPin('');
      onToast(next ? t('PIN saved. Use it to continue as you on another phone.') : t('PIN removed.'));
    } catch (e) {
      onToast(e instanceof Error ? e.message : t('Could not save your PIN.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 12, borderTop: '1px solid var(--divider)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>{t('Your PIN')}</span>
          <span style={{ fontSize: 13, lineHeight: 1.5, color: hasPin === false ? 'var(--accent-ink)' : 'var(--muted)' }}>
            {hasPin
              ? t('Set. Joining as {name} on another phone needs it.', { name: me.name })
              : t('Not set. Add a 4-digit PIN so nobody else can join as {name}, and so you can continue on a new phone.', { name: me.name })}
          </span>
        </span>
        {!editing && (
          <button type="button" className="btn btn--secondary press" style={{ height: 40, padding: '0 16px', fontSize: 14, flexShrink: 0 }} onClick={() => setEditing(true)}>
            {hasPin ? t('Change') : t('Set PIN')}
          </button>
        )}
      </div>
      {editing && (
        <form
          style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
          onSubmit={(e) => {
            e.preventDefault();
            if (pin.length === 4) void save(pin);
          }}
        >
          <label htmlFor="my-pin" className="sr-only">{t('New 4-digit PIN')}</label>
          <input
            id="my-pin"
            className="input"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="new-password"
            maxLength={4}
            placeholder={t('4 digits')}
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            style={{ height: 44, width: 120, flexGrow: 1, fontWeight: 700, letterSpacing: '0.3em' }}
          />
          <button type="submit" className="btn btn--primary press" disabled={busy || pin.length !== 4} style={{ height: 44, padding: '0 18px' }}>
            {t('Save')}
          </button>
          <button type="button" className="btn btn--secondary press" disabled={busy} style={{ height: 44, padding: '0 14px' }} onClick={() => setEditing(false)}>
            {t('Cancel')}
          </button>
          {hasPin && (
            <button type="button" className="btn btn--danger press" disabled={busy} style={{ height: 44, padding: '0 14px' }} onClick={() => void save(null)}>
              {t('Remove PIN')}
            </button>
          )}
        </form>
      )}
    </div>
  );
}
