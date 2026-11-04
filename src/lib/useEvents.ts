import { useCallback, useEffect, useState } from 'react';
import { supabase, type EventRow, type EventRsvpRow, type Rsvp } from './supabase';

/** The room's events (from two weeks ago on) and everyone's RSVPs, kept live. */
export function useEvents(roomId: string, meId: string) {
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [rsvps, setRsvps] = useState<EventRsvpRow[]>([]);

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
    const { data } = await supabase.from('events').select('*').eq('room_id', roomId).gte('starts_at', since).order('starts_at');
    const list = (data ?? []) as EventRow[];
    setEvents(list);
    if (!list.length) return setRsvps([]);
    const r = await supabase.from('event_rsvps').select('*').in('event_id', list.map((e) => e.id));
    setRsvps((r.data ?? []) as EventRsvpRow[]);
  }, [roomId]);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel(`events:${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events', filter: `room_id=eq.${roomId}` }, () => void load())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'events' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_rsvps' }, () => void load())
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void load();
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [roomId, load]);

  const create = async (e: Pick<EventRow, 'title' | 'starts_at' | 'place' | 'note'>) => {
    const { data, error } = await supabase
      .from('events')
      .insert({ ...e, title: e.title.trim().slice(0, 60), room_id: roomId, created_by: meId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    // The planner's going, of course.
    await supabase.from('event_rsvps').upsert({ event_id: (data as EventRow).id, member_id: meId, status: 'yes' });
    await load();
    return data as EventRow;
  };

  const update = async (id: string, patch: Partial<Pick<EventRow, 'title' | 'starts_at' | 'place' | 'note'>>) => {
    const { error } = await supabase.from('events').update(patch).eq('id', id);
    if (error) throw new Error(error.message);
    await load();
  };

  const remove = async (id: string) => {
    const { data, error } = await supabase.from('events').delete().eq('id', id).select('id');
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error('Only whoever planned it, or the host, can cancel an event.');
    await load();
  };

  const rsvp = async (eventId: string, status: Rsvp) => {
    setRsvps((cur) => [...cur.filter((r) => !(r.event_id === eventId && r.member_id === meId)), { event_id: eventId, member_id: meId, status, updated_at: new Date().toISOString() }]);
    const { error } = await supabase.from('event_rsvps').upsert({ event_id: eventId, member_id: meId, status, updated_at: new Date().toISOString() });
    if (error) {
      void load();
      throw new Error(error.message);
    }
  };

  return { events, rsvps, create, update, remove, rsvp };
}

export type EventsApi = ReturnType<typeof useEvents>;
