import { getLang, t } from './i18n';
import { isIOS, isStandalone } from './install';
import { knownRooms } from './session';
import { supabase } from './supabase';

export type PushSupport = 'ok' | 'needs-install' | 'unsupported';

/** iPhones only allow web push for apps added to the Home Screen (iOS 16.4+). */
export function pushSupport(): PushSupport {
  const ok = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (ok) return 'ok';
  return isIOS() && !isStandalone() ? 'needs-install' : 'unsupported';
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) throw new Error(t('Reminders need the installed app. Open the deployed site, not the dev server.'));
  return reg;
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** This browser's reminder for `memberId`, if it has one. */
export async function reminderStatus(memberId: string): Promise<{ hour: number; recap: boolean; events: boolean } | null> {
  if (pushSupport() !== 'ok' || Notification.permission !== 'granted') return null;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return null;
  const { data } = await supabase.rpc('push_status', { p_endpoint: sub.endpoint });
  // One row per room this phone gets notifications for.
  const row = (data as { member_id: string; remind_hour: number; weekly_recap?: boolean; notify_events?: boolean }[] | null)?.find((r) => r.member_id === memberId);
  return row ? { hour: row.remind_hour, recap: row.weekly_recap ?? true, events: row.notify_events ?? true } : null;
}

/**
 * Alerts when things happen (picks, bills, tapau runs) on or off for this browser, and the
 * language they're written in. Pass null to leave one as it is.
 */
export async function setPushPrefs(events: boolean | null, lang: string | null = getLang()): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager?.getSubscription();
  if (!sub) return;
  const { error } = await supabase.rpc('set_push_prefs', { p_endpoint: sub.endpoint, p_events: events, p_lang: lang });
  if (error) throw new Error(error.message);
}

/** Turn the Sunday-evening weekly recap on or off for this browser. */
export async function setWeeklyRecap(on: boolean): Promise<void> {
  const reg = await navigator.serviceWorker?.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  const { error } = await supabase.rpc('set_weekly_recap', { p_endpoint: sub.endpoint, p_on: on });
  if (error) throw new Error(error.message);
}

/** Ask for permission (needs a tap), subscribe this browser and save it for `memberId`. */
export async function enableReminders(memberId: string, hour: number): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(t('Notifications are blocked for this site. Allow them in your browser settings, then try again.'));
  }
  const reg = await registration();
  const { data: key, error: keyError } = await supabase.rpc('vapid_public_key');
  if (keyError) throw new Error(keyError.message);
  if (!key) throw new Error(t('Reminders are still being set up on the server. Try again in a few minutes.'));
  let sub = await reg.pushManager.getSubscription();
  try {
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key as string) });
  } catch (e) {
    throw new Error(t('This browser couldn’t sign up for notifications ({error}).', { error: e instanceof Error ? e.message : String(e) }));
  }
  const { keys } = sub.toJSON() as { keys: { p256dh: string; auth: string } };
  const { error } = await supabase.rpc('subscribe_push', {
    p_member_id: memberId,
    p_endpoint: sub.endpoint,
    p_p256dh: keys.p256dh,
    p_auth: keys.auth,
    p_remind_hour: hour,
  });
  if (error) throw new Error(error.message);
  // Notifications come in the app's language, and cover every room on this phone.
  await setPushPrefs(null).catch(() => {});
  await followAllRooms(hour).catch(() => {});
}

async function subscribedMembers(endpoint: string): Promise<Set<string>> {
  const { data } = await supabase.rpc('push_status', { p_endpoint: endpoint });
  return new Set(((data as { member_id: string }[] | null) ?? []).map((r) => r.member_id));
}

/** Sign up this phone's other rooms that don't have notifications yet. */
async function followAllRooms(hour: number): Promise<void> {
  const reg = await navigator.serviceWorker?.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  const { keys } = sub.toJSON() as { keys: { p256dh: string; auth: string } };
  const have = await subscribedMembers(sub.endpoint);
  for (const r of knownRooms()) {
    if (have.has(r.memberId)) continue;
    await supabase.rpc('subscribe_push', { p_member_id: r.memberId, p_endpoint: sub.endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth, p_remind_hour: hour });
  }
}

/** A room just joined on a phone that already has notifications: include it. */
export async function followRoom(memberId: string): Promise<void> {
  if (pushSupport() !== 'ok' || Notification.permission !== 'granted') return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  const { data } = await supabase.rpc('push_status', { p_endpoint: sub.endpoint });
  const rows = (data as { member_id: string; remind_hour: number }[] | null) ?? [];
  if (!rows.length || rows.some((r) => r.member_id === memberId)) return;
  const { keys } = sub.toJSON() as { keys: { p256dh: string; auth: string } };
  await supabase.rpc('subscribe_push', { p_member_id: memberId, p_endpoint: sub.endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth, p_remind_hour: rows[0].remind_hour });
}

/**
 * Stop notifications for one room on this phone (or every room without a member). The browser
 * subscription itself goes once no room uses it.
 */
export async function disableReminders(memberId?: string): Promise<void> {
  const reg = await navigator.serviceWorker?.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await supabase.rpc('unsubscribe_push', { p_endpoint: sub.endpoint, p_member_id: memberId ?? null });
  if (!memberId || (await subscribedMembers(sub.endpoint)).size === 0) await sub.unsubscribe();
}
