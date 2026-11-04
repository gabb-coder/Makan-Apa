import { useState } from 'react';
import { t } from '../lib/i18n';
import type { MemberRow } from '../lib/supabase';
import { useLifts, type Trip } from '../lib/useLifts';

/**
 * Lifts to a meet-up: who's driving, seats left and who's riding. Offer your car with a number of
 * seats, or grab a seat in someone's.
 */
export function Lifts({ roomId, me, members, trip, onError }: { roomId: string; me: MemberRow; members: MemberRow[]; trip: Trip; onError: (m: string) => void }) {
  const api = useLifts(roomId, me.id, trip);
  const [offering, setOffering] = useState(false);
  const [seats, setSeats] = useState(3);
  const [busy, setBusy] = useState(false);
  const nameOf = (id: string) => (id === me.id ? t('You') : (members.find((m) => m.id === id)?.name ?? t('Someone')));
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      onError(e instanceof Error ? e.message : t('Something went wrong. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="group" aria-label={t('Lifts')} style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8, borderTop: '1px solid var(--divider)' }}>
      {api.lifts.map((l) => {
        const riders = api.ridersOf(l.id);
        const left = l.seats - riders.length;
        const driving = l.driver_id === me.id;
        const riding = riders.some((r) => r.member_id === me.id);
        return (
          <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span aria-hidden="true" style={{ fontSize: 22 }}>
              🚗
            </span>
            <span style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ fontSize: 14, fontWeight: 800 }}>
                {driving ? t('You’re driving') : t('{name} is driving', { name: nameOf(l.driver_id) })} · {left === 0 ? t('full') : left === 1 ? t('1 seat left') : t('{n} seats left', { n: left })}
              </span>
              <span style={{ fontSize: 13, color: 'var(--muted)', overflowWrap: 'anywhere' }}>
                {riders.length ? t('With {names}', { names: riders.map((r) => nameOf(r.member_id)).join(', ') }) : t('Nobody riding yet')}
              </span>
            </span>
            {driving ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button type="button" className="icon-btn press" aria-label={t('One seat fewer')} disabled={busy || l.seats <= Math.max(1, riders.length)} onClick={() => run(() => api.setSeats(l.id, l.seats - 1))} style={{ width: 36, height: 36 }}>
                  −
                </button>
                <button type="button" className="icon-btn press" aria-label={t('One more seat')} disabled={busy || l.seats >= 7} onClick={() => run(() => api.setSeats(l.id, l.seats + 1))} style={{ width: 36, height: 36 }}>
                  +
                </button>
                <button type="button" className="btn btn--secondary press" disabled={busy} onClick={() => run(() => api.callOff(l.id))} style={{ height: 36, padding: '0 10px', fontSize: 13 }}>
                  {t('Call off')}
                </button>
              </span>
            ) : riding ? (
              <button type="button" className="btn btn--secondary press" disabled={busy} onClick={() => run(() => api.leave(l.id))} style={{ height: 36, padding: '0 12px', fontSize: 13 }}>
                {t('Leave seat')}
              </button>
            ) : (
              !api.mine &&
              left > 0 && (
                <button type="button" className="btn btn--primary press" disabled={busy} onClick={() => run(() => api.join(l.id))} style={{ height: 36, padding: '0 12px', fontSize: 13 }}>
                  {t('Grab a seat')}
                </button>
              )
            )}
          </div>
        );
      })}
      {!api.mine &&
        (offering ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span id="lift-seats-label" style={{ fontSize: 14, fontWeight: 700 }}>
              {t('Seats for others')}
            </span>
            <span role="group" aria-labelledby="lift-seats-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button type="button" className="icon-btn press" aria-label={t('One seat fewer')} disabled={seats <= 1} onClick={() => setSeats(seats - 1)} style={{ width: 36, height: 36 }}>
                −
              </button>
              <span aria-live="polite" style={{ minWidth: 20, textAlign: 'center', fontWeight: 800 }}>
                {seats}
              </span>
              <button type="button" className="icon-btn press" aria-label={t('One more seat')} disabled={seats >= 7} onClick={() => setSeats(seats + 1)} style={{ width: 36, height: 36 }}>
                +
              </button>
            </span>
            <button
              type="button"
              className="btn btn--primary press"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await api.offer(seats);
                  setOffering(false);
                })
              }
              style={{ height: 36, padding: '0 12px', fontSize: 13, marginLeft: 'auto' }}
            >
              {t('Offer lift')}
            </button>
          </div>
        ) : (
          <button type="button" className="press" onClick={() => setOffering(true)} style={{ alignSelf: 'flex-start', minHeight: 40, padding: 0, border: 'none', background: 'none', fontSize: 14, fontWeight: 700, color: 'var(--accent-text)' }}>
            {t('🚗 I’m driving: offer a lift')}
          </button>
        ))}
    </div>
  );
}
