import { useEffect, useRef, useState } from 'react';
import { landingAngle, SPIN_MS, type TickSpeed } from '../components/Wheel';
import { playChime, playTick, unlockAudio } from './sound';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

/**
 * The wheel's spin animation (SPEC.md 4b): 6 turns plus the landing offset with jitter,
 * a pointer tick that slows in steps, a tick sound per slice and a chime and burst on landing.
 */
export function useWheelSpin() {
  const reducedMotion = usePrefersReducedMotion();
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [tick, setTick] = useState<TickSpeed>(null);
  const [burstKey, setBurstKey] = useState<number | null>(null);
  const timers = useRef<number[]>([]);
  const rotorRef = useRef<HTMLDivElement>(null);
  const tickLoop = useRef(0);

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };
  const stopTickLoop = () => cancelAnimationFrame(tickLoop.current);
  useEffect(
    () => () => {
      clearTimers();
      stopTickLoop();
    },
    [],
  );

  /** Click once per slice boundary the pointer passes, read from the disc's live angle. */
  const startTickLoop = (seg: number) => {
    stopTickLoop();
    let last: number | null = null;
    let total = 0;
    let lastSlice = 0;
    const frame = () => {
      const el = rotorRef.current;
      if (el) {
        const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
        const angle = (Math.atan2(m.b, m.a) * 180) / Math.PI;
        if (last !== null) total += ((angle - last + 540) % 360) - 180;
        last = angle;
        const slice = Math.floor(total / seg);
        if (slice !== lastSlice) {
          lastSlice = slice;
          playTick();
        }
      }
      tickLoop.current = requestAnimationFrame(frame);
    };
    tickLoop.current = requestAnimationFrame(frame);
  };

  /** Spin so slice `k` of `n` lands under the pointer, then call `onLanded`. */
  const spinTo = (k: number, n: number, onLanded: () => void) => {
    const seg = 360 / n;
    const jitterMax = Math.min(12, seg * 0.35);
    const jitter = Math.random() * 2 * jitterMax - jitterMax;
    const base = rotation - (((rotation % 360) + 360) % 360);

    clearTimers();
    setBurstKey(null);

    if (reducedMotion) {
      setRotation(base + landingAngle(k, n) + jitter);
      onLanded();
      return;
    }

    unlockAudio();
    startTickLoop(seg);
    setRotation(base + 360 * 6 + landingAngle(k, n) + jitter);
    setSpinning(true);
    setTick('fast');
    timers.current = [
      window.setTimeout(() => setTick('mid'), 1500),
      window.setTimeout(() => setTick('slow'), 2700),
      window.setTimeout(() => setTick('crawl'), 3500),
      window.setTimeout(() => {
        stopTickLoop();
        playChime();
        setTick(null);
        setSpinning(false);
        setBurstKey(Date.now());
        onLanded();
      }, SPIN_MS + 100),
    ];
  };

  return {
    rotorRef,
    rotation,
    spinning,
    tick,
    burstKey: reducedMotion ? null : burstKey,
    reducedMotion,
    spinTo,
    clearBurst: () => setBurstKey(null),
  };
}
