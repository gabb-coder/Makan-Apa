import { useState } from 'react';
import { t } from '../lib/i18n';
import type { Food } from '../lib/foods';
import type { Suggestion } from '../lib/suggest';
import { FoodTile } from './FoodTile';

/**
 * The app's best idea for today and why, opened from "✨ Suggest one" on the decider card:
 * pick it, ask for another, or put it away.
 */
export function SuggestCard({ list, onPick, onClose, onError }: { list: Suggestion[]; onPick: (food: Food) => Promise<void>; onClose: () => void; onError: (m: string) => void }) {
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState(false);
  if (list.length === 0) {
    return (
      <section className="card fade-up" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <span style={{ flexGrow: 1, fontSize: 14, color: 'var(--ink-2)' }}>{t('No ideas right now: add a few foods to the food list first.')}</span>
        <button type="button" className="btn btn--secondary press" onClick={onClose} style={{ height: 40, padding: '0 14px' }}>
          {t('OK')}
        </button>
      </section>
    );
  }
  const s = list[i % list.length];
  return (
    <section className="card fade-up" aria-labelledby="suggest-label" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <h2 id="suggest-label" className="section-label" style={{ margin: 0 }}>
          {t('How about…')}
        </h2>
        <button type="button" className="icon-btn press" aria-label={t('Close the suggestion')} onClick={onClose} style={{ width: 36, height: 36, margin: '-6px -6px -6px 0' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
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
          <button type="button" className="btn btn--secondary press" disabled={busy} onClick={() => setI(i + 1)} style={{ flex: 1, height: 46 }}>
            {t('Another idea')}
          </button>
        )}
      </div>
    </section>
  );
}
