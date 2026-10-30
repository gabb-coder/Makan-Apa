import { useSyncExternalStore } from 'react';
import { storage } from './storage';

/** A tiny persisted preference that components can subscribe to. */
function pref<T extends string>(key: string, fallback: T, allowed: readonly T[]) {
  const listeners = new Set<() => void>();
  const read = (): T => {
    const v = storage.get(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  };
  let value = read();
  return {
    get: () => value,
    set(next: T) {
      value = next;
      storage.set(key, next);
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

export type ThemePref = 'system' | 'light' | 'dark';
export const themePref = pref<ThemePref>('makan.theme', 'system', ['system', 'light', 'dark']);
export const soundPref = pref<'on' | 'off'>('makan.sound', 'on', ['on', 'off']);

export function usePref<T extends string>(p: { get: () => T; subscribe: (l: () => void) => () => void }): T {
  return useSyncExternalStore(p.subscribe, p.get, p.get);
}

/** Put the theme choice on <html> and keep the browser chrome colour in step. */
export function applyTheme() {
  const choice = themePref.get();
  const root = document.documentElement;
  if (choice === 'system') delete root.dataset.theme;
  else root.dataset.theme = choice;
  const dark = choice === 'dark' || (choice === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#121214' : '#F6F6F4');
}

themePref.subscribe(applyTheme);
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
