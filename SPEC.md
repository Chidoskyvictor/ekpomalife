# EKPOMA LIFE — Build Spec v2 (matches the repo as of 17 Oct 2026)

> This replaces the old "MVP implementation specification". The old one was written before any code existed (it asked for React + Vite, a 2D map, 4 archetypes and a ₦0 placeholder starter grant). The repo has moved past that. **The repo is the truth for what is built; this file is the truth for what comes next.**
>
> Verified against `C:\Users\USER\ekpomalife` (local working tree) on 17 Oct 2026. Note: GitHub `Chidoskyvictor/ekpomalife` is behind — last push 11 Oct (`aed8f21`). Locally there are 5 more commits up to `36545fb` and a **large uncommitted change set** (HUD, /live, starting money, map zones, migration 004, forgot/terms pages). Commit it before starting Phase 1.

---

## 0. Rules for Cursor (read first)

1. Follow this spec. If the code and this spec disagree, stop and say so; do not silently "fix" either.
2. **Server-authoritative.** Money, inventory, rewards, rent, jobs, dream progress and anything other players can see are decided on the Fastify API and stored in Postgres. The client only *asks* (`POST /actions/...`) and renders what the server returns. Never add a new client-only money path.
3. **Mobile-first.** Design for a ~390px phone and low data first, then desktop. Respect `hooks/use-low-perf.ts`.
4. **Don't change established UI styles.** Keep the glass HUD (`components/hud/*`, `life-hud.module.css`, `play-hud.module.css`), vaul drawers, Island toast, Arc components (`components/arc/*`), auth "lobby" look and create-flow studio look. Reuse them; don't restyle.
5. One phase = one prompt. Before coding, list the files you will touch. After coding, run `pnpm build` (and `npx tsc --noEmit` in `backend/`), run tests, then **update the Current status table (§3)**.
6. Next.js 16 is not the Next you know — check `node_modules/next/dist/docs/` (see `AGENTS.md`).
7. Content (prices, jobs, items, places, copy) lives in `lib/game/*` / `backend/src/game/*` data files, not inside components. Shared ids must match on both sides.
8. Don't invent campus landmarks beyond `MAP_ZONES`; move existing ones. Every CC-BY asset goes in `lib/game/asset-credits.ts`.
9. No secrets in git. Don't push unless asked. Respectful Ekpoma flavour, no stereotypes; fictional risky activities stay abstract (no real-world how-to).
10. Never claim a feature works or a test passed unless you ran it.

---

## 1. Game overview

**Ekpoma Life** is a mobile-first browser life-sim set in Ekpoma, Edo State, around Ambrose Alli University (AAU). You sign up, build your character (look → traits → dream → where you live), spin your starting money, and drop onto a 3D isometric AAU campus. From there you manage needs (hunger, energy, fun, social, hygiene, study), hustle for naira, pay rent to Baba Landlord, chase your dream, and — at launch — share the town with other players.

Tone: lively, funny, broke-but-hopeful, Naija campus vernacular ("You dey hungry, find mama put", "NEPA don take light"). Competitor reference: **Lagos Life** — we copy its lessons (no client-trusted money, chat by area, low data, ads/billboards, naira top-ups) but not its UI voice.

Audience: 18+ (checkbox + DOB at signup; not real age verification).

**Product principle:** make the player feel they are living a chaotic, funny, financially tight, socially connected life in Ekpoma.

---

## 2. Tech stack and architecture (as built)

| Layer | What is actually in the repo |
|---|---|
| Frontend | Next.js **16.3** App Router, React 19, TypeScript, pnpm |
| 3D | three 0.186, @react-three/fiber 9, drei 10; GLBs in `public/models/` (Kenney city kit, admin-block, parking lot, football stadium, trees, campusroad City Bits), meshopt (`lib/game/meshopt.ts`), `scripts/convert-buildings.mjs`, @gltf-transform dev deps |
| UI | CSS modules + Tailwind 4 globals, Arc components (`components/arc`), shadcn/radix bits (`components/ui`), framer-motion/motion, **vaul** drawers, @number-flow/react, canvas-confetti, lucide icons |
| Backend | `backend/` — **Fastify 5 + `pg` (raw SQL, no Prisma)**, zod, Argon2 (`argon2`), HttpOnly session cookie, @fastify/helmet, cors (credentials, `FRONTEND_ORIGIN`), rate-limit (100/min global, 5 per 15 min on signup) |
| DB | Postgres; migrations `backend/sql/001..004` run by `npm run db:migrate` |
| Persistence today | Auth + character creation + starting money = **server**. Live game state (cash spent, needs, location, feed) = **browser localStorage** (`ekpoma-life-save-v3:<username>`) ← must move server-side (Phase 1) |
| Hosting (decided) | Domain **ekpomalife.app** on Cloudflare (no DNS yet). Frontend → Cloudflare Pages. API → Node host at **api.ekpomalife.app**. **Vercel is no longer used** (but `@vercel/analytics` is still in `package.json` and the GitHub homepage still says ekpomalife.vercel.app — remove in Phase 7). |

Commands: `pnpm dev` · `cd backend && npm run dev` · `cd backend && npm run db:migrate`. Env: frontend `NEXT_PUBLIC_API_URL` (defaults to `http://localhost:4000`); backend `DATABASE_URL`, `FRONTEND_ORIGIN`, `PORT`.

Folder map (real):

```text
app/            page.tsx (game) · signup · login · forgot · terms · look · traits · dream · live
components/
  auth/         lobby shell, signup/login forms, DOB picker, password meter, floating stickers
  create/       create-stage, studio-panel, step-dots, starting-money-spin
  look/ traits/ dreams/ live/   the four create studios
  hud/          glass HUD (status bar, money pill, needs stack, Up Next, quest stack, clock pill,
                context dock, play nav, today/profile/settings sheets, hud-drawer (vaul),
                island toast, dream tracker/celebration, phone dialog, location sheet, event dialog)
  world/        canvas, ground, roads, zones, kenney, trees, fence, landmarks, admin-block, player-avatar
  arc/ ui/
hooks/          use-game.tsx (state + localStorage), use-player-stats, use-low-perf
lib/game/       types, rules, content, needs, quests, look, hair-config, outfit-config, traits, dreams,
                live (character types/lodging/courses), onboarding, creation, starting-money,
                share-dream, share-starting-money, character-api, accounts, api, world-layout,
                map-theme, road-bits, kenney-buildings, asset-credits, meshopt
backend/src/    server.ts · routes/{signup,login,character}.ts · auth/{password,session,schema,current-user}.ts
                game/{traits,dreams,look,onboarding,starting-money}.ts · db.ts env.ts ids.ts migrate.ts
backend/sql/    001_init · 002_characters · 003_character_look_traits · 004_starting_money (untracked)
```

---

## 3. Current status

Legend: ✅ DONE · 🟡 PARTIAL · ⬜ NOT STARTED

| Feature | Status | Files | Notes / what's missing |
|---|---|---|---|
| Signup / login (Argon2, cookie session) | ✅ | `backend/src/routes/{signup,login}.ts`, `auth/*`, `components/auth/*`, `lib/game/accounts.ts` | Email + DOB are checked on the client but **not sent/stored** server-side (users table has name, username, password_hash only). No logout route. Client also keeps a "session" username in localStorage. |
| /forgot page | 🟡 | `app/forgot/page.tsx` | Page only. No reset endpoint, no email. |
| /terms page | 🟡 | `app/terms/page.tsx` | Exists; needs legal review before launch. |
| Look (body, hair, outfit, fabric/colours, GLB) | ✅ | `app/look`, `components/look/*`, `lib/game/look.ts`, `hair-config.ts`, `outfit-config.ts`, `backend/src/game/look.ts` | Server-validated via `POST /character/look`. Hair GLBs fitted per style; dev-only debug panel. |
| Traits (pick exactly 2 of 10) | ✅ | `app/traits`, `components/traits/*`, `lib/game/traits.ts`, `backend/src/game/traits.ts` | Server rejects if look not done. Traits have **no in-game effect yet** except starting-money modifiers. |
| Dreams | 🟡 | `app/dream`, `components/dreams/*`, `lib/game/dreams.ts`, `backend/src/game/dreams.ts`, `share-dream.ts` | **6 dreams, not 7** — `faculty-president` is missing (goal type `election` exists but no dream uses it). Dream progress check trusts a client-sent snapshot. |
| Live step (character type, lodging, course) | 🟡 | `app/live`, `components/live/live-studio.tsx`, `lib/game/live.ts`, `lib/game/creation.ts` | UI done. **Saved only in browser** (no server column/route). Lodging carries its own `startCash` (₦100k–₦600k) which conflicts with the server spin. |
| Starting-money spin | 🟡 | `components/create/starting-money-spin.tsx`, `backend/src/game/starting-money.ts`, `POST /character/starting-money`, `sql/004`, `share-starting-money.ts` | Server rolls once (transaction + `cash_rolled_at`) ✅. Missing faculty-president range. Local fallback `rollStartingMoneyLocal` still exists on client. |
| Onboarding gate (look→traits→dream→live→play) | 🟡 | `lib/game/onboarding.ts`, `backend/src/game/onboarding.ts` | Server knows look/traits/dream only; `live` step is client-side. |
| Game state + core actions | 🟡 | `hooks/use-game.tsx`, `lib/game/rules.ts`, `content.ts`, `types.ts` | Works in the browser: actions, travel (walk/keke), events, objectives. **All client-side + localStorage**; `STARTER_CASH = 5000` still in rules.ts. |
| Needs (6) + XP/level + mood | 🟡 | `lib/game/needs.ts`, `components/hud/needs-stack.tsx` | Client-only decay per time period. |
| Time (day + 4 periods, calendar, rent day) | 🟡 | `rules.ts`, `needs.ts` (`calendarForDay`, `PERIOD_CLOCK`), `clock-pill.tsx` | Client-only; rent is a reminder pill, no charge. |
| HUD (Apple-glass) | 🟡 | `components/hud/hud.tsx` + ~30 parts | Status bar, money pill, needs, Up Next pill with **bell**, quest stack, play nav (home/buy/phone…), vaul sheets (today/profile/settings), Island toast, me-card avatar ring — present. Some pills point at placeholder data (e.g. "Daily Okada Coins", hard-coded city events). |
| Phone | 🟡 | `components/hud/phone-dialog.tsx`, action `buy_phone` (₦2,500) | Simple dialog/feed only. No apps. |
| 3D map – first slab | 🟡 | `lib/game/world-layout.ts` (`MAP_ZONES`, `ROAD_GAPS`, `TREE_SPOTS`, `FENCE_U`), `components/world/*` | Town side, gate, campus side and extended area are placed (see §4.7). **Zones are visual only** — gameplay still uses the 15 old `content.ts` locations; the two lists are not linked. |
| Billboards / ads | ⬜ | — | Nothing in code. |
| Economy (jobs, shop, rent, transactions ledger) | ⬜ | — | Only toy actions (errand ₦500, POS shift ₦400–900). |
| Multiplayer / chat by area | ⬜ | — | |
| Events / elections | 🟡 | `content.ts` `EVENTS` (6 random pop-ups), `quests.ts` city events | Fictional pop-ups only; no real-world events feed, no elections. |
| Innovation Hub | 🟡 | location `innovation_hub`, action `feedback` | Action only; no form, nothing stored. |
| Payments (Paystack) | ⬜ | — | |
| Deploy (Cloudflare Pages + api.ekpomalife.app) | ⬜ | — | No DNS, no CI. |
| Tests | ⬜ | — | No test runner in either package. |
| Docs | 🟡 | `MAP.md` (stale: says "only Admin Block"), `spec.md` (untracked, says Prisma — wrong), `backend/README.md`, `AGENTS.md` | Replace `spec.md` with this file; refresh `MAP.md`. |

---

## 4. Built features — exact behaviour

### 4.1 Auth
- `POST /auth/signup` `{ name(2–40), username(/^[a-z0-9_]{3,20}$/), password(8–72), isAdult:true }` → 201 `{ ok, account:{name,username} }` + session cookie. 409 if username taken. Rate limit 5 / 15 min.
- `POST /auth/login` `{ username, password }` → `{ ok, account }` + cookie.
- Client form also requires email + DOB (age ≥ 18) but does not send them. **Decision for Phase 1:** store `email` (for password reset) and `date_of_birth`.
- Sessions table stores token hash + expiry.

### 4.2 Look
`Appearance = { body:'man'|'woman', hair, outfit, fabric }` (+ colours added in `36545fb`).
- Man hair: lowcut, bald, curls, afro, locs, braids, classic. Woman hair: braids, afro, bun, ponytail, long, locs, lowcut, gele, classic.
- Man outfits: casual, hoodie, office, chiller, sitework. Woman outfits: casual, office, owambe.
- Fabrics: ankara-rose, ankara-gold, ankara-sky, plain-cream, plain-navy.
- Models `/models/male.glb`, `/models/female.glb` (baked hair stripped); hair GLBs positioned via `hair-config.ts`, outfits via `outfit-config.ts`.

### 4.3 Traits (exactly 2, server-checked)
`tech`, `night-classer`, `foodie`, `leader`, `hustler`, `risk-taker`, `gym-rat`, `academic-weapon`, `fashionista`, `social-butterfly`.

### 4.4 Dreams (6 in code)
| id | Title | Goal | Reward |
|---|---|---|---|
| first-class | First class graduate | CGPA ≥ 4.5 and graduated | ₦50,000 + badge |
| ekpoma-landlord | Ekpoma landlord | net worth ≥ ₦1,000,000 and owns lodge | +15 rep + badge |
| big-boy | Big boy / big girl | career level 10 | ₦40,000 + badge |
| edo-star | Edo afrobeats star | music skill 10 | ₦30,000 + 10 rep + badge |
| campus-celeb | Campus celebrity | 5 best friends | +15 rep + badge |
| tech-founder | Ekpoma tech founder | business revenue ≥ ₦500,000 | ₦25,000 + badge |
| **faculty-president** *(to add)* | Faculty president | win a faculty election (`election` goal) | proposed: +20 rep + badge |

Change-dream dialog and dream celebration exist in the HUD. Share card: `share-dream.ts`.

### 4.5 Live step (client-only today)
- Character types: `student`, `lecturer`, `indigene`, `casual`.
- Lodgings: `hostel-poultry` (AAU student, Igbinedion Hostel, rent ₦1,200/wk), `selfcon-oxford` (Poultry road, ₦2,500/wk), `selfcon-g2` (College of Medicine G1, ₦3,000/wk), `onebed-ojo` (Ojo street, ₦10,500/wk). Each also has a `startCash` — **to be removed** (server spin is the only starting money).
- Courses (student): computer-science, engineering, mass-comm, law, accounting, theatre-arts, nursing, education. Perk copy mentions ₦3,000 Monday allowance and degree-class pay bonus (up to +25%) — not implemented.

### 4.6 Starting money (server, once only)
`POST /character/starting-money` — requires look + 2 traits + dream; runs in a DB transaction; if already rolled, returns the stored result.

| Dream | Range (₦) |
|---|---|
| ekpoma-landlord | 100,000 – 300,000 |
| tech-founder | 200,000 – 450,000 |
| edo-star | 200,000 – 450,000 |
| big-boy | 250,000 – 500,000 |
| first-class | 300,000 – 600,000 |
| faculty-president *(add)* | 400,000 – 700,000 |
| campus-celeb | 500,000 – 1,000,000 |

Modifiers: `risk-taker` re-rolls in 0.8×min – 1.2×max; `hustler` ×1.10; `leader`, `fashionista`, `social-butterfly` ×1.05 each. Result rounded to ₦500, clamped ₦100k–₦1M.
Tiers by amount: < ₦250k **Hustle Mode** · < ₦500k **Steady Start** · < ₦750k **Big Boy / Big Girl** (by body) · ≥ ₦750k **Nepo Baby**. Each tier has 3 random Naija one-liners. Stored in `characters.cash`, `starting_cash`, `starting_tier`, `cash_rolled_at`.

### 4.7 Map — first slab (`MAP_ZONES`)
- **Town side** (west of fence): Animal House ×2, Anatomy Secretariat, BAMSSA, 200 Level Hall, Relaxation Centre, 100 Level Hall, ETF Hall, MLS Hall, College of Medicine, ICT Lab, 4 small shops/houses, Off-campus Hostels, Cattle Market, Sazza.
- **Gate:** AAU School Gate.
- **Campus side:** Clinic, Sports Complex (stadium GLB), Life Science, Social Science, Physical Science, main column ICT (exams) → Education → Mass Comm → Admin Block (with nested courtyard parking), Law, Students' Centre, Cordelia Agbebaku Hall, Twin Hall.
- **Extended:** School Hostels ×3, Law (ext), Management Science, Engineering, Parking Lot, Shuttle Park.
- Roads: City Bits pieces from `campusroad.glb` on UV rails (V 0.18/0.28/~0.60/0.78/0.88, H 0.14/0.93). Trees `tree.glb`/`pinetree.glb`. Fence at `FENCE_U`.
- Camera: perspective iso-style, pan/rotate/zoom. Palette in `map-theme.ts`.
- Gap: zone ids (`admin-block`, `clinic`…) ≠ gameplay location ids (`aau_campus`, `campus_shop`, `roadside_bukka`…). Several gameplay places (Mama Amina Bukka, Keke Park, Viewing Centre, Market, church, mosque, Maryvale) have no zone.

### 4.8 Core loop (client, to be moved to server)
- State: cash, energy, health, reputation, academic, hunger, hygiene, fun, social, xp, location, day, period, hasPhone, milestones, feed (40), dream snapshot, badges.
- 14 actions in `ACTIONS` (study, night_class, socialize, rest, eat ₦800, buy_phone ₦2,500, buy_snack ₦300, errand +₦500, pos_shift +₦400–900, watch_match ₦200, pray, market_run ₦400, feedback, workout).
- Travel: walk (energy = ceil(dist/5)+2) or keke (fare max(₦100, ~dist×6) rounded to ₦50, 1 energy).
- Needs drain per period: hunger −6, hygiene −4, fun −5, social −3, xp +2. Level = floor(xp/100)+1.
- Objectives: buy phone at Campus Shop → errand at Admin Block → eat at Mama Amina Bukka.
- Random events (6): keke fare palaver, NEPA don take light, Chuks borrow, surprise test, rain, lucky find.

---

## 5. Remaining features — detailed specs

### 5.1 Server game state & core loop (Phase 1)
- New table `player_state` (1:1 with characters): needs, energy, health, reputation, academic, xp, location_id, game_day, period, has_phone, milestones, lodging_id, character_type, course_id, version (optimistic lock).
- Server copies of `ACTIONS`, travel quote, needs drain, events in `backend/src/game/`. Client `rules.ts` becomes a *preview* only.
- `POST /actions/:actionId`, `POST /travel`, `POST /events/:id/choice` → validate, apply, write ledger, return new state. Random rolls on server (`crypto.randomInt`).
- Idempotency key header on every mutating call (stops double-tap double charge).
- `POST /character/live` saves type/lodging/course; onboarding `live` step becomes server-known.
- Link map: add `locationId` to each `MAP_ZONE` that is playable; map content.ts locations onto zones (e.g. `aau_campus`→`admin-block`, `aau_library`→ICT or a new zone, `sports_complex`→`sports-complex`, `college_of_medicine`→`college-of-medicine`, `igbinedion_hostel`→`school-hostels-1`, bukka/shop/market → town shops / Cattle Market / Sazza). Places without a zone are hidden until Phase 3.
- Tapping a building opens the existing `LocationSheet`.
- Time model: **turn-based periods** (actions advance time) — keep; no real-time background sim.

### 5.2 Economy, jobs, shop, rent (Phase 2)
- `transactions` ledger: `id, user_id, amount (BIGINT, signed), kind, ref, balance_after, created_at`. Kinds: `starting_money, purchase, job_pay, rent, allowance, event, fine, dream_reward, topup, refund`. **Every cash change goes through one `applyCash()` in a DB transaction; cash can never go negative.**
- Jobs (data file): campus errand, POS agent, mama-put helper, keke rider (needs licence item), typist/cyber café (tech trait bonus), tutor (academic ≥ 70), lab assistant, event MC (rep ≥ X), barbing/salon. Each: location zone, energy, periods, pay range, requirements, trait bonus (e.g. hustler +10% pay, tech +15% on cyber jobs, gym-rat +energy). Career level 1–10 feeds `big-boy` dream.
- Shop: items table (phone tiers, food, toiletries → hygiene, textbooks → study, clothes → fashionista rep, keke licence, lodge deed). Inventory table with quantity. Purchases atomic.
- Rent: weekly on calendar rent day, from lodging `rentWeekly`. Unpaid → warnings → evicted to Off-campus Hostels (cheaper, worse needs). Owning a lodge (landlord dream) earns weekly rent.
- Student allowance ₦3,000 every Monday (from live.ts copy); degree-class pay bonus after graduation.
- Remove lodging `startCash` and `STARTER_CASH`; delete `rollStartingMoneyLocal`.
- Fictional risky hustles (abstract): e.g. "sort lecturer", "runs at the junction" — server probability; outcomes reward / fine / rep loss / lockout. No real-world instructions.

### 5.3 World, models, buildings (Phase 3)
- Every listed zone has a model, roof label, and (if playable) actions.
- Interiors are sheets, not 3D rooms (low data).
- Player avatar walks between zones on road graph (visual only; server decides arrival).
- Add missing town spots as zones: Mama Amina Bukka, Keke Park/Shuttle Park link, Viewing Centre, church, mosque, Maryvale.
- Asset budget: lazy-load GLBs per area; meshopt; total first load target < 8 MB; low-perf mode drops trees/shadows.
- Refresh `MAP.md`.

### 5.4 Multiplayer & chat (Phase 4)
- WebSocket on the same Fastify server (`@fastify/websocket`), channel per area (zone group: Town, Campus, Extended, Hostels).
- Presence: other players' avatars (low tick, ~2 Hz, positions snapped to zones).
- Chat by area + DMs; rate-limit, word filter, report/block, mute. Messages stored 7 days.
- Friends list (best friends → campus-celeb dream). Public profile card (name, look, tier, badges).
- Online count shown honestly on welcome screen.

### 5.5 Phone (Phase 5)
Buying a phone unlocks apps inside the existing phone dialog/vaul sheet: **Messages** (DMs), **Gist** (area feed), **Bank** (balance + ledger), **Jobs**, **Ekpoma Market** (shop delivery for a fee), **Calendar** (lectures, rent day, events), **Dream tracker**, **Settings**. Phone tiers change features (e.g. cheap phone: no camera/share cards).

### 5.6 Events, billboards, elections (Phase 6)
- Events feed: `events` table with `kind: 'real' | 'game'`, `verification: unverified|verified|rejected`, `published`. Real-world Ekpoma events only from admins; unverified never shown as fact. Report-wrong-info button.
- Scheduled game events (exam week = study XP ×2, free food at mama put, NEPA blackout night, inter-faculty match) replace the hard-coded `CITY_EVENTS`.
- **Billboards:** 3D billboard meshes on the map + HUD banner slot. `billboards` table (image, link, zone, start/end, impressions). Admin-only upload at first; paid slots in Phase 7.
- **Elections:** faculty/SUG elections each N game-weeks: nominate (rep threshold + fee), campaign (spend, posters), vote (one per account per election, server-counted), results event. Winner → `faculty-president` dream.
- Innovation Hub: feedback form stored in `feedback` table with status pending/reviewed/declined/implemented.

### 5.7 Payments & deploy (Phase 7)
- **Paystack** naira top-ups: server creates transaction, client opens Paystack inline, **webhook** (signature-verified) credits in-game currency via ledger kind `topup`; idempotent on Paystack reference. No cash-out. Packs priced in ₦.
- Optional: cosmetic store, billboard slot purchase.
- Deploy: Cloudflare DNS for ekpomalife.app; frontend on Cloudflare Pages (`www`/apex); API on Node host at `api.ekpomalife.app` with managed Postgres; cookies `Secure; SameSite=Lax; Domain=.ekpomalife.app`; CORS to the Pages origin; migrations on deploy; health check; error logging; backups.
- Remove `@vercel/analytics`; add privacy-friendly analytics (e.g. Cloudflare Web Analytics).
- Forgot-password via email; legal pages reviewed.

---

## 6. Server rules (non-negotiable)
1. The server owns cash, inventory, needs, location, time, rewards, dream progress, votes and chat. Client values are display only.
2. Money is integer naira in `BIGINT`. No floats in money math (round before storing).
3. One `applyCash()` pathway, inside a DB transaction, writes the ledger and blocks negative balances.
4. Starting money is rolled once (`cash_rolled_at`). No other starting grant exists.
5. Every mutating request: authenticated session, zod-validated body, idempotency key, rate limit.
6. Randomness on the server only (`crypto.randomInt`); seeded/injectable for tests.
7. Dream completion is computed from server state, never from a client snapshot (fix `/character/dream/check`).
8. Paystack credits only via verified webhook.
9. Chat: rate-limited, filtered, reportable; no private data in public feeds.
10. Low data: small JSON responses, diff-friendly state, lazy GLBs.

---

## 7. Data model & API

### 7.1 Existing tables
- `users(id, name, username UNIQUE, password_hash, created_at)`
- `sessions(id, user_id, token_hash UNIQUE, expires_at, created_at)`
- `characters(id, user_id UNIQUE, dream_id, snapshot JSONB, badges TEXT[], dream_completed_at, updated_at, appearance JSONB, traits TEXT[], cash BIGINT, starting_cash BIGINT, starting_tier TEXT, cash_rolled_at)`

### 7.2 Planned tables
`player_state`, `transactions`, `items`, `inventory`, `jobs_log`, `lodges` (ownership), `areas`/`presence` (ephemeral), `messages`, `friends`, `events`, `billboards`, `elections`, `candidates`, `votes`, `feedback`, `payments`, `idempotency_keys`. Add `users.email`, `users.date_of_birth`, `characters.character_type/lodging_id/course_id`.

### 7.3 Existing routes
| Method | Path | Notes |
|---|---|---|
| GET | `/`, `/health` | info / health |
| POST | `/auth/signup` | see §4.1 |
| POST | `/auth/login` | |
| GET | `/character` | `{ step, appearance, traits, dreamId, badges, cash, startingCash, startingTier }` |
| POST | `/character/look` | `{ appearance }` |
| POST | `/character/traits` | `{ traits:[2] }`, 409 if no look |
| POST | `/character/dream` | `{ dreamId }` |
| POST | `/character/dream/check` | `{ snapshot }` — trusts client; replace |
| POST | `/character/starting-money` | once-only roll |

### 7.4 Planned routes
`POST /auth/logout`, `POST /auth/forgot`, `POST /auth/reset` · `POST /character/live` · `GET /state` · `POST /actions/:id` · `POST /travel` · `POST /events/:id/choice` · `GET /jobs`, `POST /jobs/:id/work` · `GET /shop`, `POST /shop/buy` · `POST /rent/pay` · `GET /ledger` · `GET /dream` (server-computed) · `WS /ws` (presence, chat) · `GET/POST /friends` · `GET /feed/events`, `POST /feedback` · `GET /billboards` · `GET /elections`, `POST /elections/:id/nominate`, `POST /elections/:id/vote` · `POST /pay/topup`, `POST /pay/paystack/webhook`. CORS methods must grow beyond `GET, POST, OPTIONS` if needed.

---

## 8. Roadmap (each phase = one big Cursor prompt)

**Phase 0 — Housekeeping (small, do first).** Commit the current working tree in sensible commits; delete `vaul-1.1.2.tgz`, `tmp/`, `tsconfig.tsbuildinfo` from the tree (gitignore); replace `spec.md` with this file; add Vitest to frontend and backend.
*Accept:* clean `git status`, `pnpm build` passes, `npm test` runs (even 1 test).

**Phase 1 — Server core loop & needs.** §5.1. Add `faculty-president` dream + range; `/character/live`; `player_state`; server actions/travel/events/needs/time; client becomes thin; link MAP_ZONES to locations; fix dream check; store email/DOB; logout.
*Accept:* clearing localStorage loses nothing; editing cash in devtools changes nothing server-side; double-tapping an action charges once; create flow → /live → play works with server only; tests for actions, travel, needs drain, starting money once-only.

**Phase 2 — Economy, jobs, shop, rent.** §5.2.
*Accept:* every cash change has a ledger row; balance never < 0 (tested); at least 6 jobs, 15 items, weekly rent with eviction; allowance on Mondays; traits change job outcomes; no client-only money paths remain (`grep STARTER_CASH`, `startCash`, `rollStartingMoneyLocal` → none).

**Phase 3 — World, models, buildings.** §5.3.
*Accept:* every playable location is a tappable zone; all first-slab zones from §4.7 render with labels; low-perf mode holds ~30 fps on a mid Android; first load < 8 MB; credits complete; MAP.md updated.

**Phase 4 — Multiplayer & chat by area.** §5.4.
*Accept:* two browsers see each other in the same area; area chat + DMs with rate limit, report, block; friends list feeds campus-celeb; honest online count.

**Phase 5 — Phone.** §5.5.
*Accept:* no phone → apps locked with explanation; phone bought → Messages, Gist, Bank, Jobs, Market, Calendar, Dream apps work using Phase 1–4 APIs.

**Phase 6 — Events, billboards, elections, Innovation Hub.** §5.6.
*Accept:* events labelled real/game and verified/unverified; scheduled game events change rules (e.g. exam week XP ×2); billboards render on map + HUD from DB; one full election cycle runs and can complete faculty-president; feedback is stored and the UI says so truthfully.

**Phase 7 — Payments & deploy.** §5.7.
*Accept:* Paystack test-mode top-up credits exactly once via webhook; ekpomalife.app (Pages) + api.ekpomalife.app live over HTTPS with cookies working; migrations run on deploy; Vercel analytics gone; forgot-password works; terms/privacy reviewed; launch checklist below all ticked.

### Launch checklist (all features, per owner's call)
- [ ] Phases 0–7 accepted · [ ] mobile + desktop smoke test of full journey · [ ] no dead buttons · [ ] no secrets in git · [ ] backups + monitoring on API/DB · [ ] this status table up to date.

---

## 9. Open decisions
1. Faculty-president dream reward (proposed +20 rep + badge).
2. Whether lodging choice should cost a first-week rent out of the spun money (proposed: yes).
3. Premium currency name and Paystack pack prices.
4. Node host for the API (Railway/Fly/Render/VPS) and managed Postgres provider.
5. Who can post real-world events at launch (proposed: admins only).
6. Chat moderation staffing / word list.
