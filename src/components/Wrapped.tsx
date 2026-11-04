import { useEffect, useState } from 'react';
import { t } from '../lib/i18n';
import { formatRM } from '../lib/money';
import { drawWrapped, shareBlob } from '../lib/shareCard';
import type { Wrapped } from '../lib/wrapped';

interface Slide {
  emoji: string;
  big: string;
  line: string;
  bg: string;
}

const COLOURS = ['#CC3F17', '#2F6FD6', '#3C8D5A', '#8E44AD', '#B7791F', '#18181B'];

/** The highlights, as sentences: used on the slides and the shared picture. */
function slidesFor(w: Wrapped, room: string, label: string): Slide[] {
  const s: Omit<Slide, 'bg'>[] = [
    { emoji: '🎁', big: t('{room}, {period} wrapped', { room, period: label }), line: w.meals === 1 ? t('1 meal decided together') : t('{n} meals decided together', { n: w.meals }) },
  ];
  if (w.top) s.push({ emoji: '🏆', big: w.top.name, line: w.top.count === 1 ? t('Your top food, once') : t('Your top food, {n} times', { n: w.top.count }) });
  s.push({ emoji: '🍽️', big: w.foods === 1 ? t('1 different food') : t('{n} different foods', { n: w.foods }), line: w.streak > 1 ? t('Longest run with no repeats: {n} days', { n: w.streak }) : t('Plenty of room for something new') });
  if (w.topDecider) s.push({ emoji: '👑', big: w.topDecider.name, line: w.topDecider.count === 1 ? t('Decided the most: once') : t('Decided the most: {n} times', { n: w.topDecider.count }) });
  if (w.mostVetoed) s.push({ emoji: '🙅', big: w.mostVetoed.name, line: w.vetoes === 1 ? t('Most vetoed, out of 1 veto') : t('Most vetoed, out of {n} vetoes', { n: w.vetoes }) });
  if (w.topPlace) s.push({ emoji: '📍', big: w.topPlace.name, line: w.places === 1 ? t('Your spot, out of 1 place') : t('Your favourite spot, out of {n} places', { n: w.places }) });
  if (w.spent > 0) s.push({ emoji: '💸', big: formatRM(w.spent), line: w.topPayer ? t('Spent together. {name} paid the most ({amount}).', { name: w.topPayer.name, amount: formatRM(w.topPayer.cents) }) : t('Spent together') });
  return s.map((x, i) => ({ ...x, bg: COLOURS[i % COLOURS.length] }));
}

/** A room's month or year as a story: tap through the highlights, then share it as a picture. */
export function WrappedStory({ data, room, label, onClose, onToast }: { data: Wrapped; room: string; label: string; onClose: () => void; onToast: (m: string) => void }) {
  const slides = slidesFor(data, room, label);
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState(false);
  const last = i === slides.length - 1;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setI((n) => Math.min(n + 1, slides.length - 1));
      if (e.key === 'ArrowLeft') setI((n) => Math.max(n - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, slides.length]);
  const slide = slides[i];

  const share = async () => {
    setBusy(true);
    try {
      const blob = await drawWrapped(slides[0].big, slides[0].line, slides.slice(1).map((x) => `${x.emoji} ${x.big}: ${x.line}`));
      const msg = await shareBlob(blob, slides[0].big);
      if (msg) onToast(msg);
    } catch (e) {
      onToast(e instanceof Error ? e.message : t('Something went wrong. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sheet-backdrop" style={{ alignItems: 'stretch', background: slide.bg, transition: 'background 0.3s' }}>
      <div role="dialog" aria-modal="true" aria-labelledby="wrapped-big" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', padding: '16px 20px 24px', color: '#FFFFFF' }}>
        <div style={{ display: 'flex', gap: 4 }} aria-hidden="true">
          {slides.map((_, k) => (
            <span key={k} style={{ flex: 1, height: 4, borderRadius: 999, background: k <= i ? '#FFFFFF' : 'rgba(255,255,255,0.35)' }} />
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, opacity: 0.85 }}>
            {i + 1} / {slides.length}
          </span>
          <button type="button" className="icon-btn press" aria-label={t('Close')} onClick={onClose} style={{ background: 'rgba(255,255,255,0.18)', color: '#FFFFFF', border: 'none' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <button
          type="button"
          onClick={() => setI((n) => Math.min(n + 1, slides.length - 1))}
          aria-label={last ? undefined : t('Next')}
          style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16, border: 'none', background: 'none', color: 'inherit', textAlign: 'left', padding: 0 }}
        >
          <span key={`e${i}`} aria-hidden="true" style={{ fontSize: 72, lineHeight: 1, animation: 'popInScale 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) backwards' }}>
            {slide.emoji}
          </span>
          <span id="wrapped-big" key={`b${i}`} aria-live="polite" style={{ fontSize: 44, fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.02em', overflowWrap: 'anywhere', animation: 'fadeUp 0.45s cubic-bezier(0.2, 0.8, 0.2, 1) backwards' }}>
            {slide.big}
          </span>
          <span key={`l${i}`} style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.35, opacity: 0.92, animation: 'fadeUp 0.45s 0.08s cubic-bezier(0.2, 0.8, 0.2, 1) backwards' }}>
            {slide.line}
          </span>
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          {i > 0 && (
            <button type="button" className="btn press" onClick={() => setI(i - 1)} style={{ flex: 1, background: 'rgba(255,255,255,0.18)', color: '#FFFFFF', border: 'none' }}>
              {t('Back')}
            </button>
          )}
          {last ? (
            <button type="button" className="btn press" disabled={busy} onClick={share} style={{ flex: 2, background: '#FFFFFF', color: '#18181B', border: 'none' }}>
              {busy ? t('Making the picture…') : t('Share as a picture')}
            </button>
          ) : (
            <button type="button" className="btn press" onClick={() => setI(i + 1)} style={{ flex: 2, background: '#FFFFFF', color: '#18181B', border: 'none' }}>
              {t('Next')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
