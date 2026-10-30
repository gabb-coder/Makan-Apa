# Makan apa?

A mobile-first food decider for makan kakis: a daily decider rotation, a shared food list and a spin wheel. See [`SPEC.md`](SPEC.md) for the full build spec and [`design/`](design/) for the reference mockups.

## Run locally

```bash
npm install
npm run dev
```

Then open the URL Vite prints (use your browser's phone emulation at 390×844 for the intended layout). `npm run build` type-checks and builds to `dist/`.

## Build progress

- [x] **Phase 1: design shell + wheel.** Fonts, colour tokens, tab bar, and the Wheel screen with a hard-coded starter list, weighted spin, pointer tick, confetti burst and result card.
- [ ] Phase 2: food list + Supabase
- [ ] Phase 3: rooms, members and live sync
- [ ] Phase 4: daily rotation, propose, accept and veto
- [ ] Phase 5: history, stats and weighting from real data
- [ ] Phase 6: polish
- [ ] Phase 7: Phase 2 extras
