import { useEffect, useSyncExternalStore } from 'react';
import type { LatLng } from './geo';
import { locationPref } from './prefs';

export type LocationState =
  | { status: 'off' }
  | { status: 'locating' }
  | { status: 'ready'; here: LatLng }
  | { status: 'denied' }
  | { status: 'unavailable' };

/**
 * Where this phone is, for sorting food ideas by distance. Only read after the person turns it
 * on, kept in memory on this phone, and never sent to the room or the database. Google Maps
 * only sees it when a "near you" link is opened.
 */
const listeners = new Set<() => void>();
let state: LocationState = { status: locationPref.get() === 'on' ? 'locating' : 'off' };
let lastFix = 0;

function set(next: LocationState) {
  state = next;
  listeners.forEach((l) => l());
}

const FRESH_MS = 5 * 60_000;

/** Ask the phone for its position (the browser shows its permission prompt the first time). */
export function locate(maxAgeMs = FRESH_MS): Promise<LocationState> {
  if (!('geolocation' in navigator)) {
    set({ status: 'unavailable' });
    return Promise.resolve(state);
  }
  if (state.status === 'ready' && Date.now() - lastFix < maxAgeMs) return Promise.resolve(state);
  if (state.status !== 'ready') set({ status: 'locating' });
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (locationPref.get() !== 'on') return resolve(state); // turned off while locating
        lastFix = Date.now();
        set({ status: 'ready', here: { lat: pos.coords.latitude, lng: pos.coords.longitude } });
        resolve(state);
      },
      (err) => {
        if (locationPref.get() !== 'on') return resolve(state);
        // Keep an earlier fix if a refresh fails.
        if (state.status !== 'ready') set({ status: err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable' });
        if (err.code === err.PERMISSION_DENIED) locationPref.set('off');
        resolve(state);
      },
      { enableHighAccuracy: false, maximumAge: maxAgeMs, timeout: 15_000 },
    );
  });
}

export async function turnOnLocation(): Promise<LocationState> {
  locationPref.set('on');
  return locate(0); // a fresh fix: you may have moved since the phone last checked
}

export function turnOffLocation() {
  locationPref.set('off');
  lastFix = 0;
  set({ status: 'off' });
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Current location state; refreshes the fix whenever the app is opened with location on. */
export function useLocation(): LocationState {
  const current = useSyncExternalStore(subscribe, () => state, () => state);
  useEffect(() => {
    const refresh = () => {
      if (locationPref.get() === 'on' && document.visibilityState === 'visible') void locate();
    };
    refresh();
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, []);
  return current;
}
