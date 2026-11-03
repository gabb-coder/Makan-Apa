import { useEffect, useState } from 'react';
import type { LatLng } from './geo';

/** WMO weather codes for drizzle, rain, showers and thunderstorms. */
export function isWetCode(code: number): boolean {
  return (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95;
}

export interface Rain {
  /** Raining now. */
  now: boolean;
  /** Likely in the next two hours (60%+). */
  soon: boolean;
}

/** Open-Meteo's answer → whether it's raining now or soon. */
export function readRain(json: { current?: { precipitation?: number; weather_code?: number }; hourly?: { precipitation_probability?: (number | null)[] } }): Rain {
  const now = (json.current?.precipitation ?? 0) >= 0.1 || isWetCode(json.current?.weather_code ?? 0);
  const soon = (json.hourly?.precipitation_probability ?? []).slice(0, 2).some((p) => (p ?? 0) >= 60);
  return { now, soon: !now && soon };
}

const TTL = 15 * 60_000;
const cache = new Map<string, { at: number; rain: Rain | null; pending?: Promise<Rain | null> }>();

/** Rain at a place, from Open-Meteo (free, no key). Cached for 15 minutes; null if unknown. */
export async function rainAt(at: LatLng): Promise<Rain | null> {
  const key = `${at.lat.toFixed(2)},${at.lng.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit?.pending) return hit.pending;
  if (hit && Date.now() - hit.at < TTL) return hit.rain;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${at.lat.toFixed(3)}&longitude=${at.lng.toFixed(3)}&current=precipitation,weather_code&hourly=precipitation_probability&forecast_hours=2&timezone=auto`;
  const pending = fetch(url)
    .then((r) => (r.ok ? r.json() : null))
    .then((json) => (json ? readRain(json) : null))
    .catch(() => null)
    .then((rain) => {
      cache.set(key, { at: Date.now(), rain });
      return rain;
    });
  cache.set(key, { at: Date.now(), rain: null, pending });
  return pending;
}

/** Live-ish rain where you are (or the room's area). */
export function useRain(at: LatLng | undefined): Rain | null {
  const [rain, setRain] = useState<Rain | null>(null);
  const lat = at?.lat;
  const lng = at?.lng;
  useEffect(() => {
    if (lat === undefined || lng === undefined || !navigator.onLine) return;
    let live = true;
    const check = () => void rainAt({ lat, lng }).then((r) => live && setRain(r));
    check();
    const timer = window.setInterval(check, TTL);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [lat?.toFixed(2), lng?.toFixed(2)]);
  return rain;
}
