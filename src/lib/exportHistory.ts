import { formatRM, shares } from './money';
import { customFood, entryFood, formatTag, type Food } from './foods';
import { SUNWAY_SPOTS } from './nearby';
import { dayLabel } from './rotation';
import { supabase } from './supabase';
import type { DayEntryRow, KittyTopUpRow, MealBillRow, MealRatingRow, MemberRow, RoomRow, SecretPickRow, SettlementRow, VetoRow } from './supabase';
import { csv, xlsx, type Sheet } from './xlsx';

const AREA_BY_NAME = new Map(SUNWAY_SPOTS.map((s) => [s.name.toLowerCase(), s.area]));

interface HistoryData {
  room: RoomRow;
  entries: DayEntryRow[];
  vetoes: VetoRow[];
  picks: SecretPickRow[];
  ratings?: MealRatingRow[];
  bills?: MealBillRow[];
  members: MemberRow[];
  foodsById: Map<string, Food>;
}

/** One row per agreed meal, oldest first: when, what, who chose it, how, and what got vetoed. */
export function historySheet({ room, entries, vetoes, picks, ratings = [], bills = [], members, foodsById }: HistoryData): Sheet {
  const nameOf = new Map(members.map((m) => [m.id, m.name]));
  const who = (id: string | null) => (id && nameOf.get(id)) || 'Removed member';
  const byEntry = <T extends { day_entry_id: string }>(rows: T[]) => {
    const map = new Map<string, T[]>();
    for (const r of rows) map.set(r.day_entry_id, [...(map.get(r.day_entry_id) ?? []), r]);
    return map;
  };
  const vetoesFor = byEntry(vetoes);
  const picksFor = byEntry(picks);

  const rows = entries
    .filter((e) => e.status === 'accepted')
    .sort((a, b) => a.entry_date.localeCompare(b.entry_date) || (a.meal ?? 'lunch').localeCompare(b.meal ?? 'lunch'))
    .map((e) => {
      // The export stays in English whatever the app's language.
      const food =
        e.food_option_id && !foodsById.has(e.food_option_id) ? customFood('A deleted food') : (entryFood(e, foodsById) ?? customFood('Unknown'));
      const dayPicks = picksFor.get(e.id) ?? [];
      const secret = dayPicks.length > 0;
      const suggestedBy = dayPicks.filter((p) => p.food_text.trim().toLowerCase() === food.name.trim().toLowerCase()).map((p) => who(p.member_id));
      const how = secret ? 'Secret picks, then the wheel' : e.method === 'wheel' ? 'Spun the wheel' : e.food_option_id ? 'Picked from the list' : 'Typed in';
      const vetoed = (vetoesFor.get(e.id) ?? [])
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((v) => `${v.rejected_food} (${who(v.member_id)})`)
        .join('; ');
      return [
        { date: e.entry_date },
        dayLabel(e.entry_date, 'en-GB').split(' ')[0],
        e.meal === 'dinner' ? 'Dinner' : 'Lunch',
        food.name,
        AREA_BY_NAME.get(food.name.toLowerCase()) ?? '',
        secret ? 'Everyone' : who(e.decider_id),
        how,
        suggestedBy.join(', '),
        vetoed,
        food.tags.map(formatTag).join(', '),
        ...(() => {
          const r = ratings.filter((x) => x.day_entry_id === e.id);
          const up = r.filter((x) => x.rating === 1).length;
          return [up || null, r.length - up || null];
        })(),
        ...(() => {
          const bill = bills.find((b) => b.day_entry_id === e.id);
          return bill ? [who(bill.paid_by), bill.amount_cents / 100, bill.items?.length ? [...shares(bill)].map(([id, c]) => `${who(id)} ${formatRM(c)}`).join(', ') : bill.split_between.map(who).join(', ')] : [null, null, null];
        })(),
      ];
    });

  return {
    name: room.name?.trim() || `Room ${room.code}`,
    columns: [
      { header: 'Date', width: 12 },
      { header: 'Day', width: 6 },
      { header: 'Meal', width: 8 },
      { header: 'Food / place', width: 28 },
      { header: 'Area', width: 22 },
      { header: 'Chosen by', width: 16 },
      { header: 'How', width: 26 },
      { header: 'Suggested by', width: 16 },
      { header: 'Vetoed (by)', width: 36 },
      { header: 'Tags', width: 24 },
      { header: 'Liked', width: 7 },
      { header: 'Disliked', width: 9 },
      { header: 'Paid by', width: 14 },
      { header: 'Bill (RM)', width: 10 },
      { header: 'Split between', width: 28 },
    ],
    rows,
  };
}

interface MoneyData {
  room: RoomRow;
  members: MemberRow[];
  entries: DayEntryRow[];
  bills: MealBillRow[];
  settlements: SettlementRow[];
  topUps: KittyTopUpRow[];
  foodsById: Map<string, Food>;
}

/**
 * Every bill, payment and kitty top-up, oldest first, with a column per person for their share
 * of each bill. In English, like the meals export.
 */
export function moneySheet({ room, members, entries, bills, settlements, topUps, foodsById }: MoneyData): Sheet {
  const nameOf = new Map(members.map((m) => [m.id, m.name]));
  const who = (id: string | null) => (id && nameOf.get(id)) || 'Removed member';
  const entryById = new Map(entries.map((e) => [e.id, e]));
  // Everyone who ever had a share, in the room's order.
  const people = members.filter((m) => bills.some((b) => shares(b).has(m.id)));
  const day = (iso: string) => iso.slice(0, 10);
  type Row = { sort: string; cells: (string | number | { date: string } | null)[] };
  const rows: Row[] = [];
  for (const b of bills) {
    const e = entryById.get(b.day_entry_id);
    const date = e?.entry_date ?? day(b.updated_at);
    const food = e ? (e.food_option_id && !foodsById.has(e.food_option_id) ? 'A deleted food' : (entryFood(e, foodsById)?.name ?? 'Unknown')) : 'Unknown';
    const each = shares(b);
    rows.push({
      sort: `${date}0`,
      cells: [{ date }, b.from_kitty ? 'Bill (from the kitty)' : 'Bill', `${food}${e?.meal === 'dinner' ? ' (dinner)' : ''}`, b.from_kitty ? 'Kitty' : who(b.paid_by), '', b.amount_cents / 100, ...people.map((m) => (each.has(m.id) ? each.get(m.id)! / 100 : null))],
    });
  }
  for (const p of settlements) {
    rows.push({ sort: `${day(p.created_at)}1${p.created_at}`, cells: [{ date: day(p.created_at) }, 'Payment', '', who(p.from_member), who(p.to_member), p.amount_cents / 100, ...people.map(() => null)] });
  }
  for (const k of topUps) {
    rows.push({ sort: `${day(k.created_at)}2${k.created_at}`, cells: [{ date: day(k.created_at) }, 'Kitty top-up', '', who(k.member_id), 'Kitty', k.amount_cents / 100, ...people.map(() => null)] });
  }
  rows.sort((a, b) => a.sort.localeCompare(b.sort));
  return {
    name: `${(room.name?.trim() || `Room ${room.code}`).slice(0, 24)} money`,
    columns: [
      { header: 'Date', width: 12 },
      { header: 'Type', width: 20 },
      { header: 'Meal', width: 26 },
      { header: 'Paid by / from', width: 16 },
      { header: 'To', width: 14 },
      { header: 'Amount (RM)', width: 12 },
      ...people.map((m) => ({ header: `${m.name}'s share (RM)`, width: Math.max(12, m.name.length + 14) })),
    ],
    rows: rows.map((r) => r.cells),
  };
}

/** Bills, payments and kitty top-ups, straight from the database. */
export async function loadMoney(roomId: string): Promise<Pick<MoneyData, 'entries' | 'bills' | 'settlements' | 'topUps'>> {
  const [e, b, s, k] = await Promise.all([
    supabase.from('day_entries').select('*').eq('room_id', roomId).eq('status', 'accepted').limit(10_000),
    supabase.from('meal_bills').select('*').eq('room_id', roomId).limit(50_000),
    supabase.from('settlements').select('*').eq('room_id', roomId).limit(50_000),
    supabase.from('kitty_topups').select('*').eq('room_id', roomId).limit(50_000),
  ]);
  const error = e.error ?? b.error ?? s.error ?? k.error;
  if (error) throw new Error(error.message);
  return { entries: e.data as DayEntryRow[], bills: b.data as MealBillRow[], settlements: s.data as SettlementRow[], topUps: k.data as KittyTopUpRow[] };
}

/** Every agreed day in the room, straight from the database (the app only keeps recent ones). */
export async function loadHistory(roomId: string): Promise<Pick<HistoryData, 'entries' | 'vetoes' | 'picks' | 'ratings' | 'bills'>> {
  const [e, v, p, r, b] = await Promise.all([
    supabase.from('day_entries').select('*').eq('room_id', roomId).eq('status', 'accepted').order('entry_date').limit(10_000),
    supabase.from('vetoes').select('*, day_entries!inner(room_id)').eq('day_entries.room_id', roomId).limit(50_000),
    supabase.from('secret_picks').select('*, day_entries!inner(room_id)').eq('day_entries.room_id', roomId).limit(50_000),
    supabase.from('meal_ratings').select('*, day_entries!inner(room_id)').eq('day_entries.room_id', roomId).limit(50_000),
    supabase.from('meal_bills').select('*').eq('room_id', roomId).limit(50_000),
  ]);
  const error = e.error ?? v.error ?? p.error ?? r.error ?? b.error;
  if (error) throw new Error(error.message);
  return {
    entries: e.data as DayEntryRow[],
    vetoes: v.data as VetoRow[],
    picks: p.data as SecretPickRow[],
    ratings: r.data as MealRatingRow[],
    bills: b.data as MealBillRow[],
  };
}

export function exportFileName(room: Pick<RoomRow, 'name' | 'code'>, today: string, ext: 'xlsx' | 'csv', what: 'history' | 'money' = 'history'): string {
  const slug =
    (room.name ?? '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || room.code.toLowerCase();
  return `makan-apa-${slug}-${what}-${today}.${ext}`;
}

export function historyFile(sheet: Sheet, fileName: string, format: 'xlsx' | 'csv'): File {
  return format === 'xlsx'
    ? new File([xlsx(sheet) as BlobPart], fileName, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    : new File([csv(sheet)], fileName, { type: 'text/csv;charset=utf-8' });
}

/**
 * Hand the file over: the share sheet on phones (save to Files or Drive, send it on), a normal
 * download elsewhere. Returns false if the person closed the share sheet.
 */
export async function saveFile(file: File): Promise<boolean> {
  const touch = window.matchMedia('(pointer: coarse)').matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return true;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return false;
      // Some browsers refuse file sharing at the last moment; fall back to a download.
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}
