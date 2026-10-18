import type { PoolClient } from 'pg'
import { applyAllowanceCatchup, applyLandlordIncomeCatchup, type PayoutNotice } from './payouts.js'
import { advanceRentLadder, ensureRentRow, type RentPublic } from './rent-ladder.js'

export type WeeklyResult = {
  notices: PayoutNotice[]
  rentNotices: string[]
  rent: RentPublic | null
  toast: string | null
}

/**
 * Lazy weekly economy: allowance, landlord income, rent ladder.
 * Call inside an open transaction after game_state is locked / ticked.
 */
export async function processWeeklyEconomy(
  client: PoolClient,
  opts: {
    characterId: string
    characterType: string | null
    lodgingId: string | null
    gameTime: number
  },
): Promise<WeeklyResult> {
  await ensureRentRow(client, opts.characterId, opts.lodgingId, opts.gameTime)

  const allowance = await applyAllowanceCatchup(client, {
    characterId: opts.characterId,
    characterType: opts.characterType,
    gameTime: opts.gameTime,
  })
  const landlord = await applyLandlordIncomeCatchup(client, {
    characterId: opts.characterId,
    gameTime: opts.gameTime,
  })
  const ladder = await advanceRentLadder(client, {
    characterId: opts.characterId,
    gameTime: opts.gameTime,
    lodgingId: opts.lodgingId,
  })

  const notices = [...allowance, ...landlord]
  const toastParts = [
    ...notices.map((n) => n.message),
    ...ladder.notices,
  ]
  const toast = toastParts.length > 0 ? toastParts.join(' · ') : null

  if (toast) {
    await client.query(
      `UPDATE game_state SET pending_toast = $2, updated_at = NOW() WHERE character_id = $1`,
      [opts.characterId, toast],
    )
  }

  return {
    notices,
    rentNotices: ladder.notices,
    rent: ladder.rent,
    toast,
  }
}

export async function consumePendingToast(
  client: PoolClient,
  characterId: string,
): Promise<string | null> {
  const found = await client.query<{ pending_toast: string | null }>(
    `SELECT pending_toast FROM game_state WHERE character_id = $1 FOR UPDATE`,
    [characterId],
  )
  const toast = found.rows[0]?.pending_toast ?? null
  if (toast) {
    await client.query(
      `UPDATE game_state SET pending_toast = NULL WHERE character_id = $1`,
      [characterId],
    )
  }
  return toast
}
