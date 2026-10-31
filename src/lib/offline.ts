import { useSyncExternalStore } from 'react';

/**
 * Taps made while offline wait here and run once the connection is back, in order. Kept in
 * memory only: closing the app drops them (and the toast says so up front).
 */
type Job = { run: () => Promise<unknown>; onDone: (error: string | null) => void };
const queue: Job[] = [];
const listeners = new Set<() => void>();
let flushing = false;

function notify() {
  listeners.forEach((l) => l());
}

export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** fetch() failing outright (no response at all) means the network, not the server. */
export function isNetworkError(e: unknown): boolean {
  const message = e instanceof Error ? e.message : String(e);
  return /failed to fetch|networkerror|load failed|network request failed/i.test(message);
}

export function queueForOnline(job: Job) {
  queue.push(job);
  notify();
}

export function pendingCount(): number {
  return queue.length;
}

async function flush() {
  if (flushing || isOffline()) return;
  flushing = true;
  try {
    while (queue.length && !isOffline()) {
      const job = queue[0];
      try {
        await job.run();
        job.onDone(null);
      } catch (e) {
        if (isNetworkError(e)) break; // still not really online; try again on the next event
        job.onDone(e instanceof Error ? e.message : 'Something went wrong.');
      }
      queue.shift();
      notify();
    }
  } finally {
    flushing = false;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    notify();
    void flush();
  });
  window.addEventListener('offline', notify);
}

/** Online state plus how many taps are waiting, for the offline banner. */
export function useConnection(): { offline: boolean; pending: number } {
  const offline = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    isOffline,
    () => false,
  );
  const pending = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    pendingCount,
    () => 0,
  );
  return { offline, pending };
}
