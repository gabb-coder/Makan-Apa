import { useEffect, useState } from 'react';
import { t } from '../lib/i18n';
import type { LiveSpin } from '../lib/liveSpin';
import { useWheelSpin } from '../lib/useWheelSpin';
import { Wheel } from './Wheel';

/** Someone else spun the wheel: the same spin plays here, landing on the same food. */
export function LiveSpinOverlay({ spin, byName, onClose }: { spin: LiveSpin; byName: string; onClose: () => void }) {
  const wheel = useWheelSpin();
  const [landed, setLanded] = useState(false);
  const winner = spin.foods[spin.k];

  useEffect(() => {
    setLanded(false);
    // A beat so the wheel is on screen before it starts turning.
    const timer = window.setTimeout(() => wheel.spinTo(spin.k, spin.foods.length, () => setLanded(true)), 150);
    return () => window.clearTimeout(timer);
  }, [spin.at]);
  // It gets out of the way on its own a few seconds after landing (the pick usually follows).
  useEffect(() => {
    if (!landed) return;
    const timer = window.setTimeout(onClose, 3500);
    return () => window.clearTimeout(timer);
  }, [landed, onClose]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose} style={{ alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 40 }}>
      <div
        className="card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="live-spin-title"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 380, padding: '18px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, animation: 'popIn 0.3s var(--ease-out) both' }}
      >
        <h2 id="live-spin-title" className="title title--sm" style={{ fontSize: 22, textAlign: 'center' }}>
          {landed ? t('{food} it is!', { food: winner.name }) : t('{name} is spinning…', { name: byName })}
        </h2>
        <div style={{ transform: 'scale(0.86)', margin: '-20px 0' }}>
          <Wheel foods={spin.foods} rotation={wheel.rotation} animate={!wheel.reducedMotion} sway={false} tick={wheel.tick} burstKey={wheel.burstKey} rotorRef={wheel.rotorRef} />
        </div>
        <p role="status" style={{ margin: 0, fontSize: 14, color: 'var(--muted)', textAlign: 'center' }}>
          {landed ? t('{name} can send it as today’s pick from their phone.', { name: byName }) : t('Watching live with the room')}
        </p>
        <button type="button" className="btn btn--primary press" onClick={onClose} style={{ alignSelf: 'stretch' }}>
          {landed ? t('Nice') : t('Close')}
        </button>
      </div>
    </div>
  );
}
