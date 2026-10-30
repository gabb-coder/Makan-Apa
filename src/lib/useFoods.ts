import { useCallback, useEffect, useMemo, useState } from 'react';
import { daysBetween } from './dates';
import { rowToFood, STARTER_PACK, type Food, type FoodDraft } from './foods';
import { supabase, type DayEntryRow, type FoodOptionRow, type RoomRow } from './supabase';

function upsert(rows: FoodOptionRow[], row: FoodOptionRow): FoodOptionRow[] {
  const i = rows.findIndex((r) => r.id === row.id);
  if (i === -1) return [...rows, row];
  const next = rows.slice();
  next[i] = row;
  return next;
}

/** The room's food list, kept live with Supabase Realtime. */
export function useFoods(room: RoomRow, memberId: string, entries: DayEntryRow[] | null, today: string) {
  const [rows, setRows] = useState<FoodOptionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('food_options')
      .select('*')
      .eq('room_id', room.id)
      .order('created_at')
      .order('name');
    if (err) {
      setError(err.message);
      return;
    }
    setError(null);
    setRows(data as FoodOptionRow[]);
  }, [room.id]);

  // Most recent accepted date per food, from the day entries.
  const lastEaten = useMemo(() => {
    const latest = new Map<string, string>();
    for (const e of entries ?? []) {
      if (e.status !== 'accepted' || !e.food_option_id) continue;
      const prev = latest.get(e.food_option_id);
      if (!prev || e.entry_date > prev) latest.set(e.food_option_id, e.entry_date);
    }
    return latest;
  }, [entries]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`foods:${room.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'food_options', filter: `room_id=eq.${room.id}` },
        (p) => setRows((cur) => (cur ? upsert(cur, p.new as FoodOptionRow) : cur)),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'food_options', filter: `room_id=eq.${room.id}` },
        (p) => setRows((cur) => (cur ? upsert(cur, p.new as FoodOptionRow) : cur)),
      )
      // Realtime can't filter deletes, so drop whichever id went away.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'food_options' }, (p) => {
        const id = (p.old as { id?: string }).id;
        setRows((cur) => (cur ? cur.filter((r) => r.id !== id) : cur));
      })
      .subscribe((status) => {
        // Catch up on anything missed while the socket was down.
        if (status === 'SUBSCRIBED') load();
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [room.id, load]);

  const all = useMemo<Food[] | null>(() => {
    if (!rows) return null;
    return rows.map((r) => {
      const d = lastEaten.get(r.id);
      return rowToFood(r, d ? daysBetween(d, today) : null);
    });
  }, [rows, lastEaten, today]);

  const run = async <T,>(q: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> => {
    const { data, error: err } = await q;
    if (err) throw new Error(err.message);
    return data;
  };

  const addFood = async (draft: FoodDraft) => {
    const row = await run(supabase.from('food_options').insert({ ...draft, room_id: room.id, added_by: memberId }).select().single());
    setRows((cur) => upsert(cur ?? [], row as FoodOptionRow));
  };

  const updateFood = async (id: string, patch: Partial<FoodDraft> & { is_active?: boolean }) => {
    const row = await run(supabase.from('food_options').update(patch).eq('id', id).select().single());
    setRows((cur) => upsert(cur ?? [], row as FoodOptionRow));
  };

  const deleteFood = async (id: string) => {
    await run(supabase.from('food_options').delete().eq('id', id));
    setRows((cur) => (cur ? cur.filter((r) => r.id !== id) : cur));
  };

  const loadStarterPack = async () => {
    const have = new Set((rows ?? []).map((r) => r.name.toLowerCase()));
    const missing = STARTER_PACK.filter((f) => !have.has(f.name.toLowerCase()));
    if (missing.length === 0) return;
    const inserted = await run(
      supabase.from('food_options').insert(missing.map((f) => ({ ...f, room_id: room.id, added_by: memberId }))).select(),
    );
    setRows((cur) => (inserted as FoodOptionRow[]).reduce(upsert, cur ?? []));
  };

  return {
    foods: all,
    active: all?.filter((f) => f.isActive) ?? null,
    error,
    reload: load,
    addFood,
    updateFood,
    deleteFood,
    loadStarterPack,
  };
}
