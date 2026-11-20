import { HOME } from '@/lib/game/ludo-engine'

/*
 * Board geometry for the 15×15 Ludo cross. Cells are 1×1; (col,row) of a cell's top-left.
 * The ring is walked clockwise from red's start cell; colour c starts at ring cell c*13.
 * Colours: 0 red (top-left), 1 green (top-right), 2 yellow (bottom-right), 3 blue (bottom-left).
 */

export const COLOR_NAMES = ['Red', 'Green', 'Yellow', 'Blue'] as const
export const COLOR_HEX = ['#e0372d', '#1fa35a', '#f2b01e', '#2f6fe0'] as const
export const COLOR_DARK = ['#a3201a', '#126b3a', '#b57d06', '#1c47a3'] as const

type XY = [number, number]

export const RING_CELLS: XY[] = (() => {
  const p: XY[] = []
  const add = (c: number, r: number) => p.push([c, r])
  for (let c = 1; c <= 5; c++) add(c, 6)
  for (let r = 5; r >= 0; r--) add(6, r)
  add(7, 0)
  add(8, 0)
  for (let r = 1; r <= 5; r++) add(8, r)
  for (let c = 9; c <= 14; c++) add(c, 6)
  add(14, 7)
  add(14, 8)
  for (let c = 13; c >= 9; c--) add(c, 8)
  for (let r = 9; r <= 14; r++) add(8, r)
  add(7, 14)
  add(6, 14)
  for (let r = 13; r >= 9; r--) add(6, r)
  for (let c = 5; c >= 0; c--) add(c, 8)
  add(0, 7)
  add(0, 6)
  return p
})()

/** home-lane cells (steps 51..55) per colour */
export const LANE_CELLS: XY[][] = [
  [1, 2, 3, 4, 5].map((c): XY => [c, 7]),
  [1, 2, 3, 4, 5].map((r): XY => [7, r]),
  [13, 12, 11, 10, 9].map((c): XY => [c, 7]),
  [13, 12, 11, 10, 9].map((r): XY => [7, r]),
]

const BASE_ORIGIN: XY[] = [
  [0, 0],
  [9, 0],
  [9, 9],
  [0, 9],
]
const BASE_SLOT: XY[] = [
  [2, 2],
  [4, 2],
  [2, 4],
  [4, 4],
]
const HOME_DIR: XY[] = [
  [-1, 0],
  [0, -1],
  [1, 0],
  [0, 1],
]

export function baseSlot(color: number, token: number): XY {
  const [ox, oy] = BASE_ORIGIN[color]!
  const [sx, sy] = BASE_SLOT[token]!
  return [ox + sx, oy + sy]
}

/** Centre of the cell a seed stands on (cell units), for any step -1..56. */
export function seedXY(color: number, step: number, token: number): XY {
  if (step < 0) return baseSlot(color, token)
  if (step === HOME) {
    const [dx, dy] = HOME_DIR[color]!
    const sideways: XY = [-dy, dx]
    const k = (token - 1.5) * 0.28
    return [7.5 + dx * 0.95 + sideways[0] * k, 7.5 + dy * 0.95 + sideways[1] * k]
  }
  const cell = step <= 50 ? RING_CELLS[(color * 13 + step) % 52]! : LANE_CELLS[color]![step - 51]!
  return [cell[0] + 0.5, cell[1] + 0.5]
}
