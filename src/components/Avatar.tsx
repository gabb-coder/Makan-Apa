import type { CSSProperties } from 'react';

interface Props {
  name: string;
  color: string;
  size?: number;
  style?: CSSProperties;
}

/** Round initial badge in the member's colour. */
export function Avatar({ name, color, size = 26, style }: Props) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: 999,
        background: color,
        color: '#FFFFFF',
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
