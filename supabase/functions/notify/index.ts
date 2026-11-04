// notify: called by database triggers (migrations/*_attendance_tapau_alerts.sql) when something
// happens in a room, and pushes it to the other phones that have notifications on:
//   proposed  the decider sent a pick         → everyone else who's in: accept or veto
//   decided   the meal was agreed             → everyone else who's in (a mystery pick: no food named)
//             the wheel picked as nobody had  → everyone who's in, the decider too (as a proposal)
//   bill      a bill was added or changed     → everyone with a share, but not the payer
//   tapau     someone started a tapau run     → everyone else who's in: add your order
//   order     someone added a tapau order     → the runner
//   vote      the decider started a quick vote → everyone else who's in
//   meet      a meet-up time was set          → everyone else who's in
//   late      someone's running late          → everyone else who's in
//   chat      a message in the room's chat    → everyone else
//   join      someone asked to join a locked room → the host
//   event     someone planned an event        → everyone else
// The person who did it (actor) never gets their own alert.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import webpush from 'npm:web-push@3.6.7';
import { message, type Event, type Lang, type Meal } from '../_shared/messages.ts';
import { formatRM, shares, type Bill } from '../_shared/money.ts';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const VAPID_SUBJECT = 'https://github.com/gabb-coder/Makan-Apa';

interface Sub {
  id: string;
  member_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  lang: Lang;
}
interface Entry {
  id: string;
  room_id: string;
  entry_date: string;
  meal: Meal | null;
  decider_id: string | null;
  status: string;
  food_option_id: string | null;
  custom_food: string | null;
  vote_options: string[] | null;
  meet_at: string | null;
  meet_place: string | null;
  auto_picked: boolean;
  mystery: boolean;
  mystery_revealed: boolean;
}

/** When the wheel picks if nobody has (send-reminders), by meal. */
const AUTO_AT: Record<Meal, string> = { lunch: '12:00', dinner: '19:00' };

/** "12:30" in the room's timezone. */
function clock(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(new Date(iso));
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function foodName(entry: Entry): Promise<string> {
  if (entry.food_option_id) {
    const { data } = await db.from('food_options').select('name').eq('id', entry.food_option_id).maybeSingle();
    if (data) return (data as { name: string }).name;
  }
  return entry.custom_food ?? 'Lunch';
}

async function entry(id: string): Promise<Entry | null> {
  const { data } = await db.from('day_entries').select('id, room_id, entry_date, meal, decider_id, status, food_option_id, custom_food, vote_options, meet_at, meet_place, auto_picked, mystery, mystery_revealed').eq('id', id).maybeSingle();
  return (data as Entry | null) ?? null;
}

/** Who said they're out for that meal. */
async function awayFor(e: Entry): Promise<Set<string>> {
  const { data } = await db.from('attendance').select('member_id').eq('room_id', e.room_id).eq('entry_date', e.entry_date).eq('meal', e.meal ?? 'lunch').eq('status', 'out');
  return new Set(((data ?? []) as { member_id: string }[]).map((r) => r.member_id));
}

Deno.serve(async (req) => {
  const { data: config, error: configError } = await db.rpc('push_config');
  if (configError) return json({ error: configError.message }, 500);
  if (!config?.cron_secret || req.headers.get('x-cron-secret') !== config.cron_secret) return json({ error: 'forbidden' }, 403);
  if (!config.vapid) return json({ skipped: 'no vapid keys yet' });
  const keys = JSON.parse(config.vapid) as { publicKey: string; privateKey: string };
  webpush.setVapidDetails(VAPID_SUBJECT, keys.publicKey, keys.privateKey);

  const { type, room_id: roomId, id, actor } = (await req.json()) as { type: string; room_id: string; id: string; actor: string | null };
  const [subsRes, membersRes] = await Promise.all([
    db.from('push_subscriptions').select('id, member_id, endpoint, p256dh, auth, lang').eq('room_id', roomId).eq('notify_events', true),
    db.from('members').select('id, name').eq('room_id', roomId),
  ]);
  const subs = (subsRes.data ?? []) as Sub[];
  if (!subs.length) return json({ sent: 0 });
  const nameOf = (mid: string | null) => ((membersRes.data ?? []) as { id: string; name: string }[]).find((m) => m.id === mid)?.name ?? 'Someone';

  // Each recipient's event (their share differs on a bill), plus where a tap goes.
  const recipients = new Map<string, Event>();
  // Tapping it opens this room (the home screen otherwise).
  let url = `/?room=${roomId}#today`;
  let tag = `makan-${type}-${id}`;

  if (type === 'proposed' || type === 'decided') {
    const e = await entry(id);
    if (!e || e.status !== (type === 'proposed' ? 'proposed' : 'accepted')) return json({ skipped: 'stale' });
    const [food, away] = await Promise.all([foodName(e), awayFor(e)]);
    const meal = e.meal ?? 'lunch';
    // The wheel picked because nobody had: everyone hears, the decider included. A mystery pick
    // keeps the food out of the alert.
    const auto = type === 'proposed' && e.auto_picked;
    const mystery = type === 'decided' && e.mystery && !e.mystery_revealed;
    const ev: Event = auto
      ? { type: 'auto-picked', decider: nameOf(e.decider_id), food, meal, time: AUTO_AT[meal] }
      : mystery
        ? { type: 'mystery', decider: nameOf(e.decider_id), meal }
        : type === 'proposed'
          ? { type, decider: nameOf(e.decider_id), food, meal }
          : { type, food, meal };
    const skip = auto ? null : type === 'proposed' || mystery ? e.decider_id : null;
    for (const s of subs) if (s.member_id !== actor && s.member_id !== skip && !away.has(s.member_id)) recipients.set(s.member_id, ev);
    tag = `makan-day-${id}`;
  } else if (type === 'bill') {
    const { data } = await db.from('meal_bills').select('*').eq('day_entry_id', id).maybeSingle();
    const bill = data as (Bill & { day_entry_id: string }) | null;
    const e = bill && (await entry(bill.day_entry_id));
    if (!bill || !e) return json({ skipped: 'stale' });
    const food = await foodName(e);
    const each = shares(bill);
    for (const [mid, cents] of each) {
      // From the kitty nobody's owed, so the keeper hears about their share too.
      if ((!bill.from_kitty && mid === bill.paid_by) || mid === actor || cents <= 0) continue;
      recipients.set(
        mid,
        bill.treat && !bill.from_kitty
          ? { type: 'treat', payer: nameOf(bill.paid_by), food }
          : bill.from_kitty
          ? { type: 'kitty', amount: formatRM(bill.amount_cents), food, share: formatRM(cents) }
          : { type: 'bill', payer: nameOf(bill.paid_by), amount: formatRM(bill.amount_cents), food, share: formatRM(cents) },
      );
    }
    url = `/?room=${roomId}#bills`;
    tag = `makan-bill-${id}`;
  } else if (type === 'tapau') {
    const { data } = await db.from('tapau_runs').select('id, runner_id, place, day_entry_id').eq('id', id).maybeSingle();
    const run = data as { runner_id: string; place: string; day_entry_id: string } | null;
    const e = run && (await entry(run.day_entry_id));
    if (!run || !e) return json({ skipped: 'stale' });
    const away = await awayFor(e);
    for (const s of subs) if (s.member_id !== run.runner_id && s.member_id !== actor && !away.has(s.member_id)) recipients.set(s.member_id, { type: 'tapau', runner: nameOf(run.runner_id), place: run.place });
  } else if (type === 'order') {
    const { data } = await db.from('tapau_orders').select('member_id, item, qty, run_id, tapau_runs(runner_id)').eq('id', id).maybeSingle();
    const order = data as { member_id: string; item: string; qty: number; run_id: string; tapau_runs: { runner_id: string } | null } | null;
    const runner = order?.tapau_runs?.runner_id;
    if (!order || !runner || runner === actor) return json({ skipped: 'own order' });
    recipients.set(runner, { type: 'order', who: nameOf(order.member_id), item: order.qty > 1 ? `${order.qty}× ${order.item}` : order.item });
    tag = `makan-orders-${order.run_id}`;
  } else if (type === 'vote' || type === 'meet') {
    const e = await entry(id);
    if (!e) return json({ skipped: 'stale' });
    const away = await awayFor(e);
    let ev: Event;
    if (type === 'vote') {
      if (!e.vote_options || e.status === 'accepted') return json({ skipped: 'stale' });
      ev = { type, decider: nameOf(e.decider_id), options: e.vote_options.join(' · ') };
    } else {
      if (!e.meet_at) return json({ skipped: 'stale' });
      const { data: room } = await db.from('rooms').select('timezone').eq('id', roomId).maybeSingle();
      ev = { type, time: clock(e.meet_at, (room as { timezone: string } | null)?.timezone ?? 'Asia/Kuala_Lumpur'), place: e.meet_place ?? '—' };
    }
    for (const s of subs) if (s.member_id !== actor && !away.has(s.member_id)) recipients.set(s.member_id, ev);
    tag = `makan-${type}-${id}`;
  } else if (type === 'late') {
    // id is the member who's running late.
    const ev: Event = { type, who: nameOf(id) };
    for (const s of subs) if (s.member_id !== id) recipients.set(s.member_id, ev);
    tag = `makan-late-${id}`;
  } else if (type === 'chat') {
    const [{ data: msg }, { data: room }] = await Promise.all([
      db.from('messages').select('member_id, body').eq('id', id).maybeSingle(),
      db.from('rooms').select('name, code').eq('id', roomId).maybeSingle(),
    ]);
    const m = msg as { member_id: string; body: string } | null;
    if (!m) return json({ skipped: 'stale' });
    const r = room as { name: string | null; code: string } | null;
    const text = m.body.length > 140 ? `${m.body.slice(0, 139)}…` : m.body;
    for (const s of subs) if (s.member_id !== m.member_id) recipients.set(s.member_id, { type: 'chat', who: nameOf(m.member_id), room: r?.name || r?.code || '', text });
    url = `/?room=${roomId}#chat`;
    // One notification per room, replaced by the newest message.
    tag = `makan-chat-${roomId}`;
  } else if (type === 'join') {
    const [{ data: req }, { data: room }, { data: people }] = await Promise.all([
      db.from('join_requests').select('name, status').eq('id', id).maybeSingle(),
      db.from('rooms').select('name, code, host_id').eq('id', roomId).maybeSingle(),
      db.from('members').select('id, left_at, created_at').eq('room_id', roomId).is('left_at', null).order('created_at').order('id'),
    ]);
    const r = req as { name: string; status: string } | null;
    const rm = room as { name: string | null; code: string; host_id: string | null } | null;
    const active = (people ?? []) as { id: string }[];
    // Same rule as private.room_host_id: who it was handed to, else the longest-standing member.
    const host = active.find((m) => m.id === rm?.host_id)?.id ?? active[0]?.id;
    if (!r || r.status !== 'pending' || !host) return json({ skipped: 'stale' });
    recipients.set(host, { type: 'join', who: r.name, room: rm?.name || rm?.code || '' });
    tag = `makan-join-${id}`;
  } else if (type === 'event') {
    const [{ data: ev }, { data: room }] = await Promise.all([
      db.from('events').select('title, starts_at, place, created_by').eq('id', id).maybeSingle(),
      db.from('rooms').select('timezone').eq('id', roomId).maybeSingle(),
    ]);
    const e = ev as { title: string; starts_at: string; place: string | null; created_by: string | null } | null;
    if (!e) return json({ skipped: 'stale' });
    const tz = (room as { timezone: string } | null)?.timezone ?? 'Asia/Kuala_Lumpur';
    const when = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz }).format(new Date(e.starts_at)) + (e.place ? ` · ${e.place}` : '');
    for (const s of subs) if (s.member_id !== e.created_by && s.member_id !== actor) recipients.set(s.member_id, { type: 'event', who: nameOf(e.created_by), title: e.title, when });
    tag = `makan-event-${id}`;
  } else {
    return json({ error: 'unknown type' }, 400);
  }

  let sent = 0;
  let removed = 0;
  for (const s of subs) {
    const ev = recipients.get(s.member_id);
    if (!ev) continue;
    const text = message(ev, s.lang);
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ ...text, url, tag }), { TTL: 3 * 60 * 60 });
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await db.from('push_subscriptions').delete().eq('id', s.id);
        removed++;
      } else console.error('send failed', status, String(e).slice(0, 200));
    }
  }
  console.log('notify', JSON.stringify({ type, recipients: recipients.size, sent, removed }));
  return json({ sent, removed });
});
