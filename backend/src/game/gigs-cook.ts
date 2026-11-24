import { asMoney } from './game-state.js'
import { bad, characterOf, good, lockGig, logEvent, startGigTx, writeGig } from './gigs.js'
import { budgetLeft, dishById, keyOpen } from './gigs-rules.js'

/*
 * The Cook's 3D job: the hired cook walks to the owner's stove (the same walk-and-use action every
 * player has), cooks the dish the owner asked for, and it lands in the owner's bag as food they can
 * eat. The ingredient money held in escrow pays for it. One dish per job; repeat taps are harmless.
 */

export function cookDish(userId: string, gigId: string, key: string) {
  return writeGig(userId, key, 'POST /gigs/cook', { gigId }, async ({ client }) => {
    let g = await lockGig(client, gigId)
    if (!g || g.worker_id !== userId) return bad('That is not your job.', 404)
    if (g.category !== 'cook') return bad('This is not a cooking job.', 400)
    const dish = dishById(g.dish)
    if (!dish) return bad('This job has no dish.', 409)
    if (!keyOpen(g.status, g.start_at, g.expires_at, new Date())) return bad('Your job key is not open right now.', 403)
    if (g.cooked_at) return good({ message: `${dish.name} is already cooked.`, dish, cooked: true })
    const ownerChar = await characterOf(client, g.owner_id)
    if (!ownerChar) return bad('That house is not ready.', 409)
    // Needs a stove that is standing in the house (not put away in storage)
    await client.query(`SELECT 1 FROM game_state WHERE character_id = $1 FOR UPDATE`, [ownerChar])
    const stove = await client.query(
      `SELECT 1 FROM home_placements p JOIN home_furniture f ON f.id = p.item_id
        WHERE p.character_id = $1 AND p.stored = FALSE AND f.uses = 'cooker' LIMIT 1`,
      [ownerChar],
    )
    if (!stove.rows[0]) return bad('This house has no stove to cook on.', 409, 'NO_STOVE')
    if (budgetLeft(asMoney(g.budget), asMoney(g.budget_spent)) < dish.cost) return bad('Not enough ingredient money left.', 409)
    if (g.status === 'hired') g = await startGigTx(client, g)
    await client.query(`UPDATE gigs SET cooked_at = NOW(), budget_spent = budget_spent + $2, escrow = escrow - $2 WHERE id = $1`, [gigId, dish.cost])
    await client.query(
      `INSERT INTO inventory (character_id, item_id, qty) VALUES ($1, $2, 1)
       ON CONFLICT (character_id, item_id) DO UPDATE SET qty = inventory.qty + 1`,
      [ownerChar, dish.id],
    )
    await logEvent(client, gigId, 'cooked', dish.cost, userId)
    return good({ message: `${dish.emoji} ${dish.name} is ready. It is in their bag.`, dish, cooked: true })
  })
}
