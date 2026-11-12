/*
 * Cars sold at Magmus Autos. Copied by hand to lib/game/cars-rules.ts (keep both the same).
 * Prices in naira, cheapest first.
 */

export type CarModel = {
  id: string
  name: string
  nickname: string
  blurb: string
  price: number
  /** Factory colour (#rrggbb). */
  color: string
}

export const CARS: CarModel[] = [
  { id: 'corolla', name: 'Toyota Corolla', nickname: 'Sharp Sharp', blurb: 'Never breaks down, never complains. Runs on vibes and small fuel.', price: 4_500_000, color: '#c9ccd1' },
  { id: 'camry', name: 'Toyota Camry', nickname: 'Muscle', blurb: 'The big boy saloon every final-year student dreams of.', price: 5_000_000, color: '#1f2a44' },
  { id: 'es350', name: 'Lexus ES350', nickname: 'Odogwu Saloon', blurb: 'Quiet engine, cold AC, soft seats. Pure enjoyment.', price: 15_000_000, color: '#f2f2ef' },
  { id: 'scout', name: 'Scout Jeep', nickname: 'Bush Master', blurb: 'Potholes on Ihumudumu road? This one laughs at them.', price: 20_000_000, color: '#5a6b3a' },
  { id: 'gle43', name: 'Mercedes GLE 43 AMG', nickname: 'Big Benz', blurb: 'When you pull up at G1, everybody turns to look.', price: 60_000_000, color: '#111317' },
  { id: 'suv', name: 'Family SUV', nickname: 'Chairman', blurb: 'Seven seats, full tank of respect. Oga at the top.', price: 150_000_000, color: '#7a1c22' },
  { id: 'gt3', name: 'GT3 Racer', nickname: 'Shege Speed', blurb: 'Too fast for Ekpoma roads. Buy it anyway.', price: 1_500_000_000, color: '#f2b705' },
]

export const PAINTS = ['#c9ccd1', '#f2f2ef', '#111317', '#1f2a44', '#7a1c22', '#2f6bf0', '#1f8a4c', '#f2b705', '#e46a1c', '#6b3fa0'] as const

export const PARKING_PRICE = 500_000
/** Homes that already have space in the compound for a car. */
export const HOMES_WITH_PARKING = new Set(['onebed-ojo'])
/** Cars drawn at the house carport; the rest show as "+N more". */
export const CARPORT_SLOTS = 2

export const carById = (id: string) => CARS.find((c) => c.id === id) ?? null
/** The dealer buys back at 60% of what you paid. */
export const carSellBack = (paid: number) => Math.floor(paid * 0.6)
/** The mechanic charges 2% of the car's price to fix dents (stage 2). */
export const dentFixPrice = (paid: number) => Math.floor(paid * 0.02)
/** Most dents a car can carry (more hits change nothing until it is fixed). */
export const MAX_DENTS = 9
export const isPaint = (c: string) => (PAINTS as readonly string[]).includes(c.toLowerCase())
export const needsParking = (lodgingId: string | null, hasSpace: boolean) => !hasSpace && !HOMES_WITH_PARKING.has(lodgingId ?? '')

/* —— Drag races —— */

/** The house keeps this share of a race's pot. */
export const RACE_FEE = 0.05
export const RACE_MAX_RACERS = 6
/** No real cap on stakes: this only keeps the pot (stake × 6) a safe whole number. */
export const RACE_MAX_STAKE = 1_000_000_000_000_000
/** Stakes offered when hosting (₦). */
export const RACE_STAKES = [0, 50_000, 500_000, 5_000_000, 50_000_000, 500_000_000]
/** From "start" to "GO": time for every phone to line its car up. */
export const RACE_COUNTDOWN_MS = 8000

/** What the winner is paid: every stake in the pot, less the house cut. */
export const racePrize = (stake: number, racers: number) => Math.floor(stake * racers * (1 - RACE_FEE))
