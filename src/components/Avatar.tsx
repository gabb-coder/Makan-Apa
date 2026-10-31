import { t } from '../lib/i18n';
import type { CSSProperties } from 'react';

interface Props {
  name: string;
  color: string;
  size?: number;
  /** White badge with a coloured initial, for use on the orange decider card. */
  inverted?: boolean;
  style?: CSSProperties;
}

/** Small label marking the room's host ("You · Host" on the host's own phone). */
export function HostBadge({ you = false }: { you?: boolean }) {
  return (
    <span className="badge" style={{ background: 'var(--streak-bg)', color: 'var(--streak-ink)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" />
      </svg>
      {you ? t('You · Host') : t('Host')}
    </span>
  );
}

/** Round initial badge in the member's colour. */
export function Avatar({ name, color, size = 26, inverted = false, style }: Props) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: 999,
        background: inverted ? '#FFFFFF' : color,
        color: inverted ? color : '#FFFFFF',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: size >= 40 ? 'var(--font-display)' : undefined,
        fontSize: Math.round(size * 0.45),
        fontWeight: 800,
        ...style,
      }}
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
    </div>
  );
}
