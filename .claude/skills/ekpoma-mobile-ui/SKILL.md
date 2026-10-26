---
name: ekpoma-mobile-ui
description: Use for ANY UI work in ekpomalife — new screens, popups, menus, sheets, HUD, buttons, or editing existing ones. Mobile-first layout rules that keep the existing Ekpoma Life visual style.
---

# Ekpoma Life mobile UI rules

Keep the existing look (colors, fonts, radius, icons, Apple-simple style). Do NOT restyle. These rules are about LAYOUT and SIZE only. Most players are on Android phones (360–412px wide).

## Always
1. Design for 360px wide first, then scale up. Test at 360x740 and 412x915.
2. The game/map must stay visible. No panel may cover more than ~45% of the screen height on mobile. Never full-screen unless it's a dedicated page (e.g. settings, chat).
3. Action menus (tap on bed, sofa, stove, door, NPC, etc.): show options as a horizontal row or 2–4 column grid of icon + short label chips, all visible at once. Never a tall vertical list that pushes options off-screen. If more than 8 options, scroll horizontally.
4. Popups near an object are small and compact (max ~280px wide, auto height). Prefer a bottom sheet for anything with more than one line of content.
5. Bottom sheets: slide up, drag handle, tap backdrop or swipe down to close, max 45% height (expandable to ~85% only if the user drags it up), content scrolls inside.
6. Profile cards, player info, shop info: compact card, not a full-screen container.
7. Tap targets at least 44x44px, 8px gaps. Labels max 2 words.
8. Respect safe areas (notch, Android nav bar): use env(safe-area-inset-*).
9. Text never overflows: truncate with ellipsis, no horizontal page scroll.
10. Don't overlap the HUD (top bar, joystick, phone button). Check what else is on screen before placing a new element.
11. Reuse existing components (BottomSheet, ActionGrid, Card, etc.) instead of creating new ones; if one doesn't exist, create it once as a shared component and reuse it everywhere.

## Before finishing any UI change
- Check it at 360px wide in dev mode (browser device toolbar).
- Confirm: all options visible without scrolling, map still visible, nothing covers the joystick/HUD, no overflow.
- Mention in the diff summary which rules you checked.
