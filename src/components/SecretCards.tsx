import { useEffect, useRef, useState } from 'react';
import type { Food } from '../lib/foods';
import { t } from '../lib/i18n';
import type { MemberRow } from '../lib/supabase';
import { useWheelSpin } from '../lib/useWheelSpin';
import { Avatar } from './Avatar';
import { DeciderShell } from './DayCards';
import { FoodTile } from './FoodTile';
import { Wheel } from './Wheel';

const display = { fontFamily: 'var(--font-display)', fontWeight: 800 } as const;

/* ---------- Collecting picks ---------- */

interface CollectProps {
  decider: MemberRow;
  members: MemberRow[];
  me: MemberRow;
  /** Members who have picked (not what they picked). */
  pickedIds: Set<string>;
  myPick: Food | null;
  onPickList: () => void;
  onType: () => void;
}

export function SecretCollectCard({ decider, members, me, pickedIds, myPick, onPickList, onType }: CollectProps) {
  const count = members.filter((m) => pickedIds.has(m.id)).length;
  const waitingOn = members.filter((m) => !pickedIds.has(m.id) && m.id !== me.id).map((m) => m.name);
  return (
    <DeciderShell decider={decider} label={t('Secret picks')}>
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ ...display, fontSize: 30, letterSpacing: '-0.02em', lineHeight: 1.05 }}>{myPick ? t('You’re in!') : t('Pick in secret')}</span>
        <span style={{ fontSize: 14, lineHeight: 1.4 }}>
          {t("{count} of {total} picked. Everything's revealed when everyone's in.", { count, total: members.length })}
        </span>
      </div>

      <ul aria-label={t('Who has picked')} style={{ position: 'relative', listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {members.map((m) => {
          const done = pickedIds.has(m.id);
          return (
            <li key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: done ? 1 : 0.7 }}>
              <span style={{ position: 'relative' }}>
                <Avatar name={m.name} color={m.color} size={30} inverted />
                {done && (
                  <span
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      right: -4,
                      bottom: -4,
                      width: 16,
                      height: 16,
                      borderRadius: 999,
                      background: '#18181B',
                      color: '#FFFFFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      animation: 'popInScale 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) both',
                    }}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  </span>
                )}
              </span>
              <span style={{ fontSize: 14, fontWeight: 700 }}>
                {m.id === me.id ? t('You') : m.name}
                <span className="sr-only">{' ' + (done ? t('has picked') : t('hasn’t picked yet'))}</span>
              </span>
            </li>
          );
        })}
      </ul>

      {myPick ? (
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, background: 'var(--surface)', color: 'var(--ink)' }}>
            <FoodTile food={myPick} size={44} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
              <span style={{ fontSize: 17, fontWeight: 800, overflowWrap: 'anywhere' }}>{myPick.name}</span>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>{t('Only you can see this until the reveal')}</span>
            </div>
          </div>
          <span style={{ fontSize: 14 }}>{waitingOn.length ? t('Waiting for {names}…', { names: waitingOn.join(', ') }) : t('Revealing…')}</span>
          <button type="button" className="btn btn--ghost-light press" onClick={onPickList}>
            {t('Change my pick')}
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            className="press"
            onClick={onPickList}
            style={{
              position: 'relative',
              height: 54,
              border: 'none',
              borderRadius: 16,
              background: '#FFFFFF',
              color: '#18181B',
              fontSize: 16,
              fontWeight: 800,
              boxShadow: '0 6px 16px rgba(80, 20, 4, 0.25)',
              animation: 'pulseWhite 2.2s ease-out infinite',
            }}
          >
            {t('Pick from list')}
          </button>
          <button type="button" className="btn btn--ghost-light press" style={{ position: 'relative' }} onClick={onType}>
            {t('Type my own')}
          </button>
        </>
      )}
    </DeciderShell>
  );
}

/* ---------- Reveal and shared spin ---------- */

export interface RevealedPick {
  member: MemberRow;
  food: Food;
}

interface RevealProps {
  picks: RevealedPick[];
  me: MemberRow;
  /** Today's result once someone has spun; every phone animates to it. */
  result: Food | null;
  onSpin: (pick: RevealedPick) => Promise<boolean>;
  /** The wheel has finished landing on `result`. */
  onDone: () => void;
  onError: (message: string) => void;
}

export function SecretRevealCard({ picks, me, result, onSpin, onDone, onError }: RevealProps) {
  const wheel = useWheelSpin();
  const [busy, setBusy] = useState(false);
  const animatedFor = useRef<string | null>(null);
  // One slice per pick, so a food two people chose gets two slices.
  const slices = picks.map((p) => ({ ...p.food, id: `pick:${p.member.id}` }));

  // Whoever spun, every phone lands on the saved result.
  useEffect(() => {
    if (!result || animatedFor.current === result.name) return;
    animatedFor.current = result.name;
    const lower = result.name.toLowerCase();
    const options = slices.map((s, i) => (s.name.toLowerCase() === lower ? i : -1)).filter((i) => i >= 0);
    const k = options.length ? options[Math.floor(Math.random() * options.length)] : 0;
    wheel.spinTo(k, slices.length, () => window.setTimeout(onDone, wheel.reducedMotion ? 0 : 1400));
  }, [result]);

  const spin = async () => {
    setBusy(true);
    try {
      const winner = picks[Math.floor(Math.random() * picks.length)];
      await onSpin(winner);
    } catch (e) {
      onError(e instanceof Error ? e.message : t('Could not spin.'));
      setBusy(false);
    }
  };

  const started = busy || wheel.spinning || !!result;

  return (
    <section
      className="card"
      style={{
        borderRadius: 24,
        padding: 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        flexShrink: 0,
        animation: 'popInScale 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) both',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span className="section-label">{t('The reveal')}</span>
        <span style={{ ...display, fontSize: 28, letterSpacing: '-0.02em' }}>{t("Everyone's in!")}</span>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {picks.map((p, i) => (
          <li
            key={p.member.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              animation: `popInScale 0.5s ${(0.2 + i * 0.25).toFixed(2)}s cubic-bezier(0.2, 0.8, 0.2, 1) both`,
            }}
          >
            <Avatar name={p.member.name} color={p.member.color} size={28} />
            <span style={{ fontSize: 14, fontWeight: 700, minWidth: 0, flexShrink: 0 }}>{p.member.id === me.id ? 'You' : p.member.name}</span>
            <span aria-hidden="true" style={{ color: 'var(--muted)' }}>
              →
            </span>
            <FoodTile food={p.food} size={28} />
            <span style={{ fontSize: 15, fontWeight: 800, overflowWrap: 'anywhere' }}>{p.food.name}</span>
          </li>
        ))}
      </ul>
      <Wheel
        foods={slices}
        rotation={wheel.rotation}
        animate={!wheel.reducedMotion}
        sway={!wheel.reducedMotion && !started}
        tick={wheel.tick}
        burstKey={wheel.burstKey}
        rotorRef={wheel.rotorRef}
      />
      <button
        type="button"
        className="press"
        disabled={started}
        onClick={spin}
        style={{
          height: 58,
          border: 'none',
          borderRadius: 18,
          background: 'var(--accent)',
          color: '#FFFFFF',
          fontFamily: 'var(--font-display)',
          fontSize: 20,
          fontWeight: 800,
          boxShadow: '0 8px 18px rgba(204, 63, 23, 0.3)',
          animation: started ? 'none' : 'glow 2s ease-in-out infinite',
          opacity: started && !wheel.spinning && !result ? 0.6 : 1,
        }}
      >
        {wheel.spinning ? t('Spinning…') : result ? `${result.name}!` : t('Spin for everyone')}
      </button>
      <p style={{ margin: 0, textAlign: 'center', fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>
        {t('Anyone can spin. Every phone sees the same wheel, and where it lands is final.')}
      </p>
    </section>
  );
}
