import { useEffect, useState } from 'react';
import { supabase } from './supabase';

/** Member ids with the app open right now in this room (Supabase Realtime Presence). */
export function usePresence(roomId: string, meId: string): Set<string> {
  const [online, setOnline] = useState<Set<string>>(() => new Set([meId]));

  useEffect(() => {
    const channel = supabase.channel(`presence:${roomId}`, { config: { presence: { key: meId } } });
    channel
      .on('presence', { event: 'sync' }, () => {
        setOnline(new Set([meId, ...Object.keys(channel.presenceState())]));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void channel.track({ at: new Date().toISOString() });
      });

    // A phone in someone's pocket isn't "here": drop out while the app is hidden.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void channel.track({ at: new Date().toISOString() });
      else void channel.untrack();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      supabase.removeChannel(channel);
    };
  }, [roomId, meId]);

  return online;
}
