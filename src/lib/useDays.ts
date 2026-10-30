import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { deciderFor } from './rotation';
import { supabase, type DayEntryRow, type MemberRow, type RoomRow, type VetoRow } from './supabase';

/** What the decider is proposing: a pool food, or a name typed in. */
export type Pick = { foodId: string; name: string } | { foodId: null; name: string };

interface VetoWithEntry extends VetoRow {
  day_entries?: unknown;
}

function upsertEntry(rows: DayEntryRow[], row: DayEntryRow): DayEntryRow[] {
  const next = rows.some((r) => r.id === row.id) ? rows.map((r) => (r.id === row.id ? row : r)) : [...rows, row];
  return next.sort((a, b) => b.entry_date.localeCompare(a.entry_date));
}

function stripJoin({ day_entries: _, ...veto }: VetoWithEntry): VetoRow {
  return veto;
}

/**
 * The room's day entries and vetoes, kept live, plus the propose / accept / veto actions
 * for today (SPEC.md section 6, day entry lifecycle).
 */
export function useDays(room: RoomRow, members: MemberRow[], meId: string, today: string) {
  const [entries, setEntries] = useState<DayEntryRow[] | null>(null);
  const [vetoes, setVetoes] = useState<VetoRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const entryIds = useRef(new Set<string>());

  const load = useCallback(async () => {
    const [e, v] = await Promise.all([
      supabase.from('day_entries').select('*').eq('room_id', room.id).order('entry_date', { ascending: false }).limit(500),
      supabase.from('vetoes').select('*, day_entries!inner(room_id)').eq('day_entries.room_id', room.id).order('created_at'),
    ]);
    if (e.error || v.error) {
      setError((e.error ?? v.error)!.message);
      return;
    }
    setError(null);
    setEntries(e.data as DayEntryRow[]);
    setVetoes((v.data as VetoWithEntry[]).map(stripJoin));
  }, [room.id]);

  useEffect(() => {
    entryIds.current = new Set((entries ?? []).map((e) => e.id));
  }, [entries]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`days:${room.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'day_entries', filter: `room_id=eq.${room.id}` }, (p) =>
        setEntries((cur) => (cur ? upsertEntry(cur, p.new as DayEntryRow) : cur)),
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'day_entries', filter: `room_id=eq.${room.id}` }, (p) =>
        setEntries((cur) => (cur ? upsertEntry(cur, p.new as DayEntryRow) : cur)),
      )
      // vetoes has no room_id, so keep only those for this room's entries.
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'vetoes' }, (p) => {
        const veto = p.new as VetoRow;
        if (entryIds.current.has(veto.day_entry_id)) {
          setVetoes((cur) => (cur.some((x) => x.id === veto.id) ? cur : [...cur, veto]));
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'vetoes' }, (p) => {
        const id = (p.old as { id?: string }).id;
        setVetoes((cur) => cur.filter((x) => x.id !== id));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') load();
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [room.id, load]);

  const todayEntry = entries?.find((e) => e.entry_date === today) ?? null;
  const todayVetoes = useMemo(
    () => (todayEntry ? vetoes.filter((v) => v.day_entry_id === todayEntry.id) : []),
    [vetoes, todayEntry],
  );
  const computedDecider = deciderFor(members, room.rotation_start, today);

  // Step 1: the first visit of the day creates the entry. Both phones may race; the unique
  // (room_id, entry_date) constraint keeps one row.
  useEffect(() => {
    if (!entries || todayEntry || !computedDecider) return;
    supabase
      .from('day_entries')
      .upsert(
        { room_id: room.id, entry_date: today, decider_id: computedDecider.id, status: 'pending' },
        { onConflict: 'room_id,entry_date', ignoreDuplicates: true },
      )
      .then(({ error: err }) => (err ? setError(err.message) : load()));
  }, [entries, todayEntry, computedDecider, room.id, today, load]);

  // Until the day has a pick or a veto, follow changes to the member order or rotation start.
  useEffect(() => {
    if (!todayEntry || !computedDecider) return;
    const untouched = todayEntry.status === 'pending' && !todayEntry.food_option_id && !todayEntry.custom_food && todayVetoes.length === 0;
    if (untouched && todayEntry.decider_id !== computedDecider.id) {
      supabase
        .from('day_entries')
        .update({ decider_id: computedDecider.id })
        .eq('id', todayEntry.id)
        .eq('status', 'pending')
        .is('food_option_id', null)
        .is('custom_food', null)
        .then(({ error: err }) => err && setError(err.message));
    }
  }, [todayEntry, computedDecider, todayVetoes.length]);

  /** Run an update on today's entry; returns false if `guard` no longer matched (someone got there first). */
  const updateToday = async (patch: Partial<DayEntryRow>, guard: (q: any) => any = (q) => q): Promise<boolean> => {
    if (!todayEntry) throw new Error('Today isn’t ready yet. Try again in a moment.');
    const { data, error: err } = await guard(supabase.from('day_entries').update(patch).eq('id', todayEntry.id)).select();
    if (err) throw new Error(err.message);
    const rows = data as DayEntryRow[];
    if (rows.length) setEntries((cur) => (cur ? upsertEntry(cur, rows[0]) : cur));
    return rows.length > 0;
  };

  const soloRoom = members.length < 2;
  const myVetoesToday = todayVetoes.filter((v) => v.member_id === meId).length;

  /** Step 2: the decider picks or spins. In a room of one there's nobody to ask, so it's final. */
  const propose = async (pick: Pick, method: 'direct' | 'wheel') => {
    const ok = await updateToday(
      {
        food_option_id: pick.foodId,
        custom_food: pick.foodId ? null : pick.name,
        method,
        status: soloRoom ? 'accepted' : 'proposed',
      },
      // Only today's decider may pick, even if this phone's view of the rotation is a moment stale.
      (q) => q.neq('status', 'accepted').eq('decider_id', meId),
    );
    if (!ok) throw new Error('It’s not your turn right now, or today’s already decided.');
  };

  /** Decider takes back a proposal nobody has answered yet. */
  const retract = async () => {
    await updateToday(
      { food_option_id: null, custom_food: null, method: null, status: 'pending' },
      (q) => q.eq('status', 'proposed').eq('decider_id', meId),
    );
  };

  /** Step 3: a non-decider accepts. */
  const accept = async () => {
    const ok = await updateToday({ status: 'accepted' }, (q) => q.eq('status', 'proposed'));
    if (!ok) throw new Error('That pick changed. Have another look.');
  };

  const undoAccept = async () => {
    await updateToday({ status: 'proposed' }, (q) => q.eq('status', 'accepted'));
  };

  /** Step 4: a non-decider vetoes, if they have vetoes left. Returns the veto so it can be undone. */
  const veto = async (foodName: string): Promise<{ veto: VetoRow; previous: DayEntryRow }> => {
    if (!todayEntry) throw new Error('Today isn’t ready yet.');
    if (myVetoesToday >= room.veto_limit) throw new Error('No vetoes left today, so this pick stands.');
    const previous = todayEntry;
    const ok = await updateToday(
      { food_option_id: null, custom_food: null, method: null, status: 'pending' },
      (q) => q.eq('status', 'proposed'),
    );
    if (!ok) throw new Error('That pick changed. Have another look.');
    const { data, error: err } = await supabase
      .from('vetoes')
      .insert({ day_entry_id: todayEntry.id, member_id: meId, rejected_food: foodName })
      .select()
      .single();
    if (err) throw new Error(err.message);
    const row = data as VetoRow;
    setVetoes((cur) => (cur.some((x) => x.id === row.id) ? cur : [...cur, row]));
    return { veto: row, previous };
  };

  /** Put a vetoed pick back, as long as the decider hasn't moved on. */
  const undoVeto = async (vetoRow: VetoRow, previous: DayEntryRow) => {
    const ok = await updateToday(
      {
        food_option_id: previous.food_option_id,
        custom_food: previous.custom_food,
        method: previous.method,
        status: 'proposed',
      },
      (q) => q.eq('status', 'pending').is('food_option_id', null).is('custom_food', null),
    );
    if (!ok) throw new Error(`Too late, there's a new pick.`);
    const { error: err } = await supabase.from('vetoes').delete().eq('id', vetoRow.id);
    if (err) throw new Error(err.message);
    setVetoes((cur) => cur.filter((x) => x.id !== vetoRow.id));
  };

  return {
    entries,
    vetoes,
    error,
    todayEntry,
    todayVetoes,
    myVetoesToday,
    propose,
    retract,
    accept,
    undoAccept,
    veto,
    undoVeto,
  };
}
