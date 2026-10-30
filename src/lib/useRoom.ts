import { useEffect, useState } from 'react';
import { storage } from './storage';
import { supabase, type RoomRow } from './supabase';

const ROOM_KEY = 'makan.roomId';
// No 0/O or 1/I/L, so codes are easy to read out loud.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function randomRoomCode(length = 6): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

async function createRoom(): Promise<RoomRow> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase.from('rooms').insert({ code: randomRoomCode() }).select().single();
    if (!error) return data as RoomRow;
    if (error.code !== '23505') throw error; // anything but a code collision
  }
  throw new Error('Could not find a free room code. Try again.');
}

async function loadOrCreateRoom(): Promise<RoomRow> {
  const savedId = storage.get(ROOM_KEY);
  if (savedId) {
    const { data, error } = await supabase.from('rooms').select('*').eq('id', savedId).maybeSingle();
    if (error) throw error;
    if (data) return data as RoomRow;
  }
  const room = await createRoom();
  storage.set(ROOM_KEY, room.id);
  return room;
}

// Shared so React StrictMode's double effect doesn't create two rooms.
let pending: Promise<RoomRow> | null = null;

/**
 * Phase 2 stand-in for joining: reuse this phone's room, or create one on first visit.
 * Phase 3 replaces this with the Join screen and members.
 */
export function useRoom() {
  const [room, setRoom] = useState<RoomRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    pending ??= loadOrCreateRoom();
    pending.then(
      (r) => live && setRoom(r),
      (e: unknown) => {
        pending = null;
        if (live) setError(e instanceof Error ? e.message : 'Could not reach the server.');
      },
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  const retry = () => {
    setError(null);
    setAttempt((a) => a + 1);
  };

  return { room, error, retry };
}
