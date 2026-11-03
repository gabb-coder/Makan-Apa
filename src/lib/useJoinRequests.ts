import { useCallback, useEffect, useState } from 'react';
import { answerJoinRequest } from './session';
import { supabase, type JoinRequestRow } from './supabase';

let channels = 0;

/** For the host: people waiting to be let into the room, kept live. */
export function useJoinRequests(roomId: string, isHost: boolean) {
  const [requests, setRequests] = useState<JoinRequestRow[]>([]);
  const load = useCallback(async () => {
    if (!isHost) return setRequests([]);
    const { data } = await supabase.from('join_requests').select('*').eq('room_id', roomId).eq('status', 'pending').order('created_at');
    if (data) setRequests(data as JoinRequestRow[]);
  }, [roomId, isHost]);

  useEffect(() => {
    void load();
    if (!isHost) return;
    const channel = supabase
      .channel(`join-requests:${roomId}:${++channels}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'join_requests', filter: `room_id=eq.${roomId}` }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [roomId, isHost, load]);

  const answer = async (id: string, letIn: boolean) => {
    setRequests((cur) => cur.filter((r) => r.id !== id));
    try {
      await answerJoinRequest(id, letIn);
    } finally {
      void load();
    }
  };

  return { requests, answer };
}
