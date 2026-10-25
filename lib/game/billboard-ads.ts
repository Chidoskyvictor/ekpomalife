/**
 * Billboard ads. To change what a board shows, edit BOARD_ADS (board number → ad id),
 * or add a new entry to ADS. Images live in public/ads/.
 */

export type BillboardAd = {
  id: string
  advertiser: string
  /** One line under the advertiser name in the pop-up */
  tagline: string
  /** Portrait or square artwork shown in the pop-up */
  image: string
  imageAspect: number
  /**
   * Optional ready-made board design, about 2.4 : 1 (e.g. 2400 × 1000). Shown edge to edge on the board.
   * Keep text inside the middle 1.8 : 1 so double-sided boards don't crop it, and the top-right corner
   * clear for the board number. Without it, the board is built from `board` below + the pop-up image.
   */
  boardImage?: string
  /** Wide billboard version: headline + up to three short lines + contact, on brand colours */
  board: {
    background: string
    accent: string
    headline: string
    lines: string[]
    contact: string
  }
  whatsapp?: string
  phone?: string
  /** Last day it runs (ISO date), or undefined for open-ended */
  until?: string
}

export const ADS: Record<string, BillboardAd> = {
  'prodigy-nysc': {
    id: 'prodigy-nysc',
    advertiser: 'Prodigy Enterprises Omnium Ltd',
    tagline: 'NYSC call-up help: posting support, medicals and NERD',
    image: '/ads/prodigy-nysc.jpg',
    imageAspect: 864 / 1080,
    board: {
      background: '#0b5a33',
      accent: '#ffd21f',
      headline: 'GOT YOUR NYSC CALL-UP?',
      lines: ['Fitness Certificate ₦3,000', 'Medical Report ₦4,000', 'Both as a Bundle ₦6,000'],
      contact: 'WhatsApp / Call 0813 665 2445',
    },
    whatsapp: 'https://wa.me/2348136652445',
    phone: '08136652445',
  },
}

/** Which ad runs on each numbered board. Every board shows the Prodigy ad for now. */
export const BOARD_ADS: Record<number, string> = Object.fromEntries(
  Array.from({ length: 12 }, (_, i) => [i + 1, 'prodigy-nysc']),
)

/** Where each board stands, for the pop-up subtitle. */
export const BOARD_SPOTS: Record<number, string> = {
  1: 'Campus west · by the halls',
  2: 'Campus · admin side',
  3: 'Campus east · by the gate road',
  4: 'Campus west · front road',
  5: 'Campus east · front corner',
  6: 'Campus west · front lawn',
  7: 'Front lawn · near the gate',
  8: 'Campus east · far side',
  9: 'Town · by Magmus Autos',
  10: 'Town · church side',
  11: 'Town · Poultry Road',
  12: 'Town · Playchill corner',
}

/** "billboard-7" → 7 */
export const boardNumber = (zoneId: string) => Number(zoneId.replace(/^billboard-/, '')) || 0

export const adForBoard = (n: number): BillboardAd | null => ADS[BOARD_ADS[n] ?? ''] ?? null
