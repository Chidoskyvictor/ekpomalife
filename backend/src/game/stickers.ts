/** Sticker ids players can send in chat. Mirror of lib/game/stickers.ts (the client owns the artwork). */
export const STICKER_IDS = [
  'lol',
  'love',
  'cool',
  'cry',
  'shock',
  'think',
  'party',
  'hug',
  'pray',
  'clap',
  'thumbs',
  'wave',
  'eyes',
  'skull',
  'hundred',
  'heart',
  'sleepy',
  'fire',
  'money',
  'food',
  'books',
  'muscle',
  'shades',
  'hustle',
] as const

export type StickerId = (typeof STICKER_IDS)[number]

export const isStickerId = (id: string): id is StickerId => (STICKER_IDS as readonly string[]).includes(id)
