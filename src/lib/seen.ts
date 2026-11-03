import { storage } from './storage';

/** When this phone last looked at each room, for the main menu's "New" badges. */
const KEY = 'makan.lastSeen';

function all(): Record<string, string> {
  try {
    const v = JSON.parse(storage.get(KEY) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

export function lastSeen(roomId: string): string | null {
  return all()[roomId] ?? null;
}

export function markSeen(roomId: string, at = new Date().toISOString()) {
  storage.set(KEY, JSON.stringify({ ...all(), [roomId]: at }));
}
