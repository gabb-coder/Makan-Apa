import { useState } from 'react';
import { t } from '../lib/i18n';
import { CODE_LENGTH, createRoom, JoinError, joinRoom, type KnownRoom, normalizeCode, ROOM_NAME_MAX, roomTitle, suggestedCode, type Session } from '../lib/session';

const SLICES = [
  ['M160 160L160 10A150 150 0 0 1 266.07 53.93Z', '#A8D8A0'],
  ['M160 160L266.07 53.93A150 150 0 0 1 310 160Z', '#FFD966'],
  ['M160 160L310 160A150 150 0 0 1 266.07 266.07Z', '#F6C59A'],
  ['M160 160L266.07 266.07A150 150 0 0 1 160 310Z', '#FFB4A2'],
  ['M160 160L160 310A150 150 0 0 1 53.93 266.07Z', '#A9CDF4'],
  ['M160 160L53.93 266.07A150 150 0 0 1 10 160Z', '#DDBBE8'],
  ['M160 160L10 160A150 150 0 0 1 53.93 53.93Z', '#E9CC9F'],
  ['M160 160L53.93 53.93A150 150 0 0 1 160 10Z', '#93D7CC'],
];

const fadeUp = (delay: number) => `fadeUpJoin 0.6s ${delay}s cubic-bezier(0.2, 0.8, 0.2, 1) both`;

interface Props {
  onJoined: (s: Session, message?: string) => void;
  notice?: string;
  /** Rooms this phone is already in, to go back to. */
  rooms?: KnownRoom[];
  onOpenRoom?: (roomId: string) => void;
}

export function JoinScreen({ onJoined, notice, rooms = [], onOpenRoom }: Props) {
  const [name, setName] = useState('');
  const [code, setCode] = useState(suggestedCode);
  const [busy, setBusy] = useState<'join' | 'create' | null>(null);
  // "Create a new room" first reveals an optional room name, then creates.
  const [naming, setNaming] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [error, setError] = useState<string | null>(notice ?? null);
  // Shown once the name turns out to be taken by someone with a PIN.
  const [pinFor, setPinFor] = useState<string | null>(null);
  const [pin, setPin] = useState('');

  const trimmed = name.trim();

  const run = async (kind: 'join' | 'create') => {
    if (!trimmed) {
      setError(t('Add your name first so your kakis know who’s deciding.'));
      document.getElementById('join-name')?.focus();
      return;
    }
    if (kind === 'join' && code.length !== CODE_LENGTH) {
      setError(t('Room codes are {n} characters. Or create a new room.', { n: CODE_LENGTH }));
      document.getElementById('join-code')?.focus();
      return;
    }
    setBusy(kind);
    setError(null);
    try {
      if (kind === 'join') {
        const s = await joinRoom(code, trimmed, pinFor ? pin : undefined);
        onJoined(
          s,
          s.rejoined
            ? t('Welcome back, {name}.', { name: s.me.name })
            : s.room.name
              ? t("You're in “{name}”.", { name: s.room.name })
              : t("You're in room {code}.", { code: s.room.code }),
        );
      } else {
        const s = await createRoom(trimmed, roomName);
        onJoined(
          s,
          s.room.name
            ? t('“{name}” created. Share code {code} with your kakis.', { name: roomTitle(s.room), code: s.room.code })
            : t('Room {code} created. Share code {code} with your kakis.', { code: s.room.code }),
        );
      }
    } catch (e) {
      if (e instanceof JoinError && (e.problem === 'pin_required' || e.problem === 'wrong_pin')) {
        setPinFor(e.memberName);
        setPin('');
        setTimeout(() => document.getElementById('join-pin')?.focus(), 0);
      }
      setError(e instanceof Error ? e.message : t('Something went wrong. Try again.'));
      setBusy(null);
    }
  };

  return (
    <div
      className="app"
      style={{ justifyContent: 'space-between', padding: '56px 24px calc(32px + env(safe-area-inset-bottom))', overflowY: 'auto' }}
    >
      <svg
        width="280"
        height="280"
        viewBox="0 0 320 320"
        aria-hidden="true"
        style={{
          position: 'absolute',
          right: -96,
          top: -70,
          transform: 'rotate(-14deg)',
          pointerEvents: 'none',
          animation: 'rollIn 1.1s cubic-bezier(0.2, 0.8, 0.2, 1) both, spinJoin 30s linear 1.1s infinite',
        }}
      >
        <g stroke="#FFFFFF" strokeWidth="3">
          {SLICES.map(([d, fill]) => (
            <path key={d} d={d} fill={fill} />
          ))}
        </g>
        <circle cx="160" cy="160" r="152" fill="none" stroke="#18181B" strokeWidth="6" />
        <circle cx="160" cy="160" r="30" fill="#FFFFFF" stroke="#18181B" strokeWidth="5" />
        <circle cx="160" cy="160" r="12" fill="#CC3F17" />
      </svg>

      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 14, marginTop: 150 }}>
        <h1
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: 56,
            fontWeight: 800,
            letterSpacing: '-0.04em',
            lineHeight: 0.92,
            animation: fadeUp(0.3),
          }}
        >
          Makan
          <br />
          <span
            style={{
              display: 'inline-block',
              color: 'var(--accent)',
              transformOrigin: '30% 90%',
              animation: 'popInTilt 0.65s 0.75s cubic-bezier(0.2, 0.8, 0.2, 1) both, wiggleSoft 4s 1.8s ease-in-out infinite',
            }}
          >
            apa?
          </span>
        </h1>
        <p style={{ margin: 0, fontSize: 17, lineHeight: 1.5, color: 'var(--ink-2)', animation: fadeUp(0.45) }}>
          {t('Take turns deciding what to eat, or let the wheel settle it.')}
        </p>
      </div>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          run('join');
        }}
        style={{
          position: 'relative',
          marginTop: 28,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 26,
          padding: 22,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          boxShadow: '0 12px 30px rgba(24, 24, 27, 0.08)',
          animation: fadeUp(0.6),
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label htmlFor="join-name" className="field-label">{t('Your name')}</label>
            <input
              id="join-name"
              className="input"
              placeholder="Gabriel"
              autoComplete="nickname"
              maxLength={24}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setPinFor(null);
              }}
              style={{ height: 52 }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label htmlFor="join-code" className="field-label">{t('Room code')}</label>
            <input
              id="join-code"
              className="input"
              placeholder="K7M2QX"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              value={code}
              onChange={(e) => setCode(normalizeCode(e.target.value))}
              style={{ height: 52, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}
            />
          </div>
        </div>

        {pinFor && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, animation: 'fadeUpJoin 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) both' }}>
            <label htmlFor="join-pin" className="field-label">{t("{name}'s PIN", { name: pinFor })}</label>
            <input
              id="join-pin"
              className="input"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={4}
              placeholder="••••"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              style={{ height: 52, fontWeight: 700, letterSpacing: '0.4em' }}
            />
          </div>
        )}

        {error && (
          <p role="alert" style={{ margin: 0, fontSize: 14, lineHeight: 1.45, color: 'var(--danger)' }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          className="btn btn--primary press"
          disabled={busy !== null}
          style={{
            height: 54,
            borderRadius: 16,
            fontSize: 16,
            boxShadow: '0 8px 18px rgba(204, 63, 23, 0.3)',
            animation: 'glowSoft 2.4s ease-in-out 1.4s infinite',
          }}
        >
          {busy === 'join' ? t('Joining…') : t('Join room')}
        </button>
        {naming && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, animation: 'fadeUpJoin 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) both' }}>
            <label htmlFor="room-name" className="field-label">
              {t('Room name')} <span style={{ fontWeight: 500, color: 'var(--muted)' }}>{t('(optional)')}</span>
            </label>
            <input
              id="room-name"
              className="input"
              placeholder={t('e.g. Sunway lunch gang')}
              maxLength={ROOM_NAME_MAX}
              autoFocus
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  run('create');
                }
              }}
              style={{ height: 52 }}
            />
          </div>
        )}
        <button
          type="button"
          className="btn btn--secondary press"
          disabled={busy !== null}
          onClick={() => (naming ? run('create') : setNaming(true))}
          style={{ height: 50, borderRadius: 16 }}
        >
          {busy === 'create' ? t('Creating…') : naming ? t('Create room') : t('Create a new room')}
        </button>
      </form>

      {rooms.length > 0 && onOpenRoom && (
        <section style={{ position: 'relative', marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8, animation: fadeUp(0.7) }}>
          <span className="section-label">{t('Your rooms on this phone')}</span>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {rooms.map((r) => (
              <button key={r.roomId} type="button" className="row" onClick={() => onOpenRoom(r.roomId)}>
                <span style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1, textAlign: 'left' }}>
                  <span style={{ fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {t("Code {code} · you're {name}", { code: r.code, name: r.name })}
                  </span>
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)', flexShrink: 0 }}>{t('Open')}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <p style={{ position: 'relative', margin: '24px 0 0', textAlign: 'center', fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>
        {t('No sign-up. Share the room code with your makan kakis.')}
      </p>
    </div>
  );
}
