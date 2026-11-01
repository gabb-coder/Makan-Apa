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
    setRows((cur) => [...cur.filter((r) => !(r.member_id === memberId && r.entry_date === date && r.meal === meal)), row]);
    const { error } = await supabase.from('attendance').upsert(row);
    if (error) {
      await load();
      throw new Error(error.message);
    }
  };

  return { rows, statusOf, awayOn, setStatus };
}

export type AttendanceApi = ReturnType<typeof useAttendance>;
