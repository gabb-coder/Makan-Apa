import { t } from './i18n';
import { useCallback, useEffect, useState } from 'react';
import { hostOf } from './session';
import { supabase, type MemberRow, type RoomRow } from './supabase';

export type RoomPatch = Partial<Pick<RoomRow, 'timezone' | 'rotation_start' | 'veto_limit' | 'decision_mode' | 'name' | 'meals' | 'emoji' | 'color' | 'fixed_days' | 'host_id' | 'locked' | 'kitty_keeper' | 'eat_days' | 'skip_holidays' | 'rotation_offset' | 'auto_decide'>>;
export type MemberPatch = Partial<Pick<MemberRow, 'name' | 'color' | 'sort_order' | 'diet' | 'budget' | 'pay_duitnow' | 'pay_bank' | 'pay_qr_path' | 'allergies'>>;

function upsert(rows: MemberRow[], row: MemberRow): MemberRow[] {
  const next = rows.some((r) => r.id === row.id) ? rows.map((r) => (r.id === row.id ? row : r)) : [...rows, row];
  return next.sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
}

/** The room row and its members, kept live with Supabase Realtime. */
export function useRoomData(initialRoom: RoomRow, initialMembers: MemberRow[], meId: string) {
  const roomId = initialRoom.id;
  const [room, setRoom] = useState(initialRoom);
  const [members, setMembers] = useState<MemberRow[]>(initialMembers);

  const load = useCallback(async () => {
    const [r, m] = await Promise.all([
      supabase.from('rooms').select('*').eq('id', roomId).maybeSingle(),
      supabase.from('members').select('*').eq('room_id', roomId).order('sort_order').order('created_at'),
    ]);
    if (r.data) setRoom(r.data as RoomRow);
    if (m.data) setMembers(m.data as MemberRow[]);
  }, [roomId]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`room:${roomId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, (p) =>
        setRoom(p.new as RoomRow),
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'members', filter: `room_id=eq.${roomId}` }, (p) =>
        setMembers((cur) => upsert(cur, p.new as MemberRow)),
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'members', filter: `room_id=eq.${roomId}` }, (p) =>
        setMembers((cur) => upsert(cur, p.new as MemberRow)),
      )
      // Realtime can't filter deletes, so drop whichever id went away.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'members' }, (p) => {
        const id = (p.old as { id?: string }).id;
        setMembers((cur) => cur.filter((m) => m.id !== id));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') load();
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, load]);

  const updateRoom = async (patch: RoomPatch) => {
    const { data, error } = await supabase.from('rooms').update(patch).eq('id', roomId).select().single();
    if (error) throw new Error(error.message);
    setRoom(data as RoomRow);
  };

  const updateMember = async (id: string, patch: MemberPatch) => {
    const { data, error } = await supabase.from('members').update(patch).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    setMembers((cur) => upsert(cur, data as MemberRow));
  };

  /** Move a member up or down the rotation, renumbering everyone 0..n-1. */
  const moveMember = async (id: string, delta: -1 | 1) => {
    // Only the people still in the room are on the list, so swap with the next one of them (not
    // someone who left in between); those who left go after everyone.
    const active = members.filter((m) => !m.left_at);
    const i = active.findIndex((m) => m.id === id);
    const j = i + delta;
    if (i === -1 || j < 0 || j >= active.length) return;
    [active[i], active[j]] = [active[j], active[i]];
    const order = [...active, ...members.filter((m) => m.left_at)];
    const renumbered = order.map((m, idx) => ({ ...m, sort_order: idx }));
    setMembers(renumbered);
    const changed = renumbered.filter((m) => members.find((x) => x.id === m.id)?.sort_order !== m.sort_order);
    const results = await Promise.all(
      changed.map((m) => supabase.from('members').update({ sort_order: m.sort_order }).eq('id', m.id)),
    );
    const failed = results.find((r) => r.error);
    if (failed) {
      load();
      throw new Error(failed.error!.message);
    }
  };

  /**
   * Host only: take someone out of the room. They stay in its history and money (like leaving),
   * lose access on their phones, and need the host's OK to come back.
   */
  const removeMember = async (id: string) => {
    if (hostOf(members, room.host_id)?.id !== meId) throw new Error(t('Only the host can remove people from the room.'));
    if (id === meId) throw new Error(t('To leave, use “Leave room” in Settings.'));
    const { error } = await supabase.rpc('remove_member', { p_member_id: id });
    if (error) throw new Error(error.message);
    await load();
  };

  /** Host only: delete the room and everything in it, for everyone. */
  const deleteRoom = async () => {
    const { data, error } = await supabase.from('rooms').delete().eq('id', roomId).select('id');
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error(t('Only the host can delete the room.'));
  };

  return { room, members, updateRoom, updateMember, moveMember, removeMember, deleteRoom };
}
