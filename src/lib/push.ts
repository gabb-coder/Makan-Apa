import { isIOS, isStandalone } from './install';
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
  if (!reg) throw new Error('Reminders need the installed app. Open the deployed site, not the dev server.');
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
export async function reminderStatus(memberId: string): Promise<{ hour: number } | null> {
  if (pushSupport() !== 'ok' || Notification.permission !== 'granted') return null;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return null;
  const { data } = await supabase.rpc('push_status', { p_endpoint: sub.endpoint });
  const row = (data as { member_id: string; remind_hour: number }[] | null)?.[0];
  return row && row.member_id === memberId ? { hour: row.remind_hour } : null;
}

/** Ask for permission (needs a tap), subscribe this browser and save it for `memberId`. */
export async function enableReminders(memberId: string, hour: number): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notifications are blocked for this site. Allow them in your browser settings, then try again.');
  }
  const reg = await registration();
  const { data: key, error: keyError } = await supabase.rpc('vapid_public_key');
  if (keyError) throw new Error(keyError.message);
  if (!key) throw new Error('Reminders are still being set up on the server. Try again in a few minutes.');
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key as string) }));
  const { keys } = sub.toJSON() as { keys: { p256dh: string; auth: string } };
  const { error } = await supabase.rpc('subscribe_push', {
    p_member_id: memberId,
    p_endpoint: sub.endpoint,
    p_p256dh: keys.p256dh,
    p_auth: keys.auth,
    p_remind_hour: hour,
  });
  if (error) throw new Error(error.message);
}

/** Stop reminders on this browser. */
export async function disableReminders(): Promise<void> {
  const reg = await navigator.serviceWorker?.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await supabase.rpc('unsubscribe_push', { p_endpoint: sub.endpoint });
  await sub.unsubscribe();
}
