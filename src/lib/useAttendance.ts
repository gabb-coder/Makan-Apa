import { useCallback, useEffect, useState } from 'react';
import { addDays } from './rotation';
import { supabase, type Attendance, type AttendanceRow, type Meal } from './supabase';

const NOBODY: ReadonlySet<string> = new Set();

/**
 * "Who's in?" for the room, kept live: the last few weeks, so bills for recent meals can leave
 * out whoever wasn't there.
 */
export function useAttendance(roomId: string, today: string) {
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const since = addDays(today, -45);

  const load = useCallback(async () => {
    const { data } = await supabase.from('attendance').select('*').eq('room_id', roomId).gte('entry_date', since);
    if (data) setRows(data as AttendanceRow[]);
  }, [roomId, since]);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel(`attendance:${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance', filter: `room_id=eq.${roomId}` }, () => void load())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'attendance' }, () => void load())
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void load();
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, load]);

  const statusOf = (memberId: string, date: string, meal: Meal): Attendance =>
    rows.find((r) => r.member_id === memberId && r.entry_date === date && (r.meal ?? 'lunch') === meal)?.status ?? 'in';

  /** Who said they're out for that meal. */
  const awayOn = (date: string, meal: Meal): ReadonlySet<string> => {
    const out = rows.filter((r) => r.entry_date === date && (r.meal ?? 'lunch') === meal && r.status === 'out');
    return out.length ? new Set(out.map((r) => r.member_id)) : NOBODY;
  };

  const setStatus = async (memberId: string, date: string, meal: Meal, status: Attendance) => {
    const row = { room_id: roomId, entry_date: date, meal, member_id: memberId, status, updated_at: new Date().toISOString() };
    const before = rows.find((r) => r.member_id === memberId && r.entry_date === date && r.meal === meal);
    // Keep any guests in the local copy (the upsert leaves the column alone); out means none.
    setRows((cur) => [...cur.filter((r) => !(r.member_id === memberId && r.entry_date === date && r.meal === meal)), { ...row, guests: status === 'out' ? 0 : (before?.guests ?? 0) }]);
    const payload: Record<string, unknown> = status === 'out' ? { ...row, guests: 0 } : row;
    const { error } = await supabase.from('attendance').upsert(payload);
    if (error) {
      await load();
      throw new Error(error.message);
    }
  };

  /** Friends people are bringing to a meal (not on the app). */
  const guestsOn = (date: string, meal: Meal): { hostId: string; count: number }[] =>
    rows.filter((r) => r.entry_date === date && (r.meal ?? 'lunch') === meal && r.status !== 'out' && (r.guests ?? 0) > 0).map((r) => ({ hostId: r.member_id, count: r.guests ?? 0 }));

  /** Bringing n guests (0–5); bringing anyone means you're in. */
  const setGuests = async (memberId: string, date: string, meal: Meal, n: number) => {
    const current = statusOf(memberId, date, meal);
    const status: Attendance = current === 'out' && n > 0 ? 'in' : current;
    const guests = Math.max(0, Math.min(5, n));
    const row = { room_id: roomId, entry_date: date, meal, member_id: memberId, status, guests, updated_at: new Date().toISOString() };
    setRows((cur) => [...cur.filter((r) => !(r.member_id === memberId && r.entry_date === date && r.meal === meal)), row]);
    const { error } = await supabase.from('attendance').upsert(row);
    if (error) {
      await load();
      throw new Error(error.message);
    }
  };

  return { rows, statusOf, awayOn, setStatus, guestsOn, setGuests };
}

export type AttendanceApi = ReturnType<typeof useAttendance>;
