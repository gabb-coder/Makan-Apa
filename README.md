# Makan apa?

A mobile-first food decider for makan kakis: a daily decider rotation, a shared food list and a spin wheel. See [`SPEC.md`](SPEC.md) for the full build spec and [`design/`](design/) for the reference mockups.

## Run locally

```bash
npm install
npm run dev
```

Then open the URL Vite prints (use your browser's phone emulation at 390×844 for the intended layout). `npm run build` type-checks and builds to `dist/`.

## Backend

Supabase project `makan-apa` (Singapore). The public URL and publishable key live in [`.env`](.env); they are meant to ship to browsers, so they are committed. Put anything secret in `.env.local`. The schema is in [`supabase/migrations/`](supabase/migrations/).

### Reminders

Push reminders need the app served over HTTPS (any static host works). On iPhone they need iOS 16.4+ and the app added to the Home Screen.

- `supabase/functions/send-reminders` is deployed with JWT checks off; it only accepts calls carrying the cron secret.
- The cron secret and the VAPID key pair are generated inside Supabase and stored in the `private` schema, which the public API can't reach. Browsers only get the VAPID public key (`rpc/vapid_public_key`).
- `push_subscriptions` has RLS on and no policies; browsers use the `subscribe_push`, `unsubscribe_push` and `push_status` functions, keyed by their own push endpoint.

### Rooms and identity

There are no accounts. A phone joins a room with a name and the room code, and remembers its `room_id` and `member_id` in `localStorage`. Joining again with the same name (on a new phone, or after leaving) continues as that member. Invite links look like `https://<host>/?join=K7M2QX`.

## Build progress

- [x] **Phase 1: design shell + wheel.** Fonts, colour tokens, tab bar, and the Wheel screen with a hard-coded starter list, weighted spin, pointer tick, confetti burst and result card.
- [x] **Phase 2: food list + Supabase.** Schema with RLS and Realtime, add / edit / archive / delete foods (name, tags, icon, colour), search and tag filter, starter pack, live sync between phones. The wheel now spins the saved list.
- [x] **Phase 3: rooms, members and live sync.** Join screen (create or join by code, invite links), identity in localStorage, Settings (share code, member names, colours and decider order, veto limit, rotation start, timezone, leave room), live sync of room settings and members.
- [x] **Phase 4: daily rotation, propose, accept and veto.** Today screen with the decider card, Up next and Recently; pick from the list, type your own or spin; proposal with accept and veto (veto limit enforced, vetoed foods off the wheel for the day); "It's decided" with Find one nearby; undo for accept and veto.
- [x] **Phase 5: history, stats and weighting.** History screen with a month picker, count-up stats (meals, best no-repeat streak, vetoes by person), who decided, most eaten (top 3, expandable to 10), the month's meals with veto badges, and a More section (haven't had in a while, most vetoed, by tag). The wheel's recently-eaten penalty uses the shared history.
- [x] **Phase 6: polish.** Wheel tick sounds that follow the real rotation, a landing chime and a mute toggle (Web Audio, no files); dark mode that follows the phone with a System / Light / Dark choice; installable PWA (manifest, icons, offline app shell via a service worker, Add to Home Screen help in Settings); friendly offline state that reconnects on its own. Confetti and the starter pack landed in earlier phases.
- [x] **Phase 7: extras.** Secret picks mode (pick in secret, reveal when everyone's in, one shared spin that every phone watches land), better 3+ member support (wording, removing members; their past meals stay in history), Google Maps link on results.
- [x] **Phase 7: daily reminder.** Web Push: a "Daily reminder" switch and hour in Settings; the `send-reminders` Edge Function, run every 15 minutes by `pg_cron`, notifies today's decider (or, in secret picks mode, anyone who hasn't picked) at their chosen hour in the room's timezone until the day is decided.
