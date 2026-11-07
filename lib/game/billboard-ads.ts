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
  /** WhatsApp group invite link, shown as a "Join group" button in the pop-up */
  group?: string
  phone?: string
  /** Last day it runs (ISO date), or undefined for open-ended */
  until?: string
}

export const ADS: Record<string, BillboardAd> = {
  'prodigy-nysc': {
    id: 'prodigy-nysc',
    advertiser: 'Prodigy Enterprises Omnium Ltd',
    tagline: 'NYSC call-up help: posting support, medicals and NERD',
    image: '/ads/prodigy-nysc.webp',
    imageAspect: 864 / 1080,
    board: {
      background: '#0b5a33',
      accent: '#ffd21f',
      headline: 'GOT YOUR NYSC CALL-UP?',
      lines: ['Fitness Certificate ₦3,000', 'Medical Report ₦4,000', 'Both as a Bundle ₦6,000'],
      contact: 'WhatsApp / Call 0813 665 2445',
    },
    whatsapp: 'https://wa.me/2348136652445',
    group: 'https://chat.whatsapp.com/CJ93ONY9CAWGYlgfryoIuT?s=cl&p=a&mlu=4&ilr=4&iam=2',
    phone: '08136652445',
  },
  'prodigy-markethub': {
    id: 'prodigy-markethub',
    advertiser: 'Prodigy Markethub',
    tagline: 'Quality products, great prices, all in one place',
    image: '/ads/prodigy-markethub.webp',
    imageAspect: 853 / 1280,
    board: {
      background: '#1f3349',
      accent: '#22c55e',
      headline: 'PRODIGY MARKETHUB',
      lines: ['Groceries · Gadgets · Fashion', 'Home, Beauty, Kids and more', 'Shop smart, live better!'],
      contact: 'WhatsApp / Call 0813 665 2445',
    },
    whatsapp: 'https://wa.me/2348136652445',
    group: 'https://chat.whatsapp.com/Gai8In9DMlF3G2vW9UzQvI?s=cl&p=a&iam=2',
    phone: '08136652445',
  },
  'prodigy-media': {
    id: 'prodigy-media',
    advertiser: '(AAU) Prodigy Media',
    tagline: 'AAU news, gist and updates in one group',
    image: '/ads/prodigy-media.jpg',
    imageAspect: 1,
    board: {
      background: '#14532d',
      accent: '#ffd21f',
      headline: 'PRODIGY MEDIA',
      lines: ['AAU news and gist', 'First to know, every day', 'Join the group'],
      contact: 'WhatsApp / Call 0813 665 2445',
    },
    group: 'https://chat.whatsapp.com/EVfZ9Y3UmMa4devC5aV6Rw?s=cl&p=a&mlu=4&ilr=4&iam=2',
    phone: '08136652445',
  },
  'prodigy-story-lovers': {
    id: 'prodigy-story-lovers',
    advertiser: 'Prodigy Story Lovers',
    tagline: 'Stories you can’t put down',
    image: '/ads/prodigy-story-lovers.jpg',
    imageAspect: 1,
    board: {
      background: '#1f3349',
      accent: '#22c55e',
      headline: 'PRODIGY STORY LOVERS',
      lines: ['New stories every week', 'Read, share, discuss', 'Join the group'],
      contact: 'WhatsApp / Call 0813 665 2445',
    },
    group: 'https://chat.whatsapp.com/Cxb0ZQ2U2h16Ula4qSfEW2?s=cl&p=a&mlu=4&ilr=4&iam=2',
    phone: '08136652445',
  },
}

/** Which ad runs on each numbered board: the four ads take turns, so neighbours differ. */
const ROTATION = ['prodigy-nysc', 'prodigy-markethub', 'prodigy-media', 'prodigy-story-lovers']
export const BOARD_ADS: Record<number, string> = Object.fromEntries(
  Array.from({ length: 12 }, (_, i) => [i + 1, ROTATION[i % ROTATION.length]!]),
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
