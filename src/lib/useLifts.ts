import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

export interface LiftRow {
  id: string;
  room_id: string;
  day_entry_id: string | null;
  event_id: string | null;
  driver_id: string;
  seats: number;
  created_at: string;
}
export interface LiftRiderRow {
  lift_id: string;
  member_id: string;
  created_at: string;
}

/** A meal's or an event's meet-up. */
export type Trip = { dayEntryId: string } | { eventId: string };

/** Who's driving to a meet-up, their seats and who's riding with them, kept live. */
export function useLifts(roomId: string, meId: string, trip: Trip) {
  const key = 'dayEntryId' in trip ? `d:${trip.dayEntryId}` : `e:${trip.eventId}`;
  const [lifts, setLifts] = useState<LiftRow[]>([]);
  const [riders, setRiders] = useState<LiftRiderRow[]>([]);

  const load = useCallback(async () => {
    const q = supabase.from('lifts').select('*').eq('room_id', roomId).order('created_at');
    const { data } = await ('dayEntryId' in trip ? q.eq('day_entry_id', trip.dayEntryId) : q.eq('event_id', trip.eventId));
    const list = (data ?? []) as LiftRow[];
    setLifts(list);
    if (!list.length) return setRiders([]);
    const r = await supabase.from('lift_riders').select('*').in('lift_id', list.map((l) => l.id)).order('created_at');
    setRiders((r.data ?? []) as LiftRiderRow[]);
  }, [roomId, key]);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel(`lifts:${key}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lifts', filter: `room_id=eq.${roomId}` }, () => void load())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'lifts' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lift_riders' }, () => void load())
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void load();
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [roomId, key, load]);

  const act = async (p: PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await p;
    if (error) throw new Error(error.message);
    await load();
  };

  return {
    lifts,
    ridersOf: (liftId: string) => riders.filter((r) => r.lift_id === liftId),
    /** The car I'm in, driving or riding. */
    mine: lifts.find((l) => l.driver_id === meId || riders.some((r) => r.lift_id === l.id && r.member_id === meId)) ?? null,
    offer: (seats: number) =>
      act(supabase.from('lifts').insert({ room_id: roomId, driver_id: meId, seats, ...('dayEntryId' in trip ? { day_entry_id: trip.dayEntryId } : { event_id: trip.eventId }) })),
    setSeats: (liftId: string, seats: number) => act(supabase.from('lifts').update({ seats }).eq('id', liftId)),
    callOff: (liftId: string) => act(supabase.from('lifts').delete().eq('id', liftId)),
    join: (liftId: string) => act(supabase.from('lift_riders').insert({ lift_id: liftId, member_id: meId })),
    leave: (liftId: string) => act(supabase.from('lift_riders').delete().eq('lift_id', liftId).eq('member_id', meId)),
  };
}
