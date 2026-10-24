/**
 * Chat stickers. Ids must match backend/src/game/stickers.ts (the server only accepts these).
 * Emoji ones render large with the device's own emoji art; the rest use the game's 3D pictures.
 */
export type Sticker = { id: string; label: string } & ({ emoji: string; src?: never } | { src: string; emoji?: never })

export const STICKERS: Sticker[] = [
  { id: 'lol', label: 'Laughing', emoji: '😂' },
  { id: 'love', label: 'In love', emoji: '😍' },
  { id: 'cool', label: 'Cool', emoji: '😎' },
  { id: 'cry', label: 'Crying', emoji: '😭' },
  { id: 'shock', label: 'Shocked', emoji: '😱' },
  { id: 'think', label: 'Thinking', emoji: '🤔' },
  { id: 'party', label: 'Party', emoji: '🥳' },
  { id: 'hug', label: 'Hug', emoji: '🤗' },
  { id: 'pray', label: 'Please', emoji: '🙏' },
  { id: 'clap', label: 'Clap', emoji: '👏' },
  { id: 'thumbs', label: 'Thumbs up', emoji: '👍' },
  { id: 'wave', label: 'Wave', emoji: '👋' },
  { id: 'eyes', label: 'Eyes', emoji: '👀' },
  { id: 'skull', label: 'Dead', emoji: '💀' },
  { id: 'hundred', label: '100', emoji: '💯' },
  { id: 'heart', label: 'Heart', emoji: '❤️' },
  { id: 'sleepy', label: 'Sleepy', emoji: '😴' },
  { id: 'fire', label: 'Fire', src: '/stickers/fire.png' },
  { id: 'money', label: 'Money', src: '/emoji/money-bag.png' },
  { id: 'food', label: 'Food', src: '/stickers/food.png' },
  { id: 'books', label: 'Books', src: '/stickers/books.png' },
  { id: 'muscle', label: 'Strong', src: '/stickers/biceps.png' },
  { id: 'shades', label: 'Shades', src: '/stickers/shades.png' },
  { id: 'hustle', label: 'Hustle', src: '/stickers/hustle.png' },
]

const BY_ID = new Map(STICKERS.map((sticker) => [sticker.id, sticker]))

export const stickerById = (id: string) => BY_ID.get(id) ?? null
