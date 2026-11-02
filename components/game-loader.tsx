'use client'

import GameShell from './game-shell'

/** Home entry — guests explore the map; logged-in players need completed setup (checked by PlayShell). */
export function GameLoader() {
  return <GameShell />
}
