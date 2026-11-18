---
name: ekpoma-design
description: Use for ANY new or changed screen, app, sheet, card, list, button or in-game UI in ekpomalife, before writing the UI and again before finishing. Sets the design bar (the owner rejects plain, untried screens), the screen patterns to use, the 3D-first rule and the mandatory screenshot design pass. Use together with ekpoma-mobile-ui (layout and sizes).
---

# Ekpoma Life design bar

The owner has rejected screens that "did not even try": plain lists, actions hidden behind extra taps, no search, empty first screens, text where the game should show something. Players already call the game boring. Every screen you ship must look designed, feel alive, and be obvious to use on a 360px Android phone. Design is part of the task, never a follow-up the owner has to ask for.

## 1. Before you build
1. **3D first.** If the feature is something that happens in the world (work, games, meeting people, buying, events), make it happen in the 3D scene: characters walk there, sit, animate, others can see it, with a tag or effect over the player. The phone app is for browsing, posting and settings, not where the fun happens.
2. **Look at a reference.** If the owner sent a screenshot (Lagos Life, another app), list what it has (tabs, buttons, cards, search, chips, badges) and match or beat every item. Never copy its look: use ours (section 3).
3. **Lead with what has content.** The first tab or screen a player sees must have things in it. If one list is often empty and another is full (e.g. Find a pro vs Board), the full one comes first. An empty first screen makes the feature look dead.

## 2. Screen patterns (use these, don't invent bare lists)
- **App header:** `components/hud/phone/app-header.tsx` (back + title), then an optional hero/status card (your rank, rating, balance) in a soft tinted card.
- **Primary actions up top:** the one or two main things the player does, as big side-by-side buttons (filled primary + tinted secondary), 48px tall, icon + 1-2 words. E.g. "+ Post a job" / "Hire directly".
- **Search + filters:** lists longer than ~6 items get a search field (rounded, icon inside, placeholder that says what you search) and a horizontal row of category chips with icons ("All" first, selected chip filled).
- **Segmented tabs** for 2-4 views of the same thing (pill track, selected segment raised), not plain text links.
- **Cards for people/items, with the action ON the card:** avatar (PlayerFace with their look) + name + small badges (rank, stars, jobs done, online dot) + key number (price formatted like the balance, `₦1,250,000`, money in --ok green) + a one-line pitch, and the action buttons inside the card (outline "Chat"/"Ask" + filled "Hire"/"Apply"). Never make the player open a detail page just to find the main action.
- **List rows:** `components/hud/phone/list-row.tsx` for settings-like lists.
- **States:** `components/hud/phone/app-state.tsx` for loading skeletons, errors and empty states. Empty states are designed: an illustration/emoji, one line saying why it's empty, and a button that leads somewhere useful.
- **Sheets:** the shared `components/ui/bottom-sheet.tsx`. Attach/action menus are big icon tiles in a grid, not a text list.
- **Feedback:** press scale 0.96, a pop on success, toasts via the game's notifyToast, haptics (`components/hud/haptic`) on main actions.

## 3. Our look (tokens in `app/globals.css`, never hard-coded)
- Text `--ink` / `--ink-2` / `--ink-3`; surfaces `--paper`, `--fill`, `--fill-2`; hairlines `--line`; floating glass `rgb(var(--glass-rgb) / a)`.
- One blue: `--primary` for primary buttons, links, selected states. Green `--ok` for money gained and success, `--bad` for danger. No purple/other brand colours copied from other games.
- Radii `--r-sm` 10 / `--r-md` 14 / `--r-lg` 20 / `--r-pill`. Shadows `--elev-1/2/3`.
- Type scale only `--fs-12/14/16/20/28`; `--font-ui` for text, `--font-game` (Boogaloo) for big buttons and titles. Nothing under 12px.
- Motion `--ease-ui`, `--dur-press/pop/sheet`; everything off under prefers-reduced-motion.
- Dark mode is real (`:root[data-theme='dark']` swaps the tokens): if you use the tokens it works; any literal colour needs a dark override.
- Emoji stickers (`/emoji/*.png`) for game things (needs, categories, rewards); lucide icons for chrome (back, close, search, settings).

## 4. Mandatory design pass (before you merge)
1. Screenshot every new or changed screen at **360x740** in **light and dark** (and the empty, loading and full states).
2. Check each against this list and fix what fails:
   - Main action visible without scrolling or extra taps?
   - Search/filters present if the list can grow?
   - First screen has content (or a designed empty state with a next step)?
   - Text truncates instead of wrapping one letter per line (watch long titles and names next to prices)?
   - Spacing even (8/12/16), alignment clean, nothing cramped against edges?
   - Contrast fine in both themes, no white-on-white or grey-on-grey?
   - Tap targets 44px, safe areas respected, map/HUD not covered beyond the mobile-ui limits?
   - Matches or beats every element of the reference the owner sent?
3. Include the screenshot paths in your report and say what you fixed in this pass. If you couldn't take screenshots, say so plainly; don't claim the design is checked.
