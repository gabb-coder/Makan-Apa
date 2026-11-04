import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { tk } from './i18n';

export type QueueLevel = 'none' | 'short' | 'long';

export interface QueueReport {
  id: string;
  spot_id: string;
  level: QueueLevel;
  created_at: string;
}

/** What people say the queue at a place is like right now. */
export interface QueueNow {
  level: QueueLevel;
  /** Minutes since the latest report. */
  minutesAgo: number;
  /** Reports in the last half hour. */
  reports: number;
}

/** Reports fade after this long. */
export const QUEUE_FRESH_MINUTES = 30;

export const QUEUE_LEVELS: { level: QueueLevel; emoji: string; label: string }[] = [
  { level: 'none', emoji: '🟢', label: tk('No queue') },
  { level: 'short', emoji: '🟡', label: tk('Short queue') },
  { level: 'long', emoji: '🔴', label: tk('Long queue') },
];

/** The latest fresh report for each place (the newest one wins). */
export function queuesNow(reports: QueueReport[], now = Date.now()): Map<string, QueueNow> {
  const out = new Map<string, QueueNow>();
  const fresh = reports
    .filter((r) => now - Date.parse(r.created_at) < QUEUE_FRESH_MINUTES * 60_000)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  for (const r of fresh) {
    const cur = out.get(r.spot_id);
    if (cur) cur.reports++;
    else out.set(r.spot_id, { level: r.level, minutesAgo: Math.max(0, Math.floor((now - Date.parse(r.created_at)) / 60_000)), reports: 1 });
  }
  return out;
}

/**
 * Live queue reports from everyone using the app (no names), refreshed every 2 minutes, and
 * reporting one.
 */
export function useQueues() {
  const [reports, setReports] = useState<QueueReport[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const load = useCallback(async () => {
    const since = new Date(Date.now() - QUEUE_FRESH_MINUTES * 60_000).toISOString();
    const { data } = await supabase.from('queue_reports').select('id, spot_id, level, created_at').gte('created_at', since);
    if (data) setReports(data as QueueReport[]);
    setNow(Date.now());
  }, []);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 120_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const report = async (spotId: string, level: QueueLevel) => {
    const { error } = await supabase.from('queue_reports').insert({ spot_id: spotId, level });
    if (error) throw new Error(error.message);
    await load();
  };

  return { byPlace: queuesNow(reports, now), report };
}
export type QueuesApi = ReturnType<typeof useQueues>;
