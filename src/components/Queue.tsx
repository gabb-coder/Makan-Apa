import { useState } from 'react';
import { t } from '../lib/i18n';
import { QUEUE_LEVELS, type QueueNow, type QueuesApi } from '../lib/queues';

/** "🔴 Long queue · 4 min ago" */
export function queueText(q: QueueNow): string {
  const l = QUEUE_LEVELS.find((x) => x.level === q.level)!;
  const ago = q.minutesAgo < 1 ? t('just now') : t('{n} min ago', { n: q.minutesAgo });
  return `${l.emoji} ${t(l.label)} · ${ago}`;
}

/** A small badge for a place's card, when someone reported its queue lately. */
export function QueueBadge({ q }: { q?: QueueNow }) {
  if (!q) return null;
  return <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{queueText(q)}</span>;
}

/** On a place's page: what people say the queue is like now, and three buttons to say so yourself. */
export function QueueRow({ spotId, queues, onError }: { spotId: string; queues: QueuesApi; onError: (m: string) => void }) {
  const q = queues.byPlace.get(spotId);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <section aria-labelledby="queue-label" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h3 id="queue-label" className="field-label" style={{ margin: 0 }}>
        {t('Queue right now')}
      </h3>
      <span role="status" style={{ fontSize: 14, color: q ? 'var(--ink)' : 'var(--muted)' }}>
        {q
          ? `${queueText(q)}${q.reports > 1 ? ` (${t('{n} reports', { n: q.reports })})` : ''}`
          : t('No reports in the last half hour. There now? Tell everyone.')}
      </span>
      {sent ? (
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-2)' }}>{t('Thanks! Everyone heading here sees it for 30 minutes.')}</span>
      ) : (
        <div className="segmented" role="group" aria-label={t('How long is the queue?')} style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          {QUEUE_LEVELS.map((l) => (
            <button
              key={l.level}
              type="button"
              aria-pressed={false}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await queues.report(spotId, l.level);
                  setSent(true);
                } catch (e) {
                  onError(e instanceof Error ? e.message : t('Something went wrong. Try again.'));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {l.emoji} {t(l.label)}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
