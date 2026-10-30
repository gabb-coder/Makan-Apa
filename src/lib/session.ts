import { todayIn } from './dates';
import { storage } from './storage';
import { supabase, type MemberRow, type RoomRow } from './supabase';

const ROOM_KEY = 'makan.roomId';
const MEMBER_KEY = 'makan.memberId';
const LAST_CODE_KEY = 'makan.lastCode';

// No 0/O or 1/I/L, so codes are easy to read out loud.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;

/** Avatar colours, handed out in join order. The first two match the mockups. */
export const MEMBER_COLORS = ['#CC3F17', '#2F6FD6', '#2F8F5B', '#8A3FC4', '#B7791F', '#1E8C8C', '#C2185B', '#4A4A50'];

export interface Session {
  room: RoomRow;
  me: MemberRow;
  /** Everyone in the room at join time, so the first render isn't just you. */
  members: MemberRow[];
}

export function randomRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
}

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kuala_Lumpur';
  } catch {
    return 'Asia/Kuala_Lumpur';
  }
}

function remember({ room, me }: Pick<Session, 'room' | 'me'>) {
  storage.set(ROOM_KEY, room.id);
  storage.set(MEMBER_KEY, me.id);
  storage.set(LAST_CODE_KEY, room.code);
}

/** Forget the room on this phone. The member stays in the room's rotation. */
export function forgetSession() {
  storage.remove(ROOM_KEY);
  storage.remove(MEMBER_KEY);
}

/** Code to prefill on the Join screen: a ?join= link first, then the last room used here. */
export function suggestedCode(): string {
  const fromLink = new URLSearchParams(window.location.search).get('join');
  return normalizeCode(fromLink ?? storage.get(LAST_CODE_KEY) ?? '');
}

export async function restoreSession(): Promise<Session | null> {
  const roomId = storage.get(ROOM_KEY);
  const memberId = storage.get(MEMBER_KEY);
  if (!roomId || !memberId) return null;
  const [room, members] = await Promise.all([
    supabase.from('rooms').select('*').eq('id', roomId).maybeSingle(),
    supabase.from('members').select('*').eq('room_id', roomId).order('sort_order').order('created_at'),
  ]);
  if (room.error || members.error) throw new Error((room.error ?? members.error)!.message);
  const me = (members.data as MemberRow[]).find((m) => m.id === memberId);
  if (!room.data || !me) {
    forgetSession();
    return null;
  }
  return { room: room.data as RoomRow, me, members: members.data as MemberRow[] };
}

async function addMember(room: RoomRow, name: string): Promise<{ me: MemberRow; members: MemberRow[]; rejoined: boolean }> {
  const { data, error } = await supabase.from('members').select('*').eq('room_id', room.id).order('sort_order').order('created_at');
  if (error) throw new Error(error.message);
  const members = data as MemberRow[];

  // Same name on a new phone: carry on as that member rather than adding a twin.
  const existing = members.find((m) => m.name.trim().toLowerCase() === name.toLowerCase());
  if (existing) return { me: existing, members, rejoined: true };

  const used = new Set(members.map((m) => m.color.toUpperCase()));
  const color = MEMBER_COLORS.find((c) => !used.has(c.toUpperCase())) ?? MEMBER_COLORS[members.length % MEMBER_COLORS.length];
  const sortOrder = members.reduce((max, m) => Math.max(max, m.sort_order + 1), 0);
  const inserted = await supabase
    .from('members')
    .insert({ room_id: room.id, name, color, sort_order: sortOrder })
    .select()
    .single();
  if (inserted.error) throw new Error(inserted.error.message);
  const me = inserted.data as MemberRow;
  return { me, members: [...members, me], rejoined: false };
}

export async function joinRoom(rawCode: string, rawName: string): Promise<Session & { rejoined: boolean }> {
  const code = normalizeCode(rawCode);
  const name = rawName.trim();
  const { data, error } = await supabase.from('rooms').select('*').eq('code', code).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`No room with code ${code}. Check it with your kaki.`);
  const room = data as RoomRow;
  const { me, members, rejoined } = await addMember(room, name);
  const session = { room, me, members };
  remember(session);
  return { ...session, rejoined };
}

export async function createRoom(rawName: string): Promise<Session> {
  const timezone = browserTimeZone();
  let room: RoomRow | null = null;
  for (let attempt = 0; attempt < 5 && !room; attempt++) {
    const { data, error } = await supabase
      .from('rooms')
      .insert({ code: randomRoomCode(), timezone, rotation_start: todayIn(timezone) })
      .select()
      .single();
    if (!error) room = data as RoomRow;
    else if (error.code !== '23505') throw new Error(error.message); // anything but a code collision
  }
  if (!room) throw new Error('Could not find a free room code. Try again.');
  const { me, members } = await addMember(room, rawName.trim());
  const session = { room, me, members };
  remember(session);
  return session;
}
