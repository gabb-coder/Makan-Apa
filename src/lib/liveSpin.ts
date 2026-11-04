import { useCallback, useEffect, useRef, useState } from 'react';
import { customFood, type Food } from './foods';
import { supabase } from './supabase';

/** A spin someone else started, so everyone in the room watches the same wheel land. */
export interface LiveSpin {
  by: string;
  foods: Food[];
  k: number;
  at: number;
}

type Wire = { by: string; k: number; foods: { id: string; name: string; icon: Food['icon']; color: Food['color'] }[] };

/**
 * Spins go out over a Realtime broadcast channel (nothing is stored): the spinner sends the
 * foods on the wheel and where it lands, and every other phone in the room plays the same spin.
 */
export function useLiveSpin(roomId: string, meId: string) {
  const [incoming, setIncoming] = useState<LiveSpin | null>(null);
  const channel = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    const ch = supabase
      .channel(`spin:${roomId}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'spin' }, ({ payload }) => {
        const p = payload as Wire;
        if (!p || p.by === meId || !Array.isArray(p.foods) || p.foods.length < 2 || p.k < 0 || p.k >= p.foods.length) return;
        const foods = p.foods.slice(0, 40).map((f) => ({ ...customFood(String(f.name).slice(0, 40)), id: String(f.id), icon: f.icon, color: f.color }));
        setIncoming({ by: p.by, foods, k: p.k, at: Date.now() });
      })
      .subscribe();
    channel.current = ch;
    return () => {
      channel.current = null;
      void supabase.removeChannel(ch);
    };
  }, [roomId, meId]);

  const send = useCallback(
    (foods: Food[], k: number) => {
      const payload: Wire = { by: meId, k, foods: foods.map((f) => ({ id: f.id, name: f.name, icon: f.icon, color: f.color })) };
      void channel.current?.send({ type: 'broadcast', event: 'spin', payload });
    },
    [meId],
  );

  return { incoming, send, dismiss: () => setIncoming(null) };
}
