/**
 * Lines players send each other by tapping someone (ids match backend/src/game/club-live.ts QUICK_LINES).
 * Fixed lines only, so there's nothing to moderate.
 */
export const QUICK_LINES = [
  { id: 'hi', text: 'Hi 👋' },
  { id: 'how-far', text: 'How far? 😄' },
  { id: 'food-sweet', text: 'This food sweet die 😋' },
  { id: 'join-me', text: 'Come sit with me 🪑' },
  { id: 'treat-me', text: 'Abeg buy me shawarma 🌯' },
  { id: 'lol', text: '😂😂' },
  { id: 'thanks', text: 'Thank you 🙏' },
  { id: 'later', text: 'See you later ✌️' },
] as const

export type QuickLineId = (typeof QUICK_LINES)[number]['id']

export const quickLineText = (id: string) => QUICK_LINES.find((l) => l.id === id)?.text ?? null
