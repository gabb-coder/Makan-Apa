import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

/** A promo someone in the room spotted, optionally at one of the app's places. */
export interface DealRow {
  id: string;
  room_id: string;
  member_id: string;
  spot_id: string | null;
  title: string;
  /** The last day it's on (YYYY-MM-DD). */
  ends_on: string;
  created_at: string;
}

/** The room's deals that are still on (ending today or later), kept live. */
export function useDeals(roomId: string, meId: string, today: string) {
  const [deals, setDeals] = useState<DealRow[]>([]);
  const load = useCallback(async () => {
    const { data } = await supabase.from('deals').select('*').eq('room_id', roomId).gte('ends_on', today).order('ends_on');
    if (data) setDeals(data as DealRow[]);
  }, [roomId, today]);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel(`deals:${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deals', filter: `room_id=eq.${roomId}` }, () => void load())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'deals' }, () => void load())
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void load();
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [roomId, load]);

  const post = async (d: { title: string; spot_id: string | null; ends_on: string }) => {
    const { error } = await supabase.from('deals').insert({ ...d, title: d.title.trim().slice(0, 80), room_id: roomId, member_id: meId });
    if (error) throw new Error(error.message);
    await load();
  };
  const remove = async (id: string) => {
    const { error } = await supabase.from('deals').delete().eq('id', id);
    if (error) throw new Error(error.message);
    await load();
  };

  return { deals, post, remove, atSpot: (spotId: string) => deals.filter((d) => d.spot_id === spotId) };
}
export type DealsApi = ReturnType<typeof useDeals>;
