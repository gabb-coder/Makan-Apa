import { useState, type ReactNode } from 'react';
import { formatTag, lastEatenLabel, mapsSearchUrl, type Food } from '../lib/foods';
import { darken, FOOD_COLORS } from '../lib/palette';
import type { MemberRow } from '../lib/supabase';
import { usePrefersReducedMotion } from '../lib/usePrefersReducedMotion';
import { FoodIcon } from './FoodIcon';
import { FoodTile } from './FoodTile';

const enter = 'fadeUp 0.55s cubic-bezier(0.2, 0.8, 0.2, 1) both';
const display = { fontFamily: 'var(--font-display)', fontWeight: 800 } as const;

/** Run an async action with a busy flag, reporting failures. */
export function useAction(onError: (message: string) => void) {
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

/* ---------- Decider card (orange) ---------- */

export function DeciderShell({ decider, label, children }: { decider: MemberRow; label: string; children: ReactNode }) {
  return (
    <section
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: 'var(--accent)',
        color: '#FFFFFF',
        borderRadius: 24,
        padding: 22,
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        flexShrink: 0,
        animation: enter,
      }}
    >
      <svg
        width="230"
        height="230"
        viewBox="0 0 230 230"
        aria-hidden="true"
        style={{ position: 'absolute', right: -70, top: -70, pointerEvents: 'none', animation: 'spinSlow 40s linear infinite' }}
      >
        <g fill="none" stroke="#FFFFFF" strokeOpacity="0.18" strokeWidth="2">
          <circle cx="115" cy="115" r="110" />
          <circle cx="115" cy="115" r="70" />
          <circle cx="115" cy="115" r="22" />
          <path d="M115 5v220M5 115h220M37.2 37.2l155.6 155.6M192.8 37.2L37.2 192.8" />
        </g>
      </svg>
      <span style={{ position: 'relative', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{label}</span>
      {children}
      <span className="sr-only">Today's decider is {decider.name}</span>
    </section>
  );
}

function DeciderHeading({ decider, title, sub }: { decider: MemberRow; title: string; sub: string }) {
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14 }}>
      <div
        aria-hidden="true"
        style={{
          width: 54,
          height: 54,
          flexShrink: 0,
          borderRadius: 999,
          background: '#FFFFFF',
          color: decider.color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          ...display,
          fontSize: 24,
          animation: 'bob 2.6s ease-in-out infinite',
        }}
      >
        {decider.name.trim().charAt(0).toUpperCase()}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ ...display, fontSize: 30, letterSpacing: '-0.02em', lineHeight: 1.05, overflowWrap: 'anywhere' }}>{title}</span>
        <span style={{ fontSize: 14, lineHeight: 1.4 }}>{sub}</span>
      </div>
    </div>
  );
}

interface YourTurnProps {
  me: MemberRow;
  sub: string;
  onSpin: () => void;
  onPickList: () => void;
  onType: () => void;
}

export function YourTurnCard({ me, sub, onSpin, onPickList, onType }: YourTurnProps) {
  return (
    <DeciderShell decider={me} label="Today's decider">
      <DeciderHeading decider={me} title="Your turn!" sub={sub} />
      <button
        type="button"
        className="press spin-btn"
        onClick={onSpin}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
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
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#CC3F17" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8" />
        </svg>
        Spin the wheel
      </button>
      <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
        <button type="button" className="btn btn--ghost-light press" onClick={onPickList}>
          Pick from list
        </button>
        <button type="button" className="btn btn--ghost-light press" onClick={onType}>
          Type my own
        </button>
      </div>
    </DeciderShell>
  );
}

export function ChoosingCard({ decider, sub }: { decider: MemberRow; sub: string }) {
  return (
    <DeciderShell decider={decider} label="Today's decider">
      <DeciderHeading decider={decider} title={decider.name} sub={`is choosing… ${sub}`.trim()} />
    </DeciderShell>
  );
}

interface SentProps {
  me: MemberRow;
  food: Food;
  method: 'direct' | 'wheel' | null;
  waitingFor: string;
  /** Who can answer, e.g. "Alex" or "Alex or Sam". */
  answerers: string;
  busy: boolean;
  onChange: () => void;
  onRetract: () => void;
}

export function SentCard({ me, food, method, waitingFor, answerers, busy, onChange, onRetract }: SentProps) {
  return (
    <DeciderShell decider={me} label="Today's decider">
      <DeciderHeading decider={me} title={`Sent to ${waitingFor}`} sub={answerers.includes(' or ') ? `Waiting for a yes from ${answerers}…` : `Waiting for ${answerers} to say yes…`} />
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: 12,
          borderRadius: 16,
          background: 'var(--surface)',
          color: 'var(--ink)',
        }}
      >
        <FoodTile food={food} size={44} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
          <span style={{ fontSize: 17, fontWeight: 800, overflowWrap: 'anywhere' }}>{food.name}</span>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>{method === 'wheel' ? 'Wheel pick' : 'Picked directly'}</span>
        </div>
      </div>
      <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
        <button type="button" className="btn btn--ghost-light press" disabled={busy} onClick={onChange}>
          Change pick
        </button>
        <button type="button" className="btn btn--ghost-light press" disabled={busy} onClick={onRetract}>
          Take it back
        </button>
      </div>
    </DeciderShell>
  );
}

/* ---------- Proposal (non-decider) ---------- */

interface ProposalProps {
  food: Food;
  method: 'direct' | 'wheel' | null;
  deciderName: string;
  lastEatenText: string;
  vetoesLeft: number;
  busy: boolean;
  onAccept: () => void;
  onVeto: () => void;
}

export function ProposalCard({ food, method, deciderName, lastEatenText, vetoesLeft, busy, onAccept, onVeto }: ProposalProps) {
  const c = FOOD_COLORS[food.color];
  const deep = darken(c.ink, 0.45);
  const nameSize = food.name.length > 14 ? 40 : food.name.length > 9 ? 48 : 56;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <section
        style={{
          animation: 'popInScale 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) both',
          position: 'relative',
          overflow: 'hidden',
          background: c.tile,
          borderRadius: 28,
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <svg
          width="200"
          height="200"
          viewBox="0 0 200 200"
          aria-hidden="true"
          style={{ position: 'absolute', right: -50, bottom: -60, pointerEvents: 'none', animation: 'spinSlow 30s linear infinite' }}
        >
          <g fill="none" stroke={c.ink} strokeOpacity="0.12" strokeWidth="2">
            <circle cx="100" cy="100" r="95" />
            <circle cx="100" cy="100" r="60" />
            <circle cx="100" cy="100" r="25" />
          </g>
        </svg>
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div
            aria-hidden="true"
            style={{
              animation: 'floaty 2.8s ease-in-out infinite',
              width: 72,
              height: 72,
              borderRadius: 22,
              background: '#FFFFFF',
              color: c.ink,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 6px 14px ${c.ink}26`,
            }}
          >
            <FoodIcon icon={food.icon} size={40} strokeWidth={1.7} steam />
          </div>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 10px',
              borderRadius: 999,
              background: '#FFFFFF',
              color: c.ink,
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {method === 'wheel' ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 3v18M3 12h18" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            )}
            {method === 'wheel' ? 'Wheel pick' : 'Picked directly'}
          </span>
        </div>
        <span style={{ position: 'relative', ...display, fontSize: nameSize, letterSpacing: '-0.04em', lineHeight: 0.95, color: deep, overflowWrap: 'anywhere' }}>
          {food.name}
        </span>
        {food.tags.length > 0 && (
          <div style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {food.tags.map((t) => (
              <span key={t} style={{ padding: '6px 12px', borderRadius: 999, background: '#FFFFFF', color: c.ink, fontSize: 13, fontWeight: 700 }}>
                {formatTag(t)}
              </span>
            ))}
          </div>
        )}
        <span style={{ position: 'relative', fontSize: 14, color: deep }}>{lastEatenText}</span>
      </section>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, animation: 'fadeUp 0.55s 0.2s cubic-bezier(0.2, 0.8, 0.2, 1) both' }}>
        <span style={{ ...display, fontSize: 20 }}>Good with this?</span>
        <button
          type="button"
          className="press"
          disabled={busy}
          onClick={onAccept}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            height: 58,
            border: 'none',
            borderRadius: 18,
            background: 'var(--accent)',
            color: '#FFFFFF',
            fontSize: 17,
            fontWeight: 800,
            boxShadow: '0 8px 18px rgba(204, 63, 23, 0.3)',
            animation: 'glow 2s ease-in-out infinite',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
          Let's go
        </button>
        {vetoesLeft > 0 ? (
          <>
            <button
              type="button"
              className="btn btn--secondary press"
              disabled={busy}
              onClick={onVeto}
              style={{ height: 52, borderRadius: 18, fontSize: 16 }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
              Veto · {vetoesLeft} left today
            </button>
            <p style={{ margin: '2px 0 0', fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>
              A veto sends it back to {deciderName} and takes {food.name} off the wheel for today.
            </p>
          </>
        ) : (
          <p style={{ margin: '2px 0 0', fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>
            You've used your vetoes today, so this pick stands.
          </p>
        )}
      </div>
    </div>
  );
}

/** "Last eaten 5 days ago, picked by you" for the proposal card. */
export function lastEatenText(days: number | null, pickedBy: string | null): string {
  if (days === null) return 'You haven’t had this together yet';
  const prefix = `Last eaten ${lastEatenLabel(days).toLowerCase()}`;
  return pickedBy ? `${prefix}, picked by ${pickedBy}` : prefix;
}

/* ---------- Decided ---------- */

const CONFETTI = [
  [8, 9, 16, 3, '#FFD966', 2.8, 0],
  [18, 10, 10, 999, '#A9CDF4', 3.4, 0.6],
  [28, 8, 15, 3, '#CC3F17', 3, 0.2],
  [38, 9, 9, 999, '#DDBBE8', 3.7, 1.1],
  [50, 9, 16, 3, '#93D7CC', 2.6, 0.4],
  [60, 10, 10, 999, '#FFB4A2', 3.2, 1.4],
  [70, 8, 15, 3, '#A8D8A0', 2.9, 0.8],
  [80, 9, 9, 999, '#FFD966', 3.5, 0.1],
  [90, 9, 16, 3, '#2F6FD6', 3.1, 0.9],
  [14, 8, 15, 3, '#F6C59A', 3.6, 1.6],
  [46, 10, 10, 999, '#CC3F17', 2.7, 1.3],
  [76, 8, 15, 3, '#DDBBE8', 3.3, 0.5],
] as const;

interface DecidedProps {
  food: Food;
  tomorrowText: string;
  busy: boolean;
  onUndo?: () => void;
}

export function DecidedCard({ food, tomorrowText, busy, onUndo }: DecidedProps) {
  const reduced = usePrefersReducedMotion();
  return (
    <section
      className="card"
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 28,
        padding: '44px 24px 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        textAlign: 'center',
        flexShrink: 0,
      }}
    >
      {!reduced && (
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {CONFETTI.map(([left, w, h, radius, color, dur, delay], i) => (
            <span
              key={i}
              style={{
                position: 'absolute',
                left: `${left}%`,
                top: 0,
                width: w,
                height: h,
                borderRadius: radius,
                background: color,
                animation: `fall ${dur}s linear ${delay}s infinite both`,
              }}
            />
          ))}
        </div>
      )}
      <div
        aria-hidden="true"
        style={{
          animation: 'popInScale 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) both',
          position: 'relative',
          width: 84,
          height: 84,
          borderRadius: 999,
          background: 'var(--accent)',
          color: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 10px 22px rgba(204, 63, 23, 0.35)',
        }}
      >
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path
            d="M5 12.5l4.5 4.5L19 7.5"
            pathLength={1}
            style={{ strokeDasharray: 1, strokeDashoffset: reduced ? 0 : 1, animation: reduced ? 'none' : 'draw 0.45s 0.4s ease forwards' }}
          />
        </svg>
      </div>
      <span className="section-label" style={{ position: 'relative', marginTop: 10, letterSpacing: '0.08em' }}>
        It's decided
      </span>
      <span
        style={{
          position: 'relative',
          ...display,
          fontSize: food.name.length > 12 ? 40 : 56,
          letterSpacing: '-0.04em',
          lineHeight: 0.95,
          overflowWrap: 'anywhere',
          animation: 'popInScale 0.6s 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) both',
        }}
      >
        {food.name}!
      </span>
      <p style={{ position: 'relative', margin: 0, fontSize: 15, lineHeight: 1.5, color: 'var(--muted)' }}>
        Saved to history. {tomorrowText}
      </p>
      <div style={{ position: 'relative', alignSelf: 'stretch', display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
        <a
          href={mapsSearchUrl(food.name)}
          target="_blank"
          rel="noreferrer"
          className="btn press"
          style={{ height: 52, borderRadius: 16, background: 'var(--ink)', color: 'var(--on-ink)', fontSize: 16 }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
            <circle cx="12" cy="9.5" r="2.5" />
          </svg>
          Find one nearby
        </a>
        {onUndo && (
          <button
            type="button"
            disabled={busy}
            onClick={onUndo}
            style={{ height: 44, border: 'none', background: 'transparent', color: 'var(--muted)', fontSize: 14, fontWeight: 600 }}
          >
            Undo
          </button>
        )}
      </div>
    </section>
  );
}

/* ---------- Vetoed ---------- */

interface VetoedProps {
  foodName: string;
  deciderName: string;
  vetoesLeft: number;
  busy: boolean;
  onUndo: () => void;
}

export function VetoedCard({ foodName, deciderName, vetoesLeft, busy, onUndo }: VetoedProps) {
  return (
    <section
      className="card"
      style={{
        animation: 'shake 0.55s ease both',
        borderRadius: 28,
        padding: '40px 24px 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        textAlign: 'center',
        flexShrink: 0,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          animation: 'spinIn 0.55s 0.1s cubic-bezier(0.2, 0.8, 0.2, 1) both',
          width: 84,
          height: 84,
          borderRadius: 999,
          background: 'var(--track)',
          color: 'var(--ink)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </div>
      <span className="section-label" style={{ marginTop: 10, letterSpacing: '0.08em' }}>
        Vetoed
      </span>
      <span style={{ ...display, fontSize: 34, letterSpacing: '-0.03em', lineHeight: 1.05 }}>Back to {deciderName}</span>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: 'var(--muted)' }}>
        {foodName} is off the wheel for today.{' '}
        {vetoesLeft > 0
          ? `You have ${vetoesLeft} veto${vetoesLeft === 1 ? '' : 'es'} left.`
          : `You've used your veto, so the next pick stands.`}
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={onUndo}
        style={{ marginTop: 12, height: 44, padding: '0 16px', border: 'none', background: 'transparent', color: 'var(--muted)', fontSize: 14, fontWeight: 600 }}
      >
        Undo veto
      </button>
    </section>
  );
}
