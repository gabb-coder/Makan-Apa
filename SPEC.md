# Makan apa? (Food Decider): Build Spec

A small mobile-first web app for two friends (expandable to more) who never know what to eat. It has a spin wheel, a shared food pool, and a daily "decider" rotation, backed by a shared database so history and turns stay in sync across phones.

> **Instructions for Claude Code:** Read this whole file first, including section 4b (visual design and motion) and the reference mockups in `design/`. Build in the phases listed under "Build order", one phase at a time, and let me test each phase before moving on. Match the design closely. Ask me before changing the stack or the schema.

---

## 1. Goals

- Remove the "I don't know, you pick" loop.
- Each day has one designated **decider** who chooses what to eat.
- A **spin wheel** is available as a fun tiebreaker or backup.
- Everything is **shared and live** between phones, with **history** kept.
- Zero friction: no accounts, no passwords. A room code plus a name is enough.

## 2. Decider modes

**Default (MVP): "Decider picks."**
The day's decider either types or chooses a food directly, or builds a shortlist of 2-3 options and spins the wheel. The other member(s) can accept or veto.

**Optional (Phase 2): "Secret picks."**
Everyone submits a secret pick for the day. Once all have submitted, picks are revealed together and the wheel spins among them. Make this a per-room setting (`decision_mode`).

## 3. Tech stack

- **Frontend:** Vite + React (TypeScript), mobile-first CSS. The wheel is drawn with SVG or canvas.
- **Backend:** Supabase (Postgres + Realtime). No custom server for the MVP.
- **Hosting:** any static host (Render static site, Vercel, or Netlify).
- **Identity:** no auth. On join, store `room_id` and `member_id` in `localStorage` so the phone remembers who you are.

## 4. Screens

The app is called **Makan apa?** There is a bottom tab bar with four tabs: Today, Wheel, Food list and History. Each screen below has a matching mockup in `design/`.

1. **Join** (`design/Join.dc.html`): the app title, a "Your name" field and a "Room code" field side by side, a **Join room** button, and a **Create a new room** button. Footer: "No sign-up. Share the room code with your makan kakis."
2. **Today** (`design/Main.dc.html`):
   - Header: today's date, the "Makan apa?" title, and a room-code chip that opens Settings.
   - **Decider card**, a bold orange card:
     - If you are today's decider, it says "Your turn!" and shows **Spin the wheel** (primary), **Pick from list**, and **Type my own**.
     - If you are not, it shows the decider's name and status ("Gabriel is choosing…"). Once a proposal exists, show the Proposal view (screen 4).
   - **Up next:** the next 3 days, each with the decider's avatar.
   - **Recently:** the last 3 accepted meals with their food tiles, and a "See all" link to History.
3. **Wheel** (`design/Wheel.dc.html`):
   - A back button, then a toggle between "Whole list · N" and "My shortlist".
   - Tag filter chips.
   - The colourful wheel with a pointer at the top, and a note naming the foods that were eaten recently and are less likely to come up.
   - A big **SPIN** button.
   - After the spin, a result card with the food tile, the food's name, **Spin again**, and **Send to <other member>** (this creates the proposal).
4. **Proposal**, shown to the non-decider (`design/Proposal.dc.html`):
   - A big card in the food's colour, with the icon tile, a "Wheel pick" or "Picked directly" badge, the food name, its tags, and when it was last eaten.
   - **Let's go** (accept) and **Veto · N left today**, with a short explanation of what a veto does.
   - Accepting shows the "It's decided" celebration with **Find one nearby**, which opens Google Maps search for the food.
   - Vetoing shows "Back to <decider>".
5. **Food list** (`design/Pool.dc.html`): an **Add** button, search, and tag filter chips. Each row shows the food tile, name, tags, when it was last eaten, and a "Recent" badge if eaten in the last 3 days. Tapping a row opens edit, where you can rename, change tags, icon or colour, and archive or delete.
6. **History** (`design/History.dc.html`):
   - A month picker.
   - Stat cards: meals this month, best no-repeat streak, and vetoes.
   - A "Who decided" split bar.
   - A "Most eaten" bar chart (top 3).
   - A recent-meals list with veto badges.
7. **Settings** (not mocked; use the same card style): member names, colours and order (this decides the rotation), veto limit, rotation start date, timezone, copy or share the room code, and leave room.

## 4b. Visual design and motion

**Reference mockups:** `design/*.dc.html` holds one file per screen. They are written in a mockup template format (`<x-dc>`, `{{holes}}`, `<sc-if>`, `<sc-for>`), so don't run them. Read them for exact layout, spacing, colours, copy, SVG icon paths and `@keyframes`, then rebuild them as React components. The files map to screens like this: `Main` = Today, `Pool` = Food list.

**Layout**
- Designed at 390×844 and mobile-first.
- Page padding: 24px at the top, 20px at the sides.
- Bottom tab bar: 76px tall, white, with a top border. The active tab is accent-coloured.
- Cards: white with a 1px `#E6E6E2` border and 16–28px corner radius.
- All touch targets are at least 44px.

**Fonts (Google Fonts)**
- **Bricolage Grotesque** 700/800: headings, food names on cards, and big numbers.
- **Plus Jakarta Sans** 400–800: everything else.

**Colour tokens**

| Token | Value | Use |
|---|---|---|
| `bg` | `#F6F6F4` | App background |
| `surface` | `#FFFFFF` | Cards, tab bar |
| `border` | `#E6E6E2` | Card borders (`#D9D9D4` for inputs and secondary buttons) |
| `ink` | `#18181B` | Main text |
| `muted` | `#66666D` | Secondary text and labels |
| `accent` | `#CC3F17` | Primary buttons, decider card, active tab |
| `accent-ink` | `#A8330F` | Accent text on `accent-tint` |
| `accent-tint` | `#FBEDE8` | "Your turn" and "Recent" badges |
| `member-2` | `#2F6FD6` | Second member's avatar and bars |

**Food colours and icons.** Each food option has an `icon` and a `color` key. User-added foods get the next palette colour in rotation, and they can change both.

| Color key | Tile background | Icon/text colour | Wheel slice |
|---|---|---|---|
| leaf | `#DDEFD8` | `#2F6B2A` | `#A8D8A0` |
| mustard | `#FFF0C2` | `#8A5A00` | `#FFD966` |
| peach | `#FDE3CF` | `#9A4A12` | `#F6C59A` |
| tomato | `#FDDAD0` | `#A8330F` | `#FFB4A2` |
| sky | `#DCEAFB` | `#1F5596` | `#A9CDF4` |
| plum | `#F1E1F5` | `#7A3483` | `#DDBBE8` |
| sand | `#F5E6D0` | `#7A5222` | `#E9CC9F` |
| teal | `#D6F0EB` | `#1E6B62` | `#93D7CC` |

- **Icons:** `rice`, `bowl`, `pizza`, `sushi`, `burger`, `cup`. These are 24×24 stroke icons (stroke width 1.8, round caps). Copy their exact paths from the design files. Add more in the same style if needed.
- **Food tiles:** a 40–42px rounded square in the tile background, with the icon in the icon colour.
- **Wheel:**
  - Slices use the wheel-slice colours with 2px white dividers and a 5px ink rim.
  - White studs sit on the rim between slices.
  - Labels are 13px, weight 800, ink colour, running from the centre outward.
  - The hub is white with an ink ring and a tomato centre dot.
  - The pointer is an accent-coloured teardrop with a white outline at 12 o'clock.

**Motion** (CSS keyframes are enough; exact keyframes are in the design files)
- **Screen enter:** cards fade up 16px over 0.55s with `cubic-bezier(0.2, 0.8, 0.2, 1)`, staggered by about 0.12s.
- **Wheel, idle:** sways ±6° over 3.2s, and the SPIN button glows on a 2s loop.
- **Wheel, spinning:**
  - Pick the winner first (weighted, see section 6). Then rotate 6 full turns plus the offset that lands mid-slice, with ±12° jitter, over 4.2s using `cubic-bezier(0.12, 0.8, 0.16, 1)`.
  - The pointer ticks (rotates −24° and back) at a speed that slows as the wheel slows: 0.09s, then 0.15s from 1.5s, 0.26s from 2.7s, and 0.42s from 3.5s.
  - Optional: a tick sound per slice, with a mute toggle.
- **Wheel, landing:** a ring pulses outward from the wheel, a 12-piece confetti burst flies out from the centre, the result card pops in (scale 0.9 → 1.03 → 1), and the food tile wiggles every 3s.
- **Proposal:**
  - The card pops in, the icon tile floats, and the cup's steam rises.
  - Accept: falling confetti loop, the tick mark draws itself (stroke-dashoffset), and the food name pops in.
  - Veto: the card shakes and the X spins in.
- **Food list:** rows slide in from the left with a 0.05s stagger. Hovering a row wiggles its tile. The "Recent" badge pulses gently.
- **History:** stat numbers count up over 1.1s (ease-out cubic), and bars grow from 0 with a staggered delay. The streak card has a flickering flame icon.
- **Join:** the wheel rolls in from the right, then turns slowly (30s per turn). "apa?" pops in, then wiggles every 4s.
- **Today:** the wheel pattern behind the decider card turns slowly, the decider's avatar bobs, and **Spin the wheel** pulses.
- **Buttons:** scale to 0.95 on press.
- **Accessibility:** respect `prefers-reduced-motion` by turning off loops and confetti and making the wheel jump straight to the result.

## 5. Database schema (Supabase / Postgres)

```sql
create extension if not exists "pgcrypto";

create table rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,                       -- 6 chars, e.g. 'K7M2QX'
  timezone text not null default 'Asia/Kuala_Lumpur',
  rotation_start date not null default current_date,
  veto_limit int not null default 1,               -- vetoes per non-decider per day
  decision_mode text not null default 'decider'
    check (decision_mode in ('decider','secret')),
  created_at timestamptz not null default now()
);

create table members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  name text not null,
  color text not null default '#CC3F17',           -- avatar colour (see 4b)
  sort_order int not null default 0,               -- defines rotation order
  created_at timestamptz not null default now()
);

create table food_options (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  name text not null,
  tags text[] not null default '{}',               -- e.g. {'chinese','cheap','takeaway'}
  icon text not null default 'rice'
    check (icon in ('rice','bowl','pizza','sushi','burger','cup')),
  color text not null default 'leaf',              -- palette key from 4b
  added_by uuid references members(id) on delete set null,
  is_active boolean not null default true,         -- archive instead of hard delete
  created_at timestamptz not null default now()
);

create table day_entries (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  entry_date date not null,
  decider_id uuid not null references members(id),
  food_option_id uuid references food_options(id) on delete set null,
  custom_food text,                                -- used when the pick isn't in the pool
  method text check (method in ('direct','wheel')),
  status text not null default 'pending'
    check (status in ('pending','proposed','accepted')),
  created_at timestamptz not null default now(),
  unique (room_id, entry_date)
);

create table vetoes (
  id uuid primary key default gen_random_uuid(),
  day_entry_id uuid not null references day_entries(id) on delete cascade,
  member_id uuid not null references members(id),
  rejected_food text not null,                     -- store the name so stats survive pool edits
  created_at timestamptz not null default now()
);

-- Phase 2 (secret picks)
create table secret_picks (
  id uuid primary key default gen_random_uuid(),
  day_entry_id uuid not null references day_entries(id) on delete cascade,
  member_id uuid not null references members(id),
  food_text text not null,
  created_at timestamptz not null default now(),
  unique (day_entry_id, member_id)
);

create index on members (room_id);
create index on food_options (room_id) where is_active;
create index on day_entries (room_id, entry_date desc);
```

**Realtime:** enable Realtime on `day_entries`, `vetoes`, `food_options`, `members`, and `secret_picks`. Subscribe by `room_id` so both phones update instantly.

**Security (no-auth tradeoff):**
- Enable RLS on all tables.
- With no login, the simplest policy is permissive access using the anon key, where knowing the room code is the "password".
- Mitigations: use random 6+ character codes, never list rooms from the client, and always query by `room_id`.
- This is fine for a private friends app. If it ever goes public, add Supabase anonymous auth plus membership-based RLS policies.

## 6. Core logic

**Who is the decider today?**
`members` sorted by `sort_order`, then `index = daysBetween(rooms.rotation_start, today) mod members.length`. Use the room's timezone to decide what "today" is. The member at that index is the decider.

**Day entry lifecycle**
1. First visit to Today creates the `day_entries` row (`status = 'pending'`, `decider_id` computed).
2. The decider picks or spins, which sets the food and `method` and moves the status to `'proposed'`.
3. A non-decider **accepts**, which moves the status to `'accepted'` (the result is final and saved in history).
4. A non-decider **vetoes** (if they have vetoes left today), which inserts a `vetoes` row and sets the status back to `'pending'`. The vetoed food is excluded from the wheel and picker for the rest of the day.
5. If the veto limit is used up, the proposal stands and only Accept is shown.
6. The decider can also **override** after a veto with a direct pick.

**Wheel weighting ("recently eaten" penalty)**
For each active food option, compute `days_since_last_eaten` from accepted `day_entries`:
- Never eaten: weight `1.0`
- Otherwise: `weight = max(0.1, min(1, days_since / 7))`

Pick the winner with a weighted random draw, then animate the wheel so it lands on that segment. Slice sizes stay equal for readability, and the weighting is applied to the draw. Show a small "recently eaten" label on penalised items in the pool.

**Tag filtering:** filters on the Wheel screen narrow the candidate set before the spin. Multiple selected tags use AND by default, with a toggle for OR.

**Shortlist mode:** the decider can select 2-3 pool items (or type new ones) and spin only among them.

## 7. History and stats (simple SQL / client aggregates)

- Most-eaten foods (top 10).
- Decider streak and number of days each person decided.
- Veto count per person and most-vetoed foods.
- Cuisine or tag breakdown.
- "Haven't eaten in a while" list, which can feed suggestions.

## 8. UX details

- Big touch targets and thumb-friendly layout (the app lives on phones). Visual design and animation are specified in section 4b.
- Live presence line like "Gabriel is choosing…" is optional.
- Dark mode is a later extra. Design light mode first, as in the mockups.
- Empty states: if the pool has fewer than 2 items, prompt to add more or load a **starter pack**. The pack holds the 8 mockup foods with their icons and colours: Nasi Lemak (rice, leaf), Ramen (bowl, mustard), Chicken Rice (rice, peach), Pizza (pizza, tomato), Mixed Rice (rice, sky), Sushi (sushi, plum), Burger (burger, sand), Mamak (cup, teal).

## 9. Build order

1. **Design shell + wheel:** fonts, colour tokens, tab bar, and the Wheel screen with a hard-coded starter list. Include the full spin animation from 4b (pointer tick, confetti burst, result card).
2. **Pool + Supabase:** CRUD for food options saved to the database.
3. **Rooms + members + live sync:** create or join by code, name entry, localStorage identity, realtime subscriptions.
4. **Daily rotation:** the Today screen, decider computation, and the propose, accept and veto flow.
5. **History + weighting:** history list, the recently-eaten penalty, and stats.
6. **Polish:** sounds, confetti, dark mode, starter pack, PWA "Add to Home Screen".
7. **Phase 2 extras:** secret-picks mode, a daily reminder notification ("It's your turn to choose"), 3+ member support, and a Google Maps link on results.

## 10. Acceptance criteria (MVP)

- Two phones in the same room see the same pool and Today state within about 1 second of any change.
- The decider rotates correctly day to day and respects the member order and timezone.
- A veto returns the day to pending, excludes the vetoed food, and cannot exceed the veto limit.
- Accepted results appear in History and affect wheel weighting the next day.
- Refreshing or reopening the app keeps you in your room as the same member.
- Works smoothly at 375px width.

## 11. Open questions (defaults in brackets)

- Should the app allow 3+ members from the start? [Yes. The schema supports it, and rotation just cycles through members.]
- Should the decider be allowed to skip their day and hand it to the other person? [Not in MVP.]
- Should lunch and dinner be separate meals per day? [No. One decision per day for MVP. Add a `meal` column later if needed.]
