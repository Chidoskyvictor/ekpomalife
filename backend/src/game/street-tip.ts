import { pool } from '../db.js'
import { applyCash, asMoney, ensureGameState } from './game-state.js'
import { requireEconomySetup } from './economy.js'
import { getPublicState } from './game-state.js'

/** Tip limits: whole naira, at least ₦50, at most ₦100,000 a tip. */
export const TIP_MIN = 50
export const TIP_MAX = 100_000
/** A tip this big (or more) makes him say thanks, wave and walk off for a while. */
export const BIG_TIP = 1000

export function validTip(amount: unknown): amount is number {
  return typeof amount === 'number' && Number.isInteger(amount) && amount >= TIP_MIN && amount <= TIP_MAX
}

/** Give the street boy money: leaves the wallet with a ledger row; the server checks you can afford it. */
export async function tipStreetBoy(userId: string, amount: number) {
  if (!validTip(amount)) return { ok: false as const, error: `Tip between ₦${TIP_MIN} and ₦${TIP_MAX.toLocaleString('en-NG')}.`, code: 400 }
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return gate
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await ensureGameState(client, gate.character.id, {
      cash: asMoney(gate.character.starting_cash ?? gate.character.cash),
      lodgingId: gate.character.lodging_id,
    })
    const wrote = await applyCash(client, gate.character.id, -amount, 'Tip for the street boy', 'tip')
    if (!wrote.ok) {
      await client.query('ROLLBACK')
      return { ok: false as const, error: wrote.error === 'INSUFFICIENT_FUNDS' ? "You don't have that much cash." : wrote.error, code: 400 }
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
  const state = await getPublicState(userId)
  if (!state.ok) return state
  return { ok: true as const, state: { ok: true as const, ...state.state }, big: amount >= BIG_TIP, amount }
}
