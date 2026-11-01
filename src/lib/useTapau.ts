import { useCallback, useEffect, useState } from 'react';
import { supabase, type TapauOrderRow, type TapauRunRow } from './supabase';

async function must<T>(q: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data;
}

export type OrderDraft = Pick<TapauOrderRow, 'member_id' | 'item' | 'qty' | 'price_cents' | 'note'>;

/** The tapau run for one meal (if someone started one) and its orders, kept live. */
export function useTapau(roomId: string, dayEntryId: string | null) {
  const [run, setRun] = useState<TapauRunRow | null>(null);
  const [orders, setOrders] = useState<TapauOrderRow[]>([]);

  const load = useCallback(async () => {
    if (!dayEntryId) {
      setRun(null);
      setOrders([]);
      return;
    }
    const { data } = await supabase.from('tapau_runs').select('*').eq('day_entry_id', dayEntryId).maybeSingle();
    const r = (data as TapauRunRow | null) ?? null;
    setRun(r);
    if (!r) {
      setOrders([]);
      return;
    }
    const o = await supabase.from('tapau_orders').select('*').eq('run_id', r.id).order('created_at');
    if (o.data) setOrders(o.data as TapauOrderRow[]);
  }, [dayEntryId]);

  useEffect(() => {
    void load();
    if (!dayEntryId) return;
    const channel = supabase
      .channel(`tapau:${dayEntryId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tapau_runs', filter: `room_id=eq.${roomId}` }, () => void load())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'tapau_runs' }, () => void load())
      // Orders have no room to filter on; reloading one run's orders is cheap.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tapau_orders' }, () => void load())
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void load();
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, dayEntryId, load]);

  const start = async (runnerId: string, place: string) => {
    if (!dayEntryId) return;
    await must(supabase.from('tapau_runs').insert({ room_id: roomId, day_entry_id: dayEntryId, runner_id: runnerId, place: place.trim().slice(0, 60) }));
    await load();
  };
  const setOpen = async (open: boolean) => {
    if (!run) return;
    await must(supabase.from('tapau_runs').update({ status: open ? 'open' : 'closed' }).eq('id', run.id));
    await load();
  };
  const cancel = async () => {
    if (!run) return;
    await must(supabase.from('tapau_runs').delete().eq('id', run.id));
    await load();
  };
  const addOrder = async (order: OrderDraft) => {
    if (!run) return;
    await must(supabase.from('tapau_orders').insert({ ...order, run_id: run.id }));
    await load();
  };
  const updateOrder = async (id: string, patch: Partial<OrderDraft>) => {
    await must(supabase.from('tapau_orders').update(patch).eq('id', id));
    await load();
  };
  const removeOrder = async (id: string) => {
    await must(supabase.from('tapau_orders').delete().eq('id', id));
    await load();
  };

  return { run, orders, start, setOpen, cancel, addOrder, updateOrder, removeOrder };
}

export type TapauApi = ReturnType<typeof useTapau>;
