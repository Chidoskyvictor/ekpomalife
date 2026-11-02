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

/** Reactions everyone in your group sees over your head (ids match backend REACTIONS). */
export const REACTIONS = [
  { id: 'wave', emoji: '👋🏾', label: 'Wave' },
  { id: 'laugh', emoji: '😂', label: 'Laugh' },
  { id: 'dance', emoji: '💃🏾', label: 'Dance' },
  { id: 'abeg', emoji: '🙏🏾', label: 'Abeg' },
  { id: 'hiss', emoji: '😤', label: 'Hiss' },
] as const

/** Social actions on someone (ids match backend SOCIAL_KINDS). */
export const SOCIALS = [
  { id: 'hello', emoji: '👋🏾', label: 'Say Hello', gains: '+Social', chance: null },
  { id: 'gist', emoji: '💬', label: 'Gist', gains: '+Fun · +Social', chance: null },
  { id: 'joke', emoji: '😂', label: 'Crack Joke', gains: '+Fun · +Social', chance: 70 },
  { id: 'compliment', emoji: '✨', label: 'Compliment Their Fit', gains: '+Fun · +Social', chance: null },
] as const

export type SocialId = (typeof SOCIALS)[number]['id']

/** What shows over someone's head for a reaction or a social action line. */
export function bubbleFor(line: string, fromName?: string): string | null {
  const reaction = REACTIONS.find((r) => r.id === line)
  if (reaction) return `${reaction.emoji} ${reaction.label}`
  if (line.startsWith('social:')) {
    const [, kind, landed] = line.split(':')
    const s = SOCIALS.find((x) => x.id === kind)
    if (!s) return null
    if (kind === 'joke' && landed === '0') return '😬 Joke flopped'
    return `${s.emoji} ${s.label}${fromName ? '' : ''}`
  }
  return quickLineText(line)
}
