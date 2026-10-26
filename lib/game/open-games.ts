/*
 * Open the phone's Games app from anywhere: a challenge pop-up (straight into the match),
 * a "challenged you" note in chat (the challenges list), or a profile's Challenge button
 * (username already filled in).
 */

export const OPEN_GAMES_EVENT = 'ekpoma:open-games'

export type OpenGames = { matchId?: string; username?: string }

let pending: OpenGames | null = null

export function requestOpenGames(open: OpenGames = {}) {
  pending = open
  window.dispatchEvent(new CustomEvent(OPEN_GAMES_EVENT))
}

/** What the Games app should show when it opens, once. */
export function takePendingGames(): OpenGames | null {
  const open = pending
  pending = null
  return open
}
