import { useEffect, useState } from 'react';
import { todayIn } from './dates';

/** Today's date (YYYY-MM-DD) in `timeZone`, updating when the day rolls over. */
export function useToday(timeZone: string): string {
  const [today, setToday] = useState(() => todayIn(timeZone));
  useEffect(() => {
    const check = () => setToday(todayIn(timeZone));
    check();
    const t = window.setInterval(check, 30_000);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', check);
    };
  }, [timeZone]);
  return today;
}
