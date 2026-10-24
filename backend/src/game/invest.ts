import type { PoolClient } from 'pg'
import { pool } from '../db.js'
import { createId } from '../ids.js'
import { cryptoWorth } from './crypto.js'
import { requireEconomySetup, tickAndWeekly } from './economy.js'
import { applyCash, asMoney } from './game-state.js'
import { withIdempotency } from './idempotency.js'
import { tagMentions } from './eta-tags.js'
import { clockFromGameTime } from './time.js'

/**
 * Invest app, phase 1: land plots in Ekpoma and rides you hire out (okada, keke, shuttle bus).
 *
 * Land: each area has a fixed number of plots across all players. The buy price climbs as plots
 * sell, and every plot grows once per owner game day at the area's weekly rate:
 *   base (how popular the area is in real life) + demand (recent buying, plots already taken)
 *   + market news (a small daily swing, the same for everyone that real day).
 * Rides: every game evening at 6 PM each ride pays its day's takings minus the rider's pay,
 * or costs a repair when it breaks down. Resale value drops a little each week.
 */

export type LandArea = {
  id: string
  name: string
  plot: string
  emoji: string
  blurb: string
  listPrice: number
  /** Real-life popularity → base growth per game week (0.03 = 3%). */
  baseWeekly: number
  /** Plots in this area across all players. */
  plots: number
  /** Cheap bush plots: land grabbers ("omo-onile") risk tag. */
  risky?: boolean
}

export const LAND_AREAS: LandArea[] = [
  { id: 'ujoelen', name: 'Ujoelen', plot: 'Quarter plot', emoji: '🌱', blurb: 'Bush land off the main road. Small money gets you in, but land grabbers know this side well.', listPrice: 250_000, baseWeekly: 0.026, plots: 60, risky: true },
  { id: 'opoji-road', name: 'Opoji Road', plot: 'Half plot', emoji: '🛣️', blurb: 'The road out of town is filling up. Cheap now, busy later.', listPrice: 900_000, baseWeekly: 0.03, plots: 50, risky: true },
  { id: 'iruekpen', name: 'Iruekpen', plot: 'Half plot', emoji: '🌴', blurb: 'Quiet side of town, close enough to campus for off-campus lodges.', listPrice: 1_600_000, baseWeekly: 0.029, plots: 45, risky: true },
  { id: 'ukpenu', name: 'Ukpenu', plot: 'Full plot', emoji: '🌳', blurb: 'Students keep moving this way. New lodges go up every semester.', listPrice: 2_800_000, baseWeekly: 0.036, plots: 40, risky: true },
  { id: 'idumebo', name: 'Idumebo', plot: 'Full plot', emoji: '🏡', blurb: 'Settled family area. Steady growth, no wahala.', listPrice: 3_200_000, baseWeekly: 0.027, plots: 40 },
  { id: 'emaudo', name: 'Emaudo', plot: 'Full plot', emoji: '🎒', blurb: 'Student central. Every lodge here fills up before resumption.', listPrice: 4_500_000, baseWeekly: 0.04, plots: 35 },
  { id: 'ujemen', name: 'Ujemen', plot: 'Full plot', emoji: '🏘️', blurb: 'Old Ekpoma quarter with good roads and old money.', listPrice: 6_000_000, baseWeekly: 0.026, plots: 35 },
  { id: 'ihumudumu', name: 'Ihumudumu', plot: 'Full plot, C of O', emoji: '🎓', blurb: 'Walking distance to the AAU gate. Proper papers, safe and steady.', listPrice: 9_000_000, baseWeekly: 0.032, plots: 30 },
  { id: 'eguare', name: 'Eguare', plot: 'Commercial plot', emoji: '🏪', blurb: 'Town centre by the market road. Shops here never close.', listPrice: 18_000_000, baseWeekly: 0.022, plots: 20 },
  { id: 'hilltop-estate', name: 'Hilltop Estate', plot: 'Gated estate plot', emoji: '🏰', blurb: 'A gated estate for big men (and big women). Bragging rights included.', listPrice: 120_000_000, baseWeekly: 0.018, plots: 10 },
]

export type RideKind = 'okada' | 'keke' | 'bus'

export type RideDef = {
  kind: RideKind
  name: string
  emoji: string
  blurb: string
  price: number
  earnMin: number
  earnMax: number
  riderPay: number
  breakdownChance: number
  fixCost: number
  /** Share of the price you get back when you sell (before weekly wear). */
  resale: number
  max: number
}

export const RIDES: Record<RideKind, RideDef> = {
  okada: { kind: 'okada', name: 'Okada (Bajaj Boxer)', emoji: '🏍️', blurb: 'Hire a rider and he brings money every evening. Campus runs never stop.', price: 1_400_000, earnMin: 9_000, earnMax: 24_000, riderPay: 4_000, breakdownChance: 0.06, fixCost: 25_000, resale: 0.7, max: 5 },
  keke: { kind: 'keke', name: 'Keke Napep', emoji: '🛺', blurb: 'Ekpoma moves on keke. Gate to Ihumudumu, all day long.', price: 3_800_000, earnMin: 20_000, earnMax: 48_000, riderPay: 8_000, breakdownChance: 0.07, fixCost: 60_000, resale: 0.7, max: 5 },
  bus: { kind: 'bus', name: 'Shuttle bus (Hiace)', emoji: '🚐', blurb: 'Ekpoma to Benin, full load both ways. Big money, big repairs.', price: 16_000_000, earnMin: 70_000, earnMax: 190_000, riderPay: 25_000, breakdownChance: 0.08, fixCost: 150_000, resale: 0.65, max: 3 },
}

export type BusinessDef = {
  id: string
  name: string
  emoji: string
  blurb: string
  /** own = the whole small business; stake = a share of a big place on the map */
  type: 'own' | 'stake'
  price: number
  earnMin: number
  earnMax: number
  /** Chance a day goes wrong, and what it costs */
  badChance: number
  badLoss: number
  /** Stakes only: how many exist across all players */
  supply?: number
  /** Most a single player can hold */
  max: number
}

export const BUSINESSES: BusinessDef[] = [
  { id: 'pos-stand', name: 'POS Stand · Ihumudumu', emoji: '🏧', blurb: 'Withdrawals, transfers and “network is bad”. Small money, every day.', type: 'own', price: 150_000, earnMin: 1_200, earnMax: 4_500, badChance: 0.08, badLoss: 3_000, max: 3 },
  { id: 'zobo-stand', name: 'Zobo & Kunu Stand · AAU gate', emoji: '🥤', blurb: 'Chilled zobo for students coming out of lectures. Sells itself in the heat.', type: 'own', price: 300_000, earnMin: 2_500, earnMax: 8_000, badChance: 0.1, badLoss: 5_000, max: 3 },
  { id: 'charging-kiosk', name: 'Charging & Data Kiosk · Emaudo', emoji: '🔌', blurb: 'NEPA took light? Everybody comes to you to charge.', type: 'own', price: 450_000, earnMin: 3_500, earnMax: 11_000, badChance: 0.08, badLoss: 8_000, max: 3 },
  { id: 'buka', name: 'Buka (Mama Put) · Ujemen', emoji: '🍛', blurb: 'Rice, beans and pepper soup. The lunch rush pays the bills.', type: 'own', price: 1_800_000, earnMin: 9_000, earnMax: 32_000, badChance: 0.1, badLoss: 25_000, max: 2 },
  { id: 'barbing-salon', name: 'Barbing Salon · Emaudo', emoji: '💈', blurb: 'Low cuts, fades and gist. Friday night before parties is the big day.', type: 'own', price: 2_500_000, earnMin: 14_000, earnMax: 52_000, badChance: 0.09, badLoss: 30_000, max: 2 },
  { id: 'laundry', name: 'Laundry & Dry Clean · Ukpenu', emoji: '🧺', blurb: 'Students hate washing. You love their money.', type: 'own', price: 4_200_000, earnMin: 22_000, earnMax: 85_000, badChance: 0.08, badLoss: 60_000, max: 2 },
  { id: 'gym', name: 'Gym · Opoji Road', emoji: '🏋️', blurb: 'Monthly members plus walk-ins before every party season.', type: 'own', price: 12_000_000, earnMin: 60_000, earnMax: 230_000, badChance: 0.07, badLoss: 150_000, max: 1 },
  { id: 'event-hall', name: 'Event Hall · Eguare', emoji: '🎪', blurb: 'Weddings, birthdays and send-forths every weekend.', type: 'own', price: 35_000_000, earnMin: 150_000, earnMax: 720_000, badChance: 0.08, badLoss: 400_000, max: 1 },
  { id: 'sazza', name: 'Sazza · 10% stake', emoji: '🍔', blurb: 'The spot everybody links up at. Own a slice of the till.', type: 'stake', price: 4_000_000, earnMin: 18_000, earnMax: 75_000, badChance: 0.07, badLoss: 40_000, supply: 10, max: 3 },
  { id: 'magmus-autos', name: 'Magmus Autos · 10% stake', emoji: '🔧', blurb: 'Every keke in town ends up here sooner or later.', type: 'stake', price: 5_000_000, earnMin: 22_000, earnMax: 90_000, badChance: 0.08, badLoss: 50_000, supply: 10, max: 3 },
  { id: 'wise-gourmet', name: 'Wise Gourmet · 10% stake', emoji: '🍽️', blurb: 'Date-night food with parasols outside. Busy every evening.', type: 'stake', price: 6_000_000, earnMin: 28_000, earnMax: 110_000, badChance: 0.07, badLoss: 60_000, supply: 10, max: 3 },
  { id: 'spot-rite', name: 'Spot Rite · 10% stake', emoji: '🛒', blurb: 'Supermarket on the main road. Everyone needs provisions.', type: 'stake', price: 8_000_000, earnMin: 38_000, earnMax: 140_000, badChance: 0.06, badLoss: 70_000, supply: 10, max: 3 },
  { id: 'denco', name: 'Denco · 5% stake', emoji: '🏬', blurb: 'Big store, big footfall. Steady money.', type: 'stake', price: 3_500_000, earnMin: 15_000, earnMax: 60_000, badChance: 0.06, badLoss: 35_000, supply: 20, max: 4 },
  { id: 'forbes', name: 'Forbes · 5% stake', emoji: '👑', blurb: 'Where the big boys hang. Bottles pop, you get paid.', type: 'stake', price: 25_000_000, earnMin: 110_000, earnMax: 420_000, badChance: 0.08, badLoss: 250_000, supply: 20, max: 2 },
  { id: 'playchill-climax', name: 'Playchill Climax · 5% stake', emoji: '🪩', blurb: 'The most famous night spot in Ekpoma. Weekends are madness.', type: 'stake', price: 60_000_000, earnMin: 260_000, earnMax: 1_100_000, badChance: 0.09, badLoss: 600_000, supply: 20, max: 2 },
]

/** Stake buy price climbs as stakes sell; sells pay the same price minus a small fee. */
const stakePrice = (def: BusinessDef, sold: number) =>
  roundTo(def.price * (1 + 0.5 * Math.min(1, sold / (def.supply ?? 1))), 1000)
const STAKE_FEE = 0.03
/** Whole small businesses resell for this share of the price. */
const OWN_RESALE = 0.6

const AGENT_FEE = 0.05
const MAX_PLOTS_PER_PLAYER = 20
const PAYOUT_HOUR = 18
/** Away for ages? Rides pay at most this many missed evenings at once. */
const CATCH_UP_DAYS = 14
/** Land growth catches up at most this many game days per visit. */
const GROWTH_CATCH_UP_DAYS = 60

type Fail = { ok: false; error: string; code: number; reason?: string }

// —— Market ——

function hash(text: string) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Same swing for everyone on a given real day: bad news, good news, or nothing. */
function newsShock(areaId: string, dateKey: string) {
  const roll = hash(`${areaId}:${dateKey}`) % 100
  if (roll < 12) return -0.015
  if (roll < 27) return 0.012
  return 0
}

const roundTo = (n: number, step: number) => Math.round(n / step) * step

export type AreaMarket = {
  area: LandArea
  sold: number
  recent: number
  left: number
  price: number
  weeklyRate: number
  shock: number
}

async function loadMarket(db: PoolClient | typeof pool): Promise<Map<string, AreaMarket>> {
  const rows = await db.query<{ area_id: string; sold: number; recent: number }>(
    `SELECT area_id, COUNT(*)::int AS sold,
            COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int AS recent
     FROM land_holdings GROUP BY area_id`,
  )
  const counts = new Map(rows.rows.map((row) => [row.area_id, row]))
  // ẹta chatter about an area this week (players and NPCs) adds demand
  const mentions = await tagMentions(db, 'area:')
  const dateKey = new Date().toISOString().slice(0, 10)
  const market = new Map<string, AreaMarket>()
  for (const area of LAND_AREAS) {
    const sold = counts.get(area.id)?.sold ?? 0
    const recent = counts.get(area.id)?.recent ?? 0
    const soldShare = Math.min(1, sold / area.plots)
    const demand =
      0.012 * Math.min(1, recent / Math.max(1, area.plots * 0.15)) +
      0.008 * soldShare +
      0.008 * Math.min(1, (mentions.get(area.id) ?? 0) / 12)
    const shock = newsShock(area.id, dateKey)
    market.set(area.id, {
      area,
      sold,
      recent,
      left: Math.max(0, area.plots - sold),
      price: roundTo(area.listPrice * (1 + 0.6 * soldShare), 1000),
      weeklyRate: area.baseWeekly + demand + shock,
      shock,
    })
  }
  return market
}

function marketNews(market: Map<string, AreaMarket>) {
  const areas = [...market.values()]
  const good = areas.filter((m) => m.shock > 0).sort((a, b) => b.area.listPrice - a.area.listPrice)[0]
  const bad = areas.filter((m) => m.shock < 0).sort((a, b) => b.area.listPrice - a.area.listPrice)[0]
  if (bad) return `Land grabbers are making noise in ${bad.area.name}. Prices there are slipping today.`
  if (good) return `New lodges are going up in ${good.area.name}. Buyers are rushing in.`
  const hot = areas.sort((a, b) => b.recent - a.recent)[0]
  if (hot && hot.recent > 0) return `Most buying this week: ${hot.area.name}.`
  return 'Quiet day on the land market. Plots still grow every day.'
}

// —— Daily growth and payouts ——

const rideSellValue = (def: RideDef, boughtPrice: number, boughtDay: number, day: number) =>
  roundTo(boughtPrice * def.resale * Math.pow(0.99, Math.max(0, day - boughtDay) / 7), 1000)

const randomInt = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1))

async function addEvents(client: PoolClient, characterId: string, events: { day: number; kind: string; amount: number }[]) {
  if (events.length === 0) return
  const values: unknown[] = []
  const rows = events.map((event, i) => {
    values.push(characterId, event.day, event.kind, event.amount)
    return `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`
  })
  await client.query(`INSERT INTO invest_events (character_id, game_day, kind, amount) VALUES ${rows.join(', ')}`, values)
}

/** Grow plots to today and pay any 6 PM ride evenings that have passed. */
async function settle(client: PoolClient, characterId: string, gameTime: number, market: Map<string, AreaMarket>) {
  const { day, hour } = clockFromGameTime(gameTime)
  const events: { day: number; kind: string; amount: number }[] = []

  const lands = await client.query<{ id: string; area_id: string; value: string; last_day: number }>(
    `SELECT id, area_id, value, last_day FROM land_holdings WHERE character_id = $1 FOR UPDATE`,
    [characterId],
  )
  for (const land of lands.rows) {
    const days = Math.min(day - land.last_day, GROWTH_CATCH_UP_DAYS)
    if (days <= 0) continue
    const rate = (market.get(land.area_id)?.weeklyRate ?? 0.02) / 7
    const value = asMoney(land.value)
    let running = value
    for (let i = 0; i < days; i++) {
      const next = Math.round(running * (1 + rate))
      events.push({ day: day - days + 1 + i, kind: 'land_growth', amount: next - running })
      running = next
    }
    await client.query(`UPDATE land_holdings SET value = $2, last_day = $3 WHERE id = $1`, [land.id, running, day])
  }

  const rides = await client.query<{ id: string; kind: RideKind; last_paid_day: number }>(
    `SELECT id, kind, last_paid_day FROM ride_holdings WHERE character_id = $1 FOR UPDATE`,
    [characterId],
  )
  const lastDue = hour >= PAYOUT_HOUR ? day : day - 1
  for (const ride of rides.rows) {
    const def = RIDES[ride.kind]
    if (!def || lastDue <= ride.last_paid_day) continue
    const from = Math.max(ride.last_paid_day + 1, lastDue - CATCH_UP_DAYS + 1)
    let net = 0
    for (let d = from; d <= lastDue; d++) {
      if (Math.random() < def.breakdownChance) {
        events.push({ day: d, kind: 'ride_repair', amount: -def.fixCost })
        net -= def.fixCost
      } else {
        const takings = randomInt(def.earnMin, def.earnMax) - def.riderPay
        events.push({ day: d, kind: 'ride_income', amount: takings })
        net += takings
      }
    }
    if (net !== 0) {
      const paid = await applyCash(
        client,
        characterId,
        net,
        net >= 0 ? `${def.name} takings` : `${def.name} repairs`,
        'ride_income',
      )
      // Can't cover a repair right now? The mechanic waits — don't block the day.
      if (!paid.ok) net = 0
    }
    await client.query(`UPDATE ride_holdings SET last_paid_day = $2, earned = earned + $3 WHERE id = $1`, [ride.id, lastDue, net])
  }

  const businesses = await client.query<{ id: string; business_id: string; last_paid_day: number }>(
    `SELECT id, business_id, last_paid_day FROM business_holdings WHERE character_id = $1 FOR UPDATE`,
    [characterId],
  )
  if (businesses.rows.length) {
    const holders = await businessHolders(client)
    const buzzTalk = await tagMentions(client, 'biz:')
    for (const holding of businesses.rows) {
      const def = BUSINESSES.find((b) => b.id === holding.business_id)
      if (!def || lastDue <= holding.last_paid_day) continue
      // Popular places do better: more stakeholders (up to +40%) and more ẹta talk (up to +20%)
      const buzz = 1 + Math.min(0.4, (holders.get(def.id) ?? 0) * 0.04) + Math.min(0.2, (buzzTalk.get(def.id) ?? 0) * 0.02)
      const from = Math.max(holding.last_paid_day + 1, lastDue - CATCH_UP_DAYS + 1)
      let net = 0
      for (let d = from; d <= lastDue; d++) {
        const amount =
          Math.random() < def.badChance ? -def.badLoss : Math.round(randomInt(def.earnMin, def.earnMax) * buzz)
        events.push({ day: d, kind: amount >= 0 ? 'business_income' : 'business_loss', amount })
        net += amount
      }
      if (net !== 0) {
        const paid = await applyCash(client, characterId, net, `${def.name} ${net >= 0 ? 'payout' : 'bad day'}`, 'business_income')
        if (!paid.ok) net = 0
      }
      await client.query(`UPDATE business_holdings SET last_paid_day = $2, earned = earned + $3 WHERE id = $1`, [holding.id, lastDue, net])
    }
  }

  await addEvents(client, characterId, events)
}

async function businessHolders(db: PoolClient | typeof pool) {
  const rows = await db.query<{ business_id: string; n: number }>(
    `SELECT business_id, COUNT(*)::int AS n FROM business_holdings GROUP BY business_id`,
  )
  return new Map(rows.rows.map((row) => [row.business_id, row.n]))
}

// —— View ——

export type InvestView = Awaited<ReturnType<typeof buildView>>

/** Reads only — pass the pool after commit so the four queries run in parallel. */
async function buildView(db: PoolClient | typeof pool, characterId: string, gameTime: number, market: Map<string, AreaMarket>) {
  const { day, hour } = clockFromGameTime(gameTime)
  const [lands, rides, sums, cash, businesses, holders, crypto] = await Promise.all([
    db.query<{ id: string; area_id: string; bought_price: string; value: string }>(
      `SELECT id, area_id, bought_price, value FROM land_holdings WHERE character_id = $1 ORDER BY created_at`,
      [characterId],
    ),
    db.query<{ id: string; kind: RideKind; bought_price: string; bought_day: number; earned: string }>(
      `SELECT id, kind, bought_price, bought_day, earned FROM ride_holdings WHERE character_id = $1 ORDER BY created_at`,
      [characterId],
    ),
    db.query<{ today: string | null; week: string | null; total: string | null }>(
      `SELECT SUM(amount) FILTER (WHERE game_day = $2) AS today,
              SUM(amount) FILTER (WHERE game_day > $2 - 7) AS week,
              SUM(amount) AS total
       FROM invest_events WHERE character_id = $1`,
      [characterId, day],
    ),
    db.query<{ cash: string }>(`SELECT cash FROM game_state WHERE character_id = $1`, [characterId]),
    db.query<{ id: string; business_id: string; bought_price: string; earned: string }>(
      `SELECT id, business_id, bought_price, earned FROM business_holdings WHERE character_id = $1 ORDER BY created_at`,
      [characterId],
    ),
    businessHolders(db),
    cryptoWorth(characterId),
  ])

  const myLand = lands.rows.map((row) => {
    const m = market.get(row.area_id)
    const value = asMoney(row.value)
    return {
      id: row.id,
      areaId: row.area_id,
      name: m?.area.name ?? row.area_id,
      emoji: m?.area.emoji ?? '🌱',
      boughtPrice: asMoney(row.bought_price),
      value,
      weeklyGrowth: Math.round(value * (m?.weeklyRate ?? 0)),
      sellFor: Math.round(value * (1 - AGENT_FEE)),
    }
  })
  const myRides = rides.rows.map((row) => {
    const def = RIDES[row.kind]
    return {
      id: row.id,
      kind: row.kind,
      name: def.name,
      emoji: def.emoji,
      boughtPrice: asMoney(row.bought_price),
      sellFor: rideSellValue(def, asMoney(row.bought_price), row.bought_day, day),
      earned: asMoney(row.earned),
    }
  })
  const myBusinesses = businesses.rows.map((row) => {
    const def = BUSINESSES.find((b) => b.id === row.business_id)!
    const sellFor =
      def.type === 'stake'
        ? Math.round(stakePrice(def, (holders.get(def.id) ?? 1) - 1) * (1 - STAKE_FEE))
        : roundTo(asMoney(row.bought_price) * OWN_RESALE, 1000)
    return {
      id: row.id,
      businessId: def.id,
      name: def.name,
      emoji: def.emoji,
      type: def.type,
      boughtPrice: asMoney(row.bought_price),
      sellFor,
      earned: asMoney(row.earned),
    }
  })
  const businessHaircut = myBusinesses.reduce((sum, b) => sum + (b.sellFor - b.boughtPrice), 0)
  const rideHaircut = myRides.reduce((sum, ride) => sum + (ride.sellFor - ride.boughtPrice), 0)
  const landWorth = myLand.reduce((sum, land) => sum + land.value, 0)
  const rideWorth = myRides.reduce((sum, ride) => sum + ride.sellFor, 0)
  const businessWorth = myBusinesses.reduce((sum, b) => sum + b.sellFor, 0)
  const s = sums.rows[0]

  return {
    cash: asMoney(cash.rows[0]?.cash ?? 0),
    day,
    worth: landWorth + rideWorth + businessWorth + crypto,
    crypto,
    today: asMoney(s?.today ?? 0),
    week: asMoney(s?.week ?? 0),
    // Payouts and growth so far, plus what the rides would lose if sold now
    total: asMoney(s?.total ?? 0) + rideHaircut + businessHaircut,
    news: marketNews(market),
    nextPayout: hour >= PAYOUT_HOUR ? 'tomorrow at 6:00 PM' : 'today at 6:00 PM',
    agentFee: AGENT_FEE,
    myLand,
    myRides,
    myBusinesses,
    businesses: BUSINESSES.map((def) => {
      const sold = holders.get(def.id) ?? 0
      return {
        id: def.id,
        name: def.name,
        emoji: def.emoji,
        blurb: def.blurb,
        type: def.type,
        price: def.type === 'stake' ? stakePrice(def, sold) : def.price,
        earnMin: def.earnMin,
        earnMax: def.earnMax,
        badLoss: def.badLoss,
        left: def.type === 'stake' ? Math.max(0, (def.supply ?? 0) - sold) : null,
        supply: def.supply ?? null,
        owned: myBusinesses.filter((b) => b.businessId === def.id).length,
        max: def.max,
      }
    }),
    lands: LAND_AREAS.map((area) => {
      const m = market.get(area.id)!
      return {
        id: area.id,
        name: area.name,
        plot: area.plot,
        emoji: area.emoji,
        blurb: area.blurb,
        risky: Boolean(area.risky),
        price: m.price,
        weeklyRate: m.weeklyRate,
        left: m.left,
        plots: area.plots,
      }
    }),
    rides: Object.values(RIDES).map((def) => ({
      kind: def.kind,
      name: def.name,
      emoji: def.emoji,
      blurb: def.blurb,
      price: def.price,
      earnMin: def.earnMin,
      earnMax: def.earnMax,
      riderPay: def.riderPay,
      fixCost: def.fixCost,
      owned: myRides.filter((ride) => ride.kind === def.kind).length,
      max: def.max,
    })),
  }
}

// —— Transactions ——

async function withInvest<T>(
  userId: string,
  run: (ctx: { client: PoolClient; characterId: string; gameTime: number; market: Map<string, AreaMarket> }) => Promise<T>,
): Promise<T | Fail> {
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return { ok: false, error: gate.error, code: gate.code }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { row } = await tickAndWeekly(client, gate.character, gate.traits)
    await client.query(`SELECT 1 FROM game_state WHERE character_id = $1 FOR UPDATE`, [gate.character.id])
    const market = await loadMarket(client)
    await settle(client, gate.character.id, row.game_time, market)
    const result = await run({ client, characterId: gate.character.id, gameTime: row.game_time, market })
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function getInvest(userId: string) {
  // Settle inside the transaction, then read the screen in parallel once it's committed
  const settled = await withInvest(userId, async ({ characterId, gameTime }) => ({ ok: true as const, characterId, gameTime }))
  if (!settled.ok) return settled
  const market = await loadMarket(pool)
  return { ok: true as const, invest: await buildView(pool, settled.characterId, settled.gameTime, market) }
}

type ActionResult = { status: number; body: unknown }
const bad = (status: number, reason: string, error: string): ActionResult => ({ status, body: { ok: false, code: reason, error } })

async function action(
  userId: string,
  key: string,
  route: string,
  body: unknown,
  run: (ctx: { client: PoolClient; characterId: string; gameTime: number; market: Map<string, AreaMarket> }) => Promise<ActionResult | string>,
): Promise<ActionResult | Fail> {
  const done = await withInvest(userId, async (ctx) => ({
    ok: true as const,
    characterId: ctx.characterId,
    gameTime: ctx.gameTime,
    // A retry with the same key replays the stored result instead of charging again
    result: await withIdempotency(ctx.client, {
      userId,
      characterId: ctx.characterId,
      key,
      route,
      body,
      run: async () => {
        const outcome = await run(ctx)
        return typeof outcome === 'string' ? { status: 200, body: { ok: true, message: outcome } } : outcome
      },
    }),
  }))
  if (!done.ok) return done
  const { result } = done
  if (result.status !== 200) return result
  // Fresh numbers after the change, read in parallel after commit
  const market = await loadMarket(pool)
  const invest = await buildView(pool, done.characterId, done.gameTime, market)
  return { status: 200, body: { ...(result.body as object), invest } }
}

const naira = (n: number) => `₦${n.toLocaleString('en-NG')}`

export function buyLand(userId: string, areaId: string, key: string) {
  return action(userId, key, 'POST /invest/land/buy', { areaId }, async ({ client, characterId, gameTime }) => {
    const area = LAND_AREAS.find((a) => a.id === areaId)
    if (!area) return bad(404, 'UNKNOWN_AREA', 'That area isn’t for sale.')
    // One buyer at a time per area so the last plot can't sell twice
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`land:${area.id}`])
    const counts = await client.query<{ sold: number; mine: number }>(
      `SELECT COUNT(*) FILTER (WHERE area_id = $1)::int AS sold,
              COUNT(*) FILTER (WHERE character_id = $2)::int AS mine
       FROM land_holdings`,
      [area.id, characterId],
    )
    const { sold, mine } = counts.rows[0]!
    if (sold >= area.plots) return bad(409, 'SOLD_OUT', `Every plot in ${area.name} is taken. Try another area.`)
    if (mine >= MAX_PLOTS_PER_PLAYER) return bad(409, 'TOO_MANY', `You already hold ${MAX_PLOTS_PER_PLAYER} plots. Sell one first.`)
    const price = roundTo(area.listPrice * (1 + 0.6 * Math.min(1, sold / area.plots)), 1000)
    const paid = await applyCash(client, characterId, -price, `Bought a plot in ${area.name}`, 'invest_land')
    if (!paid.ok) return bad(400, 'INSUFFICIENT_FUNDS', `You need ${naira(price)} for this plot.`)
    const { day } = clockFromGameTime(gameTime)
    await client.query(
      `INSERT INTO land_holdings (id, character_id, area_id, bought_price, value, last_day) VALUES ($1, $2, $3, $4, $4, $5)`,
      [`land_${createId()}`, characterId, area.id, price, day],
    )
    return `You bought a plot in ${area.name} for ${naira(price)}.`
  })
}

export function sellLand(userId: string, holdingId: string, key: string) {
  return action(userId, key, 'POST /invest/land/sell', { holdingId }, async ({ client, characterId, gameTime }) => {
    const found = await client.query<{ area_id: string; value: string }>(
      `DELETE FROM land_holdings WHERE id = $1 AND character_id = $2 RETURNING area_id, value`,
      [holdingId, characterId],
    )
    const row = found.rows[0]
    if (!row) return bad(404, 'NOT_FOUND', 'You don’t own that plot.')
    const value = asMoney(row.value)
    const net = Math.round(value * (1 - AGENT_FEE))
    const name = LAND_AREAS.find((a) => a.id === row.area_id)?.name ?? 'your area'
    await applyCash(client, characterId, net, `Sold a plot in ${name}`, 'invest_land')
    await addEvents(client, characterId, [{ day: clockFromGameTime(gameTime).day, kind: 'agent_fee', amount: net - value }])
    return `Sold your ${name} plot for ${naira(net)} after the agent’s cut.`
  })
}

export function buyRide(userId: string, kind: string, key: string) {
  return action(userId, key, 'POST /invest/rides/buy', { kind }, async ({ client, characterId, gameTime }) => {
    const def = RIDES[kind as RideKind]
    if (!def) return bad(404, 'UNKNOWN_RIDE', 'That ride isn’t for sale.')
    const owned = await client.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM ride_holdings WHERE character_id = $1 AND kind = $2`,
      [characterId, def.kind],
    )
    if ((owned.rows[0]?.n ?? 0) >= def.max) return bad(409, 'TOO_MANY', `You can run at most ${def.max} of these.`)
    const paid = await applyCash(client, characterId, -def.price, `Bought a ${def.name}`, 'invest_ride')
    if (!paid.ok) return bad(400, 'INSUFFICIENT_FUNDS', `You need ${naira(def.price)} for this.`)
    const { day, hour } = clockFromGameTime(gameTime)
    await client.query(
      `INSERT INTO ride_holdings (id, character_id, kind, bought_price, bought_day, last_paid_day)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      // Bought before 6 PM → it works this evening
      [`ride_${createId()}`, characterId, def.kind, def.price, day, hour >= PAYOUT_HOUR ? day : day - 1],
    )
    return `Your ${def.name} is on the road. First takings ${hour >= PAYOUT_HOUR ? 'tomorrow' : 'this evening'} at 6 PM.`
  })
}

export function sellRide(userId: string, holdingId: string, key: string) {
  return action(userId, key, 'POST /invest/rides/sell', { holdingId }, async ({ client, characterId, gameTime }) => {
    const found = await client.query<{ kind: RideKind; bought_price: string; bought_day: number }>(
      `DELETE FROM ride_holdings WHERE id = $1 AND character_id = $2 RETURNING kind, bought_price, bought_day`,
      [holdingId, characterId],
    )
    const row = found.rows[0]
    if (!row) return bad(404, 'NOT_FOUND', 'You don’t own that ride.')
    const def = RIDES[row.kind]
    const day = clockFromGameTime(gameTime).day
    const value = rideSellValue(def, asMoney(row.bought_price), row.bought_day, day)
    await applyCash(client, characterId, value, `Sold a ${def.name}`, 'invest_ride')
    await addEvents(client, characterId, [{ day, kind: 'ride_resale', amount: value - asMoney(row.bought_price) }])
    return `Sold your ${def.name} for ${naira(value)}.`
  })
}

export function buyBusiness(userId: string, businessId: string, key: string) {
  return action(userId, key, 'POST /invest/business/buy', { businessId }, async ({ client, characterId, gameTime }) => {
    const def = BUSINESSES.find((b) => b.id === businessId)
    if (!def) return bad(404, 'UNKNOWN_BUSINESS', 'That business isn’t for sale.')
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`business:${def.id}`])
    const counts = await client.query<{ sold: number; mine: number }>(
      `SELECT COUNT(*)::int AS sold, COUNT(*) FILTER (WHERE character_id = $2)::int AS mine
       FROM business_holdings WHERE business_id = $1`,
      [def.id, characterId],
    )
    const { sold, mine } = counts.rows[0]!
    if (def.type === 'stake' && sold >= (def.supply ?? 0)) return bad(409, 'SOLD_OUT', `Every stake in ${def.name.split(' ·')[0]} is taken.`)
    if (mine >= def.max) return bad(409, 'TOO_MANY', `You can hold at most ${def.max} of these.`)
    const price = def.type === 'stake' ? stakePrice(def, sold) : def.price
    const paid = await applyCash(client, characterId, -price, `Bought ${def.name}`, 'invest_business')
    if (!paid.ok) return bad(400, 'INSUFFICIENT_FUNDS', `You need ${naira(price)} for this.`)
    const { day, hour } = clockFromGameTime(gameTime)
    await client.query(
      `INSERT INTO business_holdings (id, character_id, business_id, bought_price, bought_day, last_paid_day)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [`biz_${createId()}`, characterId, def.id, price, day, hour >= PAYOUT_HOUR ? day : day - 1],
    )
    return `${def.name} is yours. First payout ${hour >= PAYOUT_HOUR ? 'tomorrow' : 'this evening'} at 6 PM.`
  })
}

export function sellBusiness(userId: string, holdingId: string, key: string) {
  return action(userId, key, 'POST /invest/business/sell', { holdingId }, async ({ client, characterId, gameTime }) => {
    const found = await client.query<{ business_id: string; bought_price: string }>(
      `DELETE FROM business_holdings WHERE id = $1 AND character_id = $2 RETURNING business_id, bought_price`,
      [holdingId, characterId],
    )
    const row = found.rows[0]
    if (!row) return bad(404, 'NOT_FOUND', 'You don’t own that.')
    const def = BUSINESSES.find((b) => b.id === row.business_id)!
    let value: number
    if (def.type === 'stake') {
      const left = await client.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM business_holdings WHERE business_id = $1`, [def.id])
      value = Math.round(stakePrice(def, left.rows[0]?.n ?? 0) * (1 - STAKE_FEE))
    } else {
      value = roundTo(asMoney(row.bought_price) * OWN_RESALE, 1000)
    }
    await applyCash(client, characterId, value, `Sold ${def.name}`, 'invest_business')
    await addEvents(client, characterId, [
      { day: clockFromGameTime(gameTime).day, kind: 'business_resale', amount: value - asMoney(row.bought_price) },
    ])
    return `Sold ${def.name} for ${naira(value)}.`
  })
}
