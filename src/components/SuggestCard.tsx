import { useState } from 'react';
import { t } from '../lib/i18n';
import type { Food } from '../lib/foods';
import type { Suggestion } from '../lib/suggest';
import { FoodTile } from './FoodTile';

/** "Suggest something": the best idea for today and why, then pick it or ask for another. */
export function SuggestCard({ list, onPick, onError }: { list: Suggestion[]; onPick: (food: Food) => Promise<void>; onError: (m: string) => void }) {
  const [i, setI] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  if (list.length === 0) return null;
  if (i === null) {
    return (
      <button type="button" className="btn btn--secondary press" onClick={() => setI(0)} style={{ height: 48, flexShrink: 0 }}>
        {t('✨ Suggest something')}
      </button>
    );
  }
  const s = list[i % list.length];
  return (
    <section className="card fade-up" aria-labelledby="suggest-label" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
      <h2 id="suggest-label" className="section-label" style={{ margin: 0 }}>
        {t('How about…')}
      </h2>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }} aria-live="polite">
        <FoodTile food={s.food} size={48} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span style={{ fontSize: 20, fontWeight: 800, overflowWrap: 'anywhere' }}>{s.food.name}</span>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {s.reasons.map((r) => (
              <li key={r.key} style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                ✓ {t(r.key, r.vars)}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          className="btn btn--primary press"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onPick(s.food);
            } catch (e) {
              onError(e instanceof Error ? e.message : t('Something went wrong. Try again.'));
            } finally {
              setBusy(false);
            }
          }}
          style={{ flex: 2, height: 46 }}
        >
          {t('Pick {food}', { food: s.food.name })}
        </button>
        {list.length > 1 && (
          <button type="button" className="btn btn--secondary press" disabled={busy} onClick={() => setI((i ?? 0) + 1)} style={{ flex: 1, height: 46 }}>
            {t('Another idea')}
          </button>
        )}
      </div>
    </section>
  );
}
