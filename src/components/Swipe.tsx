import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import '../styles/swipe.css';
import { Avatar } from './Avatar';
import { FoodTile } from './FoodTile';
import { t } from '../lib/i18n';
import { joinNames, lastEatenLabel, wheelWeight, type Food } from '../lib/foods';
import { FOOD_COLORS } from '../lib/palette';
import { priceLabel } from '../lib/nearby';
import { dealFoods, tallySwipes } from '../lib/swipe';
import type { MemberRow, SwipeRow } from '../lib/supabase';

const CLOSE_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
}

/** The decider deals out a few foods for everyone to swipe on. */
export function SwipeSheet({ foods, onStart, onClose }: { foods: Food[]; onStart: (options: string[]) => Promise<void>; onClose: () => void }) {
  useEscape(onClose);
  const [n, setN] = useState(Math.min(8, foods.length));
  const [dealt, setDealt] = useState<Food[]>(() => dealFoods(foods, Math.min(8, foods.length), wheelWeight));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deal = (count = n) => setDealt(dealFoods(foods, count, wheelWeight));
  const sizes = [6, 8, 10].filter((k) => k <= foods.length);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="swipe-sheet-title" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '90dvh', overflowY: 'auto' }}>
        <div aria-hidden="true" style={{ width: 40, height: 5, borderRadius: 999, background: 'var(--border-strong)', alignSelf: 'center', flexShrink: 0 }} />
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <h2 id="swipe-sheet-title" className="title title--sm" style={{ fontSize: 24 }}>
            {t('Swipe to match')}
          </h2>
          <button type="button" className="icon-btn press" aria-label={t('Close')} onClick={onClose}>
            {CLOSE_ICON}
          </button>
        </header>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--ink-2)' }}>
          {t('Everyone swipes yes or no on these. The ones everybody likes are the matches, and you pick from them.')}
        </p>
        {sizes.length > 1 && (
          <div className="segmented" role="group" aria-label={t('How many foods')} style={{ gridTemplateColumns: `repeat(${sizes.length}, minmax(0, 1fr))` }}>
            {sizes.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={n === k}
                onClick={() => {
                  setN(k);
                  deal(k);
                }}
              >
                {t('{n} foods', { n: k })}
              </button>
            ))}
          </div>
        )}
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {dealt.map((f) => (
            <li key={f.id} className="chip" style={{ gap: 6 }}>
              <FoodTile food={f} size={22} />
              {f.name}
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => deal()} style={{ alignSelf: 'flex-start', minHeight: 40, border: 'none', background: 'none', color: 'var(--accent-text)', fontWeight: 700, fontSize: 14, padding: 0 }}>
          {t('🔀 Deal again')}
        </button>
        {error && (
          <p role="alert" style={{ margin: 0, fontSize: 14, color: 'var(--danger)' }}>
            {error}
          </p>
        )}
        <button
          type="button"
          className="btn btn--primary press"
          disabled={busy || dealt.length < 2}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await onStart(dealt.map((f) => f.name));
              onClose();
            } catch (e) {
              setError(e instanceof Error ? e.message : t('Could not save.'));
              setBusy(false);
            }
          }}
          style={{ height: 52, flexShrink: 0 }}
        >
          {t('Start swiping')}
        </button>
      </div>
    </div>
  );
}

/** How far a card has to go before it counts as a swipe. */
const THRESHOLD = 100;

/** The stack of cards: drag right (or tap ♥) for yes, left (or ✕) for no. */
export function SwipeDeck({ foods, answered, onSwipe, onClose }: { foods: Food[]; answered: Map<number, boolean>; onSwipe: (choice: number, yes: boolean) => void; onClose: () => void }) {
  useEscape(onClose);
  const order = foods.map((_, i) => i);
  const left = order.filter((i) => !answered.has(i));
  const current = left[0];
  const next = left[1];
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [flying, setFlying] = useState<{ index: number; yes: boolean } | null>(null);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => root.current?.focus(), []);

  const decide = (yes: boolean) => {
    if (current === undefined || flying) return;
    setFlying({ index: current, yes });
    setDrag(null);
    // Let the card fly off, then record it.
    window.setTimeout(() => {
      onSwipe(current, yes);
      setFlying(null);
    }, 260);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') decide(true);
      if (e.key === 'ArrowLeft') decide(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (flying) return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ x: 0, y: 0 });
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!start.current || start.current.id !== e.pointerId) return;
    setDrag({ x: e.clientX - start.current.x, y: (e.clientY - start.current.y) * 0.4 });
  };
  const up = () => {
    const d = drag;
    start.current = null;
    if (d && Math.abs(d.x) > THRESHOLD) decide(d.x > 0);
    else setDrag(null);
  };

  const cardStyle = (index: number): CSSProperties => {
    const food = foods[index];
    const bg = FOOD_COLORS[food.color]?.tile ?? '#FFFFFF';
    if (flying?.index === index) {
      return { ['--sw-bg' as string]: bg, transform: `translate(${flying.yes ? 140 : -140}vw, 40px) rotate(${flying.yes ? 30 : -30}deg)` };
    }
    if (index === current && drag) return { ['--sw-bg' as string]: bg, transform: `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x / 18}deg)`, transition: 'none' };
    return { ['--sw-bg' as string]: bg };
  };
  const lean = drag ? Math.max(-1, Math.min(1, drag.x / THRESHOLD)) : 0;
  const shown = flying ? [flying.index, current === flying.index ? next : current].filter((x): x is number => x !== undefined) : [current, next].filter((x): x is number => x !== undefined);

  return (
    <div ref={root} tabIndex={-1} className="sw" role="dialog" aria-modal="true" aria-labelledby="sw-title" style={{ outline: 'none' }}>
      <div className="sw-top">
        <h2 id="sw-title" className="sw-count" style={{ margin: 0 }}>
          {current === undefined ? t('Swipe to match') : t('{n} of {total}', { n: foods.length - left.length + 1, total: foods.length })}
        </h2>
        <button type="button" className="icon-btn press sw-close" aria-label={t('Close')} onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none' }}>
          {CLOSE_ICON}
        </button>
      </div>
      <div className="sw-pips" aria-hidden="true">
        {order.map((i) => (
          <span key={i} className={`sw-pip${answered.has(i) ? (answered.get(i) ? ' sw-pip--yes' : ' sw-pip--no') : ''}`} />
        ))}
      </div>
      <div className="sw-stage">
        {current === undefined && !flying ? (
          <div className="sw-done" role="status">
            <span style={{ fontSize: 64 }} aria-hidden="true">
              🙌
            </span>
            <b>{t('All swiped!')}</b>
            <span style={{ opacity: 0.8 }}>{t('The matches show once everyone’s done.')}</span>
            <button type="button" className="btn press" onClick={onClose} style={{ background: '#fff', color: '#18181B', border: 'none', marginTop: 8, padding: '0 28px' }}>
              {t('See the matches')}
            </button>
          </div>
        ) : (
          [...shown].reverse().map((index) => {
            const food = foods[index];
            const isTop = index === (flying ? flying.index : current);
            return (
              <div
                key={index}
                className={`sw-card${isTop ? ' sw-card--top' : ' sw-card--next'}${flying?.index === index ? ' sw-card--fly' : ''}${isTop && !drag && !flying ? ' sw-card--settle' : ''}`}
                style={cardStyle(index)}
                onPointerDown={isTop && !flying ? down : undefined}
                onPointerMove={isTop ? move : undefined}
                onPointerUp={isTop ? up : undefined}
                onPointerCancel={isTop ? up : undefined}
                aria-hidden={!isTop}
              >
                {isTop && (
                  <>
                    <span className="sw-stamp sw-stamp--yes" style={{ opacity: flying?.index === index ? (flying.yes ? 1 : 0) : Math.max(0, lean) }}>
                      {t('YUM')}
                    </span>
                    <span className="sw-stamp sw-stamp--no" style={{ opacity: flying?.index === index ? (flying.yes ? 0 : 1) : Math.max(0, -lean) }}>
                      {t('NOPE')}
                    </span>
                  </>
                )}
                <FoodTile food={food} size={120} style={{ boxShadow: '0 12px 30px rgba(0,0,0,0.18)' }} />
                <p className="sw-name" aria-live={isTop ? 'polite' : undefined}>
                  {food.name}
                </p>
                <div className="sw-meta">
                  {food.price ? <span>{priceLabel(food.price as 1 | 2 | 3)}</span> : null}
                  {!food.id.startsWith('custom') && <span>{t('Last had: {when}', { when: lastEatenLabel(food.daysSinceEaten) })}</span>}
                  {food.tags.slice(0, 3).map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
      {current !== undefined && (
        <>
          <p className="sw-hint" aria-hidden="true">
            {t('Drag right for yes, left for no')}
          </p>
          <div className="sw-foot">
            <button type="button" className="sw-btn sw-btn--no" aria-label={t('No to {food}', { food: foods[current].name })} onClick={() => decide(false)}>
              ✕
            </button>
            <button type="button" className="sw-btn sw-btn--yes" aria-label={t('Yes to {food}', { food: foods[current].name })} onClick={() => decide(true)}>
              ♥
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Today's swipe: who's done, then the matches for the decider to pick from. */
export function SwipeCard({
  foods,
  swipes,
  round,
  voters,
  me,
  decider,
  onSwipe,
  onSettle,
  onDealAgain,
  onCancel,
  onError,
}: {
  foods: Food[];
  swipes: SwipeRow[];
  round: number;
  /** People who are in today: they're the ones swiping. */
  voters: MemberRow[];
  me: MemberRow;
  decider: MemberRow;
  onSwipe: (choice: number, yes: boolean) => Promise<void>;
  onSettle: (food: Food) => Promise<unknown>;
  onDealAgain: () => void;
  onCancel: () => Promise<void>;
  onError: (m: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [early, setEarly] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const ids = voters.map((m) => m.id);
  const r = tallySwipes(
    foods.map((f) => f.name),
    swipes,
    round,
    ids,
  );
  const mine = new Map(swipes.filter((s) => s.member_id === me.id && s.round === round).map((s) => [s.choice, s.yes]));
  const iAmDone = mine.size >= foods.length;
  const isDecider = me.id === decider.id;
  const waiting = voters.filter((m) => !r.finished.has(m.id));
  const showResults = r.allDone || early;
  const matches = r.ranked.filter((x) => x.everyone);
  const max = Math.max(1, ids.length);

  const swipe = (choice: number, yes: boolean) => onSwipe(choice, yes).catch((e: unknown) => onError(e instanceof Error ? e.message : String(e)));
  const settle = async (index: number) => {
    setBusy(index);
    try {
      await onSettle(foods[index]);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby="swipe-label" className="card fade-up" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <h2 id="swipe-label" className="title title--sm" style={{ fontSize: 22, margin: 0 }}>
          {t('Swipe to match')}
        </h2>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)' }}>{t('{n} of {total} done', { n: r.finished.size, total: ids.length })}</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }} aria-label={t('Who’s done')}>
        {voters.map((m) => (
          <span key={m.id} title={m.name} style={{ opacity: r.finished.has(m.id) ? 1 : 0.35, transition: 'opacity 0.3s' }}>
            <Avatar name={m.name} color={m.color} size={30} />
          </span>
        ))}
      </div>

      {!iAmDone && (
        <button type="button" className="btn btn--primary press" onClick={() => setOpen(true)} style={{ height: 52, fontSize: 16 }}>
          {mine.size ? t('Keep swiping ({n} left)', { n: foods.length - mine.size }) : t('Start swiping ({n} foods)', { n: foods.length })}
        </button>
      )}

      {iAmDone && !showResults && (
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--ink-2)' }}>
          {t('You’re done. Waiting for {names}.', { names: joinNames(waiting.map((m) => (m.id === me.id ? t('you') : m.name))) })}
        </p>
      )}

      {showResults && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="field-label">
            {matches.length === 1 ? t('It’s a match!') : matches.length > 1 ? t('{n} matches', { n: matches.length }) : t('No match for everyone. Closest:')}
          </span>
          {(matches.length ? matches : r.ranked.slice(0, 3)).map((x) => {
            const food = foods[x.index];
            const content = (
              <>
                <FoodTile food={food} size={36} />
                <span style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 16, fontWeight: 800 }}>
                    {x.everyone ? '💘 ' : ''}
                    {food.name}
                  </span>
                  <span aria-hidden="true" style={{ height: 6, borderRadius: 999, background: 'var(--bar-track)', overflow: 'hidden' }}>
                    <span style={{ display: 'block', height: '100%', width: `${(x.yes / max) * 100}%`, background: x.everyone ? 'var(--accent)' : 'var(--muted)', transition: 'width 0.4s ease' }} />
                  </span>
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', flexShrink: 0 }}>{t('{n} yes', { n: x.yes })}</span>
              </>
            );
            const rowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, minHeight: 56, padding: '8px 12px', borderRadius: 14, border: `2px solid ${x.everyone ? 'var(--accent)' : 'var(--border)'}`, background: 'var(--surface)', color: 'var(--ink)', textAlign: 'left' };
            return isDecider ? (
              <button key={x.index} type="button" className={`press${x.everyone ? ' sw-match' : ''}`} disabled={busy !== null} onClick={() => void settle(x.index)} aria-label={t('Go with {food}', { food: food.name })} style={rowStyle}>
                {content}
              </button>
            ) : (
              <div key={x.index} className={x.everyone ? 'sw-match' : undefined} style={rowStyle}>
                {content}
              </div>
            );
          })}
          <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
            {isDecider ? t('Tap one to go with it.') : t('{name} picks from these.', { name: decider.name })}
          </p>
        </div>
      )}

      {isDecider && (
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', columnGap: 18 }}>
          {!showResults && r.finished.size > 0 && (
            <button type="button" className="press" onClick={() => setEarly(true)} style={{ minHeight: 40, border: 'none', background: 'none', color: 'var(--accent-text)', fontSize: 14, fontWeight: 700 }}>
              {t('See results now')}
            </button>
          )}
          <button type="button" className="press" onClick={onDealAgain} style={{ minHeight: 40, border: 'none', background: 'none', color: 'var(--accent-text)', fontSize: 14, fontWeight: 700 }}>
            {t('🔀 New deal for everyone')}
          </button>
          <button
            type="button"
            className="press"
            onClick={() => {
              if (!confirmCancel) return setConfirmCancel(true);
              onCancel().catch((e: unknown) => onError(e instanceof Error ? e.message : String(e)));
            }}
            style={{ minHeight: 40, border: 'none', background: 'none', color: confirmCancel ? 'var(--danger)' : 'var(--muted)', fontSize: 14, fontWeight: confirmCancel ? 700 : 600 }}
          >
            {confirmCancel ? t('Tap again to call it off') : t('Call it off')}
          </button>
        </div>
      )}

      {open && <SwipeDeck foods={foods} answered={mine} onSwipe={(i, yes) => void swipe(i, yes)} onClose={() => setOpen(false)} />}
    </section>
  );
}
