/** Phone → Games: static iframe mini-games (Snooker uses its own bridge). */

export type EmbeddedGameId = 'tic-tac-toe' | 'chesskit' | 'ludo'

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
    subtitle: 'Friend, phone or online · bets',
    path: '/games/tic-tac-toe/index.html',
    bridgeSource: 'ekpoma-game',
  },
  {
    id: 'chesskit',
    name: 'Chess',
    emoji: '♟️',
    subtitle: 'Chesskit · needs internet',
    path: '/games/chesskit/index.html',
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
