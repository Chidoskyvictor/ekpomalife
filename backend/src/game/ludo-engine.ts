/*
 * Ludo rules (pure, no I/O). Used by the live match server: the server rolls the dice and
 * validates every move, so a phone can't invent a roll or a result.
 *
 * Board: a ring of 52 cells. Colour c (0..3) starts at ring cell c*13 and walks 51 cells
 * (steps 0..50), then up its own home lane (steps 51..55) to home (step 56). -1 = in base.
 * Roll a 6 to leave base. Landing on an opponent sends those tokens back to base: the Naija way,
 * no safe squares on the ring (even a start cell). Only your own home lane is safe.
 * An exact roll is needed to reach home. A 6 gives an extra roll.
 */

export const RING = 52
export const HOME = 56
export const TOKENS = 4

export type LudoState = {
  /** colour index (0..3) of each seat */
  colors: number[]
  /** pos[seat][token]: -1 base, 0..55 on the way, 56 home */
  pos: number[][]
  turn: number
  /** the roll waiting to be played, or null if the player must roll */
  dice: number | null
  winner: number | null
}

export type LudoMoveResult = {
  token: number
  from: number
  to: number
  captured: { seat: number; token: number }[]
  extra: boolean
}

export function newLudo(colors: number[]): LudoState {
  return { colors: [...colors], pos: colors.map(() => [-1, -1, -1, -1]), turn: 0, dice: null, winner: null }
}

/** Ring cell for a step on the shared ring, or null in base / on the home lane. */
export function ringCell(color: number, step: number): number | null {
  if (step < 0 || step > 50) return null
  return (color * 13 + step) % RING
}

export function legalTokens(s: LudoState): number[] {
  if (s.winner != null || s.dice == null) return []
  const out: number[] = []
  s.pos[s.turn]!.forEach((p, t) => {
    if (p === -1 ? s.dice === 6 : p + s.dice! <= HOME) out.push(t)
  })
  return out
}

function nextTurn(s: LudoState) {
  s.turn = (s.turn + 1) % s.colors.length
  s.dice = null
}

/** Set the roll for the player to move. If nothing can move, the turn passes. */
export function applyRoll(s: LudoState, value: number): { ok: boolean; legal: number[]; passed: boolean } {
  if (s.winner != null || s.dice != null || !Number.isInteger(value) || value < 1 || value > 6) {
    return { ok: false, legal: [], passed: false }
  }
  s.dice = value
  const legal = legalTokens(s)
  if (!legal.length) {
    nextTurn(s)
    return { ok: true, legal, passed: true }
  }
  return { ok: true, legal, passed: false }
}

export function applyMove(s: LudoState, token: number): LudoMoveResult | null {
  if (!legalTokens(s).includes(token)) return null
  const dice = s.dice!
  const seat = s.turn
  const from = s.pos[seat]![token]!
  const to = from === -1 ? 0 : from + dice
  s.pos[seat]![token] = to
  const captured: LudoMoveResult['captured'] = []
  const cell = ringCell(s.colors[seat]!, to)
  if (cell != null) {
    s.pos.forEach((tokens, other) => {
      if (other === seat) return
      tokens.forEach((p, t) => {
        if (ringCell(s.colors[other]!, p) === cell) {
          tokens[t] = -1
          captured.push({ seat: other, token: t })
        }
      })
    })
  }
  if (s.pos[seat]!.every((p) => p === HOME)) {
    s.winner = seat
    s.dice = null
    return { token, from, to, captured, extra: false }
  }
  const extra = dice === 6
  if (extra) s.dice = null
  else nextTurn(s)
  return { token, from, to, captured, extra }
}

/** The legal token furthest along (used when a player runs out of time). */
export function autoToken(s: LudoState): number | null {
  const legal = legalTokens(s)
  if (!legal.length) return null
  return legal.reduce((best, t) => (s.pos[s.turn]![t]! > s.pos[s.turn]![best]! ? t : best), legal[0]!)
}
