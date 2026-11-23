import { CanvasTexture, LinearMipmapLinearFilter, SRGBColorSpace } from 'three'

/*
 * Every signboard in the town lives in one texture atlas, so all the buildings can share one
 * material. The kit asks for a board with `signRect(text, background, ink)` while it builds its
 * shapes and gets the atlas rectangle back; `makeSignAtlas()` then paints all of them.
 */

const COLS = 2
const ROWS = 32
export const CELL_W = 512
export const CELL_H = 64

type Board = { text: string; bg: string; ink: string; sub?: string }
const boards: Board[] = []
const index = new Map<string, number>()

/** The atlas rectangle [u0, v0, u1, v1] for a board (v counts down from the top of the canvas). */
export function signRect(text: string, bg: string, ink = '#ffffff', sub?: string): [number, number, number, number] {
  const key = `${text}|${bg}|${ink}|${sub ?? ''}`
  let i = index.get(key)
  if (i === undefined) {
    i = boards.length
    if (i >= COLS * ROWS) i = i % (COLS * ROWS)
    else boards.push({ text, bg, ink, sub })
    index.set(key, i)
  }
  const col = i % COLS
  const row = Math.floor(i / COLS)
  const pu = 0.002
  const pv = 0.0012
  return [col / COLS + pu, row / ROWS + pv, (col + 1) / COLS - pu, (row + 1) / ROWS - pv]
}

/** Shop names in the Ekpoma manner, each on its own colour of board. */
export const SHOP_SIGNS: Board[] = [
  { text: 'Tasty Corner Eatery', bg: '#c8332b', ink: '#fff6e0' },
  { text: 'Emmanuel Provision Store', bg: '#1f5fbf', ink: '#ffffff' },
  { text: 'Divine Favour Pharmacy', bg: '#1e8a4c', ink: '#ffffff' },
  { text: 'Grace Abounding Ventures', bg: '#e8b923', ink: '#2b1d00' },
  { text: 'Wisdom Cyber Cafe', bg: '#6b3fa0', ink: '#ffffff' },
  { text: 'Osagie & Sons Electronics', bg: '#e8721c', ink: '#ffffff' },
  { text: 'Ehi Beauty Salon', bg: '#d0457f', ink: '#ffffff' },
  { text: 'Blessed Hands Tailoring', bg: '#14899a', ink: '#ffffff' },
  { text: 'Uyi Bakery & Cakes', bg: '#8c2f2f', ink: '#ffe9b8' },
  { text: 'Evergreen Supermarket', bg: '#2a6b34', ink: '#ffffff' },
  { text: 'New Era Phones & POS', bg: '#17407a', ink: '#ffd84a' },
  { text: 'Mama Joy Foodstuff', bg: '#c9531a', ink: '#ffffff' },
]

export const BLOCK_SIGNS: Board[] = [
  { text: 'Peace Villa Lodge', bg: '#1b4f8a', ink: '#ffffff' },
  { text: 'Favour Court Hostel', bg: '#7a2b4a', ink: '#ffffff' },
  { text: 'Hope Plaza', bg: '#2a6b6b', ink: '#ffffff' },
  { text: 'Sunrise Suites', bg: '#b8641a', ink: '#ffffff' },
]

export const KIOSK_SIGNS: Board[] = [
  { text: 'Airtime & Recharge Cards', bg: '#e8b923', ink: '#2b1d00' },
  { text: 'Cold Drinks & Pure Water', bg: '#1f6fd0', ink: '#ffffff' },
  { text: 'Suya Spot', bg: '#c8332b', ink: '#ffffff' },
]

/** Paints every board asked for so far (call once the whole kit has been built). */
export function makeSignAtlas() {
  const canvas = document.createElement('canvas')
  canvas.width = CELL_W * COLS
  canvas.height = CELL_H * ROWS
  const ctx = canvas.getContext('2d')!
  boards.forEach((b, i) => {
    const x = (i % COLS) * CELL_W
    const y = Math.floor(i / COLS) * CELL_H
    ctx.fillStyle = b.bg
    ctx.fillRect(x, y, CELL_W, CELL_H)
    // A paler band at the top and a thin ink border, like a painted board
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    ctx.fillRect(x, y, CELL_W, 6)
    ctx.strokeStyle = b.ink
    ctx.globalAlpha = 0.85
    ctx.lineWidth = 3
    ctx.strokeRect(x + 4, y + 4, CELL_W - 8, CELL_H - 8)
    ctx.globalAlpha = 1
    ctx.fillStyle = b.ink
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    let size = b.sub ? 34 : 40
    do {
      ctx.font = `800 ${size}px system-ui, "Segoe UI", sans-serif`
      size -= 2
    } while (ctx.measureText(b.text).width > CELL_W - 36 && size > 14)
    ctx.fillText(b.text, x + CELL_W / 2, y + (b.sub ? 24 : 34))
    if (b.sub) {
      ctx.font = `700 18px system-ui, "Segoe UI", sans-serif`
      ctx.fillText(b.sub, x + CELL_W / 2, y + 49)
    }
  })
  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  tex.flipY = false
  tex.minFilter = LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.anisotropy = 4
  return tex
}
