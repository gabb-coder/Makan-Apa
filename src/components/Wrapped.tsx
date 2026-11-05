import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import '../styles/wrapped.css';
import { FoodTile } from './FoodTile';
import { t } from '../lib/i18n';
import { formatRM } from '../lib/money';
import { drawWrapped, shareBlob } from '../lib/shareCard';
import { vibeOf, type Wrapped } from '../lib/wrapped';

type Kind = 'intro' | 'top' | 'variety' | 'deciders' | 'vetoed' | 'place' | 'spent' | 'finale';

/** Each slide's colours: a gradient, two drifting blobs, and the ink for text on white. */
const THEMES: Record<Kind, { a: string; b: string; c: string; d: string; ink: string; floats: string[] }> = {
  intro: { a: '#2B0F3A', b: '#B8360F', c: '#FF7A45', d: '#8E44AD', ink: '#2B0F3A', floats: ['🍜', '🍛', '🥘', '🍢', '🧋', '🍱'] },
  top: { a: '#7A1F0B', b: '#C2410C', c: '#FBBF24', d: '#E11D48', ink: '#7A1F0B', floats: ['🏆', '⭐', '🍽️', '✨'] },
  variety: { a: '#0B3D2E', b: '#2F7A4B', c: '#A3E635', d: '#0EA5A4', ink: '#0B3D2E', floats: ['🌶️', '🥢', '🍤', '🥟', '🍙'] },
  deciders: { a: '#172554', b: '#2F5FC4', c: '#60A5FA', d: '#7C3AED', ink: '#172554', floats: ['👑', '🎲', '🎯'] },
  vetoed: { a: '#450A0A', b: '#B91C1C', c: '#FB923C', d: '#7F1D1D', ink: '#7F1D1D', floats: ['🙅', '❌', '👎'] },
  place: { a: '#0F3B3A', b: '#0F766E', c: '#5EEAD4', d: '#1D4ED8', ink: '#0F3B3A', floats: ['📍', '🗺️', '🛵'] },
  spent: { a: '#451A03', b: '#A16207', c: '#FDE047', d: '#C2410C', ink: '#451A03', floats: ['💸', '🧾'] },
  finale: { a: '#18181B', b: '#5B21B6', c: '#EC4899', d: '#F59E0B', ink: '#18181B', floats: ['🎉', '✨', '🥳'] },
};

/** How long a slide stays before the story moves on by itself. */
const SLIDE_MS = 6500;

interface Slide {
  kind: Kind;
  /** The slide as one sentence, for screen readers. */
  say: string;
}

function slidesFor(w: Wrapped, room: string, label: string): Slide[] {
  const s: Slide[] = [{ kind: 'intro', say: `${t('{room}, {period} wrapped', { room, period: label })}. ${w.meals === 1 ? t('1 meal decided together') : t('{n} meals decided together', { n: w.meals })}` }];
  if (w.top) s.push({ kind: 'top', say: `${w.top.name}. ${w.top.count === 1 ? t('Your top food, once') : t('Your top food, {n} times', { n: w.top.count })}` });
  s.push({ kind: 'variety', say: w.foods === 1 ? t('1 different food') : t('{n} different foods', { n: w.foods }) });
  if (w.topDecider) s.push({ kind: 'deciders', say: `${w.topDecider.name}. ${w.topDecider.count === 1 ? t('Decided the most: once') : t('Decided the most: {n} times', { n: w.topDecider.count })}` });
  if (w.mostVetoed) s.push({ kind: 'vetoed', say: `${w.mostVetoed.name}. ${w.vetoes === 1 ? t('Most vetoed, out of 1 veto') : t('Most vetoed, out of {n} vetoes', { n: w.vetoes })}` });
  if (w.topPlace) s.push({ kind: 'place', say: `${w.topPlace.name}. ${w.places === 1 ? t('Your spot, out of 1 place') : t('Your favourite spot, out of {n} places', { n: w.places })}` });
  if (w.spent > 0) s.push({ kind: 'spent', say: `${formatRM(w.spent)}. ${t('Spent together')}` });
  s.push({ kind: 'finale', say: t("That's a wrap!") });
  return s;
}

function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const q = matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduce(q.matches);
    q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, []);
  return reduce;
}

/** Counts from 0 up to `to`, easing out, after a short wait. */
function useCountUp(to: number, reduce: boolean, ms = 1200, delay = 250): number {
  const [v, setV] = useState(reduce ? to : 0);
  useEffect(() => {
    if (reduce) {
      setV(to);
      return;
    }
    let raf = 0;
    const start = performance.now() + delay;
    const tick = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - start) / ms));
      setV(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, reduce, ms, delay]);
  return v;
}

const vars = (v: Record<string, string | number>) => v as CSSProperties;

/** A few emoji drifting up behind the slide, spread out the same way every time. */
function Floats({ emoji }: { emoji: string[] }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: 12 }, (_, i) => (
        <span
          key={i}
          className="wr-float"
          style={vars({
            left: `${(i * 37 + 7) % 96}%`,
            '--size': `${22 + ((i * 13) % 26)}px`,
            '--dur': `${8 + ((i * 7) % 7)}s`,
            '--delay': `${-((i * 1.7) % 9)}s`,
            '--spin': `${(i % 2 ? -1 : 1) * (30 + ((i * 17) % 60))}deg`,
          })}
        >
          {emoji[i % emoji.length]}
        </span>
      ))}
    </div>
  );
}

function Confetti() {
  const colours = ['#FFFFFF', '#FDE047', '#F472B6', '#60A5FA', '#34D399', '#FB923C'];
  return (
    <div aria-hidden="true">
      {Array.from({ length: 44 }, (_, i) => (
        <span
          key={i}
          className="wr-confetti"
          style={vars({
            left: `${(i * 23 + 3) % 100}%`,
            background: colours[i % colours.length],
            '--dx': `${((i * 29) % 120) - 60}px`,
            '--dur': `${2.4 + ((i * 7) % 16) / 10}s`,
            '--delay': `${((i * 3) % 10) / 10}s`,
            '--spin': `${360 + ((i * 47) % 540)}deg`,
          })}
        />
      ))}
    </div>
  );
}

function Coins() {
  return (
    <div aria-hidden="true">
      {Array.from({ length: 16 }, (_, i) => (
        <span
          key={i}
          className="wr-coin"
          style={vars({ left: `${(i * 31 + 5) % 94}%`, '--dur': `${1.8 + ((i * 5) % 10) / 10}s`, '--delay': `${0.2 + ((i * 3) % 12) / 10}s`, '--spin': `${(i % 2 ? -1 : 1) * (200 + i * 20)}deg` })}
        >
          {i % 3 ? '🪙' : '💵'}
        </span>
      ))}
    </div>
  );
}

const In = ({ i = 0, pop = false, children, style }: { i?: number; pop?: boolean; children: ReactNode; style?: CSSProperties }) => (
  <div className={pop ? 'wr-pop' : 'wr-in'} style={{ ...vars({ '--i': i }), ...style }}>
    {children}
  </div>
);

function Intro({ w, room, label, reduce }: { w: Wrapped; room: string; label: string; reduce: boolean }) {
  const n = useCountUp(w.meals, reduce, 1300, 900);
  return (
    <>
      <In>
        <span className="wr-eyebrow">{room}</span>
      </In>
      <h2 id="wrapped-big" className="wr-big" aria-label={label}>
        <span className="wr-letters" aria-hidden="true">
          {[...label].map((ch, i) => (
            <span key={i} className="wr-letter" style={vars({ '--i': i })}>
              {ch}
            </span>
          ))}
        </span>
      </h2>
      <span className="wr-sticker">{t('wrapped')}</span>
      <In i={6} style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 18 }}>
        <span className="wr-huge" style={{ fontSize: 'clamp(72px, 24vw, 120px)' }}>
          {n}
        </span>
        <p className="wr-line" style={{ maxWidth: 160 }}>
          {w.meals === 1 ? t('meal decided together') : t('meals decided together')}
        </p>
      </In>
    </>
  );
}

function Podium({ foods }: { foods: Wrapped['topFoods'] }) {
  // 2nd, 1st, 3rd, like a real podium.
  const order = [1, 0, 2].filter((k) => foods[k]);
  const heights = [150, 108, 80];
  const medals = ['🥇', '🥈', '🥉'];
  return (
    <div className="wr-podium" aria-hidden="true">
      {order.map((k) => {
        const f = foods[k];
        return (
          <div key={k} className={`wr-step wr-step--${k + 1}`}>
            <div className="wr-step-food" style={vars({ '--i': [2, 0, 1][k] })}>
              {k === 0 && <span className="wr-crown">👑</span>}
              {f.food ? (
                <FoodTile food={f.food} size={k === 0 ? 60 : 48} style={{ boxShadow: '0 8px 20px rgba(0,0,0,0.25)' }} />
              ) : (
                <span style={{ fontSize: k === 0 ? 48 : 38, lineHeight: 1 }}>🍽️</span>
              )}
              <span className="wr-step-name">{f.name}</span>
            </div>
            <div className="wr-step-block" style={vars({ '--h': `${heights[k]}px`, '--i': [2, 0, 1][k] })}>
              <span style={{ fontSize: 22, opacity: 1 }}>{medals[k]}</span>
              <b>×{f.count}</b>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Top({ w }: { w: Wrapped }) {
  const top = w.top!;
  return (
    <>
      <In>
        <span className="wr-eyebrow">{t('The crowd favourite')}</span>
      </In>
      <In i={1}>
        <h2 id="wrapped-big" className="wr-big">
          {top.name}
        </h2>
      </In>
      <In i={2}>
        <p className="wr-line">{top.count === 1 ? t('Eaten once') : t('Eaten {n} times', { n: top.count })}</p>
      </In>
      {w.topFoods.length > 0 && <Podium foods={w.topFoods} />}
    </>
  );
}

function Variety({ w, reduce }: { w: Wrapped; reduce: boolean }) {
  const n = useCountUp(w.foods, reduce);
  const dots = Math.min(w.streak, 21);
  return (
    <>
      <In>
        <span className="wr-eyebrow">{t('Variety')}</span>
      </In>
      <In i={1}>
        <span className="wr-huge" aria-hidden="true">
          {n}
        </span>
      </In>
      <In i={2}>
        <h2 id="wrapped-big" className="wr-big" style={{ fontSize: 'clamp(30px, 9vw, 44px)' }}>
          {w.foods === 1 ? t('different food') : t('different foods')}
        </h2>
      </In>
      {w.streak > 1 ? (
        <>
          <div className="wr-dots" aria-hidden="true" style={{ marginTop: 8 }}>
            {Array.from({ length: dots }, (_, i) => (
              <span key={i} className="wr-dot wr-dot--on" style={vars({ '--i': i })} />
            ))}
          </div>
          <In i={4}>
            <p className="wr-line">{t('Longest run with no repeats: {n} days', { n: w.streak })}</p>
          </In>
        </>
      ) : (
        <In i={3}>
          <p className="wr-line">{t('Plenty of room for something new')}</p>
        </In>
      )}
    </>
  );
}

function Deciders({ w }: { w: Wrapped }) {
  const top = w.topDecider!;
  const max = Math.max(1, ...w.deciders.map((d) => d.count));
  return (
    <>
      <In pop>
        <span className="wr-emoji">👑</span>
      </In>
      <In i={1}>
        <span className="wr-eyebrow">{t('Who called the shots')}</span>
      </In>
      <In i={2}>
        <h2 id="wrapped-big" className="wr-big">
          {top.name}
        </h2>
      </In>
      <In i={3}>
        <p className="wr-line">{top.count === 1 ? t('Decided once') : t('Decided {n} times', { n: top.count })}</p>
      </In>
      {w.deciders.length > 1 && (
        <div className="wr-rank" aria-hidden="true">
          {w.deciders.map((d, i) => (
            <div key={d.name + i} className="wr-rank-row wr-in" style={vars({ '--i': 4 + i })}>
              <span>{d.name}</span>
              <span className="wr-rank-track">
                <span style={vars({ '--w': `${(d.count / max) * 100}%`, '--i': i })} />
              </span>
              <span>{d.count}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Vetoed({ w }: { w: Wrapped }) {
  return (
    <>
      <In>
        <span className="wr-eyebrow">{t('Most vetoed')}</span>
      </In>
      <In i={1}>
        <div className="wr-veto">
          <h2 id="wrapped-big" className="wr-big" style={{ paddingRight: 24 }}>
            {w.mostVetoed!.name}
          </h2>
          <span className="wr-stamp" aria-hidden="true">
            {t('VETOED')}
          </span>
        </div>
      </In>
      <In i={3} style={{ marginTop: 10 }}>
        <p className="wr-line">{w.vetoes === 1 ? t('Out of 1 veto') : t('Out of {n} vetoes', { n: w.vetoes })}</p>
      </In>
    </>
  );
}

function Place({ w }: { w: Wrapped }) {
  const p = w.topPlace!;
  return (
    <>
      <div className="wr-pin" aria-hidden="true">
        <b>📍</b>
        <span className="wr-ring" style={vars({ '--i': 0 })} />
        <span className="wr-ring" style={vars({ '--i': 1 })} />
      </div>
      <In i={1}>
        <span className="wr-eyebrow">{t('Your spot')}</span>
      </In>
      <In i={2}>
        <h2 id="wrapped-big" className="wr-big">
          {p.name}
        </h2>
      </In>
      <In i={3}>
        <p className="wr-line">{p.count === 1 ? t('Been once') : t('Been {n} times', { n: p.count })}</p>
      </In>
      <In i={4}>
        <span className="wr-chip">🗺️ {w.places === 1 ? t('1 place stamped') : t('{n} places stamped', { n: w.places })}</span>
      </In>
    </>
  );
}

function Spent({ w, reduce }: { w: Wrapped; reduce: boolean }) {
  const cents = useCountUp(w.spent, reduce, 1500, 300);
  return (
    <>
      <In>
        <span className="wr-eyebrow">{t('Spent together')}</span>
      </In>
      <In i={1}>
        <h2 id="wrapped-big" className="wr-huge" style={{ fontSize: 'clamp(56px, 17vw, 96px)', margin: 0, overflowWrap: 'anywhere' }}>
          {formatRM(cents)}
        </h2>
      </In>
      {w.topPayer && (
        <In i={3}>
          <p className="wr-line">{t('{name} paid the most: {amount}', { name: w.topPayer.name, amount: formatRM(w.topPayer.cents) })}</p>
        </In>
      )}
      {w.billed > 0 && (
        <In i={4}>
          <span className="wr-chip">🍽️ {t('About {amount} a meal', { amount: formatRM(Math.round(w.spent / w.billed)) })}</span>
        </In>
      )}
    </>
  );
}

export function vibeLine(w: Wrapped): string | null {
  const v = vibeOf(w);
  if (v === 'explorers') return t('🧭 The explorers: always trying something new');
  if (v === 'habit') return t('🔁 Creatures of habit: you know what you like');
  if (v === 'balanced') return t('⚖️ A bit of both: old favourites and new finds');
  return null;
}

/** The numbers on the last slide and the shared picture. */
export function tilesFor(w: Wrapped): { value: string; label: string }[] {
  const tiles = [
    { value: String(w.meals), label: w.meals === 1 ? t('meal') : t('meals') },
    { value: String(w.foods), label: w.foods === 1 ? t('food') : t('foods') },
    { value: String(w.places), label: w.places === 1 ? t('place') : t('places') },
  ];
  tiles.push(w.spent > 0 ? { value: formatRM(w.spent), label: t('spent') } : { value: String(w.streak), label: t('days, no repeats') });
  return tiles;
}

function Finale({ w, label }: { w: Wrapped; label: string }) {
  const vibe = vibeLine(w);
  return (
    <>
      <In>
        <span className="wr-eyebrow">{t("That's a wrap!")}</span>
      </In>
      <In i={1}>
        <h2 id="wrapped-big" className="wr-big" style={{ fontSize: 'clamp(34px, 10vw, 52px)' }}>
          {label}
        </h2>
      </In>
      <In i={2}>
        <div className="wr-card">
          <div className="wr-grid">
            {tilesFor(w).map((x, i) => (
              <div key={x.label} className="wr-tile wr-pop" style={vars({ '--i': 3 + i })}>
                <b style={x.value.length > 7 ? { fontSize: x.value.length > 9 ? 'clamp(16px, 4.8vw, 22px)' : 'clamp(18px, 5.6vw, 25px)' } : undefined}>{x.value}</b>
                <span>{x.label}</span>
              </div>
            ))}
          </div>
          {(w.top || w.topDecider) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 15, fontWeight: 700 }}>
              {w.top && <span>🏆 {t('Top food: {name}', { name: w.top.name })}</span>}
              {w.topDecider && <span>👑 {t('Decided the most: {name}', { name: w.topDecider.name })}</span>}
            </div>
          )}
        </div>
      </In>
      {vibe && (
        <In i={8}>
          <p className="wr-line" style={{ fontSize: 16 }}>
            {vibe}
          </p>
        </In>
      )}
    </>
  );
}

/** A room's month or year as a story: tap through the highlights, then share it as a picture. */
export function WrappedStory({ data, room, label, onClose, onToast }: { data: Wrapped; room: string; label: string; onClose: () => void; onToast: (m: string) => void }) {
  const slides = slidesFor(data, room, label);
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const holding = useRef<{ at: number; timer: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const last = i === slides.length - 1;
  const slide = slides[i];
  const theme = THEMES[slide.kind];

  const go = useCallback(
    (by: 1 | -1) => {
      setDir(by);
      setI((n) => Math.min(Math.max(n + by, 0), slides.length - 1));
    },
    [slides.length],
  );

  useEffect(() => {
    root.current?.focus();
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === ' ' && e.target === root.current) {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, go]);

  // Hold anywhere to pause; a quick tap moves back or on.
  const down = () => {
    holding.current = { at: Date.now(), timer: window.setTimeout(() => setPaused(true), 220) };
  };
  const up = (by: 1 | -1) => {
    const h = holding.current;
    holding.current = null;
    if (!h) return;
    clearTimeout(h.timer);
    if (Date.now() - h.at < 220) go(by);
    else setPaused(false);
  };

  const share = async () => {
    setBusy(true);
    setPaused(true);
    try {
      const blob = await drawWrapped({
        room,
        title: t('{period} wrapped', { period: label }),
        tiles: tilesFor(data),
        lines: [data.top && `🏆 ${t('Top food: {name}', { name: data.top.name })}`, data.topDecider && `👑 ${t('Decided the most: {name}', { name: data.topDecider.name })}`, data.topPlace && `📍 ${t('Favourite spot: {name}', { name: data.topPlace.name })}`].filter((x): x is string => !!x),
        vibe: vibeLine(data),
      });
      const msg = await shareBlob(blob, t('{room}, {period} wrapped', { room, period: label }));
      if (msg) onToast(msg);
    } catch (e) {
      onToast(e instanceof Error ? e.message : t('Something went wrong. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  const auto = !reduce && !last;
  const body = (() => {
    switch (slide.kind) {
      case 'intro':
        return <Intro w={data} room={room} label={label} reduce={reduce} />;
      case 'top':
        return <Top w={data} />;
      case 'variety':
        return <Variety w={data} reduce={reduce} />;
      case 'deciders':
        return <Deciders w={data} />;
      case 'vetoed':
        return <Vetoed w={data} />;
      case 'place':
        return <Place w={data} />;
      case 'spent':
        return <Spent w={data} reduce={reduce} />;
      case 'finale':
        return <Finale w={data} label={label} />;
    }
  })();

  return (
    <div
      ref={root}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="wrapped-big"
      className={`wr${paused ? ' wr--paused' : ''}`}
      style={vars({ '--wr-a': theme.a, '--wr-b': theme.b, '--wr-c': theme.c, '--wr-d': theme.d, '--wr-ink': theme.ink, '--wr-slide': `${SLIDE_MS}ms`, outline: 'none' })}
    >
      <span className="wr-blob wr-blob--1" aria-hidden="true" />
      <span className="wr-blob wr-blob--2" aria-hidden="true" />
      <Floats key={`f${slide.kind}`} emoji={theme.floats} />
      {slide.kind === 'spent' && <Coins key={`c${i}`} />}
      {slide.kind === 'finale' && <Confetti key={`c${i}`} />}

      <div className="wr-top">
        <div className="wr-bars" aria-hidden="true">
          {slides.map((_, k) => (
            <span key={k} className={`wr-bar${k === i && auto ? ' wr-bar--live' : ''}`}>
              <span
                key={k === i ? `live${i}` : 'still'}
                style={{ transform: k < i || (k === i && !auto) ? 'scaleX(1)' : k > i ? 'scaleX(0)' : undefined }}
                onAnimationEnd={k === i && auto ? () => go(1) : undefined}
              />
            </span>
          ))}
        </div>
        <div className="wr-head">
          <span className="wr-brand">
            <b>Makan Wrapped</b>
            <span>
              {room} · {i + 1}/{slides.length}
            </span>
          </span>
          {auto && (
            <button type="button" className="wr-icon" aria-label={paused ? t('Play') : t('Pause')} aria-pressed={paused} onClick={() => setPaused((p) => !p)}>
              {paused ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <rect x="5" y="4" width="5" height="16" rx="1.5" />
                  <rect x="14" y="4" width="5" height="16" rx="1.5" />
                </svg>
              )}
            </button>
          )}
          <button type="button" className="wr-icon" aria-label={t('Close')} onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </div>

      <div className="wr-stage">
        <div className="wr-tap wr-tap--back" aria-hidden="true" onPointerDown={down} onPointerUp={() => up(-1)} onPointerLeave={() => holding.current && up(-1)} />
        <div className="wr-tap wr-tap--next" aria-hidden="true" onPointerDown={down} onPointerUp={() => up(1)} onPointerLeave={() => holding.current && up(1)} />
        <div key={i} className={`wr-slide${dir < 0 ? ' wr-slide--back' : ''}${slide.kind === 'vetoed' ? ' wr-slide--shake' : ''}`}>
          {body}
        </div>
        <span className="sr-only" aria-live="polite">
          {slide.say}
        </span>
      </div>

      <div className="wr-foot">
        {i > 0 && (
          <button type="button" className="wr-btn wr-btn--ghost" onClick={() => go(-1)}>
            {t('Back')}
          </button>
        )}
        {last ? (
          <button type="button" className="wr-btn wr-btn--solid wr-btn--shine" disabled={busy} onClick={share}>
            {busy ? t('Making the picture…') : t('Share as a picture')}
          </button>
        ) : (
          <button type="button" className="wr-btn wr-btn--solid" onClick={() => go(1)}>
            {t('Next')}
          </button>
        )}
      </div>
    </div>
  );
}
