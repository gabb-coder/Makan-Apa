// send-reminders: called every 15 minutes by pg_cron (see migrations/*_push_reminders.sql).
//
// For each browser subscribed to reminders, once a day at its chosen hour in the room's
// timezone, it sends:
//   - decider mode: "It's your turn to choose" to today's decider, if nothing's been picked yet
//   - secret picks: "Secret picks are open" to anyone who hasn't picked yet
// Nothing is sent once the day is decided.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import webpush from 'npm:web-push@3.6.7';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const VAPID_SUBJECT = 'https://github.com/gabb-coder/Makan-Apa';

interface Sub {
  id: string;
  room_id: string;
  member_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  remind_hour: number;
  last_sent_on: string | null;
}
interface Room {
  id: string;
  timezone: string;
  rotation_start: string;
  decision_mode: 'decider' | 'secret';
}
interface Member {
  id: string;
  room_id: string;
  sort_order: number;
  created_at: string;
}
interface Entry {
  id: string;
  room_id: string;
  entry_date: string;
  decider_id: string | null;
  status: 'pending' | 'proposed' | 'accepted';
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Local date (YYYY-MM-DD) and hour in `timeZone`. */
function localNow(timeZone: string, now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
}

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Same rule as the app (src/lib/rotation.ts). */
function deciderFor(members: Member[], rotationStart: string, date: string): string | null {
  if (!members.length) return null;
  const sorted = [...members].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
  const n = sorted.length;
  return sorted[((daysBetween(rotationStart, date) % n) + n) % n].id;
}

async function vapidKeys(config: Record<string, string>) {
  if (config.vapid) return JSON.parse(config.vapid) as { publicKey: string; privateKey: string };
  // First run: make the key pair here so the private key never leaves Supabase.
  const { data, error } = await db.rpc('save_vapid_keys', { p_keys: JSON.stringify(webpush.generateVAPIDKeys()) });
  if (error) throw new Error(error.message);
  return JSON.parse(data as string) as { publicKey: string; privateKey: string };
}

Deno.serve(async (req) => {
  const { data: config, error: configError } = await db.rpc('push_config');
  if (configError) return json({ error: configError.message }, 500);
  if (!config?.cron_secret || req.headers.get('x-cron-secret') !== config.cron_secret) return json({ error: 'forbidden' }, 403);

  const keys = await vapidKeys(config);
  webpush.setVapidDetails(VAPID_SUBJECT, keys.publicKey, keys.privateKey);

  const { data: subsData, error: subsError } = await db.from('push_subscriptions').select('*');
  if (subsError) return json({ error: subsError.message }, 500);
  const subs = subsData as Sub[];
  const summary = { subscriptions: subs.length, due: 0, sent: 0, notNeeded: 0, removed: 0, failed: 0 };
  if (!subs.length) {
    console.log('send-reminders', JSON.stringify(summary));
    return json(summary);
  }

  const roomIds = [...new Set(subs.map((s) => s.room_id))];
  const [rooms, members, entries] = await Promise.all([
    db.from('rooms').select('id, timezone, rotation_start, decision_mode').in('id', roomIds),
    db.from('members').select('id, room_id, sort_order, created_at').in('room_id', roomIds),
    // Wide enough for any timezone's "today".
    db
      .from('day_entries')
      .select('id, room_id, entry_date, decider_id, status')
      .in('room_id', roomIds)
      .gte('entry_date', new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10)),
  ]);
  if (rooms.error || members.error || entries.error) {
    return json({ error: (rooms.error ?? members.error ?? entries.error)!.message }, 500);
  }

  const entryIds = (entries.data as Entry[]).map((e) => e.id);
  const picks = entryIds.length
    ? await db.from('secret_picks').select('day_entry_id, member_id').in('day_entry_id', entryIds)
    : { data: [] as { day_entry_id: string; member_id: string }[], error: null };
  const now = new Date();

  for (const sub of subs) {
    const room = (rooms.data as Room[]).find((r) => r.id === sub.room_id);
    if (!room) continue;
    const local = localNow(room.timezone, now);
    if (local.hour < sub.remind_hour || sub.last_sent_on === local.date) continue;
    summary.due++;

    const entry = (entries.data as Entry[]).find((e) => e.room_id === room.id && e.entry_date === local.date);
    const roomMembers = (members.data as Member[]).filter((m) => m.room_id === room.id);
    let message: { title: string; body: string } | null = null;

    if (entry?.status !== 'accepted') {
      if (room.decision_mode === 'secret') {
        const picked = (picks.data ?? []).some((p) => p.day_entry_id === entry?.id && p.member_id === sub.member_id);
        if (!picked) message = { title: 'Secret picks are open', body: 'Make your pick so the wheel can spin.' };
      } else {
        const decider = entry?.decider_id ?? deciderFor(roomMembers, room.rotation_start, local.date);
        if (decider === sub.member_id && entry?.status !== 'proposed') {
          message = { title: 'It’s your turn to choose', body: 'Makan apa? Spin the wheel or pick something for today.' };
        }
      }
    }

    if (message) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ ...message, url: '/#today', tag: `makan-${local.date}` }),
          { TTL: 6 * 60 * 60 },
        );
        summary.sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          // The browser unsubscribed or the subscription expired.
          await db.from('push_subscriptions').delete().eq('id', sub.id);
          summary.removed++;
          continue;
        }
        summary.failed++;
        console.error('send failed', status, String(e).slice(0, 200));
        continue; // try again next run
      }
    } else {
      summary.notNeeded++;
    }
    await db.from('push_subscriptions').update({ last_sent_on: local.date }).eq('id', sub.id);
  }

  console.log('send-reminders', JSON.stringify(summary));
  return json(summary);
});
