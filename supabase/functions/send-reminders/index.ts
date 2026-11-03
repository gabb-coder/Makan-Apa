// send-reminders: called every 5 minutes by pg_cron (see migrations/*_push_reminders.sql).
//
// For each browser subscribed to reminders, once a day at its chosen hour in the room's
// timezone, it sends:
//   - decider mode: "It's your turn to choose" to today's decider, if nothing's been picked yet
//   - secret picks: "Secret picks are open" to anyone who hasn't picked yet
// Nothing is sent once the day is decided, or to someone who said they're out. Rooms deciding
// lunch and dinner are reminded about lunch only. Reminders are in each phone's language.
//
// Paybacks: phones with alerts on whose person still owes money get a nudge at their reminder
// hour, at most every 3 days.
//
// Weekly recap: on Sunday from 8pm (room's time), phones with reminders on that haven't turned
// the recap off get a summary of the past 7 days: meals, the favourite, vetoes and who paid most.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import webpush from 'npm:web-push@3.6.7';
import { message, type Lang } from '../_shared/messages.ts';
import { balances, formatRM, settleUp, type Bill, type Payment } from '../_shared/money.ts';

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
  weekly_recap: boolean;
  last_recap_on: string | null;
  notify_events: boolean;
  lang: Lang;
  last_nudge_on: string | null;
}
interface Room {
  id: string;
  timezone: string;
  rotation_start: string;
  decision_mode: 'decider' | 'secret';
  fixed_days: Record<string, string> | null;
}
interface Member {
  id: string;
  room_id: string;
  name: string;
  sort_order: number;
  created_at: string;
  left_at: string | null;
}
interface Entry {
  id: string;
  room_id: string;
  entry_date: string;
  decider_id: string | null;
  status: 'pending' | 'proposed' | 'accepted';
  meal: 'lunch' | 'dinner';
  food_option_id: string | null;
  custom_food: string | null;
  meet_at: string | null;
  meet_place: string | null;
  meet_alerted: boolean;
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
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  return { date, hour: Number(get('hour')), weekday: new Date(`${date}T00:00:00Z`).getUTCDay() };
}

function addDays(date: string, n: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

const RECAP_HOUR = 20; // Sunday, 8pm room time

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Same rule as the app (src/lib/rotation.ts): lunch, skipping whoever's out. */
function deciderFor(members: Member[], rotationStart: string, date: string, away: Set<string>): string | null {
  if (!members.length) return null;
  const sorted = [...members].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
  const n = sorted.length;
  const i = ((daysBetween(rotationStart, date) % n) + n) % n;
  for (let k = 0; k < n; k++) if (!away.has(sorted[(i + k) % n].id)) return sorted[(i + k) % n].id;
  return sorted[i].id;
}

const NUDGE_EVERY_DAYS = 3;

async function vapidKeys(config: Record<string, string>) {
  if (config.vapid) return JSON.parse(config.vapid) as { publicKey: string; privateKey: string };
  // First run: make the key pair here so the private key never leaves Supabase.
  const { data, error } = await db.rpc('save_vapid_keys', { p_keys: JSON.stringify(webpush.generateVAPIDKeys()) });
  if (error) throw new Error(error.message);
  return JSON.parse(data as string) as { publicKey: string; privateKey: string };
}

/** Send one notification; a 404/410 means the browser dropped it, so the row is deleted. */
async function send(sub: Sub, payload: Record<string, string>): Promise<'sent' | 'failed' | 'gone'> {
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), {
      TTL: 6 * 60 * 60,
    });
    return 'sent';
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      await db.from('push_subscriptions').delete().eq('id', sub.id);
      return 'gone';
    }
    console.error('send failed', status, String(e).slice(0, 200));
    return 'failed';
  }
}

/**
 * "Your week: 5 meals" with the most-eaten food, vetoes and who paid most, for the 7 days up to
 * `date` in a room; null if the room ate nothing that week.
 */
async function weeklyRecaps(entries: Entry[], members: Member[]) {
  const accepted = entries.filter((e) => e.status === 'accepted');
  const ids = accepted.map((e) => e.id);
  const foodIds = [...new Set(accepted.map((e) => e.food_option_id).filter((x): x is string => !!x))];
  const [foods, vetoes, bills] = await Promise.all([
    foodIds.length ? db.from('food_options').select('id, name').in('id', foodIds) : { data: [] },
    entries.length ? db.from('vetoes').select('day_entry_id, member_id').in('day_entry_id', entries.map((e) => e.id)) : { data: [] },
    ids.length ? db.from('meal_bills').select('day_entry_id, paid_by, amount_cents').in('day_entry_id', ids).eq('from_kitty', false) : { data: [] },
  ]);
  const foodName = new Map(((foods.data ?? []) as { id: string; name: string }[]).map((f) => [f.id, f.name]));
  const memberName = new Map(members.map((m) => [m.id, m.name]));

  return (roomId: string, date: string): { title: string; body: string } | null => {
    const from = addDays(date, -6);
    const week = entries.filter((e) => e.room_id === roomId && e.entry_date >= from && e.entry_date <= date);
    const meals = week.filter((e) => e.status === 'accepted');
    if (!meals.length) return null;

    const counts = new Map<string, number>();
    for (const e of meals) {
      const name = (e.food_option_id && foodName.get(e.food_option_id)) || e.custom_food || 'Something';
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    const [topName, topCount] = [...counts].sort((a, b) => b[1] - a[1])[0];
    const weekIds = new Set(week.map((e) => e.id));
    const weekVetoes = ((vetoes.data ?? []) as { day_entry_id: string; member_id: string }[]).filter((v) => weekIds.has(v.day_entry_id));
    const vetoers = new Map<string, number>();
    for (const v of weekVetoes) vetoers.set(v.member_id, (vetoers.get(v.member_id) ?? 0) + 1);
    const topVetoer = [...vetoers].sort((a, b) => b[1] - a[1])[0];
    const paid = new Map<string, number>();
    for (const b of (bills.data ?? []) as { day_entry_id: string; paid_by: string; amount_cents: number }[]) {
      if (weekIds.has(b.day_entry_id)) paid.set(b.paid_by, (paid.get(b.paid_by) ?? 0) + b.amount_cents);
    }
    const topPayer = [...paid].sort((a, b) => b[1] - a[1])[0];

    const times = topCount === 1 ? 'once' : topCount === 2 ? 'twice' : `${topCount} times`;
    const parts = [
      meals.length > 1 && topCount > 1 ? `${topName} won ${times}.` : `Last up: ${topName}.`,
      weekVetoes.length
        ? `${weekVetoes.length} ${weekVetoes.length === 1 ? 'veto' : 'vetoes'}${topVetoer ? `, most from ${memberName.get(topVetoer[0]) ?? 'someone'}` : ''}.`
        : 'No vetoes.',
      topPayer ? `${memberName.get(topPayer[0]) ?? 'Someone'} paid the most (RM${(topPayer[1] / 100).toFixed(2)}).` : null,
    ];
    return {
      title: `Your week: ${meals.length} ${meals.length === 1 ? 'meal' : 'meals'} decided`,
      body: parts.filter(Boolean).join(' '),
    };
  };
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
    db.from('rooms').select('id, timezone, rotation_start, decision_mode, fixed_days').in('id', roomIds),
    db.from('members').select('id, room_id, name, sort_order, created_at, left_at').in('room_id', roomIds),
    // A week back for the recap, plus enough for any timezone's "today".
    db
      .from('day_entries')
      .select('id, room_id, entry_date, decider_id, status, meal, food_option_id, custom_food, meet_at, meet_place, meet_alerted')
      .in('room_id', roomIds)
      .gte('entry_date', new Date(Date.now() - 9 * 86_400_000).toISOString().slice(0, 10)),
  ]);
  if (rooms.error || members.error || entries.error) {
    return json({ error: (rooms.error ?? members.error ?? entries.error)!.message }, 500);
  }

  const entryIds = (entries.data as Entry[]).map((e) => e.id);
  const picks = entryIds.length
    ? await db.from('secret_picks').select('day_entry_id, member_id').in('day_entry_id', entryIds)
    : { data: [] as { day_entry_id: string; member_id: string }[], error: null };
  const since = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
  const [attendance, bills, settlements] = await Promise.all([
    db.from('attendance').select('room_id, entry_date, member_id').in('room_id', roomIds).eq('meal', 'lunch').eq('status', 'out').gte('entry_date', since),
    db.from('meal_bills').select('room_id, paid_by, amount_cents, split_between, items, from_kitty').in('room_id', roomIds),
    db.from('settlements').select('room_id, from_member, to_member, amount_cents').in('room_id', roomIds),
  ]);
  const outOn = (roomId: string, date: string) =>
    new Set(((attendance.data ?? []) as { room_id: string; entry_date: string; member_id: string }[]).filter((a) => a.room_id === roomId && a.entry_date === date).map((a) => a.member_id));
  const roomDebts = new Map<string, Payment[]>();
  const debtsIn = (roomId: string) => {
    if (!roomDebts.has(roomId)) {
      const b = ((bills.data ?? []) as (Bill & { room_id: string })[]).filter((x) => x.room_id === roomId);
      const p = ((settlements.data ?? []) as (Payment & { room_id: string })[]).filter((x) => x.room_id === roomId);
      roomDebts.set(roomId, b.length ? settleUp(balances(b, p)) : []);
    }
    return roomDebts.get(roomId)!;
  };
  const now = new Date();
  // Meet-ups starting in the next ~10 minutes that haven't had their "leaving soon" alert.
  const leavingSoon = (entries.data as Entry[]).filter((e) => {
    if (e.status !== 'accepted' || !e.meet_at || e.meet_alerted) return false;
    const ms = Date.parse(e.meet_at) - now.getTime();
    return ms > 0 && ms <= 12 * 60_000;
  });
  const recapFor = await weeklyRecaps(entries.data as Entry[], members.data as Member[]);

  for (const sub of subs) {
    const room = (rooms.data as Room[]).find((r) => r.id === sub.room_id);
    if (!room) continue;
    const local = localNow(room.timezone, now);

    // Alerts on only.
    for (const e of sub.notify_events ? leavingSoon.filter((x) => x.room_id === room.id) : []) {
      if (outOn(room.id, e.entry_date).has(sub.member_id) && (e.meal ?? 'lunch') === 'lunch') continue;
      const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: room.timezone }).format(new Date(e.meet_at!));
      const result = await send(sub, { ...message({ type: 'leaving', time, place: e.meet_place ?? '' }, sub.lang), url: `/?room=${room.id}#today`, tag: `makan-leaving-${e.id}` });
      if (result === 'gone') break;
      summary[result]++;
    }

    if (sub.weekly_recap && local.weekday === 0 && local.hour >= RECAP_HOUR && sub.last_recap_on !== local.date) {
      const recap = recapFor(room.id, local.date);
      if (recap) {
        const result = await send(sub, { ...recap, url: `/?room=${room.id}#history`, tag: `makan-recap-${room.id}-${local.date}` });
        if (result === 'gone') {
          summary.removed++;
          continue;
        }
        summary[result]++;
      }
      // A failed recap isn't retried: next week's will do.
      await db.from('push_subscriptions').update({ last_recap_on: local.date }).eq('id', sub.id);
    }

    if (local.hour < sub.remind_hour || sub.last_sent_on === local.date) continue;
    summary.due++;

    const entry = (entries.data as Entry[]).find((e) => e.room_id === room.id && e.entry_date === local.date && (e.meal ?? 'lunch') === 'lunch');
    const everyone = (members.data as Member[]).filter((m) => m.room_id === room.id);
    // People who left are out of the turns (their names still show on what they're owed).
    const roomMembers = everyone.filter((m) => !m.left_at);
    let reminder: { title: string; body: string } | null = null;
    const away = outOn(room.id, local.date);

    // Nothing for someone who said they're out today, or on a fixed day (it decides itself).
    const fixedDay = !!room.fixed_days?.[String(local.weekday)];
    if (entry?.status !== 'accepted' && !away.has(sub.member_id) && !fixedDay) {
      if (room.decision_mode === 'secret') {
        const picked = (picks.data ?? []).some((p) => p.day_entry_id === entry?.id && p.member_id === sub.member_id);
        if (!picked) reminder = message({ type: 'secret-open' }, sub.lang);
      } else {
        const decider = entry?.decider_id ?? deciderFor(roomMembers, room.rotation_start, local.date, away);
        if (decider === sub.member_id && entry?.status !== 'proposed') reminder = message({ type: 'your-turn' }, sub.lang);
      }
    }

    // Every few days, a gentle note to anyone who still owes money (alerts on only).
    const owed = debtsIn(room.id).filter((p) => p.from_member === sub.member_id);
    if (sub.notify_events && owed.length && (!sub.last_nudge_on || daysBetween(sub.last_nudge_on, local.date) >= NUDGE_EVERY_DAYS)) {
      const total = owed.reduce((n, p) => n + p.amount_cents, 0);
      const to = everyone.find((m) => m.id === owed[0].to_member)?.name ?? 'someone';
      const nudge = message({ type: 'nudge', to, amount: formatRM(total), several: owed.length > 1 }, sub.lang);
      const result = await send(sub, { ...nudge, url: `/?room=${room.id}#bills`, tag: `makan-owe-${room.id}-${local.date}` });
      if (result === 'gone') {
        summary.removed++;
        continue;
      }
      summary[result]++;
      await db.from('push_subscriptions').update({ last_nudge_on: local.date }).eq('id', sub.id);
    }

    if (reminder) {
      const result = await send(sub, { ...reminder, url: `/?room=${room.id}#today`, tag: `makan-${room.id}-${local.date}` });
      if (result === 'gone') {
        summary.removed++;
        continue;
      }
      summary[result]++;
      if (result === 'failed') continue; // try again next run
    } else {
      summary.notNeeded++;
    }
    await db.from('push_subscriptions').update({ last_sent_on: local.date }).eq('id', sub.id);
  }

  // Each meet-up gets its "leaving soon" alert once.
  if (leavingSoon.length) await db.from('day_entries').update({ meet_alerted: true }).in('id', leavingSoon.map((e) => e.id));

  console.log('send-reminders', JSON.stringify(summary));
  return json(summary);
});
