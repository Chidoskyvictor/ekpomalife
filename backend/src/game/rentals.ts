import { pool } from '../db.js'
import { dayFromGameTime, displayDateForGameDay, nextRentDay } from './calendar.js'
import { requireEconomySetup } from './economy.js'
import { applyCash } from './game-state.js'
import { rehomeFurniture } from './home-buy.js'
import { lodgingHasKitchen, moveInFeeFor, normalizeLodgingId, rentWeeklyForLodging, type LodgingId } from './lodging.js'
import { realGameTime } from './time.js'

/*
 * The phone's Houses app: rent another place and move there. You pay the new place's move-in fee
 * (as at sign-up; the hostel is free), its weekly rent starts fresh from today, your starter
 * furniture swaps for the new home's and what you bought moves with you (rehomeFurniture).
 * One move per 7 days, and not while you owe the caretaker.
 */

export const MOVE_COOLDOWN_DAYS = 7

const HOUSES: { id: LodgingId; name: string; address: string; about: string }[] = [
  { id: 'hostel-poultry', name: 'Hostel bunk', address: 'Igbinedion Hostel, AAU campus, Ekpoma', about: 'A bunk in a shared campus room. Cheapest, but no space of your own to decorate.' },
  { id: 'single-poultry', name: 'Single room', address: 'Poultry road, Ekpoma', about: 'Your own room. Shared bathroom outside, no kitchen.' },
  { id: 'selfcon-g2', name: 'Self-con', address: 'By College of Medicine and G1, Ekpoma', about: 'Room with its own bathroom and a small kitchen.' },
  { id: 'onebed-ojo', name: 'One bedroom', address: 'Ojo street, Ekpoma', about: 'Bedroom and parlour, own kitchen and bathroom. Space for friends.' },
]

type Fail = { ok: false; error: string; code: number }
const fail = (error: string, code = 400): Fail => ({ ok: false, error, code })

async function moveInfo(characterId: string) {
  const r = await pool.query<{ moved_at: Date | null; status: string | null }>(
    `SELECT c.moved_at, r.status FROM characters c LEFT JOIN rent r ON r.character_id = c.id WHERE c.id = $1`,
    [characterId],
  )
  const row = r.rows[0]
  const movedAt = row?.moved_at ? new Date(row.moved_at).getTime() : null
  const nextMoveAt = movedAt ? movedAt + MOVE_COOLDOWN_DAYS * 86_400_000 : null
  return {
    owesRent: row?.status === 'late' || row?.status === 'evicted',
    nextMoveAt: nextMoveAt && nextMoveAt > Date.now() ? new Date(nextMoveAt).toISOString() : null,
  }
}

export async function listRentals(userId: string) {
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return gate
  const current = normalizeLodgingId(gate.character.lodging_id)
  const info = await moveInfo(gate.character.id)
  return {
    ok: true as const,
    current,
    owesRent: info.owesRent,
    nextMoveAt: info.nextMoveAt,
    houses: HOUSES.map((h) => ({
      ...h,
      moveIn: moveInFeeFor(h.id),
      rentWeekly: rentWeeklyForLodging(h.id),
      kitchen: lodgingHasKitchen(h.id),
      decorate: h.id !== 'hostel-poultry',
      current: h.id === current,
    })),
  }
}

export async function moveToRental(userId: string, lodgingId: string) {
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return gate
  const house = HOUSES.find((h) => h.id === lodgingId)
  if (!house) return fail('That place isn’t for rent.', 404)
  const characterId = gate.character.id
  const current = normalizeLodgingId(gate.character.lodging_id)
  if (house.id === current) return fail('You already live here.', 409)

  const fee = moveInFeeFor(house.id)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // Lock the character so two taps can't move twice
    const locked = await client.query<{ moved_at: Date | null }>(`SELECT moved_at FROM characters WHERE id = $1 FOR UPDATE`, [characterId])
    const movedAt = locked.rows[0]?.moved_at ? new Date(locked.rows[0].moved_at).getTime() : null
    if (movedAt && Date.now() - movedAt < MOVE_COOLDOWN_DAYS * 86_400_000) {
      await client.query('ROLLBACK')
      return fail(`You moved recently. You can move again on ${new Date(movedAt + MOVE_COOLDOWN_DAYS * 86_400_000).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}.`, 409)
    }
    const rent = await client.query<{ status: string }>(`SELECT status FROM rent WHERE character_id = $1`, [characterId])
    const status = rent.rows[0]?.status
    if (status === 'late' || status === 'evicted') {
      await client.query('ROLLBACK')
      return fail('Pay the caretaker what you owe before you move.', 409)
    }
    if (fee > 0) {
      const paid = await applyCash(client, characterId, -fee, `Move-in fee: ${house.name}, ${house.address}`, 'rent')
      if (!paid.ok) {
        await client.query('ROLLBACK')
        return fail(paid.error === 'INSUFFICIENT_FUNDS' ? `You need ₦${fee.toLocaleString()} to move in.` : 'Could not take the payment.', paid.error === 'INSUFFICIENT_FUNDS' ? 402 : 409)
      }
    }
    await client.query(`UPDATE characters SET lodging_id = $2, moved_at = NOW(), updated_at = NOW() WHERE id = $1`, [characterId, house.id])
    // Fresh rent at the new place: the move-in fee covers you until the next rent day
    const day = dayFromGameTime(realGameTime())
    const dueDay = nextRentDay(day + 1)
    await client.query(
      `UPDATE rent SET lodging_id = $2, amount = $3, status = 'ok', warnings = 0, evicted_at = NULL, last_warned_at = NULL,
              message = NULL, due_game_day = $4, paid_until_game_day = $5, due_at = $6::timestamptz, paid_until = $7::timestamptz
       WHERE character_id = $1`,
      [characterId, house.id, rentWeeklyForLodging(house.id), dueDay, day, displayDateForGameDay(dueDay), displayDateForGameDay(day)],
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }

  const furniture = await rehomeFurniture(characterId, house.id)
  const extra =
    furniture.refunded > 0
      ? ` ${furniture.refunded} piece${furniture.refunded === 1 ? '' : 's'} didn't fit and ${furniture.refunded === 1 ? 'was' : 'were'} sold back for ₦${furniture.refundTotal.toLocaleString()}.`
      : furniture.kept > 0
        ? ' Your furniture came with you.'
        : ''
  return { ok: true as const, lodgingId: house.id, message: `Moved in to your ${house.name.toLowerCase()} on ${house.address}.${extra}` }
}
