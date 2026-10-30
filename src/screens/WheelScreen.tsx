import { useMemo, useState } from 'react';
import { FoodTile } from '../components/FoodTile';
import { Wheel } from '../components/Wheel';
import { shortDate } from '../lib/dates';
import {
  filterByTags,
  formatTag,
  isRecent,
  joinNames,
  popularTags,
  weightedPick,
  wheelWeight,
  type Food,
} from '../lib/foods';
import { FOOD_COLORS, nextColor } from '../lib/palette';
import { soundPref, usePref } from '../lib/prefs';
import { useWheelSpin } from '../lib/useWheelSpin';

const SHORTLIST_MAX = 3;

/** What the result card offers: sending today's pick, or just a note (not your turn, already decided). */
export type WheelSend = { kind: 'send'; label: string } | { kind: 'note'; text: string };

interface Props {
  /** Active foods, minus anything vetoed today. */
  pool: Food[];
  /** Foods vetoed today, mentioned in the note. */
  vetoedNames: string[];
  timezone: string;
  /** e.g. "Your turn" or "Alex's turn". */
  turnLabel: string;
  send: WheelSend;
  onBack: () => void;
  onSend: (food: Food) => Promise<void>;
}

export function WheelScreen({ pool, vetoedNames, timezone, turnLabel, send, onBack, onSend }: Props) {
  const [sending, setSending] = useState(false);

  const [mode, setMode] = useState<'all' | 'shortlist'>('all');
  const [tags, setTags] = useState<string[]>([]);
  const [tagMode, setTagMode] = useState<'and' | 'or'>('and');
  const [shortlistIds, setShortlistIds] = useState<string[]>([]);
  const [customFoods, setCustomFoods] = useState<Food[]>([]);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');

  const [result, setResult] = useState<Food | null>(null);
  const wheel = useWheelSpin();
  const { spinning } = wheel;
  const sound = usePref(soundPref);

  const tagChips = useMemo(() => popularTags(pool, 6), [pool]);
  const shortlistOptions = useMemo(() => [...pool, ...customFoods], [pool, customFoods]);

  const wheelFoods = useMemo(() => {
    if (mode === 'shortlist') {
      return shortlistIds
        .map((id) => shortlistOptions.find((f) => f.id === id))
        .filter((f): f is Food => !!f);
    }
    return filterByTags(pool, tags, tagMode);
  }, [mode, shortlistIds, shortlistOptions, pool, tags, tagMode]);

  const recentNames = wheelFoods.filter(isRecent).map((f) => f.name);

  // Any change to the candidate set invalidates a shown result.
  const resetResult = () => {
    setResult(null);
    wheel.clearBurst();
  };

  const toggleTag = (tag: string) => {
    resetResult();
    setTags((cur) => (cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag]));
  };

  const toggleShortlist = (id: string) => {
    resetResult();
    setShortlistIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < SHORTLIST_MAX ? [...cur, id] : cur,
    );
  };

  const addCustom = () => {
    const name = draft.trim();
    if (!name) return;
    const food: Food = {
      id: `custom-${Date.now()}`,
      name,
      tags: [],
      icon: 'bowl',
      color: nextColor(pool.length + customFoods.length),
      isActive: true,
      daysSinceEaten: null,
    };
    setCustomFoods((cur) => [...cur, food]);
    if (shortlistIds.length < SHORTLIST_MAX) {
      resetResult();
      setShortlistIds((cur) => [...cur, food.id]);
    }
    setDraft('');
    setTyping(false);
  };

  const canSpin = !spinning && wheelFoods.length >= 2;

  const spin = () => {
    if (!canSpin) return;
    const k = weightedPick(wheelFoods, wheelWeight);
    const winner = wheelFoods[k];
    setResult(null);
    wheel.spinTo(k, wheelFoods.length, () => setResult(winner));
  };

  const switchMode = (next: 'all' | 'shortlist') => {
    if (spinning || next === mode) return;
    resetResult();
    setMode(next);
  };

  const vetoNote = vetoedNames.length
    ? ` ${joinNames(vetoedNames)} ${vetoedNames.length === 1 ? 'is' : 'are'} off the wheel today.`
    : '';
  let note: string;
  if (mode === 'shortlist' && wheelFoods.length < 2) {
    note = `Pick 2–${SHORTLIST_MAX} foods for your shortlist, or type your own.`;
  } else if (pool.length < 2) {
    note = 'Add at least 2 foods in the Food list to spin.';
  } else if (wheelFoods.length < 2) {
    note = wheelFoods.length === 0
      ? 'Nothing matches those tags. Try fewer, or switch to “any”.'
      : `Only ${wheelFoods[0].name} matches. Pick fewer tags to give the wheel a choice.`;
  } else if (recentNames.length === 1) {
    note = `${recentNames[0]} was eaten recently, so it's less likely to come up.`;
  } else if (recentNames.length > 1) {
    note = `${joinNames(recentNames)} were eaten recently, so they're less likely to come up.`;
  } else {
    note = 'Nothing here was eaten recently, so every slice has a fair shot.';
  }

  return (
    <main className="screen" style={{ gap: 16 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="button" className="icon-btn press" aria-label="Back to today" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="eyebrow">{turnLabel} · {shortDate(new Date(), timezone)}</span>
          <h1 className="title title--sm">Spin the wheel</h1>
        </div>
        <button
          type="button"
          className="icon-btn press"
          aria-label={sound === 'on' ? 'Mute wheel sounds' : 'Turn wheel sounds on'}
          aria-pressed={sound === 'off'}
          onClick={() => soundPref.set(sound === 'on' ? 'off' : 'on')}
          style={{ marginLeft: 'auto' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z" />
            {sound === 'on' ? <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /> : <path d="M16 9.5l5 5M21 9.5l-5 5" />}
          </svg>
        </button>
      </header>

      <div className="segmented" role="group" aria-label="Wheel source">
        <button type="button" aria-pressed={mode === 'all'} onClick={() => switchMode('all')}>
          Whole list · {pool.length}
        </button>
        <button type="button" aria-pressed={mode === 'shortlist'} onClick={() => switchMode('shortlist')}>
          My shortlist{shortlistIds.length > 0 ? ` · ${shortlistIds.length}` : ''}
        </button>
      </div>

      {mode === 'all' ? (
        <div className="chip-row" role="group" aria-label="Filter by tag">
          <button type="button" className="chip press" aria-pressed={tags.length === 0} disabled={spinning} onClick={() => { resetResult(); setTags([]); }}>
            Anything
          </button>
          {tagChips.map((tag) => (
            <button key={tag} type="button" className="chip press" aria-pressed={tags.includes(tag)} disabled={spinning} onClick={() => toggleTag(tag)}>
              {formatTag(tag)}
            </button>
          ))}
          {tags.length > 1 && (
            <button
              type="button"
              className="chip chip--ghost press"
              disabled={spinning}
              aria-label={`Matching ${tagMode === 'and' ? 'all' : 'any'} selected tags. Tap to switch.`}
              onClick={() => { resetResult(); setTagMode((m) => (m === 'and' ? 'or' : 'and')); }}
            >
              Match {tagMode === 'and' ? 'all' : 'any'}
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
          <div className="chip-row" role="group" aria-label={`Choose up to ${SHORTLIST_MAX} foods`}>
            {shortlistOptions.map((f) => {
              const on = shortlistIds.includes(f.id);
              return (
                <button
                  key={f.id}
                  type="button"
                  className="chip press"
                  aria-pressed={on}
                  disabled={spinning || (!on && shortlistIds.length >= SHORTLIST_MAX)}
                  style={!on && shortlistIds.length >= SHORTLIST_MAX ? { opacity: 0.45 } : undefined}
                  onClick={() => toggleShortlist(f.id)}
                >
                  <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 999, background: FOOD_COLORS[f.color].slice }} />
                  {f.name}
                </button>
              );
            })}
            <button type="button" className="chip chip--ghost press" disabled={spinning} onClick={() => setTyping(true)}>
              + Type one
            </button>
          </div>
          {typing && (
            <form
              style={{ display: 'flex', gap: 8 }}
              onSubmit={(e) => {
                e.preventDefault();
                addCustom();
              }}
            >
              <label htmlFor="custom-food" className="sr-only">Food name</label>
              <input
                id="custom-food"
                className="input"
                autoFocus
                placeholder="e.g. Banana leaf"
                value={draft}
                maxLength={40}
                onChange={(e) => setDraft(e.target.value)}
              />
              <button type="submit" className="btn btn--primary press" style={{ padding: '0 18px', flexShrink: 0 }}>
                Add
              </button>
            </form>
          )}
        </div>
      )}

      <Wheel
        foods={wheelFoods}
        rotation={wheel.rotation}
        animate={!wheel.reducedMotion}
        sway={!wheel.reducedMotion && !spinning && !result}
        tick={wheel.tick}
        burstKey={wheel.burstKey}
        rotorRef={wheel.rotorRef}
      />

      {result ? (
        <section
          className="card"
          style={{
            animation: 'popIn 0.6s 0.15s cubic-bezier(0.2, 0.8, 0.2, 1) both',
            borderRadius: 22,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            boxShadow: '0 8px 20px rgba(24, 24, 27, 0.08)',
          }}
          aria-live="polite"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <FoodTile food={result} size={56} style={{ borderRadius: 16, animation: 'wiggleLoop 3s 0.8s ease-in-out infinite' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span className="section-label">The wheel says</span>
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 30,
                  fontWeight: 800,
                  letterSpacing: '-0.02em',
                  lineHeight: 1.1,
                  overflowWrap: 'anywhere',
                }}
              >
                {result.name}
              </span>
            </div>
          </div>
          {send.kind === 'send' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              <button type="button" className="btn btn--secondary press" disabled={sending} onClick={spin}>
                Spin again
              </button>
              <button
                type="button"
                className="btn btn--primary press"
                disabled={sending}
                onClick={async () => {
                  setSending(true);
                  try {
                    await onSend(result);
                  } finally {
                    setSending(false);
                  }
                }}
              >
                {sending ? 'Sending…' : send.label}
              </button>
            </div>
          ) : (
            <>
              <button type="button" className="btn btn--secondary press" onClick={spin}>
                Spin again
              </button>
              <p style={{ margin: 0, textAlign: 'center', fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>{send.text}</p>
            </>
          )}
        </section>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ margin: 0, textAlign: 'center', fontSize: 13, lineHeight: 1.5, color: 'var(--muted)' }}>{note}{vetoNote}</p>
          <button
            type="button"
            className="press"
            onClick={spin}
            disabled={!canSpin}
            style={{
              height: 58,
              flexShrink: 0,
              border: 'none',
              borderRadius: 18,
              background: 'var(--accent)',
              color: '#FFFFFF',
              fontFamily: 'var(--font-display)',
              fontSize: 20,
              fontWeight: 800,
              letterSpacing: '0.01em',
              boxShadow: '0 8px 18px rgba(204, 63, 23, 0.3)',
              animation: canSpin ? 'glow 2s ease-in-out infinite' : 'none',
              opacity: !canSpin && !spinning ? 0.5 : 1,
            }}
          >
            {spinning ? 'Spinning…' : 'SPIN'}
          </button>
        </div>
      )}
    </main>
  );
}
