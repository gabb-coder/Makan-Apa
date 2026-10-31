import { customFood, entryFood, formatTag, type Food } from './foods';
import { SUNWAY_SPOTS } from './nearby';
import { dayLabel } from './rotation';
import { supabase } from './supabase';
import type { DayEntryRow, MealBillRow, MealRatingRow, MemberRow, RoomRow, SecretPickRow, VetoRow } from './supabase';
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
      const food = entryFood(e, foodsById) ?? customFood('Unknown');
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
        dayLabel(e.entry_date).split(' ')[0],
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
          return bill ? [who(bill.paid_by), bill.amount_cents / 100, bill.split_between.map(who).join(', ')] : [null, null, null];
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

export function exportFileName(room: Pick<RoomRow, 'name' | 'code'>, today: string, ext: 'xlsx' | 'csv'): string {
  const slug =
    (room.name ?? '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || room.code.toLowerCase();
  return `makan-apa-${slug}-history-${today}.${ext}`;
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
