import { useEffect, useState } from 'react';
import { formatTag, isRecent, lastEatenLabel, type Food } from '../lib/foods';
import { FoodTile } from './FoodTile';

interface Props {
  mode: 'list' | 'type';
  foods: Food[];
  /** Names vetoed today, shown greyed out. */
  vetoed: string[];
  /** Who the pick goes to; null in a room of one, where it's final. */
  sendTo: string | null;
  onClose: () => void;
  onPick: (pick: { food: Food } | { name: string }) => Promise<void>;
}

/** Bottom sheet for the decider: pick straight from the food list, or type a food. */
export function PickSheet({ mode, foods, vetoed, sendTo, onClose, onPick }: Props) {
  const [query, setQuery] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const vetoedSet = new Set(vetoed.map((v) => v.toLowerCase()));
  const q = query.trim().toLowerCase();
  const shown = foods.filter((f) => !q || f.name.toLowerCase().includes(q) || f.tags.some((t) => t.includes(q)));

  const pick = async (p: { food: Food } | { name: string }) => {
    setBusy(true);
    setError(null);
    try {
      await onPick(p);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send that.');
      setBusy(false);
    }
  };

  const typedName = typed.trim();
  const typedVetoed = vetoedSet.has(typedName.toLowerCase());

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="pick-title" onClick={(e) => e.stopPropagation()}>
        <div aria-hidden="true" style={{ width: 40, height: 5, borderRadius: 999, background: 'var(--border-strong)', alignSelf: 'center' }} />
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="eyebrow">{sendTo ? `Your turn · goes to ${sendTo}` : 'Your turn · this one’s final'}</span>
            <h2 id="pick-title" className="title title--sm" style={{ fontSize: 24 }}>
              {mode === 'list' ? 'Pick from list' : 'Type my own'}
            </h2>
          </div>
          <button type="button" className="icon-btn press" aria-label="Close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        {mode === 'list' ? (
          <>
            <div>
              <label htmlFor="pick-search" className="sr-only">Search food</label>
              <input
                id="pick-search"
                type="search"
                className="input"
                placeholder="Search food or tags"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {shown.map((f) => {
                const off = vetoedSet.has(f.name.toLowerCase());
                return (
                  <button
                    key={f.id}
                    type="button"
                    className="row"
                    disabled={busy || off}
                    onClick={() => pick({ food: f })}
                    style={off ? { opacity: 0.45 } : undefined}
                  >
                    <FoodTile food={f} size={42} />
                    <div style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <span style={{ fontSize: 16, fontWeight: 700 }}>{f.name}</span>
                      <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                        {off ? 'Vetoed today' : f.tags.length ? f.tags.map(formatTag).join(' · ') : 'No tags'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                      {!off && isRecent(f) && <span className="badge badge--recent">Recent</span>}
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{lastEatenLabel(f.daysSinceEaten)}</span>
                    </div>
                  </button>
                );
              })}
              {shown.length === 0 && (
                <p style={{ margin: 0, padding: 16, fontSize: 14, color: 'var(--muted)', textAlign: 'center' }}>Nothing matches.</p>
              )}
            </div>
          </>
        ) : (
          <form
            style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
            onSubmit={(e) => {
              e.preventDefault();
              if (typedName && !typedVetoed) pick({ name: typedName });
            }}
          >
            <label htmlFor="typed-food" className="field-label">What are we eating?</label>
            <input
              id="typed-food"
              className="input"
              autoFocus
              maxLength={40}
              placeholder="e.g. Banana leaf rice"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
            {typedVetoed && <span style={{ fontSize: 13, color: '#b42318' }}>{typedName} was vetoed today.</span>}
            <button type="submit" className="btn btn--primary press" style={{ height: 52 }} disabled={!typedName || typedVetoed || busy}>
              {sendTo ? `Send to ${sendTo}` : 'Lock it in'}
            </button>
          </form>
        )}

        {error && (
          <p role="alert" style={{ margin: 0, fontSize: 14, color: '#b42318' }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
