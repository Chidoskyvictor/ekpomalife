import type { PoolClient } from 'pg'
import { pool } from '../db.js'
import { createId } from '../ids.js'
import { requireEconomySetup } from './economy.js'
import { tagMentions } from './eta-tags.js'
import { applyCash } from './game-state.js'
import { withIdempotency } from './idempotency.js'
import { liveSpaceMoneyBlock } from './spaces-money.js'

/**
 * Player-made coins on a constant-product curve: price = naira reserve / token reserve.
 * Buys push the price up, sells push it down, with no ceiling.
 *
 * Every 10 real minutes each coin rolls a "market mood" from its hype:
 *   hype = followers + ẹta talk (incl. NPC shouts) + holders + recent buying (log-scaled)
 *   pump chance = 25% … 75% (high hype ≈ 70%)
 * Pumps are outside buyers bringing new money (capped per real day across all coins);
 * dumps are those outside buyers selling part of what they hold. Nothing is guaranteed.
 */

const VIRTUAL_NAIRA = 3_000_000
const VIRTUAL_TOKENS = 1_000_000_000
export const LAUNCH_FEE = 50_000
const TRADE_FEE = 0.01
const MIN_TRADE = 1_000
/** Creator may buy at most this share of supply at launch, and can't sell for a while. */
const CREATOR_MAX_SHARE = 0.1
const CREATOR_LOCK_HOURS = 6
const COINS_PER_DAY = 3
const TICK_MS = 10 * 60_000
const MAX_TICKS = 6
/** New outside money per real day across all coins. */
const OUTSIDE_DAILY_BUDGET = 60_000_000

type Fail = { ok: false; error: string; code: number }
type ActionResult = { status: number; body: unknown }
const bad = (status: number, code: string, error: string): ActionResult => ({ status, body: { ok: false, code, error } })

type CoinRow = {
  id: string
  ticker: string
  name: string
  emoji: string
  description: string
  creator_user_id: string | null
  naira_reserve: number
  token_reserve: number
  outside_tokens: number
  hype: number
  creator_unlock_at: Date
  last_tick_at: Date
  created_at: Date
}

const priceOf = (coin: Pick<CoinRow, 'naira_reserve' | 'token_reserve'>) => coin.naira_reserve / coin.token_reserve

/** Naira in → tokens out (after fee). */
function quoteBuy(coin: CoinRow, naira: number) {
  const net = naira * (1 - TRADE_FEE)
  const k = coin.naira_reserve * coin.token_reserve
  const nextNaira = coin.naira_reserve + net
  const nextTokens = k / nextNaira
  return { tokens: coin.token_reserve - nextTokens, nextNaira, nextTokens }
}

/** Tokens in → naira out (after fee). */
function quoteSell(coin: CoinRow, tokens: number) {
  const k = coin.naira_reserve * coin.token_reserve
  const nextTokens = coin.token_reserve + tokens
  const nextNaira = k / nextTokens
  const gross = coin.naira_reserve - nextNaira
  return { naira: Math.floor(gross * (1 - TRADE_FEE)), nextNaira, nextTokens }
}

// —— Hype and market moods ——

async function hypeScores(db: PoolClient | typeof pool) {
  const [talk, follows, holders, volume] = await Promise.all([
    tagMentions(db, 'coin:'),
    db.query<{ coin_id: string; n: number }>(`SELECT coin_id, COUNT(*)::int AS n FROM coin_follows GROUP BY coin_id`),
    db.query<{ coin_id: string; n: number }>(`SELECT coin_id, COUNT(*)::int AS n FROM coin_holdings WHERE tokens > 0 GROUP BY coin_id`),
    db.query<{ coin_id: string; naira: string }>(
      `SELECT coin_id, SUM(naira)::text AS naira FROM coin_trades
       WHERE side = 'buy' AND outside = FALSE AND created_at > NOW() - INTERVAL '1 day' GROUP BY coin_id`,
    ),
  ])
  const by = <T extends { coin_id: string }>(rows: T[], pick: (r: T) => number) => new Map(rows.map((r) => [r.coin_id, pick(r)]))
  return {
    talk,
    follows: by(follows.rows, (r) => r.n),
    holders: by(holders.rows, (r) => r.n),
    volume: by(volume.rows, (r) => Number(r.naira)),
  }
}

function hypeOf(coin: CoinRow, s: Awaited<ReturnType<typeof hypeScores>>) {
  return (
    Math.log1p(s.follows.get(coin.id) ?? 0) +
    1.5 * Math.log1p(s.talk.get(coin.ticker.toLowerCase()) ?? 0) +
    Math.log1p(s.holders.get(coin.id) ?? 0) +
    Math.log1p((s.volume.get(coin.id) ?? 0) / 100_000)
  )
}

let lastMarketRun = 0

/** Catch every coin up on missed 10-minute moods. Runs at most once a minute, one server at a time. */
export async function runCryptoMarket() {
  const now = Date.now()
  if (now - lastMarketRun < 60_000) return
  lastMarketRun = now
  const client = await pool.connect()
  try {
    const lock = await client.query<{ ok: boolean }>(`SELECT pg_try_advisory_lock(hashtext('crypto-market')) AS ok`)
    if (!lock.rows[0]?.ok) return
    try {
      const coins = await client.query<CoinRow>(`SELECT * FROM coins`)
      if (!coins.rows.length) return
      const scores = await hypeScores(client)
      const spent = await client.query<{ total: string | null }>(
        `SELECT SUM(naira)::text AS total FROM coin_trades WHERE outside = TRUE AND side = 'buy' AND created_at > NOW() - INTERVAL '1 day'`,
      )
      let budget = OUTSIDE_DAILY_BUDGET - Number(spent.rows[0]?.total ?? 0)
      for (const coin of coins.rows) {
        const ticks = Math.min(MAX_TICKS, Math.floor((now - coin.last_tick_at.getTime()) / TICK_MS))
        const hype = hypeOf(coin, scores)
        if (ticks <= 0) {
          await client.query(`UPDATE coins SET hype = $2 WHERE id = $1`, [coin.id, hype])
          continue
        }
        const pumpChance = Math.min(0.75, Math.max(0.25, 0.25 + 0.08 * hype))
        let state = { ...coin }
        for (let i = 0; i < ticks; i++) {
          if (Math.random() < pumpChance && budget > 0) {
            const size = Math.min(budget, Math.round(150_000 * (1 + hype * 0.3) * (0.5 + Math.random())))
            const q = quoteBuy(state, size)
            budget -= size
            state = { ...state, naira_reserve: q.nextNaira, token_reserve: q.nextTokens, outside_tokens: state.outside_tokens + q.tokens }
            await client.query(
              `INSERT INTO coin_trades (coin_id, side, outside, naira, tokens, price_after) VALUES ($1, 'buy', TRUE, $2, $3, $4)`,
              [coin.id, size, q.tokens, priceOf(state)],
            )
          } else if (state.outside_tokens > 1) {
            const tokens = state.outside_tokens * (0.2 + Math.random() * 0.4)
            const q = quoteSell(state, tokens)
            state = { ...state, naira_reserve: q.nextNaira, token_reserve: q.nextTokens, outside_tokens: state.outside_tokens - tokens }
            await client.query(
              `INSERT INTO coin_trades (coin_id, side, outside, naira, tokens, price_after) VALUES ($1, 'sell', TRUE, $2, $3, $4)`,
              [coin.id, q.naira, tokens, priceOf(state)],
            )
          }
        }
        await client.query(
          `UPDATE coins SET naira_reserve = $2, token_reserve = $3, outside_tokens = $4, hype = $5,
                  last_tick_at = last_tick_at + make_interval(secs => $6) WHERE id = $1`,
          [coin.id, state.naira_reserve, state.token_reserve, state.outside_tokens, hype, (ticks * TICK_MS) / 1000],
        )
      }
    } finally {
      await client.query(`SELECT pg_advisory_unlock(hashtext('crypto-market'))`)
    }
  } catch (error) {
    console.error('crypto market tick failed', error)
  } finally {
    client.release()
  }
}

// —— Reading ——

async function characterFor(userId: string) {
  const gate = await requireEconomySetup(userId)
  return gate.ok ? gate.character.id : null
}

function coinCard(coin: CoinRow, change24h: number, followers: number, holders: number) {
  return {
    id: coin.id,
    ticker: coin.ticker,
    name: coin.name,
    emoji: coin.emoji,
    description: coin.description,
    price: priceOf(coin),
    /** Price × total supply */
    marketCap: Math.round(priceOf(coin) * VIRTUAL_TOKENS),
    change24h,
    hype: Math.round(coin.hype * 10) / 10,
    followers,
    holders,
    createdAt: coin.created_at.toISOString(),
  }
}

export async function listCoins(userId: string) {
  await runCryptoMarket()
  const characterId = await characterFor(userId)
  const [coins, opens, follows, holders, mine] = await Promise.all([
    pool.query<CoinRow>(`SELECT * FROM coins ORDER BY hype DESC, created_at DESC LIMIT 60`),
    pool.query<{ coin_id: string; price: number }>(
      `SELECT DISTINCT ON (coin_id) coin_id, price_after AS price FROM coin_trades
       WHERE created_at <= NOW() - INTERVAL '1 day' ORDER BY coin_id, created_at DESC`,
    ),
    pool.query<{ coin_id: string; n: number; me: boolean }>(
      `SELECT coin_id, COUNT(*)::int AS n, BOOL_OR(user_id = $1) AS me FROM coin_follows GROUP BY coin_id`,
      [userId],
    ),
    pool.query<{ coin_id: string; n: number }>(`SELECT coin_id, COUNT(*)::int AS n FROM coin_holdings WHERE tokens > 0 GROUP BY coin_id`),
    characterId
      ? pool.query<{ coin_id: string; tokens: number; cost: string }>(
          `SELECT coin_id, tokens, cost::text FROM coin_holdings WHERE character_id = $1 AND tokens > 0`,
          [characterId],
        )
      : Promise.resolve({ rows: [] as { coin_id: string; tokens: number; cost: string }[] }),
  ])
  const open = new Map(opens.rows.map((r) => [r.coin_id, r.price]))
  const follow = new Map(follows.rows.map((r) => [r.coin_id, r]))
  const hold = new Map(holders.rows.map((r) => [r.coin_id, r.n]))
  const byId = new Map(coins.rows.map((c) => [c.id, c]))
  const start = VIRTUAL_NAIRA / VIRTUAL_TOKENS
  return {
    ok: true as const,
    launchFee: LAUNCH_FEE,
    coins: coins.rows.map((coin) => {
      const before = open.get(coin.id) ?? start
      return {
        ...coinCard(coin, (priceOf(coin) - before) / before, follow.get(coin.id)?.n ?? 0, hold.get(coin.id) ?? 0),
        following: Boolean(follow.get(coin.id)?.me),
      }
    }),
    mine: mine.rows.map((row) => {
      const coin = byId.get(row.coin_id)
      const value = coin ? quoteSell(coin, row.tokens).naira : 0
      return { coinId: row.coin_id, ticker: coin?.ticker ?? '', emoji: coin?.emoji ?? '🪙', tokens: row.tokens, value, cost: Number(row.cost) }
    }),
  }
}

export async function getCoin(userId: string, coinId: string) {
  await runCryptoMarket()
  const characterId = await characterFor(userId)
  const coin = await pool.query<CoinRow>(`SELECT * FROM coins WHERE id = $1 OR ticker = UPPER($1)`, [coinId])
  const c = coin.rows[0]
  if (!c) return { ok: false as const, code: 404, error: 'No such coin.' }
  const [chart, followers, holders, mine, following, creator] = await Promise.all([
    pool.query<{ price: number; at: Date }>(
      `SELECT price_after AS price, created_at AS at FROM coin_trades WHERE coin_id = $1 ORDER BY created_at DESC LIMIT 60`,
      [c.id],
    ),
    pool.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM coin_follows WHERE coin_id = $1`, [c.id]),
    pool.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM coin_holdings WHERE coin_id = $1 AND tokens > 0`, [c.id]),
    characterId
      ? pool.query<{ tokens: number; cost: string }>(`SELECT tokens, cost::text FROM coin_holdings WHERE coin_id = $1 AND character_id = $2`, [c.id, characterId])
      : Promise.resolve({ rows: [] as { tokens: number; cost: string }[] }),
    pool.query(`SELECT 1 FROM coin_follows WHERE coin_id = $1 AND user_id = $2`, [c.id, userId]),
    pool.query<{ username: string }>(`SELECT username FROM users WHERE id = $1`, [c.creator_user_id]),
  ])
  const points = chart.rows.reverse().map((r) => r.price)
  const start = VIRTUAL_NAIRA / VIRTUAL_TOKENS
  const holding = mine.rows[0]
  return {
    ok: true as const,
    coin: {
      ...coinCard(c, (priceOf(c) - (points[0] ?? start)) / (points[0] ?? start), followers.rows[0]?.n ?? 0, holders.rows[0]?.n ?? 0),
      creator: creator.rows[0]?.username ?? null,
      mine: c.creator_user_id === userId,
      creatorLockedUntil: c.creator_unlock_at.toISOString(),
      following: Boolean(following.rowCount),
      chart: points.length ? points : [start, priceOf(c)],
      position: holding && holding.tokens > 0
        ? { tokens: holding.tokens, value: quoteSell(c, holding.tokens).naira, cost: Number(holding.cost) }
        : null,
    },
  }
}

// —— Writing ——

async function inTx<T>(run: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await run(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`

export async function launchCoin(
  userId: string,
  input: { ticker: string; name: string; emoji: string; description: string; devBuy: number },
  key: string,
): Promise<ActionResult | Fail> {
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return { ok: false, error: gate.error, code: gate.code }
  const ticker = input.ticker.trim().toUpperCase().replace(/^\$/, '')
  if (!/^[A-Z][A-Z0-9]{1,7}$/.test(ticker)) return bad(400, 'BAD_TICKER', 'Ticker: 2–8 letters or numbers, starting with a letter.')
  const name = input.name.trim()
  if (name.length < 2 || name.length > 24) return bad(400, 'BAD_NAME', 'Name: 2–24 characters.')
  const devBuy = Math.max(0, Math.floor(input.devBuy || 0))
  if (devBuy > 0) {
    const inSpace = await liveSpaceMoneyBlock([userId])
    if (inSpace) return { ok: false, error: inSpace, code: 409 }
  }
  return inTx((client) =>
    withIdempotency(client, {
      userId,
      characterId: gate.character.id,
      key,
      route: 'POST /crypto/launch',
      body: { ticker, name, devBuy },
      run: async () => {
        const today = await client.query<{ n: number }>(
          `SELECT COUNT(*)::int AS n FROM coins WHERE creator_user_id = $1 AND created_at > NOW() - INTERVAL '1 day'`,
          [userId],
        )
        if ((today.rows[0]?.n ?? 0) >= COINS_PER_DAY) return bad(429, 'TOO_MANY', `You can launch ${COINS_PER_DAY} coins a day.`)
        const taken = await client.query(`SELECT 1 FROM coins WHERE ticker = $1`, [ticker])
        if (taken.rowCount) return bad(409, 'TICKER_TAKEN', `$${ticker} already exists. Pick another ticker.`)
        const fee = await applyCash(client, gate.character.id, -LAUNCH_FEE, `Launched $${ticker}`, 'crypto_launch')
        if (!fee.ok) return bad(400, 'INSUFFICIENT_FUNDS', `Launching costs ${naira(LAUNCH_FEE)}.`)
        const id = `coin_${createId()}`
        let coin: CoinRow = {
          id,
          ticker,
          name,
          emoji: (input.emoji || '🪙').slice(0, 8),
          description: input.description.trim().slice(0, 140),
          creator_user_id: userId,
          naira_reserve: VIRTUAL_NAIRA,
          token_reserve: VIRTUAL_TOKENS,
          outside_tokens: 0,
          hype: 0,
          creator_unlock_at: new Date(Date.now() + CREATOR_LOCK_HOURS * 3_600_000),
          last_tick_at: new Date(),
          created_at: new Date(),
        }
        let bought = 0
        let spend = 0
        if (devBuy >= MIN_TRADE) {
          // Cap the creator's own buy at 10% of supply
          const q = quoteBuy(coin, devBuy)
          const maxTokens = VIRTUAL_TOKENS * CREATOR_MAX_SHARE
          spend = devBuy
          if (q.tokens > maxTokens) {
            const targetTokens = coin.token_reserve - maxTokens
            spend = Math.ceil((coin.naira_reserve * coin.token_reserve) / targetTokens - coin.naira_reserve) / (1 - TRADE_FEE)
          }
          const paid = await applyCash(client, gate.character.id, -Math.round(spend), `Bought $${ticker} at launch`, 'crypto_trade')
          if (!paid.ok) return bad(400, 'INSUFFICIENT_FUNDS', `You don’t have ${naira(spend)} for the launch buy.`)
          const real = quoteBuy(coin, Math.round(spend))
          bought = real.tokens
          coin = { ...coin, naira_reserve: real.nextNaira, token_reserve: real.nextTokens }
        }
        await client.query(
          `INSERT INTO coins (id, ticker, name, emoji, description, creator_user_id, naira_reserve, token_reserve, creator_unlock_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [id, ticker, coin.name, coin.emoji, coin.description, userId, coin.naira_reserve, coin.token_reserve, coin.creator_unlock_at],
        )
        await client.query(`INSERT INTO coin_trades (coin_id, side, naira, tokens, price_after) VALUES ($1, 'buy', 0, 0, $2)`, [
          id,
          VIRTUAL_NAIRA / VIRTUAL_TOKENS,
        ])
        if (bought > 0) {
          await client.query(`INSERT INTO coin_holdings (coin_id, character_id, tokens, cost) VALUES ($1, $2, $3, $4)`, [
            id,
            gate.character.id,
            bought,
            Math.round(spend),
          ])
          await client.query(
            `INSERT INTO coin_trades (coin_id, character_id, side, naira, tokens, price_after) VALUES ($1, $2, 'buy', $3, $4, $5)`,
            [id, gate.character.id, Math.round(spend), bought, priceOf(coin)],
          )
        }
        await client.query(`INSERT INTO coin_follows (coin_id, user_id) VALUES ($1, $2)`, [id, userId])
        return { status: 200, body: { ok: true, coinId: id, message: `$${ticker} is live on every phone in Ekpoma. Go hype it on ẹta 🚀` } }
      },
    }),
  )
}

export async function tradeCoin(
  userId: string,
  coinId: string,
  side: 'buy' | 'sell',
  amount: number,
  key: string,
): Promise<ActionResult | Fail> {
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return { ok: false, error: gate.error, code: gate.code }
  const inSpace = await liveSpaceMoneyBlock([userId])
  if (inSpace) return { ok: false, error: inSpace, code: 409 }
  await runCryptoMarket()
  return inTx((client) =>
    withIdempotency(client, {
      userId,
      characterId: gate.character.id,
      key,
      route: `POST /crypto/${side}`,
      body: { coinId, amount },
      run: async () => {
        const found = await client.query<CoinRow>(`SELECT * FROM coins WHERE id = $1 FOR UPDATE`, [coinId])
        const coin = found.rows[0]
        if (!coin) return bad(404, 'NOT_FOUND', 'No such coin.')
        if (side === 'buy') {
          const spend = Math.floor(amount)
          if (!(spend >= MIN_TRADE)) return bad(400, 'TOO_SMALL', `Buy at least ${naira(MIN_TRADE)}.`)
          const paid = await applyCash(client, gate.character.id, -spend, `Bought $${coin.ticker}`, 'crypto_trade')
          if (!paid.ok) return bad(400, 'INSUFFICIENT_FUNDS', 'You don’t have that much cash.')
          const q = quoteBuy(coin, spend)
          await client.query(`UPDATE coins SET naira_reserve = $2, token_reserve = $3 WHERE id = $1`, [coin.id, q.nextNaira, q.nextTokens])
          await client.query(
            `INSERT INTO coin_holdings (coin_id, character_id, tokens, cost) VALUES ($1, $2, $3, $4)
             ON CONFLICT (coin_id, character_id) DO UPDATE SET tokens = coin_holdings.tokens + $3, cost = coin_holdings.cost + $4`,
            [coin.id, gate.character.id, q.tokens, spend],
          )
          await client.query(
            `INSERT INTO coin_trades (coin_id, character_id, side, naira, tokens, price_after) VALUES ($1, $2, 'buy', $3, $4, $5)`,
            [coin.id, gate.character.id, spend, q.tokens, q.nextNaira / q.nextTokens],
          )
          return { status: 200, body: { ok: true, message: `You bought ${Math.round(q.tokens).toLocaleString('en-NG')} $${coin.ticker}.` } }
        }
        // Sell: amount is the share of your bag (0–1]
        const share = Math.min(1, Math.max(0, amount))
        if (!(share > 0)) return bad(400, 'TOO_SMALL', 'Pick how much to sell.')
        if (coin.creator_user_id === userId && coin.creator_unlock_at.getTime() > Date.now()) {
          return bad(409, 'CREATOR_LOCKED', 'Creators can’t sell in the first 6 hours. Hype it first!')
        }
        const held = await client.query<{ tokens: number; cost: string }>(
          `SELECT tokens, cost::text FROM coin_holdings WHERE coin_id = $1 AND character_id = $2 FOR UPDATE`,
          [coin.id, gate.character.id],
        )
        const bag = held.rows[0]
        if (!bag || bag.tokens <= 0) return bad(400, 'NO_BAG', `You don’t hold any $${coin.ticker}.`)
        const tokens = share >= 0.999 ? bag.tokens : bag.tokens * share
        const q = quoteSell(coin, tokens)
        await client.query(`UPDATE coins SET naira_reserve = $2, token_reserve = $3 WHERE id = $1`, [coin.id, q.nextNaira, q.nextTokens])
        const costLeft = Math.round(Number(bag.cost) * (1 - tokens / bag.tokens))
        await client.query(`UPDATE coin_holdings SET tokens = $3, cost = $4 WHERE coin_id = $1 AND character_id = $2`, [
          coin.id,
          gate.character.id,
          Math.max(0, bag.tokens - tokens),
          costLeft,
        ])
        if (q.naira > 0) await applyCash(client, gate.character.id, q.naira, `Sold $${coin.ticker}`, 'crypto_trade')
        await client.query(
          `INSERT INTO coin_trades (coin_id, character_id, side, naira, tokens, price_after) VALUES ($1, $2, 'sell', $3, $4, $5)`,
          [coin.id, gate.character.id, q.naira, tokens, q.nextNaira / q.nextTokens],
        )
        return { status: 200, body: { ok: true, message: `Sold for ${naira(q.naira)}.` } }
      },
    }),
  )
}

export async function toggleCoinFollow(userId: string, coinId: string) {
  const exists = await pool.query(`SELECT 1 FROM coins WHERE id = $1`, [coinId])
  if (!exists.rowCount) return { ok: false as const, code: 404, error: 'No such coin.' }
  const removed = await pool.query(`DELETE FROM coin_follows WHERE coin_id = $1 AND user_id = $2`, [coinId, userId])
  if (!removed.rowCount) await pool.query(`INSERT INTO coin_follows (coin_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [coinId, userId])
  return { ok: true as const, following: !removed.rowCount }
}

/** Crypto bags for the Invest portfolio card. */
export async function cryptoWorth(characterId: string) {
  const rows = await pool.query<CoinRow & { tokens: number }>(
    `SELECT c.*, h.tokens FROM coin_holdings h JOIN coins c ON c.id = h.coin_id WHERE h.character_id = $1 AND h.tokens > 0`,
    [characterId],
  )
  return rows.rows.reduce((sum, row) => sum + quoteSell(row, row.tokens).naira, 0)
}
