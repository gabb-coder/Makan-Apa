import { todayIn } from './dates';
import { storage } from './storage';
import { supabase, type MemberRow, type RoomRow } from './supabase';

const ROOM_KEY = 'makan.roomId';
const MEMBER_KEY = 'makan.memberId';
const LAST_CODE_KEY = 'makan.lastCode';

export const CODE_LENGTH = 6;

/** Avatar colours, handed out in join order (the database uses the same list). */
export const MEMBER_COLORS = ['#CC3F17', '#2F6FD6', '#2F8F5B', '#8A3FC4', '#B7791F', '#1E8C8C', '#C2185B', '#4A4A50'];

export interface Session {
  room: RoomRow;
  me: MemberRow;
  /** Everyone in the room at join time, so the first render isn't just you. */
  members: MemberRow[];
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

/**
 * Every phone has a Supabase anonymous account (no sign-up, nothing to remember). Room data is
 * only visible to accounts that are members of that room (see the room_membership migration).
 */
export async function ensureSignedIn(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  if (data.session) return;
  const { error } = await supabase.auth.signInAnonymously();
  if (error) throw new Error(error.message);
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

/** Leave on this phone: drop this account's access to the room, then forget it. */
export async function leaveRoom(roomId: string): Promise<void> {
  forgetSession();
  await supabase.rpc('leave_room', { p_room_id: roomId });
}

/** Code to prefill on the Join screen: a ?join= link first, then the last room used here. */
export function suggestedCode(): string {
  const fromLink = new URLSearchParams(window.location.search).get('join');
  return normalizeCode(fromLink ?? storage.get(LAST_CODE_KEY) ?? '');
}

async function loadSession(roomId: string, memberId: string): Promise<Session | null> {
  const [room, members] = await Promise.all([
    supabase.from('rooms').select('*').eq('id', roomId).maybeSingle(),
    supabase.from('members').select('*').eq('room_id', roomId).order('sort_order').order('created_at'),
  ]);
  if (room.error || members.error) throw new Error((room.error ?? members.error)!.message);
  const me = (members.data as MemberRow[]).find((m) => m.id === memberId);
  if (!room.data || !me) return null;
  return { room: room.data as RoomRow, me, members: members.data as MemberRow[] };
}

export async function restoreSession(): Promise<Session | null> {
  const roomId = storage.get(ROOM_KEY);
  const memberId = storage.get(MEMBER_KEY);
  if (!roomId || !memberId) return null;
  await ensureSignedIn();
  let session = await loadSession(roomId, memberId);
  if (!session) {
    // A phone from before accounts (or a fresh sign-in): its saved ids prove who it is.
    const { data: claimed } = await supabase.rpc('claim_member', { p_room_id: roomId, p_member_id: memberId });
    if (claimed) session = await loadSession(roomId, memberId);
  }
  if (!session) forgetSession();
  return session;
}

interface JoinResult {
  room: RoomRow;
  member: MemberRow;
  rejoined: boolean;
}

async function finish(result: JoinResult): Promise<Session & { rejoined: boolean }> {
  const session = await loadSession(result.room.id, result.member.id);
  if (!session) throw new Error('Could not open the room. Try again.');
  remember(session);
  return { ...session, rejoined: result.rejoined };
}

export async function joinRoom(rawCode: string, rawName: string): Promise<Session & { rejoined: boolean }> {
  const code = normalizeCode(rawCode);
  await ensureSignedIn();
  const { data, error } = await supabase.rpc('join_room', { p_code: code, p_name: rawName.trim() });
  if (error) throw new Error(error.message);
  // Same name as someone already there continues as that member rather than adding a twin.
  if (!data) throw new Error(`No room with code ${code}. Check it with your kaki.`);
  return finish(data as JoinResult);
}

/** What to call a room: its name, or "Room K7M2QX" if it has none. */
export function roomTitle(room: Pick<RoomRow, 'name' | 'code'>): string {
  return room.name?.trim() || `Room ${room.code}`;
}

export const ROOM_NAME_MAX = 40;

export async function createRoom(rawName: string, roomName = ''): Promise<Session> {
  const timezone = browserTimeZone();
  await ensureSignedIn();
  const { data, error } = await supabase.rpc('create_room', {
    p_name: rawName.trim(),
    p_timezone: timezone,
    p_rotation_start: todayIn(timezone),
    p_room_name: roomName.trim() || null,
  });
  if (error) throw new Error(error.message);
  return finish(data as JoinResult);
}

/**
 * The room's host: whoever created it, i.e. the first member to join. Only the host can
 * remove people or delete the room (enforced by the database's row-level security).
 */
export function hostOf(members: MemberRow[]): MemberRow | null {
  return members.reduce<MemberRow | null>(
    (first, m) => (!first || m.created_at < first.created_at || (m.created_at === first.created_at && m.id < first.id) ? m : first),
    null,
  );
}
