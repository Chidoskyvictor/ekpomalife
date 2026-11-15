# Ekpoma Life: full-site design audit (brief for Fable)

Scope: the whole front end (`app/`, `components/`). Rules to follow while changing anything: `.claude/skills/ekpoma-mobile-ui/SKILL.md` (360px first, keep the current look, tap targets 44px, no horizontal scroll, respect safe areas). `AGENTS.md`: this Next.js has breaking changes, check `node_modules/next/dist/docs/` before writing code.

**Method and limits.** Code and CSS review plus a 360x740 look at the guest home. I could NOT sign in, so logged-in screens (HUD, phone apps, room, setup flow) are judged from code, not seen. Verify each item visually before and after.

## Facts from the code
- 106 CSS modules. `life-hud.module.css` is 1,326 lines, `phone.module.css` 1,022: both too big to reason about.
- Design tokens exist in `app/globals.css` (oklch: `--primary`, `--surface`, `--radius`, z-index scale), but components mostly bypass them: hex colours hard-coded everywhere (`#6b7280` x81, `#8e8e93` x56, `#6e6e73` x50, `#f2f2f7` x38, `#3d9ad6` x36, `#007aff` x23). Three different greys do the same job.
- Radii are ad hoc: 999px x328, then 16, 12, 14, 18, 22, 24, 20, 10px. Fonts: Boogaloo (17 hard-coded uses), Plus Jakarta Sans, Inter, `var(--font-body)`, Georgia (2).
- Dark mode: effectively absent (1 file mentions it). The app is light only.
- No shared BottomSheet / ActionGrid component, although the skill says to reuse one. Each sheet is its own: `buy-sheet`, `house-sheet`, `map-place-sheet`, `market-hub-sheet`, `place-sheet`, `profile-sheet`, `topup-sheet`, `today-sheet`, `location-sheet`, `phone-dialog`, plus `components/arc/dialog`.
- Reduced motion is respected in 81 files (good), 37 CSS files define animations, 25 use `motion/react`. Entrance/transition styles vary per component.
- 43 text sizes at 9-11px (`font-size: 9/10/11px`): below comfortable reading on phones.
- Two button systems: `components/arc/button` and `components/ui/button` (+ many local button styles in modules).
- Routes: `/` (map + HUD), `/room`, `/room/[username]`, `/club/[id]`, `/login`, `/signup`, `/forgot`, setup (`/dream`, `/live`, `/look`, `/traits`), `/support`, `/contact`, legal pages, `/s/[code]`, `/anon/[id]`, `/admin/*`.

## What works
- Consistent glass-pill language on the HUD, clear primary blue, friendly Boogaloo for buttons.
- Good tap-target discipline on HUD controls (44px), safe-area padding on docks, `lowPerf` fallback that removes blur on weak phones.
- Number-flow cash counter, ±₦ float, need-ring avatar: nice game feedback.
- Phone-as-OS metaphor (home screen, app grid, status bar) is strong and distinctive.

## Problems, by priority

### P1: affects every screen
1. **No design system in practice.** Tokens exist but are bypassed. Fix: define semantic tokens (text-primary/secondary/tertiary, surface, surface-2, border, success, warning, danger, radius-sm/md/lg/pill, shadow-1/2/3, font roles) and replace hex/px literals module by module. Collapse the grey ramp to 3 values; keep `--primary` as the only blue (kill `#3d9ad6`/`#007aff` drift).
2. **No shared sheet.** Build one `BottomSheet` (drag handle, backdrop tap, swipe down, 45% default / 85% on drag, internal scroll, safe-area, focus trap, reduced-motion) and migrate the 10+ sheets. This also delivers consistent open/close motion.
3. **Top-of-screen clutter (logged in).** Status pill + missions pill + activity tiles + settings circle stack up to four layers over the map. Merge missions into the status pill (or a single collapsible "Today" chip), keep activity tiles only while active.
4. **Small text.** Raise 9-11px to 12px minimum, 13-14px for body in sheets.
5. **No dark theme.** Decide: ship a night theme tied to the in-game period (night = dark glass) or explicitly stay light. Tokens (item 1) are the prerequisite.

### P2: game feel and polish
6. **Map button** is the key control yet looks like the other tabs. (Started: breathing halo, commit 96e8335.) Consider a labelled primary state and a badge for "where to go next".
7. **Needs card** (bottom-left): six 16px icons with tiny bars are hard to scan; phones show only the lowest need. Make critical state loud (pulse once, colour fill), calm otherwise.
8. **Phone home** (`components/hud/phone`): ~35 apps, many in separate styles (`messages`, `forbes`, `invest`, `family`, `prodigy`, `games`, `eta`, `guide`, `anonymous`, `ride-picker`...). Standardise app header, back button, list row, empty state, loading skeleton, error state.
9. **Empty/loading/error states** are inconsistent (text shimmer in one place, blank in another, "Couldn't load · Retry" in the status bar). One skeleton + one error pattern.
10. **Setup flow** (`/dream`, `/live`, `/look`, `/traits`): first impression after signup. Add progress indicator, consistent primary action pinned to the bottom, celebratory completion.
11. **Guest home**: top pill + auth + three feature chips + welcome card; the map area was blank in my preview (3D not rendering headless), so check on a real phone. The welcome card repeats "Sign up" (top pill AND card): drop one.
12. **Typography**: pick 2 families (Jakarta body, Boogaloo display for buttons/headings only) and one scale (12/14/16/20/28). Remove Georgia/Inter strays.

### P3: hygiene
13. Split `life-hud.module.css` and `phone.module.css` by component.
14. Merge `components/ui/button` and `components/arc/button` (or document which wins).
15. Radii to 4 steps (10 / 14 / 20 / pill).
16. Icons: mix of lucide, PNG emoji stickers (`/emoji`) and Unicode emoji; pick one style per context (stickers for needs/game, lucide for chrome).
17. Admin pages are desktop tools; leave out of the visual refresh.
18. Typecheck currently reports 3 errors in `components/arc/dialog/dialog.tsx` and `components/arc/tabs/tabs.tsx` (`render` prop not on Radix types). Not from design work; may be only my worktree's linked `node_modules`, check on main.

## Suggested motion language (one set, reused)
- Enter: translate 14-18px + fade, 420ms `cubic-bezier(0.2,0.8,0.2,1)`, 70ms stagger (already added for HUD).
- Sheets: slide up 320ms same easing; backdrop fade 200ms.
- Press: scale 0.96, 120ms. Success: one soft pop (scale 1 to 1.08 to 1, 260ms).
- Transform/opacity only, nothing looping except one ambient element per screen; everything off under `prefers-reduced-motion`, no blur on `lowPerf`.

## Suggested order for Fable
1. Tokens + type scale + radii (no visual change at first, then collapse greys/blues).
2. Shared `BottomSheet`; migrate map-place, house, market-hub, profile, topup first.
3. HUD top-area merge + needs card.
4. Phone app chrome (header/list row/empty/loading/error), then the busiest apps (Messages, Bank, Forbes).
5. Setup flow and guest home.
6. Dark/night theme if wanted.
Do NOT touch Support account code or chat code unless asked. Screenshot each screen at 360x740 and 412x915 before and after.
