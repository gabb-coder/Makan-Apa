import { useEffect, useState } from 'react';
import { t } from './i18n';
import type { DayEntryRow } from './supabase';

/** Re-render every `ms`, for anything that changes with the clock. */
export function useNow(ms: number): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

/**
 * Is this meal a mystery to me? Only the decider knows until they reveal it, the meet-up time
 * comes, or the day is over.
 */
export function mysteryHidden(e: DayEntryRow, meId: string, today: string, now = Date.now()): boolean {
  return !!e.mystery && !e.mystery_revealed && e.decider_id !== meId && e.entry_date >= today && !(e.meet_at && now >= Date.parse(e.meet_at));
}

/** The entry as this phone should see it: a hidden mystery shows no food. */
export function maskMystery(e: DayEntryRow, meId: string, today: string, now = Date.now()): DayEntryRow {
  return mysteryHidden(e, meId, today, now) ? { ...e, food_option_id: null, custom_food: e.meal === 'dinner' ? t('Mystery dinner 🎁') : t('Mystery lunch 🎁'), mystery_hidden: true } : e;
}
