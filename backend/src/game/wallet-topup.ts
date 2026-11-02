import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { pool } from '../db.js'
import { env } from '../env.js'
import { createId } from '../ids.js'
import { applyCash, ensureGameState } from './game-state.js'
import { findWalletPack } from './wallet-packs.js'

const PAYSTACK_API = 'https://api.paystack.co'

export type TopupRow = {
  id: string
  user_id: string
  pack_id: string
  amount_kobo: string | number
  game_money: string | number
  reference: string
  status: 'pending' | 'success' | 'failed'
  created_at: Date
  paid_at: Date | null
}

type PaystackVerifyData = { status?: string; amount?: number; currency?: string; reference?: string }

export function paystackConfigured() {
  return Boolean(env.PAYSTACK_SECRET_KEY)
}

async function paystack<T>(path: string, init?: RequestInit): Promise<{ status: boolean; message?: string; data?: T }> {
  const response = await fetch(`${PAYSTACK_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(15_000),
  })
  const body = (await response.json().catch(() => null)) as { status: boolean; message?: string; data?: T } | null
  if (!body) return { status: false, message: `Paystack HTTP ${response.status}` }
  return body
}

export async function initTopup(user: { id: string; username: string }, packId: string) {
  if (!paystackConfigured()) return { ok: false as const, error: 'Top-ups are not available yet.', code: 503 }
  const pack = findWalletPack(packId)
  if (!pack) return { ok: false as const, error: 'Pack not found.', code: 404 }

  const found = await pool.query<{ email: string | null }>(`SELECT email FROM users WHERE id = $1`, [user.id])
  const email = found.rows[0]?.email?.trim() || `${user.username}@players.ekpomalife.app`

  const amountKobo = pack.naira * 100
  const reference = `ekp_${Date.now().toString(36)}_${randomBytes(6).toString('hex')}`
  await pool.query(
    `INSERT INTO wallet_topups (id, user_id, pack_id, amount_kobo, game_money, reference, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
    [createId(), user.id, pack.id, amountKobo, pack.gameMoney, reference],
  )

  const callbackUrl = `${env.FRONTEND_URL.replace(/\/+$/, '')}/?topup=${encodeURIComponent(reference)}`
  const result = await paystack<{ authorization_url: string; access_code: string; reference: string }>(
    '/transaction/initialize',
    {
      method: 'POST',
      body: JSON.stringify({
        email,
        amount: amountKobo,
        currency: 'NGN',
        reference,
        callback_url: callbackUrl,
        metadata: { user_id: user.id, pack_id: pack.id },
      }),
    },
  )
  if (!result.status || !result.data) {
    await pool.query(`UPDATE wallet_topups SET status = 'failed' WHERE reference = $1 AND status = 'pending'`, [reference])
    return { ok: false as const, error: 'Could not start payment. Try again.', code: 502 }
  }
  return {
    ok: true as const,
    reference,
    access_code: result.data.access_code,
    authorization_url: result.data.authorization_url,
  }
}

/**
 * Idempotent credit: only the call that flips pending/failed → success adds game money.
 * 'failed' is included so a payment Paystack confirms after we gave up on it
 * (e.g. the player came back to an abandoned checkout) is still credited.
 * Returns the row when this call credited it, null otherwise.
 */
export async function creditTopup(reference: string, paidKobo: number) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const flipped = await client.query<TopupRow>(
      `UPDATE wallet_topups SET status = 'success', paid_at = NOW()
       WHERE reference = $1 AND status IN ('pending', 'failed') AND amount_kobo = $2
       RETURNING *`,
      [reference, paidKobo],
    )
    const row = flipped.rows[0]
    if (!row) {
      await client.query('ROLLBACK')
      const existing = await pool.query<Pick<TopupRow, 'status' | 'amount_kobo'>>(
        `SELECT status, amount_kobo FROM wallet_topups WHERE reference = $1`,
        [reference],
      )
      const found = existing.rows[0]
      if (!found) console.warn(`[topup] credit for unknown reference ${reference} (paid ${paidKobo} kobo)`)
      else if (found.status !== 'success' && Number(found.amount_kobo) !== paidKobo) {
        console.warn(
          `[topup] amount mismatch for ${reference}: expected ${found.amount_kobo} kobo, paid ${paidKobo} kobo — not credited`,
        )
      }
      return null
    }
    const character = await client.query<{ id: string; cash: string | number; lodging_id: string | null }>(
      `SELECT id, cash, lodging_id FROM characters WHERE user_id = $1`,
      [row.user_id],
    )
    const char = character.rows[0]
    if (!char) throw new Error(`Top-up ${reference}: user has no character`)
    await ensureGameState(client, char.id, { cash: Number(char.cash) || 0, lodgingId: char.lodging_id })
    const pack = findWalletPack(row.pack_id)
    const wrote = await applyCash(client, char.id, Number(row.game_money), `Wallet top-up: ${pack?.name ?? row.pack_id}`, 'topup')
    if (!wrote.ok) throw new Error(`Top-up ${reference}: ${wrote.error}`)
    await client.query('COMMIT')
    return row
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function verifyTopup(userId: string, reference: string) {
  const found = await pool.query<TopupRow>(`SELECT * FROM wallet_topups WHERE reference = $1 AND user_id = $2`, [reference, userId])
  const row = found.rows[0]
  if (!row) return { ok: false as const, error: 'Top-up not found.', code: 404 }
  const view = (status: TopupRow['status'], credited: boolean) => ({
    ok: true as const,
    status,
    credited,
    reference,
    pack_id: row.pack_id,
    naira: Number(row.amount_kobo) / 100,
    game_money: Number(row.game_money),
  })
  // 'failed' rows are re-checked too: Paystack may confirm a payment after we marked it failed.
  if (row.status === 'success') return view(row.status, false)
  if (!paystackConfigured()) return { ok: false as const, error: 'Top-ups are not available yet.', code: 503 }

  const result = await paystack<PaystackVerifyData>(`/transaction/verify/${encodeURIComponent(reference)}`)
  const data = result.data
  if (!result.status || !data) return view('pending', false)
  if (data.status === 'success') {
    if (Number(data.amount) !== Number(row.amount_kobo) || data.currency !== 'NGN') {
      console.warn(
        `[topup] verify mismatch for ${reference}: expected ${row.amount_kobo} kobo NGN, got ${data.amount} ${data.currency ?? '(no currency)'}`,
      )
      return { ok: false as const, error: 'Payment amount mismatch. Contact support.', code: 409 }
    }
    const credited = await creditTopup(reference, Number(data.amount))
    return view('success', Boolean(credited))
  }
  // 'abandoned' just means the checkout was left open/closed — the player can still pay, so keep it pending.
  if (data.status === 'failed' || data.status === 'reversed') {
    await pool.query(`UPDATE wallet_topups SET status = 'failed' WHERE reference = $1 AND status = 'pending'`, [reference])
    return view('failed', false)
  }
  return view(row.status, false)
}

export function validPaystackSignature(rawBody: Buffer, signature: string | undefined) {
  if (!env.PAYSTACK_SECRET_KEY || !signature) return false
  const expected = createHmac('sha512', env.PAYSTACK_SECRET_KEY).update(rawBody).digest('hex')
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(signature, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function handlePaystackEvent(event: { event?: string; data?: PaystackVerifyData }) {
  if (event.event !== 'charge.success' || !event.data?.reference) return null
  if (event.data.status !== 'success' || event.data.currency !== 'NGN') {
    console.warn(
      `[topup] ignored charge.success for ${event.data.reference}: status=${event.data.status ?? '(none)'} currency=${event.data.currency ?? '(none)'}`,
    )
    return null
  }
  return creditTopup(event.data.reference, Number(event.data.amount))
}
