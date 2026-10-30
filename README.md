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

There are no accounts. A phone joins a room with a name and the room code, and remembers its `room_id` and `member_id` in `localStorage`. Joining again with the same name (on a new phone, or after leaving) continues as that member. Invite links look like `https://<host>/?join=K7M2QX`.

## Build progress

- [x] **Phase 1: design shell + wheel.** Fonts, colour tokens, tab bar, and the Wheel screen with a hard-coded starter list, weighted spin, pointer tick, confetti burst and result card.
- [x] **Phase 2: food list + Supabase.** Schema with RLS and Realtime, add / edit / archive / delete foods (name, tags, icon, colour), search and tag filter, starter pack, live sync between phones. The wheel now spins the saved list.
- [x] **Phase 3: rooms, members and live sync.** Join screen (create or join by code, invite links), identity in localStorage, Settings (share code, member names, colours and decider order, veto limit, rotation start, timezone, leave room), live sync of room settings and members.
- [ ] Phase 4: daily rotation, propose, accept and veto
- [ ] Phase 5: history, stats and weighting from real data
- [ ] Phase 6: polish
- [ ] Phase 7: Phase 2 extras
