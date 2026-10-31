import { useEffect, useMemo, useState } from 'react';
import { Avatar, HostBadge } from '../components/Avatar';
import { isIOS, isStandalone, useInstallPrompt } from '../lib/install';
import { shareInvite } from '../lib/invite';
import { BUDGETS, MEMBER_NEEDS } from '../lib/diet';
import { getLang, LANGS, locale, setLang, t, tk, tNodes, useLang } from '../lib/i18n';
import { turnOffLocation, turnOnLocation, useLocation } from '../lib/location';
import { NEARBY_LABEL } from '../lib/nearby';
import { nearbyPref, soundPref, themePref, usePref, type ThemePref } from '../lib/prefs';
import { disableReminders, enableReminders, pushSupport, reminderStatus, setWeeklyRecap } from '../lib/push';
import { hostOf, letMemberRejoin, MEMBER_COLORS, ROOM_NAME_MAX, roomPins, roomTitle, setMyPin } from '../lib/session';
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
  const [pins, setPins] = useState<Set<string> | null>(null);
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
  const theme = usePref(themePref);
  const lang = useLang();
  const sound = usePref(soundPref);
  const nearby = usePref(nearbyPref);
  const location = useLocation();
  const install = useInstallPrompt();
  const installed = isStandalone();

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
      </section>

      <section className="card fade-up" style={{ ...cardStyle, animationDelay: '0.08s' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="section-label">{t('Members · decider order')}</span>
          <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>
            {t('The top person decides on the rotation start date, then it goes down the list, one day each.')}
          </span>
          {members.length > 1 && (
            <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>
              {iAmHost
                ? t('You’re the host: tap someone’s name to rename them, change their colour or remove them from the room.')
                : t('{name} is the host and can remove people from the room.', { name: host?.name ?? t('The host') })}
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

      <section className="card fade-up" style={{ ...cardStyle, animationDelay: '0.12s' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="section-label">{t('Your food needs')}</span>
          <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>
            {t("Foods that clash with anyone in the room stay off the wheel, and nearby ideas skip places that don't fit.")}
          </span>
        </div>
        <div className="chip-row" role="group" aria-label={t('Diet')} style={{ flexWrap: 'wrap' }}>
          {MEMBER_NEEDS.map((n) => {
            const on = me.diet.includes(n.key);
            return (
              <button
                key={n.key}
                type="button"
                className="chip press"
                aria-pressed={on}
                onClick={() => attempt(() => updateMember(me.id, { diet: on ? me.diet.filter((d) => d !== n.key) : [...me.diet, n.key] }))}
              >
                {t(n.label)}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span id="budget-label" style={{ fontSize: 15, fontWeight: 700 }}>{t('Budget per meal')}</span>
          <div className="segmented" role="group" aria-labelledby="budget-label" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            {BUDGETS.map((b) => (
              <button key={b.label} type="button" aria-pressed={me.budget === b.value} onClick={() => me.budget !== b.value && attempt(() => updateMember(me.id, { budget: b.value }))}>
                {t(b.label)}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="card fade-up" style={{ ...cardStyle, animationDelay: '0.16s' }}>
        <span className="section-label">{t('Rules')}</span>

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

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label htmlFor="rotation-start" className="field-label">{t('Rotation start date')}</label>
          <input
            id="rotation-start"
            type="date"
            className="input"
            value={room.rotation_start}
            onChange={(e) => e.target.value && attempt(() => updateRoom({ rotation_start: e.target.value }))}
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
      </section>

      <section className="card fade-up" style={{ ...cardStyle, animationDelay: '0.24s' }}>
        <span className="section-label">{t('This phone')}</span>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span id="language-label" style={{ fontSize: 15, fontWeight: 700 }}>{t('Language')}</span>
          <div className="segmented" role="group" aria-labelledby="language-label" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            {LANGS.map((l) => (
              <button key={l.key} type="button" lang={l.key === 'zh' ? 'zh-Hans' : l.key} aria-pressed={lang === l.key} onClick={() => setLang(l.key)} style={{ fontSize: 13 }}>
                {l.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span id="appearance-label" style={{ fontSize: 15, fontWeight: 700 }}>{t('Appearance')}</span>
          <div className="segmented" role="group" aria-labelledby="appearance-label" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            {(
              [
                ['system', tk('System')],
                ['light', tk('Light')],
                ['dark', tk('Dark')],
              ] as [ThemePref, string][]
            ).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={theme === value} onClick={() => themePref.set(value)}>
                {t(label)}
              </button>
            ))}
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44, cursor: 'pointer' }}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>{t('Wheel sounds')}</span>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>{t('A tick per slice and a chime on landing')}</span>
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
            <span style={{ fontSize: 15, fontWeight: 700 }}>{t('Food ideas near {place}', { place: NEARBY_LABEL })}</span>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>{t('Places around Bandar Sunway on Today and with each result')}</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="switch"
            checked={nearby === 'on'}
            onChange={(e) => nearbyPref.set(e.target.checked ? 'on' : 'off')}
          />
        </label>

        {nearby === 'on' && (
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44, cursor: 'pointer' }}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>{t('Use my location')}</span>
              <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>
                {location.status === 'denied'
                  ? t('Blocked by your browser. Allow location for this site in your phone settings, then turn this on.')
                  : location.status === 'unavailable'
                    ? t("Couldn't get your location. Turn it off and on to try again.")
                    : t('Show the closest places first, and search near you when you’re away from Sunway. Stays on this phone; never shared with the room.')}
              </span>
            </span>
            <input
              type="checkbox"
              role="switch"
              className="switch"
              checked={location.status !== 'off' && location.status !== 'denied'}
              onChange={(e) => (e.target.checked ? void turnOnLocation() : turnOffLocation())}
            />
          </label>
        )}

        <ReminderSetting room={room} me={me} onToast={onToast} />

        {!installed && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4, borderTop: '1px solid var(--divider)' }}>
            <span style={{ fontSize: 15, fontWeight: 700, paddingTop: 10 }}>{t('Add to Home Screen')}</span>
            {install.available ? (
              <>
                <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>{t('Open Makan apa? like an app, full screen.')}</span>
                <button
                  type="button"
                  className="btn btn--primary press"
                  onClick={async () => {
                    if (await install.prompt()) onToast(t('Added. Look for Makan apa? on your home screen.'));
                  }}
                >
                  {t('Install app')}
                </button>
              </>
            ) : isIOS() ? (
              <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>
                {tNodes('In Safari, tap {icon} Share, then {add}.', {
                  icon: (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label={t('Share')} style={{ verticalAlign: '-2px' }}>
                      <path d="M12 3v12M7.5 7.5L12 3l4.5 4.5" />
                      <path d="M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8" />
                    </svg>
                  ),
                  add: <strong style={{ color: 'var(--ink)' }}>{t('Add to Home Screen')}</strong>,
                })}
              </span>
            ) : (
              <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>
                {tNodes('Open your browser menu and choose {install} or {add}.', {
                  install: <strong style={{ color: 'var(--ink)' }}>{t('Install app')}</strong>,
                  add: <strong style={{ color: 'var(--ink)' }}>{t('Add to Home screen')}</strong>,
                })}
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
          {confirmLeave ? t('Tap again to leave this room') : t('Leave room on this phone')}
        </button>
        <p style={{ margin: 0, textAlign: 'center', fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>
          {t('You stay in the rotation. Rejoin any time with code {code} and the same name.', { code: room.code })}
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

const REMINDER_HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 6am to 10pm

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

function hourLabel(h: number): string {
  // English keeps "11:00 am"; Malay and Chinese use their own clock style.
  if (getLang() !== 'en') return new Intl.DateTimeFormat(locale(), { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(Date.UTC(2000, 0, 1, h));
  const suffix = h < 12 ? 'am' : 'pm';
  return `${h % 12 === 0 ? 12 : h % 12}:00 ${suffix}`;
}

/** Daily push reminder for this phone (sent by the send-reminders Edge Function). */
function ReminderSetting({ room, me, onToast }: { room: RoomRow; me: MemberRow; onToast: (m: string) => void }) {
  const support = pushSupport();
  const [status, setStatus] = useState<{ hour: number; recap?: boolean } | null | 'loading'>('loading');
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

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      onToast(ok);
    } catch (e) {
      onToast(e instanceof Error ? e.message : t('Could not change reminders.'));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (next: boolean) =>
    run(
      async () => {
        if (next) {
          await enableReminders(me.id, hour);
          setStatus({ hour, recap: true });
        } else {
          await disableReminders();
          setStatus(null);
        }
      },
      next ? t("Reminders on. We'll nudge you at {time}.", { time: hourLabel(hour) }) : t('Reminders off on this phone.'),
    );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44, cursor: support === 'ok' ? 'pointer' : 'default' }}>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>{t('Daily reminder')}</span>
          <span style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--muted)' }}>
            {support === 'ok'
              ? room.decision_mode === 'secret'
                ? t('A notification to make your secret pick, if it’s not decided yet.')
                : t('A notification when it’s your turn to choose, if it’s not decided yet.')
              : support === 'needs-install'
                ? t('On iPhone, add Makan apa? to your Home Screen first (below), then turn this on from there.')
                : t('This browser can’t show notifications.')}
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
            {t('Remind me at')}
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
                setStatus((s) => ({ hour: h, recap: s !== 'loading' && s ? s.recap : true }));
              }, t('Reminder moved to {time}.', { time: hourLabel(h) }));
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
      {on && typeof status === 'object' && status && (
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44, cursor: 'pointer' }}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{t('Weekly recap')}</span>
            <span style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--muted)' }}>{t("Sunday at 8pm: the week's meals, favourite, vetoes and who paid most.")}</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="switch"
            checked={status.recap !== false}
            disabled={busy}
            onChange={(e) => {
              const next = e.target.checked;
              run(async () => {
                await setWeeklyRecap(next);
                setStatus({ ...status, recap: next });
              }, next ? t('Weekly recap on.') : t('Weekly recap off.'));
            }}
          />
        </label>
      )}
      {on && (
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{t('Times are in the room’s timezone ({zone}).', { zone: room.timezone.replace(/_/g, ' ') })}</span>
      )}
    </div>
  );
}
