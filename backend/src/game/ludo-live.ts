import { randomInt } from 'node:crypto'
import { applyMove, applyRoll, autoToken, legalTokens, newLudo, type LudoMoveResult, type LudoState } from './ludo-engine.js'

/*
 * Live Ludo matches (1v1). The server holds the board, rolls the dice and checks every
 * move; phones only ask to "roll" or "move" a token. The winner is decided here and settled
 * by the match system, so a phone can't report a fake result.
 */

/** Seat 0 plays red (colour 0), seat 1 plays yellow (colour 2): opposite corners. */
const COLORS = [0, 2]
export const LUDO_TURN_MS = 45_000

type Room = {
  state: LudoState
  last: { seat: number; roll?: number; move?: LudoMoveResult; passed?: boolean } | null
  deadline: number
  timer: ReturnType<typeof setTimeout> | null
  settled: boolean
}

const rooms = new Map<string, Room>()

export type LudoHooks = {
  /** send a message to both phones in the match */
  broadcast: (matchId: string, msg: unknown) => void
  /** the match is decided: pay out */
  finish: (matchId: string, winnerSeat: number) => void
  /** dice source (tests inject their own) */
  roll?: () => number
}

let hooks: LudoHooks | null = null
export function setLudoHooks(h: LudoHooks) {
  hooks = h
}

function rollDie() {
  return hooks?.roll ? hooks.roll() : randomInt(1, 7)
}

export function ludoRoom(matchId: string) {
  let room = rooms.get(matchId)
  if (!room) {
    room = { state: newLudo(COLORS), last: null, deadline: Date.now() + LUDO_TURN_MS, timer: null, settled: false }
    rooms.set(matchId, room)
    arm(matchId, room)
  }
  return room
}

export function ludoView(matchId: string) {
  const room = ludoRoom(matchId)
  const s = room.state
  return {
    t: 'ludo',
    colors: s.colors,
    pos: s.pos,
    turn: s.turn,
    dice: s.dice,
    legal: legalTokens(s),
    winner: s.winner,
    last: room.last,
    secondsLeft: Math.max(0, Math.ceil((room.deadline - Date.now()) / 1000)),
  }
}

function push(matchId: string) {
  hooks?.broadcast(matchId, ludoView(matchId))
}

function arm(matchId: string, room: Room) {
  if (room.timer) clearTimeout(room.timer)
  room.deadline = Date.now() + LUDO_TURN_MS
  if (room.state.winner != null) return
  room.timer = setTimeout(() => {
    // Out of time: roll and play for the player so the game never stalls
    const s = room.state
    if (s.winner != null) return
    const seat = s.turn
    if (s.dice == null) act(matchId, seat, { t: 'roll' })
    const token = autoToken(room.state)
    if (room.state.turn === seat && token != null) act(matchId, seat, { t: 'move', token })
  }, LUDO_TURN_MS)
  room.timer.unref?.()
}

/** A phone asks to roll or move. Anything not allowed is refused with a short reason. */
export function act(matchId: string, seat: number, msg: { t?: unknown; token?: unknown }): { ok: boolean; error?: string } {
  const room = ludoRoom(matchId)
  const s = room.state
  if (s.winner != null) return { ok: false, error: 'Game over.' }
  if (s.turn !== seat) return { ok: false, error: 'Not your turn.' }
  if (msg.t === 'roll') {
    if (s.dice != null) return { ok: false, error: 'Move a token first.' }
    const value = rollDie()
    const res = applyRoll(s, value)
    room.last = { seat, roll: value, passed: res.passed }
    arm(matchId, room)
    push(matchId)
    return { ok: true }
  }
  if (msg.t === 'move') {
    const token = typeof msg.token === 'number' ? msg.token : -1
    const roll = s.dice
    const moved = applyMove(s, token)
    if (!moved) return { ok: false, error: 'That token can’t move.' }
    room.last = { seat, roll: roll ?? undefined, move: moved }
    arm(matchId, room)
    push(matchId)
    if (s.winner != null && !room.settled) {
      room.settled = true
      hooks?.finish(matchId, s.winner)
    }
    return { ok: true }
  }
  return { ok: false, error: 'Unknown action.' }
}

export function dropLudoRoom(matchId: string) {
  const room = rooms.get(matchId)
  if (room?.timer) clearTimeout(room.timer)
  rooms.delete(matchId)
}
