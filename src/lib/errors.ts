import { supabase } from './supabase';

/**
 * Crash reports: uncaught errors go to the client_errors table (insert-only, 20 an hour per
 * phone on the server, 10 per session here). Nothing personal: the message, stack, page and
 * browser.
 */
const MAX_PER_SESSION = 10;
let sent = 0;
const seen = new Set<string>();

export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

export function reportError(error: unknown, context?: string) {
  if (import.meta.env.DEV || sent >= MAX_PER_SESSION) return;
  const e = error instanceof Error ? error : new Error(String(error));
  const message = `${context ? `${context}: ` : ''}${e.message || 'Unknown error'}`.slice(0, 1000);
  if (seen.has(message)) return;
  seen.add(message);
  sent++;
  void supabase.auth.getSession().then(({ data }) => {
    if (!data.session) return; // only signed-in phones can write; errors before sign-in are dropped
    return supabase.from('client_errors').insert({
      message,
      stack: e.stack?.slice(0, 4000) ?? null,
      url: `${location.pathname}${location.hash}`.slice(0, 500),
      user_agent: navigator.userAgent.slice(0, 300),
      app_version: APP_VERSION.slice(0, 40),
    });
  });
}

export function installErrorReporting() {
  window.addEventListener('error', (e) => reportError(e.error ?? e.message, 'window.onerror'));
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason, 'unhandledrejection'));
}
