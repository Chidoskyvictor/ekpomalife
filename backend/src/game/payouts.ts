import type { PoolClient } from 'pg'
import { applyCash, asMoney } from './game-state.js'
import {
  dayFromGameTime,
  gameWeekFromDay,
  mondayDayForWeek,
  rentDayForWeek,
} from './calendar.js'
import { LODGE_DEED_ITEM_ID, LODGE_INCOME_WEEKLY } from './lodging.js'

export const ALLOWANCE_AMOUNT = 3_000
export const ALLOWANCE_KIND = 'allowance'
export const LANDLORD_KIND = 'landlord_income'
/** Max Mondays / landlord weeks to catch up in one tick. */
export const PAYOUT_CATCHUP_CAP = 4

export type PayoutNotice = { kind: string; amount: number; message: string }

async function tryInsertPayout(
  client: PoolClient,
  characterId: string,
  kind: string,
  gameWeek: number,
  amount: number,
): Promise<boolean> {
  const inserted = await client.query(
    `INSERT INTO payouts (character_id, kind, game_week, amount)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (character_id, kind, game_week) DO NOTHING
     RETURNING character_id`,
    [characterId, kind, gameWeek, amount],
  )
  return (inserted.rowCount ?? 0) > 0
}

/** Student Monday allowance — idempotent per game week, catch-up capped. */
export async function applyAllowanceCatchup(
  client: PoolClient,
  opts: {
    characterId: string
    characterType: string | null
    gameTime: number
  },
): Promise<PayoutNotice[]> {
  if (opts.characterType !== 'student') return []
  const day = dayFromGameTime(opts.gameTime)
  const currentWeek = gameWeekFromDay(day)
  const notices: PayoutNotice[] = []

  for (let i = 0; i < PAYOUT_CATCHUP_CAP; i++) {
    const week = currentWeek - i
    if (week < 0) break
    const monday = mondayDayForWeek(week)
    if (day < monday) continue

    const claimed = await tryInsertPayout(
      client,
      opts.characterId,
      ALLOWANCE_KIND,
      week,
      ALLOWANCE_AMOUNT,
    )
    if (!claimed) continue

    const wrote = await applyCash(
      client,
      opts.characterId,
      ALLOWANCE_AMOUNT,
      'Monday allowance',
      'allowance',
    )
    if (!wrote.ok) {
      // Should not happen for a credit; roll back claim if cash write fails.
      await client.query(
        `DELETE FROM payouts WHERE character_id = $1 AND kind = $2 AND game_week = $3`,
        [opts.characterId, ALLOWANCE_KIND, week],
      )
      continue
    }
    notices.push({
      kind: 'allowance',
      amount: ALLOWANCE_AMOUNT,
      message: `Monday allowance +₦${ALLOWANCE_AMOUNT.toLocaleString()}`,
    })
  }

  return notices
}

async function ownsLodgeDeed(client: PoolClient, characterId: string): Promise<boolean> {
  const found = await client.query<{ qty: number }>(
    `SELECT qty FROM inventory
     WHERE character_id = $1 AND item_id = $2 AND qty > 0`,
    [characterId, LODGE_DEED_ITEM_ID],
  )
  return (found.rows[0]?.qty ?? 0) > 0
}

/**
 * Landlord weekly income — only when lodge-deed is owned.
 * Ledger kind `rent` (positive). Payouts table uses kind landlord_income for uniqueness.
 */
export async function applyLandlordIncomeCatchup(
  client: PoolClient,
  opts: { characterId: string; gameTime: number },
): Promise<PayoutNotice[]> {
  if (!(await ownsLodgeDeed(client, opts.characterId))) return []

  const day = dayFromGameTime(opts.gameTime)
  const currentWeek = gameWeekFromDay(day)
  const notices: PayoutNotice[] = []

  for (let i = 0; i < PAYOUT_CATCHUP_CAP; i++) {
    const week = currentWeek - i
    if (week < 0) break
    const sat = rentDayForWeek(week)
    if (day < sat) continue

    const claimed = await tryInsertPayout(
      client,
      opts.characterId,
      LANDLORD_KIND,
      week,
      LODGE_INCOME_WEEKLY,
    )
    if (!claimed) continue

    const wrote = await applyCash(
      client,
      opts.characterId,
      LODGE_INCOME_WEEKLY,
      'Lodge rent income',
      'rent',
    )
    if (!wrote.ok) {
      await client.query(
        `DELETE FROM payouts WHERE character_id = $1 AND kind = $2 AND game_week = $3`,
        [opts.characterId, LANDLORD_KIND, week],
      )
      continue
    }

    // Landlord dream: owning lodge + rising net worth (cash mirrors netWorth floor in getPublicState).
    await client.query(
      `UPDATE characters
       SET snapshot = COALESCE(snapshot, '{}'::jsonb) || jsonb_build_object('ownsLodge', true),
           updated_at = NOW()
       WHERE id = $1`,
      [opts.characterId],
    )

    notices.push({
      kind: 'rent',
      amount: LODGE_INCOME_WEEKLY,
      message: `Lodge rent in +₦${LODGE_INCOME_WEEKLY.toLocaleString()}`,
    })
  }

  return notices
}

export async function sumLedgerEqualsCash(
  client: PoolClient,
  characterId: string,
): Promise<{ cash: number; ledgerSum: number }> {
  const cashRow = await client.query<{ cash: string | number }>(
    `SELECT cash FROM game_state WHERE character_id = $1`,
    [characterId],
  )
  const ledger = await client.query<{ amount: string | number }>(
    `SELECT amount FROM ledger WHERE character_id = $1`,
    [characterId],
  )
  const cash = asMoney(cashRow.rows[0]?.cash)
  const ledgerSum = ledger.rows.reduce((total, row) => total + asMoney(row.amount), 0)
  return { cash, ledgerSum }
}
