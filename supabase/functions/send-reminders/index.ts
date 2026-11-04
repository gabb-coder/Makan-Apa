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
//
// Auto-decide (rooms with it on, decider mode): if nobody has picked by 11:30 (6:30pm for dinner)
// the decider gets a nudge; at 12:00 (7pm) the wheel picks for them, and everyone can accept or
// veto as usual. Days the room doesn't eat together (weekends, holidays) get no reminders.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import webpush from 'npm:web-push@3.6.7';
import { message, type Lang } from '../_shared/messages.ts';
import { balances, formatRM, settleUp, type Bill, type Payment } from '../_shared/money.ts';
import { isEatingDay, turnIndex, type Rotation } from '../_shared/calendar.ts';
import { autoPhase, pickFood, pickTime, type Meal, type PickFood } from '../_shared/autopick.ts';

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
  rotation_offset: number;
  eat_days: number[];
  skip_holidays: boolean;
  decision_mode: 'decider' | 'secret';
  fixed_days: Record<string, string> | null;
  meals: 'lunch' | 'both';
}
const ROOM_COLUMNS = 'id, timezone, rotation_start, rotation_offset, eat_days, skip_holidays, decision_mode, fixed_days, meals';
const rotationOf = (r: Room): Rotation => ({ start: r.rotation_start, offset: r.rotation_offset ?? 0, cal: { days: r.eat_days, holidays: r.skip_holidays } });
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
  const minute = Number(new Intl.DateTimeFormat('en-GB', { timeZone, minute: '2-digit' }).format(now));
  return { date, hour: Number(get('hour')), minutes: Number(get('hour')) * 60 + minute, weekday: new Date(`${date}T00:00:00Z`).getUTCDay() };
}

function addDays(date: string, n: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

const RECAP_HOUR = 20; // Sunday, 8pm room time

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Same rule as the app (src/lib/rotation.ts): one eating day each, skipping whoever's out. */
function deciderFor(members: Member[], rot: Rotation, date: string, away: Set<string>, meal: Meal = 'lunch'): string | null {
  if (!members.length) return null;
  const sorted = [...members].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
  const n = sorted.length;
  const i = (((turnIndex(rot, date) + (meal === 'dinner' ? 1 : 0)) % n) + n) % n;
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
    ids.length ? db.from('meal_bills').select('day_entry_id, paid_by, amount_cents').in('day_entry_id', ids).eq('from_kitty', false).eq('treat', false) : { data: [] },
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

/**
 * Auto-decide for every room that has it on: nudge deciders who haven't picked, then let the wheel
 * pick for them. Each step happens once per meal (auto_decisions). The wheel's pick goes in as a
 * proposal, so the room can still accept or veto it; the notify function announces it.
 */
async function autoDecide(now: Date, subs: Sub[]): Promise<{ nudged: number; autoPicked: number }> {
  const done = { nudged: 0, autoPicked: 0 };
  const { data: roomRows, error } = await db.from('rooms').select(ROOM_COLUMNS).eq('auto_decide', true).eq('decision_mode', 'decider');
  if (error || !roomRows?.length) return done;
  // What's due in each room right now, by its own clock.
  const due: { room: Room; meal: Meal; date: string; phase: 'nudge' | 'pick' }[] = [];
  for (const room of roomRows as Room[]) {
    const local = localNow(room.timezone, now);
    for (const meal of room.meals === 'both' ? (['lunch', 'dinner'] as const) : (['lunch'] as const)) {
      const phase = autoPhase(meal, local.minutes);
      // A fixed day decides itself.
      if (!phase || (meal === 'lunch' && room.fixed_days?.[String(local.weekday)])) continue;
      due.push({ room, meal, date: local.date, phase });
    }
  }
  if (!due.length) return done;

  const ids = [...new Set(due.map((d) => d.room.id))];
  const dates = [...new Set(due.map((d) => d.date))];
  const since = addDays(dates.sort()[0], -14);
  const [log, people, recent, out, foodRows] = await Promise.all([
    db.from('auto_decisions').select('room_id, entry_date, meal, nudged_at, decided_at').in('room_id', ids).in('entry_date', dates),
    db.from('members').select('id, room_id, name, sort_order, created_at, left_at, diet, budget').in('room_id', ids).is('left_at', null),
    db.from('day_entries').select('id, room_id, entry_date, meal, decider_id, status, food_option_id, vote_options').in('room_id', ids).gte('entry_date', since),
    db.from('attendance').select('room_id, entry_date, meal, member_id').in('room_id', ids).in('entry_date', dates).eq('status', 'out'),
    db.from('food_options').select('id, room_id, name, diet, price').in('room_id', ids).eq('is_active', true),
  ]);
  type Row = { id: string; room_id: string; entry_date: string; meal: Meal | null; decider_id: string | null; status: string; food_option_id: string | null; vote_options: string[] | null };
  const entries = (recent.data ?? []) as Row[];
  const todayIds = entries.filter((e) => dates.includes(e.entry_date)).map((e) => e.id);
  const vetoRows = todayIds.length ? ((await db.from('vetoes').select('day_entry_id, rejected_food').in('day_entry_id', todayIds)).data ?? []) : [];

  for (const { room, meal, date, phase } of due) {
    const mark = ((log.data ?? []) as { room_id: string; entry_date: string; meal: Meal; nudged_at: string | null; decided_at: string | null }[]).find(
      (l) => l.room_id === room.id && l.entry_date === date && l.meal === meal,
    );
    if (phase === 'nudge' ? mark?.nudged_at || mark?.decided_at : mark?.decided_at) continue;
    const rot = rotationOf(room);
    const entry = entries.find((e) => e.room_id === room.id && e.entry_date === date && (e.meal ?? 'lunch') === meal);
    // Already picked, a vote is on, or a day off nobody started: nothing to do.
    if (entry && (entry.status !== 'pending' || entry.vote_options)) continue;
    if (!entry && !isEatingDay(date, rot.cal)) continue;
    const away = new Set(((out.data ?? []) as { room_id: string; entry_date: string; meal: Meal; member_id: string }[]).filter((a) => a.room_id === room.id && a.entry_date === date && a.meal === meal).map((a) => a.member_id));
    const members = ((people.data ?? []) as (Member & { diet: string[] | null; budget: number | null })[]).filter((m) => m.room_id === room.id);
    const present = members.filter((m) => !away.has(m.id));
    if (!present.length) continue;
    const decider = entry?.decider_id ?? deciderFor(members, rot, date, away, meal);
    if (!decider) continue;

    if (phase === 'nudge') {
      for (const sub of subs.filter((s) => s.room_id === room.id && s.member_id === decider)) {
        const text = message({ type: 'auto-nudge', meal, time: pickTime(meal) }, sub.lang);
        if ((await send(sub, { ...text, url: `/?room=${room.id}#today`, tag: `makan-auto-${room.id}-${date}-${meal}` })) === 'sent') done.nudged++;
      }
      await db.from('auto_decisions').upsert({ room_id: room.id, entry_date: date, meal, nudged_at: now.toISOString() });
      continue;
    }

    // The wheel's turn: foods eaten lately are much less likely, like on the app's wheel.
    const daysSince = new Map<string, number>();
    for (const e of entries) {
      if (e.room_id !== room.id || e.status !== 'accepted' || !e.food_option_id || e.entry_date >= date) continue;
      const d = daysBetween(e.entry_date, date);
      if (!daysSince.has(e.food_option_id) || d < daysSince.get(e.food_option_id)!) daysSince.set(e.food_option_id, d);
    }
    const vetoed = new Set((vetoRows as { day_entry_id: string; rejected_food: string }[]).filter((v) => v.day_entry_id === entry?.id).map((v) => v.rejected_food.toLowerCase()));
    const foods = ((foodRows.data ?? []) as (PickFood & { room_id: string })[]).filter((f) => f.room_id === room.id);
    const food = pickFood(foods, present, vetoed, daysSince, Math.random());
    await db.from('auto_decisions').upsert({ room_id: room.id, entry_date: date, meal, nudged_at: mark?.nudged_at ?? null, decided_at: now.toISOString() });
    if (!food) continue;
    let entryId = entry?.id;
    if (!entryId) {
      await db.from('day_entries').upsert({ room_id: room.id, entry_date: date, meal, decider_id: decider, status: 'pending' }, { onConflict: 'room_id,entry_date,meal', ignoreDuplicates: true });
      const { data } = await db.from('day_entries').select('id').eq('room_id', room.id).eq('entry_date', date).eq('meal', meal).maybeSingle();
      entryId = (data as { id: string } | null)?.id;
    }
    if (!entryId) continue;
    // Only if it's still waiting: someone may have picked a moment ago.
    const { data: updated } = await db
      .from('day_entries')
      .update({ status: 'proposed', food_option_id: food.id, custom_food: null, method: 'wheel', auto_picked: true })
      .eq('id', entryId)
      .eq('status', 'pending')
      .is('vote_options', null)
      .select('id');
    if (updated?.length) done.autoPicked++;
  }
  return done;
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
  const auto = await autoDecide(new Date(), subs);
  const summary = { subscriptions: subs.length, due: 0, sent: 0, notNeeded: 0, removed: 0, failed: 0, ...auto };
  if (!subs.length) {
    console.log('send-reminders', JSON.stringify(summary));
    return json(summary);
  }

  const roomIds = [...new Set(subs.map((s) => s.room_id))];
  const [rooms, members, entries] = await Promise.all([
    db.from('rooms').select(ROOM_COLUMNS).in('id', roomIds),
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
  const [attendance, mealBills, settlements, eventBills] = await Promise.all([
    db.from('attendance').select('room_id, entry_date, member_id').in('room_id', roomIds).eq('meal', 'lunch').eq('status', 'out').gte('entry_date', since),
    db.from('meal_bills').select('room_id, paid_by, amount_cents, split_between, items, from_kitty, treat, birthday').in('room_id', roomIds),
    db.from('settlements').select('room_id, from_member, to_member, amount_cents').in('room_id', roomIds),
    db.from('event_bills').select('room_id, paid_by, amount_cents, split_between, items, from_kitty, treat, birthday').in('room_id', roomIds),
  ]);
  // Meal and event bills both count towards who owes whom.
  const bills = { data: [...(mealBills.data ?? []), ...(eventBills.data ?? [])] };
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

    // Nothing for someone who said they're out today, on a fixed day (it decides itself), or on a
    // day the room doesn't eat together (unless someone started one anyway).
    const fixedDay = !!room.fixed_days?.[String(local.weekday)];
    const offDay = !entry && !isEatingDay(local.date, rotationOf(room).cal);
    if (entry?.status !== 'accepted' && !away.has(sub.member_id) && !fixedDay && !offDay) {
      if (room.decision_mode === 'secret') {
        const picked = (picks.data ?? []).some((p) => p.day_entry_id === entry?.id && p.member_id === sub.member_id);
        if (!picked) reminder = message({ type: 'secret-open' }, sub.lang);
      } else {
        const decider = entry?.decider_id ?? deciderFor(roomMembers, rotationOf(room), local.date, away);
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
