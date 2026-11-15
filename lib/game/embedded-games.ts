/** Phone → Games: static iframe mini-games (Snooker uses its own bridge). */

export type EmbeddedGameId = 'tic-tac-toe' | 'chess' | 'ludo'

export type EmbeddedGame = {
  id: EmbeddedGameId
  name: string
  emoji: string
  subtitle: string
  /** Path under /games/… served from public/ */
  path: string
  /** postMessage source id from the game shell */
  bridgeSource: string
}

export const EMBEDDED_GAMES: EmbeddedGame[] = [
  {
    id: 'tic-tac-toe',
    name: 'Tic tac toe',
    emoji: '⭕',
    subtitle: 'Play a friend or the phone',
    path: '/games/tic-tac-toe/index.html',
    bridgeSource: 'ekpoma-game',
  },
  {
    id: 'chess',
    name: 'Chess',
    emoji: '♟️',
    subtitle: 'vs phone · pass & play · online',
    path: '/games/chess/index.html',
    bridgeSource: 'ekpoma-game',
  },
  {
    id: 'ludo',
    name: 'Ludo',
    emoji: '🎲',
    subtitle: 'Offline board · 2–4 players',
    path: '/games/ludo/index.html',
    bridgeSource: 'ekpoma-game',
  },
]
