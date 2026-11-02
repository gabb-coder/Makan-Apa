import { useRef, useState, type TouchEvent } from 'react';

/** How far (as a share of the screen) or how fast (px/ms) a swipe must go to change tab. */
const DISTANCE = 0.22;
const SPEED = 0.45;
/** Touches this close to a screen edge are left to the phone's own back gesture. */
const EDGE = 24;

/** Swipes that start on these are theirs, not the tab bar's. */
const OWN_GESTURES = 'input, textarea, select, .sheet-backdrop, [data-no-swipe]';

/** True if the touch began on something that scrolls sideways (the nearby strip, chip rows). */
function scrollsSideways(target: EventTarget | null, stop: Element | null): boolean {
  for (let el = target instanceof Element ? target : null; el && el !== stop; el = el.parentElement) {
    if (el.matches(OWN_GESTURES)) return true;
    if (el.scrollWidth > el.clientWidth + 1) {
      const { overflowX } = getComputedStyle(el);
      if (overflowX === 'auto' || overflowX === 'scroll') return true;
    }
  }
  return false;
}

/**
 * Swipe left or right across a tab's screen to go to the next or previous tab. While the finger
 * is down the screen follows it (with a rubber band at the first and last tab); let go past a
 * quarter of the way, or with a flick, and it moves on.
 */
export function useTabSwipe(index: number, count: number, onSwipe: (to: number) => void, enabled = true) {
  const [dragX, setDragX] = useState(0);
  // A swipe let go too early springs back; one that changes tab just hands over to the new screen.
  const [settling, setSettling] = useState(false);
  const settleTimer = useRef<number | undefined>(undefined);
  const start = useRef<{ x: number; y: number; t: number; width: number; axis: 'x' | 'y' | null } | null>(null);

  const onTouchStart = (e: TouchEvent<HTMLElement>) => {
    const touch = e.touches[0];
    const width = e.currentTarget.clientWidth || window.innerWidth;
    if (!enabled || e.touches.length > 1 || touch.clientX < EDGE || touch.clientX > window.innerWidth - EDGE || scrollsSideways(e.target, e.currentTarget)) {
      start.current = null;
      return;
    }
    start.current = { x: touch.clientX, y: touch.clientY, t: performance.now(), width, axis: null };
  };

  const onTouchMove = (e: TouchEvent<HTMLElement>) => {
    const s = start.current;
    if (!s) return;
    const dx = e.touches[0].clientX - s.x;
    const dy = e.touches[0].clientY - s.y;
    // Decide once whether this is a sideways swipe or a scroll, then stick with it.
    if (!s.axis) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      s.axis = Math.abs(dx) > Math.abs(dy) * 1.3 ? 'x' : 'y';
    }
    if (s.axis !== 'x') return;
    const atEnd = (dx > 0 && index === 0) || (dx < 0 && index === count - 1);
    setDragX(atEnd ? dx * 0.25 : dx);
  };

  const onTouchEnd = (e: TouchEvent<HTMLElement>) => {
    const s = start.current;
    start.current = null;
    if (!s || s.axis !== 'x') return;
    const dx = (e.changedTouches[0]?.clientX ?? s.x) - s.x;
    const speed = Math.abs(dx) / Math.max(1, performance.now() - s.t);
    const to = dx < 0 ? index + 1 : index - 1;
    const moves = (Math.abs(dx) > s.width * DISTANCE || speed > SPEED) && to >= 0 && to < count;
    window.clearTimeout(settleTimer.current);
    setSettling(!moves);
    if (!moves) settleTimer.current = window.setTimeout(() => setSettling(false), 320);
    setDragX(0);
    if (moves) onSwipe(to);
  };

  return {
    /** How far the screen has been dragged, in px (0 when not dragging). */
    dragX,
    /** True while a released swipe springs back into place. */
    settling,
    /** Drag progress as a fraction of a tab, for the tab bar's highlight. */
    dragFraction: -dragX / Math.min(window.innerWidth || 390, 480),
    handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd },
  };
}
