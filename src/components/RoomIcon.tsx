import { MEMBER_COLORS } from '../lib/session';
import { Avatar } from './Avatar';

export const ROOM_EMOJIS = ['🍜', '🍛', '🍚', '🍣', '🍕', '🍔', '🥟', '🍗', '🌮', '🥘', '🧋', '☕', '🏢', '🏠', '🎓', '👨‍👩‍👧'];

/** A steady colour per room, from its code, until someone picks one. */
export function roomColor(code: string, chosen?: string | null): string {
  if (chosen) return chosen;
  let h = 0;
  for (const c of code) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return MEMBER_COLORS[h % MEMBER_COLORS.length];
}

/** The room's emoji on its colour, or its first letter if it has no emoji. */
export function RoomIcon({ title, code, emoji, color, size = 46 }: { title: string; code: string; emoji?: string | null; color?: string | null; size?: number }) {
  const bg = roomColor(code, color);
  if (!emoji) return <Avatar name={title} color={bg} size={size} />;
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, flexShrink: 0, borderRadius: 999, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.52, lineHeight: 1 }}
    >
      {emoji}
    </span>
  );
}
