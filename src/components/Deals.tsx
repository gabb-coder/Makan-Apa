import { useEffect, useState } from 'react';
import { t } from '../lib/i18n';
import { addDays, dayLabel } from '../lib/rotation';
import type { Spot } from '../lib/nearby';
import type { MemberRow } from '../lib/supabase';
import type { DealRow, DealsApi } from '../lib/useDeals';

/** "until Fri 6", "today only" */
function untilText(endsOn: string, today: string): string {
  if (endsOn === today) return t('today only');
  if (endsOn === addDays(today, 1)) return t('until tomorrow');
  return t('until {day}', { day: dayLabel(endsOn) });
}

/** The room's deals as a row of chips (tap one at a place to open it), and a way to post one. */
export function DealsRow({ api, spots, today, onOpenSpot, onPost }: { api: DealsApi; spots: Spot[]; today: string; onOpenSpot: (spot: Spot) => void; onPost: () => void }) {
  const byId = new Map(spots.map((s) => [s.id, s]));
  if (!api.deals.length) {
    return (
      <button type="button" className="press" onClick={onPost} style={{ alignSelf: 'flex-start', minHeight: 40, padding: 0, border: 'none', background: 'none', fontSize: 14, fontWeight: 700, color: 'var(--accent-text)' }}>
        {t('🏷️ Spotted a promo? Post a deal')}
      </button>
    );
  }
  return (
    <div className="chip-row" role="list" aria-label={t('Deals')} style={{ gap: 8 }}>
      {api.deals.map((d) => {
        const spot = d.spot_id ? byId.get(d.spot_id) : undefined;
        const style = { flexShrink: 0, maxWidth: 260, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1, height: 'auto', padding: '8px 12px', textAlign: 'left' } as const;
        const body = (
          <>
            <span style={{ fontSize: 13, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>🏷️ {d.title}</span>
            <span style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
              {spot ? `${spot.name} · ` : ''}
              {untilText(d.ends_on, today)}
            </span>
          </>
        );
        // Only a deal at a place opens something; the others are just notes.
        return spot ? (
          <button key={d.id} type="button" role="listitem" className="chip press" onClick={() => onOpenSpot(spot)} style={style}>
            {body}
          </button>
        ) : (
          <div key={d.id} role="listitem" className="chip" style={style}>
            {body}
          </div>
        );
      })}
      <button type="button" className="chip press" onClick={onPost} style={{ flexShrink: 0 }}>
        {t('+ Deal')}
      </button>
    </div>
  );
}

/** On a place's page: its deals, with remove for whoever posted it (or the host), and post one here. */
export function SpotDeals({ spot, api, today, me, members, isHost, onPost, onError }: { spot: Spot; api: DealsApi; today: string; me: MemberRow; members: MemberRow[]; isHost: boolean; onPost: () => void; onError: (m: string) => void }) {
  const here = api.atSpot(spot.id);
  const nameOf = (id: string) => (id === me.id ? t('You') : (members.find((m) => m.id === id)?.name ?? t('Someone')));
  return (
    <section aria-labelledby="spot-deals-label" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h3 id="spot-deals-label" className="field-label" style={{ margin: 0 }}>
        {t('Deals here')}
      </h3>
      {here.map((d) => (
        <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 14, background: 'var(--accent-tint)', color: 'var(--accent-ink)' }}>
          <span style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 14, fontWeight: 700, overflowWrap: 'anywhere' }}>🏷️ {d.title}</span>
            <span style={{ fontSize: 12 }}>
              {untilText(d.ends_on, today)} · {nameOf(d.member_id)}
            </span>
          </span>
          {(d.member_id === me.id || isHost) && (
            <button type="button" className="press" onClick={() => api.remove(d.id).catch((e: unknown) => onError(e instanceof Error ? e.message : String(e)))} style={{ minHeight: 36, border: 'none', background: 'none', fontSize: 13, fontWeight: 700, color: 'inherit', textDecoration: 'underline' }}>
              {t('Remove')}
            </button>
          )}
        </div>
      ))}
      <button type="button" className="btn btn--secondary press" onClick={onPost} style={{ height: 40 }}>
        {t('🏷️ Post a deal here')}
      </button>
    </section>
  );
}

/** The coming Sunday (today if it's Sunday): when most weekly promos end. */
function thisSunday(today: string): string {
  const wd = new Date(`${today}T00:00:00Z`).getUTCDay();
  return addDays(today, (7 - wd) % 7);
}

/** Post a deal: what it is, where (optional), and the last day it's on. */
export function DealSheet({ spots, today, spotId = null, onPost, onClose }: { spots: Spot[]; today: string; spotId?: string | null; onPost: (d: Pick<DealRow, 'title' | 'spot_id' | 'ends_on'>) => Promise<void>; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [where, setWhere] = useState(spotId ?? '');
  const [endsOn, setEndsOn] = useState(thisSunday(today));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const sorted = [...spots].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <form
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="deal-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim() || !endsOn) return;
          setBusy(true);
          setError(null);
          try {
            await onPost({ title, spot_id: where || null, ends_on: endsOn < today ? today : endsOn });
            onClose();
          } catch (err) {
            setError(err instanceof Error ? err.message : t('Something went wrong. Try again.'));
            setBusy(false);
          }
        }}
      >
        <h2 id="deal-title" className="title title--sm" style={{ fontSize: 22 }}>
          {t('Post a deal')}
        </h2>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--ink-2)' }}>{t('Everyone in the room sees it on Today, and the wheel leans a little towards food you can get there.')}</p>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="field-label">{t('What’s the deal?')}</span>
          <input id="deal-text" className="input" maxLength={80} placeholder={t('e.g. 1-for-1 milk tea after 3pm')} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="field-label">
            {t('Where')} <span style={{ fontWeight: 500, color: 'var(--muted)' }}>{t('(optional)')}</span>
          </span>
          <select id="deal-spot" className="input" value={where} onChange={(e) => setWhere(e.target.value)}>
            <option value="">{t('Somewhere else')}</option>
            {sorted.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="field-label">{t('Last day')}</span>
          <input id="deal-ends" type="date" className="input" min={today} value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
        </label>
        {error && (
          <p role="alert" style={{ margin: 0, color: 'var(--danger)', fontSize: 14 }}>
            {error}
          </p>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn--secondary press" onClick={onClose} style={{ flex: 1 }}>
            {t('Cancel')}
          </button>
          <button type="submit" className="btn btn--primary press" disabled={busy || !title.trim()} style={{ flex: 2 }}>
            {t('Post deal')}
          </button>
        </div>
      </form>
    </div>
  );
}
