import { localHour, todayIn } from './dates';
import { balances, settleUp, type Payment } from './money';
import { deciderFor } from './rotation';
import { ensureSignedIn, forgetSession, knownRooms, openRoom, type KnownRoom } from './session';
import { supabase, type DayEntryRow, type Meal, type MealBillRow, type MemberRow, type RoomRow, type SettlementRow } from './supabase';

export type MealStatus =
  | { kind: 'your-turn' }
  | { kind: 'choosing'; decider: string }
  | { kind: 'sent'; food: string }
  | { kind: 'answer'; decider: string; food: string }
  | { kind: 'decided'; food: string }
  | { kind: 'secret'; picked: number; total: number; mine: boolean }
  | { kind: 'out' };

/** What the home screen shows for one room: like a chat list's last message. */
export interface RoomSummary {
  known: KnownRoom;
  room: RoomRow;
  members: MemberRow[];
  /** Everyone who's been in the room, people who left included, for names on old bills. */
  everyone: MemberRow[];
  meId: string;
  /** Today in the room's timezone. */
  date: string;
  /** The meal that's on now (dinner from 3pm in rooms that decide both). */
  meal: Meal;
  /** What's happening now, from this person's point of view. */
  status: MealStatus;
  /** Every meal the room decides today: lunch, and dinner in rooms that decide both. */
  meals: { meal: Meal; status: MealStatus }[];
  /** The payments that would settle up, where you pay or get paid. */
  debts: Payment[];
  /** A tapau run that's open for orders, and who's buying. */
  tapau: { runner: string; mine: boolean } | null;
  /** Your balance in sen: negative means you owe. */
  balance: number;
  /** When anything last happened in the room: a pick, a bill, a payback, a tapau run, a join. */
  lastActivity: string | null;
  /** Something's waiting on you: your turn, a pick to answer, a secret pick, money owed. */
  needsYou: boolean;
}

interface Bundle {
  rooms: RoomRow[];
  members: MemberRow[];
  entries: DayEntryRow[];
  foods: { id: string; name: string }[];
  bills: MealBillRow[];
  settlements: SettlementRow[];
  picks: { day_entry_id: string; member_id: string }[];
  attendance: { room_id: string; entry_date: string; meal: string; member_id: string; status: string }[];
  runs: { room_id: string; day_entry_id: string; runner_id: string; status: string; created_at?: string }[];
}

/** Lunch, or dinner from 3pm in rooms that decide both (same rule as the room screen). */
function mealNow(room: RoomRow): Meal {
  return room.meals === 'both' && localHour(room.timezone) >= 15 ? 'dinner' : 'lunch';
}

/** Turns everything loaded for the rooms into one summary each. Pure, for testing. */
export function summarize(known: KnownRoom[], b: Bundle, today: (room: RoomRow) => string = (r) => todayIn(r.timezone)): RoomSummary[] {
  const foodName = new Map(b.foods.map((f) => [f.id, f.name]));
  const out: RoomSummary[] = [];
  for (const k of known) {
    const room = b.rooms.find((r) => r.id === k.roomId);
    if (!room) continue;
    const everyone = b.members.filter((m) => m.room_id === room.id);
    const members = everyone.filter((m) => !m.left_at || m.id === k.memberId).sort((x, y) => x.sort_order - y.sort_order || x.created_at.localeCompare(y.created_at));
    const meId = k.memberId;
    const name = (id: string | null) => (id && everyone.find((m) => m.id === id)?.name) || '?';
    const date = today(room);
    const meal = mealNow(room);

    const statusFor = (m: Meal): { status: MealStatus; entry: DayEntryRow | null } => {
      const away = new Set(b.attendance.filter((a) => a.room_id === room.id && a.entry_date === date && a.meal === m && a.status === 'out').map((a) => a.member_id));
      const present = members.filter((x) => !away.has(x.id));
      const entry = b.entries.find((e) => e.room_id === room.id && e.entry_date === date && (e.meal ?? 'lunch') === m) ?? null;
      const food = entry ? (entry.food_option_id && foodName.get(entry.food_option_id)) || entry.custom_food || '' : '';
      if (entry?.status === 'accepted') return { entry, status: away.has(meId) ? { kind: 'out' } : { kind: 'decided', food } };
      // A fixed day nobody has opened yet is decided all the same.
      const fixed = m === 'lunch' ? room.fixed_days?.[String(new Date(`${date}T00:00:00Z`).getUTCDay())] : undefined;
      if (fixed && !entry?.food_option_id && !entry?.custom_food) return { entry, status: away.has(meId) ? { kind: 'out' } : { kind: 'decided', food: fixed } };
      if (away.has(meId)) return { entry, status: { kind: 'out' } };
      if (room.decision_mode === 'secret') {
        const picked = new Set(b.picks.filter((p) => p.day_entry_id === entry?.id).map((p) => p.member_id));
        return { entry, status: { kind: 'secret', picked: present.filter((x) => picked.has(x.id)).length, total: present.length, mine: picked.has(meId) } };
      }
      const decider = entry?.decider_id ?? deciderFor(members, room.rotation_start, date, m, away)?.id ?? null;
      if (entry?.status === 'proposed') return { entry, status: decider === meId ? { kind: 'sent', food } : { kind: 'answer', decider: name(decider), food } };
      return { entry, status: decider === meId ? { kind: 'your-turn' } : { kind: 'choosing', decider: name(decider) } };
    };
    const meals = (room.meals === 'both' ? (['lunch', 'dinner'] as const) : (['lunch'] as const)).map((m) => ({ meal: m, ...statusFor(m) }));
    const now = meals.find((x) => x.meal === meal) ?? meals[0];
    const { status, entry } = now;

    const run = entry && b.runs.find((r) => r.day_entry_id === entry.id && r.status === 'open');
    const net = balances(
      b.bills.filter((x) => x.room_id === room.id),
      b.settlements.filter((x) => x.room_id === room.id),
    );
    const balance = net.get(meId) ?? 0;
    const debts = settleUp(net).filter((p) => p.from_member === meId || p.to_member === meId);

    const needsYou =
      status.kind === 'your-turn' || status.kind === 'answer' || (status.kind === 'secret' && !status.mine) || balance < 0 || (!!run && run.runner_id !== meId);
    const stamps = [
      ...b.entries.filter((e) => e.room_id === room.id).map((e) => e.updated_at ?? e.created_at),
      ...b.bills.filter((x) => x.room_id === room.id).map((x) => x.updated_at),
      ...b.settlements.filter((x) => x.room_id === room.id).map((x) => x.created_at),
      ...b.runs.filter((x) => x.room_id === room.id).map((x) => x.created_at ?? ''),
      ...everyone.filter((m) => m.id !== meId).map((m) => m.created_at),
    ].filter(Boolean);
    const lastActivity = stamps.length ? stamps.reduce((a, c) => (c > a ? c : a)) : null;
    out.push({ known: k, room, members, everyone, meId, lastActivity, date, meal, status, meals: meals.map((x) => ({ meal: x.meal, status: x.status })), debts, tapau: run ? { runner: name(run.runner_id), mine: run.runner_id === meId } : null, balance, needsYou });
  }
  return out;
}

async function fetchBundle(roomIds: string[]): Promise<Bundle> {
  const since = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
  const [rooms, members, entries, bills, settlements, attendance, runs] = await Promise.all([
    supabase.from('rooms').select('*').in('id', roomIds),
    supabase.from('members').select('*').in('room_id', roomIds),
    supabase.from('day_entries').select('*').in('room_id', roomIds).gte('entry_date', since),
    supabase.from('meal_bills').select('*').in('room_id', roomIds),
    supabase.from('settlements').select('*').in('room_id', roomIds),
    supabase.from('attendance').select('room_id, entry_date, meal, member_id, status').in('room_id', roomIds).gte('entry_date', since),
    supabase.from('tapau_runs').select('room_id, day_entry_id, runner_id, status, created_at').in('room_id', roomIds),
  ]);
  const failed = [rooms, members, entries, bills, settlements].find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);
  const entryRows = (entries.data ?? []) as DayEntryRow[];
  const foodIds = [...new Set(entryRows.map((e) => e.food_option_id).filter((x): x is string => !!x))];
  const entryIds = entryRows.map((e) => e.id);
  const [foods, picks] = await Promise.all([
    foodIds.length ? supabase.from('food_options').select('id, name').in('id', foodIds) : Promise.resolve({ data: [] }),
    entryIds.length ? supabase.from('secret_picks').select('day_entry_id, member_id').in('day_entry_id', entryIds) : Promise.resolve({ data: [] }),
  ]);
  return {
    rooms: (rooms.data ?? []) as RoomRow[],
    members: (members.data ?? []) as MemberRow[],
    entries: entryRows,
    foods: (foods.data ?? []) as { id: string; name: string }[],
    bills: (bills.data ?? []) as MealBillRow[],
    settlements: (settlements.data ?? []) as SettlementRow[],
    picks: (picks.data ?? []) as { day_entry_id: string; member_id: string }[],
    attendance: (attendance.data ?? []) as Bundle['attendance'],
    runs: (runs.data ?? []) as Bundle['runs'],
  };
}

/**
 * Every room on this phone, summarised. A room that doesn't come back (deleted, or this phone
 * was removed) gets one chance to reclaim its member before it's forgotten.
 */
export async function loadRoomSummaries(): Promise<RoomSummary[]> {
  await ensureSignedIn();
  let known = knownRooms();
  if (!known.length) return [];
  let bundle = await fetchBundle(known.map((k) => k.roomId));
  const missing = known.filter((k) => !bundle.rooms.some((r) => r.id === k.roomId) || !bundle.members.some((m) => m.id === k.memberId));
  if (missing.length) {
    const back = await Promise.all(missing.map((k) => openRoom(k.roomId, k.memberId).catch(() => null)));
    missing.forEach((k, i) => !back[i] && forgetSession(k.roomId));
    known = knownRooms();
    if (back.some(Boolean)) bundle = await fetchBundle(known.map((k) => k.roomId));
  }
  return summarize(known, bundle);
}
