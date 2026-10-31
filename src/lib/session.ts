import { todayIn } from './dates';
import { t } from './i18n';
import { storage } from './storage';
import { supabase, type MemberRow, type RoomRow } from './supabase';

const ROOM_KEY = 'makan.roomId';
const MEMBER_KEY = 'makan.memberId';
const LAST_CODE_KEY = 'makan.lastCode';
const ROOMS_KEY = 'makan.rooms';

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

/** A room this phone has joined, for switching between rooms. */
export interface KnownRoom {
  roomId: string;
  memberId: string;
  code: string;
  title: string;
  /** Your name in that room. */
  name: string;
}

export function knownRooms(): KnownRoom[] {
  try {
    const list = JSON.parse(storage.get(ROOMS_KEY) ?? '[]') as KnownRoom[];
    return Array.isArray(list) ? list.filter((r) => r && r.roomId && r.memberId) : [];
  } catch {
    return [];
  }
}

function saveKnownRooms(list: KnownRoom[]) {
  storage.set(ROOMS_KEY, JSON.stringify(list));
}

function remember({ room, me }: Pick<Session, 'room' | 'me'>) {
  storage.set(ROOM_KEY, room.id);
  storage.set(MEMBER_KEY, me.id);
  storage.set(LAST_CODE_KEY, room.code);
  const entry: KnownRoom = { roomId: room.id, memberId: me.id, code: room.code, title: roomTitle(room), name: me.name };
  saveKnownRooms([entry, ...knownRooms().filter((r) => r.roomId !== room.id)]);
}

/** The room open now, if any. */
export function currentRoomId(): string | null {
  return storage.get(ROOM_KEY);
}

/** Make another known room the current one (then restore it). */
export function selectRoom(roomId: string): boolean {
  const known = knownRooms().find((r) => r.roomId === roomId);
  if (!known) return false;
  storage.set(ROOM_KEY, known.roomId);
  storage.set(MEMBER_KEY, known.memberId);
  return true;
}

/** Close the current room without forgetting it, e.g. to join another one. */
export function closeCurrentRoom() {
  storage.remove(ROOM_KEY);
  storage.remove(MEMBER_KEY);
}

/** Forget the room on this phone. The member stays in the room's rotation. */
export function forgetSession(roomId = storage.get(ROOM_KEY)) {
  if (roomId && roomId === storage.get(ROOM_KEY)) closeCurrentRoom();
  if (roomId) saveKnownRooms(knownRooms().filter((r) => r.roomId !== roomId));
}

/** Leave on this phone: drop this account's access to the room, then forget it. */
export async function leaveRoom(roomId: string): Promise<void> {
  forgetSession(roomId);
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

async function openRoom(roomId: string, memberId: string): Promise<Session | null> {
  let session = await loadSession(roomId, memberId);
  if (!session) {
    // A phone from before accounts (or a fresh sign-in): its saved ids prove who it is.
    const { data: claimed } = await supabase.rpc('claim_member', { p_room_id: roomId, p_member_id: memberId });
    if (claimed) session = await loadSession(roomId, memberId);
  }
  return session;
}

/**
 * Open the current room, or failing that the most recent other room on this phone. Rooms that
 * no longer exist (or no longer have you) are forgotten on the way.
 */
export async function restoreSession(): Promise<Session | null> {
  const current = storage.get(ROOM_KEY);
  const memberId = storage.get(MEMBER_KEY);
  const candidates: { roomId: string; memberId: string }[] = [];
  if (current && memberId) candidates.push({ roomId: current, memberId });
  else if (current || memberId) closeCurrentRoom();
  // With no current room (after "Join another room" was cancelled, say), fall back to the list.
  if (!candidates.length) candidates.push(...knownRooms());
  if (!candidates.length) return null;
  await ensureSignedIn();
  for (const c of candidates) {
    const session = await openRoom(c.roomId, c.memberId);
    if (session) {
      remember(session);
      return session;
    }
    forgetSession(c.roomId);
    if (c.roomId === current) break; // the current room is gone: show the join screen with the rest
  }
  return null;
}

interface JoinResult {
  room: RoomRow;
  member: MemberRow;
  rejoined: boolean;
}

async function finish(result: JoinResult): Promise<Session & { rejoined: boolean }> {
  const session = await loadSession(result.room.id, result.member.id);
  if (!session) throw new Error(t('Could not open the room. Try again.'));
  remember(session);
  return { ...session, rejoined: result.rejoined };
}

export type JoinProblem = 'pin_required' | 'wrong_pin' | 'pin_locked' | 'name_in_use';

/** Joining with a name that's taken needs that person's PIN (see the member_pins migration). */
export class JoinError extends Error {
  constructor(
    public problem: JoinProblem,
    public memberName: string,
    public triesLeft?: number,
  ) {
    super(joinProblemText(problem, memberName, triesLeft));
  }
}

export function joinProblemText(problem: JoinProblem, name: string, triesLeft?: number): string {
  switch (problem) {
    case 'pin_required':
      return t("{name} is already in this room. If that's you, enter your PIN to continue on this phone.", { name });
    case 'wrong_pin':
      return triesLeft === 1
        ? t("That PIN isn't right. 1 try left before it locks for 15 minutes.")
        : triesLeft == null
          ? t("That PIN isn't right. A few tries left before it locks for 15 minutes.")
          : t("That PIN isn't right. {n} tries left before it locks for 15 minutes.", { n: triesLeft });
    case 'pin_locked':
      return t('Too many wrong PINs for {name}. Try again in 15 minutes, or ask the host to let you back in.', { name });
    case 'name_in_use':
      return t('{name} is already using this name on another phone. Pick a different name, or ask the host to let you back in from Settings.', { name });
  }
}

export async function joinRoom(rawCode: string, rawName: string, pin?: string): Promise<Session & { rejoined: boolean }> {
  const code = normalizeCode(rawCode);
  await ensureSignedIn();
  const { data, error } = await supabase.rpc('join_room', { p_code: code, p_name: rawName.trim(), p_pin: pin || null });
  if (error) throw new Error(error.message);
  if (!data) throw new Error(t('No room with code {code}. Check it with your kaki.', { code }));
  const problem = data as { error?: JoinProblem; name?: string; tries_left?: number };
  if (problem.error) throw new JoinError(problem.error, problem.name ?? rawName.trim(), problem.tries_left);
  // Same name as someone already there continues as that member rather than adding a twin.
  return finish(data as JoinResult);
}

/** Set, change or (with null) remove this phone's member PIN. */
export async function setMyPin(roomId: string, pin: string | null): Promise<void> {
  const { error } = await supabase.rpc('set_my_pin', { p_room_id: roomId, p_pin: pin });
  if (error) throw new Error(error.message);
}

/** Host only: let a member rejoin by name on a new phone for the next 15 minutes. */
export async function letMemberRejoin(roomId: string, memberId: string): Promise<void> {
  const { error } = await supabase.rpc('let_member_rejoin', { p_room_id: roomId, p_member_id: memberId });
  if (error) throw new Error(error.message);
}

/** Members of the room who have a PIN. */
export async function roomPins(roomId: string): Promise<Set<string>> {
  const { data, error } = await supabase.rpc('room_pins', { p_room_id: roomId });
  if (error) throw new Error(error.message);
  return new Set((data as string[] | null) ?? []);
}

/** What to call a room: its name, or "Room K7M2QX" if it has none. */
export function roomTitle(room: Pick<RoomRow, 'name' | 'code'>): string {
  return room.name?.trim() || t('Room {code}', { code: room.code });
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
