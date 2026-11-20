/*
 * Naija Ludo rules (pure, no I/O, no dependencies). The live match server owns one of these
 * per table: it rolls the dice and validates every move, so a phone can't invent a roll.
 * lib/game/ludo-engine.ts is an identical copy used by the phone-vs-computer game.
 *
 * Board: a ring of 52 cells. Colour c (0..3) starts at ring cell c*13 and walks 51 cells
 * (steps 0..50), then up its own home lane (steps 51..55) to home (step 56). -1 = in base.
 *
 * Two dice are rolled together:
 *  - a seed leaves base only with a 6 (that die is spent on it);
 *  - each die may move a different seed (a 4 and a 3 → one seed by 4, another by 3) …
 *  - … or both dice may be added and one seed moved by the total (4+3 → 7);
 *  - 6+1: the 6 brings a seed out, the 1 moves a seed; double six: two seeds out AND roll again;
 *  - landing on an opponent sends that seed home (no safe squares on the ring, only your own
 *    home lane is safe); an exact count is needed to reach home.
 */

export const RING = 52
export const HOME = 56
export const TOKENS = 4

export type Dice = [number, number]
/** die: 0 / 1 = use that die alone; 'sum' = both dice added, on a seed already out. */
export type LudoMove = { token: number; die: 0 | 1 | 'sum' }

export type LudoState = {
  /** colour index (0..3) of each seat */
  colors: number[]
  /** pos[seat][token]: -1 base, 0..55 on the way, 56 home */
  pos: number[][]
  turn: number
  /** the two dice waiting to be played, or null if the player must roll */
  dice: Dice | null
  used: [boolean, boolean]
  winner: number | null
}

export type LudoMoveResult = {
  token: number
  from: number
  to: number
  die: LudoMove['die']
  steps: number
  captured: { seat: number; token: number }[]
  /** this move used up the roll and a double six gives the player another one */
  extra: boolean
  /** the roll is finished (no dice left that can be played) */
  ended: boolean
}

export function newLudo(colors: number[]): LudoState {
  return {
    colors: [...colors],
    pos: colors.map(() => [-1, -1, -1, -1]),
    turn: 0,
    dice: null,
    used: [false, false],
    winner: null,
  }
}

/** Ring cell for a step on the shared ring, or null in base / on the home lane. */
export function ringCell(color: number, step: number): number | null {
  if (step < 0 || step > 50) return null
  return (color * 13 + step) % RING
}

/** Where a seed would land using `steps`, or null if it can't. Base seeds need exactly a 6. */
export function destination(from: number, steps: number): number | null {
  if (from === HOME) return null
  if (from === -1) return steps === 6 ? 0 : null
  return from + steps <= HOME ? from + steps : null
}

export function legalMoves(s: LudoState): LudoMove[] {
  if (s.winner != null || s.dice == null) return []
  const out: LudoMove[] = []
  const mine = s.pos[s.turn]!
  mine.forEach((p, token) => {
    for (const die of [0, 1] as const) {
      if (!s.used[die] && destination(p, s.dice![die]) != null) out.push({ token, die })
    }
    if (p >= 0 && !s.used[0] && !s.used[1] && destination(p, s.dice![0] + s.dice![1]) != null) {
      out.push({ token, die: 'sum' })
    }
  })
  return out
}

function nextTurn(s: LudoState) {
  s.turn = (s.turn + 1) % s.colors.length
  s.dice = null
  s.used = [false, false]
}

const isDoubleSix = (d: Dice) => d[0] === 6 && d[1] === 6

function validDie(v: number) {
  return Number.isInteger(v) && v >= 1 && v <= 6
}

/** Set the roll for the player to move. If nothing can move, the turn passes. */
export function applyRoll(s: LudoState, a: number, b: number): { ok: boolean; moves: LudoMove[]; passed: boolean } {
  if (s.winner != null || s.dice != null || !validDie(a) || !validDie(b)) return { ok: false, moves: [], passed: false }
  s.dice = [a, b]
  s.used = [false, false]
  const moves = legalMoves(s)
  if (!moves.length) {
    nextTurn(s)
    return { ok: true, moves, passed: true }
  }
  return { ok: true, moves, passed: false }
}

export function applyMove(s: LudoState, move: LudoMove): LudoMoveResult | null {
  const allowed = legalMoves(s).some((m) => m.token === move.token && m.die === move.die)
  if (!allowed) return null
  const dice = s.dice!
  const seat = s.turn
  const steps = move.die === 'sum' ? dice[0] + dice[1] : dice[move.die]
  const from = s.pos[seat]![move.token]!
  const to = destination(from, steps)!
  s.pos[seat]![move.token] = to
  if (move.die === 'sum') s.used = [true, true]
  else s.used[move.die] = true

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
  const base = { token: move.token, from, to, die: move.die, steps, captured }
  if (s.pos[seat]!.every((p) => p === HOME)) {
    s.winner = seat
    s.dice = null
    return { ...base, extra: false, ended: true }
  }
  if (legalMoves(s).length > 0) return { ...base, extra: false, ended: false }
  // Nothing left to play on this roll
  const extra = isDoubleSix(dice)
  if (extra) {
    s.dice = null
    s.used = [false, false]
  } else nextTurn(s)
  return { ...base, extra, ended: true }
}

/** A sensible move for a computer player or a player who ran out of time. */
export function autoMove(s: LudoState): LudoMove | null {
  const moves = legalMoves(s)
  if (!moves.length) return null
  const seat = s.turn
  const score = (m: LudoMove) => {
    const steps = m.die === 'sum' ? s.dice![0] + s.dice![1] : s.dice![m.die]
    const from = s.pos[seat]![m.token]!
    const to = destination(from, steps)!
    let v = to + (from === -1 ? 30 : 0)
    if (to === HOME) v += 60
    const cell = ringCell(s.colors[seat]!, to)
    if (cell != null) {
      s.pos.forEach((tokens, other) => {
        if (other !== seat) tokens.forEach((p) => ringCell(s.colors[other]!, p) === cell && (v += 80))
      })
    }
    // prefer single-die moves so both dice get used
    if (m.die === 'sum') v -= 15
    return v
  }
  return moves.reduce((best, m) => (score(m) > score(best) ? m : best), moves[0]!)
}
