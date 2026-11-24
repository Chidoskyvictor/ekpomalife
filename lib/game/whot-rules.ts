/*
 * Naija Whot rules (pure, no I/O, no dependencies). The live server owns one of these per
 * table and validates every action; the phone-vs-computer game runs the same file in the
 * browser (lib/game/whot-rules.ts is an identical copy — keep the two in sync).
 *
 * Deck: the standard 54-card Whot pack.
 *   circle   1 2 3 4 5 7 8 10 11 12 13 14   (12)
 *   triangle 1 2 3 4 5 7 8 10 11 12 13 14   (12)
 *   cross    1 2 3 5 7 10 11 13 14           (9)
 *   square   1 2 3 5 7 10 11 13 14           (9)
 *   star     1 2 3 4 5 7 8                   (7)
 *   whot     20 ×5                           (5)
 * Specials: 1 Hold On (play again), 2 Pick Two, 5 Pick Three, 8 Suspension (next player
 * misses a turn), 14 General Market (everyone else picks one, you play again), 20 Whot (play
 * on anything, then call the shape that must follow).
 */

export type Shape = 'circle' | 'triangle' | 'cross' | 'square' | 'star' | 'whot'
export const CALLABLE_SHAPES: Shape[] = ['circle', 'triangle', 'cross', 'square', 'star']

export type Card = { id: number; shape: Shape; num: number }

export type WhotRules = {
  /** a pick-two/pick-three can be answered with the same card, passing the bigger pick on */
  stackPicks: boolean
  /** a player left on one card must call "last card" or pick two */
  lastCardCall: boolean
}
export const DEFAULT_RULES: WhotRules = { stackPicks: true, lastCardCall: true }

const DECK_SPEC: Record<Exclude<Shape, 'whot'>, number[]> = {
  circle: [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14],
  triangle: [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14],
  cross: [1, 2, 3, 5, 7, 10, 11, 13, 14],
  square: [1, 2, 3, 5, 7, 10, 11, 13, 14],
  star: [1, 2, 3, 4, 5, 7, 8],
}

export const HAND_SIZE = 6
export const LAST_CARD_PENALTY = 2

export function buildDeck(): Card[] {
  const cards: Card[] = []
  let id = 0
  for (const shape of Object.keys(DECK_SPEC) as Exclude<Shape, 'whot'>[]) {
    for (const num of DECK_SPEC[shape]) cards.push({ id: id++, shape, num })
  }
  for (let i = 0; i < 5; i++) cards.push({ id: id++, shape: 'whot', num: 20 })
  return cards
}

export type Special = 'hold-on' | 'pick-two' | 'pick-three' | 'suspension' | 'general-market' | 'whot'

export function specialOf(card: Card): Special | null {
  if (card.shape === 'whot') return 'whot'
  switch (card.num) {
    case 1:
      return 'hold-on'
    case 2:
      return 'pick-two'
    case 5:
      return 'pick-three'
    case 8:
      return 'suspension'
    case 14:
      return 'general-market'
    default:
      return null
  }
}

export type WhotEvent =
  | { kind: 'play'; seat: number; card: Card; call?: Shape }
  | { kind: 'pick'; seat: number; count: number }
  | { kind: 'hold-on'; seat: number }
  | { kind: 'suspended'; seat: number }
  | { kind: 'general-market'; seat: number }
  | { kind: 'last-card'; seat: number }
  | { kind: 'penalty'; seat: number; count: number }
  | { kind: 'reshuffle' }
  | { kind: 'win'; seat: number }

export type WhotState = {
  rules: WhotRules
  hands: Card[][]
  market: Card[]
  pile: Card[]
  turn: number
  /** cards the player on turn must pick unless they answer (stacking) */
  pending: number
  /** kind of the pending pick, so only the same kind stacks */
  pendingKind: 'pick-two' | 'pick-three' | null
  /** shape demanded by the last Whot 20 */
  called: Shape | null
  /** the player on turn already played a Hold On / General Market and plays again */
  again: boolean
  /** seat that owes a "last card" call (resolved on the next action by anyone) */
  owesCall: number | null
  winner: number | null
  /** seats that left the table: their cards went back to the market and they are skipped */
  out?: boolean[]
}

export type ActionResult = { ok: true; events: WhotEvent[] } | { ok: false; error: string }

export type Rng = () => number

function shuffle<T>(items: T[], rng: Rng): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

export function newWhot(players: number, rules: WhotRules = DEFAULT_RULES, rng: Rng = Math.random): WhotState {
  if (!Number.isInteger(players) || players < 2 || players > 4) throw new Error('Whot is 2–4 players.')
  const deck = shuffle(buildDeck(), rng)
  const hands: Card[][] = Array.from({ length: players }, () => [])
  for (let r = 0; r < HAND_SIZE; r++) for (let p = 0; p < players; p++) hands[p]!.push(deck.pop()!)
  // The first card turned up is never a special: those go back under the market.
  let start = deck.pop()!
  while (specialOf(start)) {
    deck.unshift(start)
    start = deck.pop()!
  }
  return {
    rules: { ...rules },
    hands,
    market: deck,
    pile: [start],
    turn: 0,
    pending: 0,
    pendingKind: null,
    called: null,
    again: false,
    owesCall: null,
    winner: null,
  }
}

export function top(s: WhotState): Card {
  return s.pile[s.pile.length - 1]!
}

/** Does `card` match the top of the pile (or the shape called on a Whot)? */
export function matches(s: WhotState, card: Card): boolean {
  if (card.shape === 'whot') return true
  const t = top(s)
  if (t.shape === 'whot') return s.called == null ? true : card.shape === s.called
  return card.shape === t.shape || card.num === t.num
}

export function canPlay(s: WhotState, seat: number, card: Card): boolean {
  if (s.winner != null || s.turn !== seat) return false
  if (s.pending > 0) {
    // Under a pick penalty only the same special can be played, and only with stacking on.
    return s.rules.stackPicks && specialOf(card) === s.pendingKind
  }
  return matches(s, card)
}

export function playableIds(s: WhotState, seat: number): number[] {
  return (s.hands[seat] ?? []).filter((c) => canPlay(s, seat, c)).map((c) => c.id)
}

function refill(s: WhotState, events: WhotEvent[], rng: Rng) {
  if (s.market.length > 0 || s.pile.length <= 1) return
  const keep = s.pile.pop()!
  s.market = shuffle(s.pile, rng)
  s.pile = [keep]
  events.push({ kind: 'reshuffle' })
}

function draw(s: WhotState, seat: number, count: number, events: WhotEvent[], rng: Rng): number {
  let got = 0
  for (let i = 0; i < count; i++) {
    refill(s, events, rng)
    const c = s.market.pop()
    if (!c) break
    s.hands[seat]!.push(c)
    got++
  }
  return got
}

function isOut(s: WhotState, seat: number) {
  return Boolean(s.out?.[seat])
}

/** The seat `steps` active players after `from` (seats that left are skipped). */
function nextSeat(s: WhotState, from: number, steps = 1) {
  let seat = from
  for (let i = 0; i < steps; i++) {
    do seat = (seat + 1) % s.hands.length
    while (isOut(s, seat) && seat !== from)
  }
  return seat
}

function advance(s: WhotState, steps = 1) {
  s.turn = nextSeat(s, s.turn, steps)
  s.again = false
}

/** If a player owed a "last card" call and didn't make it, they pick two now. */
function settleCall(s: WhotState, acting: number, events: WhotEvent[], rng: Rng) {
  const owed = s.owesCall
  if (owed == null || owed === acting) return
  s.owesCall = null
  if (!s.rules.lastCardCall) return
  if (s.hands[owed]!.length !== 1) return
  const n = draw(s, owed, LAST_CARD_PENALTY, events, rng)
  events.push({ kind: 'penalty', seat: owed, count: n })
}

export function play(s: WhotState, seat: number, cardId: number, call?: Shape, rng: Rng = Math.random): ActionResult {
  if (s.winner != null) return { ok: false, error: 'Game over.' }
  if (s.turn !== seat) return { ok: false, error: 'Not your turn.' }
  const hand = s.hands[seat]!
  const idx = hand.findIndex((c) => c.id === cardId)
  if (idx < 0) return { ok: false, error: 'You don’t hold that card.' }
  const card = hand[idx]!
  if (!canPlay(s, seat, card)) {
    return {
      ok: false,
      error: s.pending > 0 ? `Pick ${s.pending} from the market.` : 'That card doesn’t match the pile.',
    }
  }
  const kind = specialOf(card)
  if (kind === 'whot' && (!call || !CALLABLE_SHAPES.includes(call))) {
    return { ok: false, error: 'Call a shape for your Whot.' }
  }

  const events: WhotEvent[] = []
  settleCall(s, seat, events, rng)

  hand.splice(idx, 1)
  s.pile.push(card)
  s.called = kind === 'whot' ? call! : null
  events.push({ kind: 'play', seat, card, call: kind === 'whot' ? call : undefined })

  if (hand.length === 0) {
    s.winner = seat
    s.owesCall = null
    events.push({ kind: 'win', seat })
    return { ok: true, events }
  }
  if (hand.length === 1) {
    s.owesCall = seat
  }

  switch (kind) {
    case 'hold-on':
      s.again = true
      events.push({ kind: 'hold-on', seat })
      break
    case 'general-market':
      for (let p = 0; p < s.hands.length; p++) {
        if (p === seat || isOut(s, p)) continue
        const n = draw(s, p, 1, events, rng)
        events.push({ kind: 'pick', seat: p, count: n })
      }
      s.again = true
      events.push({ kind: 'general-market', seat })
      break
    case 'pick-two':
    case 'pick-three': {
      const add = kind === 'pick-two' ? 2 : 3
      s.pending = (s.pendingKind === kind ? s.pending : 0) + add
      s.pendingKind = kind
      advance(s)
      break
    }
    case 'suspension': {
      const skipped = nextSeat(s, seat)
      events.push({ kind: 'suspended', seat: skipped })
      advance(s, 2)
      break
    }
    default:
      advance(s)
  }
  return { ok: true, events }
}

export function pick(s: WhotState, seat: number, rng: Rng = Math.random): ActionResult {
  if (s.winner != null) return { ok: false, error: 'Game over.' }
  if (s.turn !== seat) return { ok: false, error: 'Not your turn.' }
  const events: WhotEvent[] = []
  settleCall(s, seat, events, rng)
  const count = s.pending > 0 ? s.pending : 1
  const got = draw(s, seat, count, events, rng)
  events.push({ kind: 'pick', seat, count: got })
  if (got === 0) {
    // The market is dry and the pile can't be reshuffled: the game ends, fewest cards wins
    // (ties go to the lower card total).
    const alive = s.hands.map((_, i) => i).filter((i) => !isOut(s, i))
    const total = (i: number) => s.hands[i]!.reduce((n, c) => n + c.num, 0)
    alive.sort((a, b) => s.hands[a]!.length - s.hands[b]!.length || total(a) - total(b))
    s.winner = alive[0]!
    s.owesCall = null
    events.push({ kind: 'win', seat: s.winner })
    return { ok: true, events }
  }
  s.pending = 0
  s.pendingKind = null
  advance(s)
  return { ok: true, events }
}

/** A player leaves mid-game: their cards go back under the market and play carries on. */
export function forfeit(s: WhotState, seat: number): WhotEvent[] {
  if (s.winner != null || isOut(s, seat)) return []
  s.out = s.out ?? s.hands.map(() => false)
  s.out[seat] = true
  s.market.unshift(...s.hands[seat]!)
  s.hands[seat] = []
  if (s.owesCall === seat) s.owesCall = null
  const alive = s.hands.map((_, i) => i).filter((i) => !s.out![i])
  const events: WhotEvent[] = []
  if (alive.length === 1) {
    s.winner = alive[0]!
    events.push({ kind: 'win', seat: s.winner })
    return events
  }
  if (s.turn === seat) {
    s.pending = 0
    s.pendingKind = null
    s.turn = nextSeat(s, seat)
    s.again = false
  }
  return events
}

/** "Last card!" — the player down to one card announces it. */
export function callLastCard(s: WhotState, seat: number): ActionResult {
  if (s.winner != null) return { ok: false, error: 'Game over.' }
  if (s.owesCall !== seat) return { ok: false, error: 'Nothing to call.' }
  s.owesCall = null
  return { ok: true, events: [{ kind: 'last-card', seat }] }
}

/** Simple computer opponent / timeout autoplay. Returns the action it took. */
export function autoMove(s: WhotState, seat: number, rng: Rng = Math.random): ActionResult {
  if (s.owesCall === seat) callLastCard(s, seat)
  const ids = playableIds(s, seat)
  if (!ids.length) return pick(s, seat, rng)
  const hand = s.hands[seat]!
  const cards = ids.map((id) => hand.find((c) => c.id === id)!)
  // Save Whot 20s for when nothing else fits; otherwise play the highest-value special first.
  const normal = cards.filter((c) => c.shape !== 'whot')
  const choice = normal.length ? normal[Math.floor(rng() * normal.length)]! : cards[0]!
  let call: Shape | undefined
  if (choice.shape === 'whot') {
    const counts = new Map<Shape, number>()
    for (const c of hand) if (c.shape !== 'whot') counts.set(c.shape, (counts.get(c.shape) ?? 0) + 1)
    call = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? CALLABLE_SHAPES[Math.floor(rng() * 5)]!
  }
  return play(s, seat, choice.id, call, rng)
}

/** What each player is allowed to see. */
export type WhotView = {
  phase: 'playing' | 'over'
  rules: WhotRules
  pileTop: Card
  called: Shape | null
  marketCount: number
  turn: number
  pending: number
  pendingKind: 'pick-two' | 'pick-three' | null
  again: boolean
  owesCall: number | null
  winner: number | null
  counts: number[]
  out: boolean[]
  hand: Card[]
  playable: number[]
}

export function viewFor(s: WhotState, seat: number): WhotView {
  return {
    phase: s.winner != null ? 'over' : 'playing',
    rules: s.rules,
    pileTop: top(s),
    called: s.called,
    marketCount: s.market.length,
    turn: s.turn,
    pending: s.pending,
    pendingKind: s.pendingKind,
    again: s.again,
    owesCall: s.owesCall,
    winner: s.winner,
    counts: s.hands.map((h) => h.length),
    out: s.hands.map((_, i) => isOut(s, i)),
    hand: s.hands[seat] ?? [],
    playable: s.winner == null && s.turn === seat ? playableIds(s, seat) : [],
  }
}
