import Game from 'whot'
import type { CardShape } from 'whot/dist/shapes'

export type WhotCardView = {
  value: number
  shape: CardShape
  move?: string
  iNeed?: CardShape
}

export type WhotAlert =
  | { kind: 'last-card'; seat: number }
  | { kind: 'checkup'; seat: number }
  | { kind: 'special'; text: string }

export type WhotPublicState = {
  phase: 'playing' | 'over'
  pileTop: WhotCardView | null
  marketCount: number
  currentSeat: number | null
  players: {
    seat: number
    name: string
    cardCount: number
    eliminated: boolean
    isTurn: boolean
  }[]
  alerts: WhotAlert[]
  winnerSeat: number | null
  mustPick: boolean
  callShape: CardShape | null
}

const SHAPES: CardShape[] = ['Circle', 'Triangle', 'Cross', 'Square', 'Star', 'Whot']

type CardLike = { value: number; shape: CardShape; move: string; iNeed?: CardShape }

function cardView(card: CardLike | undefined | null): WhotCardView | null {
  if (!card) return null
  return {
    value: card.value,
    shape: card.shape,
    move: card.move && card.move !== 'None' ? card.move : undefined,
    iNeed: card.iNeed,
  }
}

export function seatIndexFromPlayerId(playerId: number) {
  return playerId - 1
}

export function advancePastEliminated(game: Game, eliminated: Set<number>) {
  const total = game.players.length
  let guard = total + 1
  while (guard-- > 0) {
    const p = game.turn.next()
    if (!p) return
    const seat = seatIndexFromPlayerId(p.id)
    if (!eliminated.has(seat)) return
    game.turn.switch()
  }
}

export function buildPublicState(
  game: Game,
  names: string[],
  eliminated: Set<number>,
  alerts: WhotAlert[],
  winnerSeat: number | null,
): WhotPublicState {
  const current = game.turn.next()
  const currentSeat = current ? seatIndexFromPlayerId(current.id) : null
  const pileTop = cardView(game.pile.top() as CardLike)
  const mustPick = Boolean(current && !eliminated.has(seatIndexFromPlayerId(current.id)) && current.toPick > 0)
  return {
    phase: winnerSeat != null ? 'over' : 'playing',
    pileTop,
    marketCount: game.market.count(),
    currentSeat: currentSeat != null && eliminated.has(currentSeat) ? null : currentSeat,
    players: game.players.map((p, i) => ({
      seat: i,
      name: names[i] ?? `Player ${i + 1}`,
      cardCount: eliminated.has(i) ? 0 : p.hand().length,
      eliminated: eliminated.has(i),
      isTurn: Boolean(p.turn && !eliminated.has(i)),
    })),
    alerts,
    winnerSeat,
    mustPick,
    callShape: pileTop?.iNeed ?? null,
  }
}

export function handForSeat(game: Game, seat: number): WhotCardView[] {
  const p = game.players[seat]
  if (!p) return []
  return p.hand().map((c) => cardView(c as CardLike)!)
}

export function tryPlay(game: Game, seat: number, cardIndex: number, shape?: CardShape) {
  const player = game.players[seat]
  if (!player?.turn) return { ok: false as const, error: 'Not your turn.' }
  try {
    const card = player.play(cardIndex, shape)
    game.turn.execute(card)
    return { ok: true as const, card, lastCard: player.lastCard(), checkup: player.hasWon }
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : 'Invalid play.' }
  }
}

export function tryPick(game: Game, seat: number) {
  const player = game.players[seat]
  if (!player?.turn) return { ok: false as const, error: 'Not your turn.' }
  try {
    player.pick()
    if (player.toPick === 0) game.turn.switch()
    return { ok: true as const }
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : 'Cannot pick.' }
  }
}

export function pickCompatibleIndex(game: Game, seat: number): number {
  const player = game.players[seat]
  if (!player) return -1
  const top = game.pile.top()
  return player.hand().findIndex((c) => c.matches(top) || c.shape === 'Whot')
}

export function botShapeChoice(): CardShape {
  const choices = SHAPES.filter((s) => s !== 'Whot')
  return choices[Math.floor(Math.random() * choices.length)]!
}

export function checkWinner(game: Game, eliminated: Set<number>): number | null {
  for (let i = 0; i < game.players.length; i++) {
    if (eliminated.has(i)) continue
    if (game.players[i]!.hasWon || game.players[i]!.empty()) return i
  }
  const alive = game.players.map((_, i) => i).filter((i) => !eliminated.has(i))
  if (alive.length === 1) return alive[0]!
  return null
}
