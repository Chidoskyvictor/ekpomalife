import type { PoolClient } from 'pg'
import { pool } from '../db.js'
import { createId } from '../ids.js'
import { env } from '../env.js'
import { roomFail } from './economy-codes.js'
import {
  applyCash,
  asMoney,
  ensureGameState,
  getPublicState,
  type PublicGameState,
} from './game-state.js'
import { withIdempotency } from './idempotency.js'
import { normalizeLodgingId } from './lodging.js'
import { requireEconomySetup } from './economy.js'
import {
  DEFAULT_ROOM_STYLE,
  FLOOR_PRICE,
  FURNITURE_BY_ID,
  FURNITURE_CATALOG,
  MAX_ROOM_ITEMS,
  PAINT_PRICE,
  ROOM_TIERS,
  ROOM_WALL_COLORS,
  STARTER_ITEMS,
} from './room-constants.js'
import { computeComfort, validateLayout } from './room-rules.js'
import type {
  FurnitureItem,
  RoomItem,
  RoomState,
  RoomStyle,
  Rotation,
} from './room-types.js'

type CatalogRow = {
  id: string
  name: string
  emoji: string
  category: string
  price: string | number
  footprint_w: number
  footprint_d: number
  model: string
  comfort: FurnitureItem['comfort'] | string
  min_tier: number
  wall_mounted: boolean
  max_per_room: number
  replaces: string | null
}

function mapCatalog(row: CatalogRow): FurnitureItem {
  const comfort =
    typeof row.comfort === 'string'
      ? (JSON.parse(row.comfort) as FurnitureItem['comfort'])
      : row.comfort
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    category: row.category as FurnitureItem['category'],
    price: asMoney(row.price),
    footprint: { w: row.footprint_w, d: row.footprint_d },
    model: row.model,
    comfort: comfort ?? {},
    minTier: row.min_tier as 1 | 2 | 3 | 4,
    wallMounted: row.wall_mounted,
    maxPerRoom: row.max_per_room,
    replaces: row.replaces ?? undefined,
  }
}

async function loadCatalog(client: PoolClient): Promise<FurnitureItem[]> {
  const rows = await client.query<CatalogRow>(
    `SELECT * FROM furniture_catalog ORDER BY sort ASC, id ASC`,
  )
  if (rows.rows.length === 0) return FURNITURE_CATALOG
  return rows.rows.map(mapCatalog)
}

function catalogMap(items: FurnitureItem[]) {
  return new Map(items.map((item) => [item.id, item]))
}

export async function ensureRoom(client: PoolClient, characterId: string) {
  await client.query(
    `INSERT INTO room_style (character_id, wall_color, floor_id, owned_floors, version)
     VALUES ($1, $2, $3, ARRAY['cement'], 0)
     ON CONFLICT (character_id) DO NOTHING`,
    [characterId, DEFAULT_ROOM_STYLE.wallColor, DEFAULT_ROOM_STYLE.floorId],
  )

  const existing = await client.query(
    `SELECT 1 FROM room_items WHERE character_id = $1 AND is_starter = TRUE LIMIT 1`,
    [characterId],
  )
  if ((existing.rowCount ?? 0) > 0) return

  for (const itemId of STARTER_ITEMS) {
    await client.query(
      `INSERT INTO room_items (id, character_id, item_id, placed, x, z, rotation, is_starter)
       VALUES ($1, $2, $3, TRUE, 0, 0, 0, TRUE)`,
      [`ri_${createId()}`, characterId, itemId],
    )
  }
}

type StyleRow = {
  wall_color: string
  floor_id: string
  owned_floors: string[]
  version: number
  last_fun_bonus_day: number | null
}

type ItemRow = {
  id: string
  item_id: string
  placed: boolean
  x: number
  z: number
  rotation: number
  is_starter: boolean
}

async function loadRoomState(
  client: PoolClient,
  opts: {
    characterId: string
    username: string
    lodgingId: string | null
    placedOnly?: boolean
  },
): Promise<RoomState> {
  await ensureRoom(client, opts.characterId)
  const lodging = normalizeLodgingId(opts.lodgingId)
  const tier = ROOM_TIERS[lodging]
  const catalog = catalogMap(await loadCatalog(client))

  const styleRow = await client.query<StyleRow>(
    `SELECT wall_color, floor_id, owned_floors, version, last_fun_bonus_day
     FROM room_style WHERE character_id = $1`,
    [opts.characterId],
  )
  const styleDb = styleRow.rows[0]!
  const style: RoomStyle = {
    wallColor: styleDb.wall_color,
    floorId: styleDb.floor_id as RoomStyle['floorId'],
  }

  const itemRows = await client.query<ItemRow>(
    `SELECT id, item_id, placed, x, z, rotation, is_starter
     FROM room_items WHERE character_id = $1 ORDER BY acquired_at ASC, id ASC`,
    [opts.characterId],
  )

  // Force over-tier items unplaced
  const forced: string[] = []
  for (const row of itemRows.rows) {
    const def = catalog.get(row.item_id)
    if (def && def.minTier > tier.tier && row.placed) {
      forced.push(row.id)
    }
  }
  if (forced.length) {
    await client.query(
      `UPDATE room_items SET placed = FALSE, x = 0, z = 0, rotation = 0
       WHERE id = ANY($1::text[])`,
      [forced],
    )
  }

  const refreshed = forced.length
    ? await client.query<ItemRow>(
        `SELECT id, item_id, placed, x, z, rotation, is_starter
         FROM room_items WHERE character_id = $1 ORDER BY acquired_at ASC, id ASC`,
        [opts.characterId],
      )
    : itemRows

  let items: RoomItem[] = refreshed.rows.map((row) => ({
    uid: row.id,
    itemId: row.item_id,
    placed: row.placed,
    x: row.placed ? row.x : 0,
    z: row.placed ? row.z : 0,
    rotation: row.rotation as Rotation,
  }))

  if (opts.placedOnly) {
    items = items.filter((item) => item.placed)
  }

  const comfort = computeComfort(items, catalog, tier, style)
  return {
    ownerUsername: opts.username,
    tier,
    style,
    items,
    comfort,
    version: styleDb.version,
  }
}

async function bumpVersion(client: PoolClient, characterId: string): Promise<number> {
  const updated = await client.query<{ version: number }>(
    `UPDATE room_style
     SET version = version + 1, updated_at = NOW()
     WHERE character_id = $1
     RETURNING version`,
    [characterId],
  )
  return updated.rows[0]!.version
}

async function publicStateOk(
  userId: string,
): Promise<{ ok: true; state: PublicGameState & { ok: true } } | { ok: false; error: string; code: number }> {
  const state = await getPublicState(userId)
  if (!state.ok) return state
  return { ok: true, state: { ok: true as const, ...state.state } }
}

export async function getRoom(userId: string) {
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return gate

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const username = await client.query<{ username: string }>(
      `SELECT username FROM users WHERE id = $1`,
      [userId],
    )
    const room = await loadRoomState(client, {
      characterId: gate.character.id,
      username: username.rows[0]?.username ?? 'player',
      lodgingId: gate.character.lodging_id,
    })
    const catalog = await loadCatalog(client)
    await client.query('COMMIT')
    return { ok: true as const, room, catalog }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function getVisitRoom(viewerId: string, username: string) {
  const gate = await requireEconomySetup(viewerId)
  if (!gate.ok) return gate

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const me = await client.query<{ username: string }>(
      `SELECT username FROM users WHERE id = $1`,
      [viewerId],
    )
    const myName = me.rows[0]?.username ?? ''
    const target = await client.query<{
      user_id: string
      character_id: string
      lodging_id: string | null
      username: string
    }>(
      `SELECT u.id AS user_id, u.username, c.id AS character_id, c.lodging_id
       FROM users u
       JOIN characters c ON c.user_id = u.id
       WHERE LOWER(u.username) = LOWER($1)`,
      [username],
    )
    const row = target.rows[0]
    if (!row) {
      await client.query('ROLLBACK')
      return { ok: false as const, error: 'Player not found.', code: 404 }
    }

    const isSelf = row.user_id === viewerId || row.username === myName
    if (!isSelf && !env.ROOM_VISITS_ENABLED) {
      await client.query('ROLLBACK')
      const fail = roomFail('VISITS_DISABLED')
      return { ok: false as const, error: fail.error, code: fail.http, roomCode: fail.code }
    }

    const room = await loadRoomState(client, {
      characterId: row.character_id,
      username: row.username,
      lodgingId: row.lodging_id,
      placedOnly: !isSelf,
    })
    await client.query('COMMIT')
    return { ok: true as const, room, readOnly: true as const }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function buyRoomItem(
  userId: string,
  itemId: string,
  qty: number,
  idemKey: string,
) {
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return gate
  const count = Math.max(1, Math.min(5, Math.floor(qty)))

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await ensureGameState(client, gate.character.id, {
      cash: asMoney(gate.character.starting_cash ?? gate.character.cash),
      lodgingId: gate.character.lodging_id,
    })

    const result = await withIdempotency(client, {
      userId,
      characterId: gate.character.id,
      key: idemKey,
      route: 'POST /room/buy',
      body: { itemId, qty: count },
      run: async () => {
        const lodging = normalizeLodgingId(gate.character.lodging_id)
        const tier = ROOM_TIERS[lodging]
        const catalog = catalogMap(await loadCatalog(client))
        const def = catalog.get(itemId)
        if (!def) {
          const f = roomFail('UNKNOWN_ITEM')
          return { status: f.http, body: { ok: false, error: f.error, code: f.code } }
        }
        if (def.minTier > tier.tier) {
          const f = roomFail('TIER_LOCKED')
          return { status: f.http, body: { ok: false, error: f.error, code: f.code } }
        }

        await ensureRoom(client, gate.character.id)
        const owned = await client.query<{ item_id: string }>(
          `SELECT item_id FROM room_items WHERE character_id = $1`,
          [gate.character.id],
        )
        if (owned.rows.length + count > MAX_ROOM_ITEMS) {
          const f = roomFail('TOO_MANY')
          return { status: f.http, body: { ok: false, error: f.error, code: f.code } }
        }
        const same = owned.rows.filter((r) => r.item_id === itemId).length
        if (same + count > def.maxPerRoom) {
          const f = roomFail('TOO_MANY')
          return { status: f.http, body: { ok: false, error: f.error, code: f.code } }
        }

        const total = def.price * count
        if (total > 0) {
          const wrote = await applyCash(
            client,
            gate.character.id,
            -total,
            `Bought ${def.name} for your room`,
            'purchase',
          )
          if (!wrote.ok) {
            const f = roomFail('INSUFFICIENT_FUNDS')
            return { status: f.http, body: { ok: false, error: f.error, code: f.code } }
          }
        }

        const bought: RoomItem[] = []
        for (let i = 0; i < count; i++) {
          const uid = `ri_${createId()}`
          await client.query(
            `INSERT INTO room_items (id, character_id, item_id, placed, x, z, rotation, is_starter)
             VALUES ($1, $2, $3, FALSE, 0, 0, 0, FALSE)`,
            [uid, gate.character.id, itemId],
          )
          bought.push({ uid, itemId, placed: false, x: 0, z: 0, rotation: 0 })
        }
        await bumpVersion(client, gate.character.id)
        const room = await loadRoomState(client, {
          characterId: gate.character.id,
          username: (
            await client.query<{ username: string }>(`SELECT username FROM users WHERE id = $1`, [
              userId,
            ])
          ).rows[0]!.username,
          lodgingId: gate.character.lodging_id,
        })
        return {
          status: 200,
          body: {
            ok: true,
            room,
            bought,
            message: count === 1 ? `Bought ${def.name}.` : `Bought ${count}× ${def.name}.`,
            _needState: true,
          },
        }
      },
    })

    if (result.replay) {
      await client.query('COMMIT')
      const body = result.body as Record<string, unknown>
      if (body.ok === true && body._needState) {
        const pub = await publicStateOk(userId)
        if (!pub.ok) return pub
        const { _needState: _, ...rest } = body
        return { ok: true as const, ...(rest as object), state: pub.state } as const
      }
      return {
        ok: false as const,
        error: (body.error as string) ?? 'Request failed.',
        code: result.status,
        roomCode: body.code as string | undefined,
        uid: body.uid as string | undefined,
        body,
      }
    }

    await client.query('COMMIT')
    const body = result.body as Record<string, unknown>
    if (body.ok !== true) {
      return {
        ok: false as const,
        error: (body.error as string) ?? 'Request failed.',
        code: result.status,
        roomCode: body.code as string | undefined,
        uid: body.uid as string | undefined,
      }
    }
    const pub = await publicStateOk(userId)
    if (!pub.ok) return pub
    const { _needState: _, ...rest } = body
    return {
      ok: true as const,
      room: rest.room as RoomState,
      bought: rest.bought as RoomItem[],
      message: rest.message as string,
      state: pub.state,
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function saveLayout(
  userId: string,
  version: number,
  items: { uid: string; placed: boolean; x: number; z: number; rotation: Rotation }[],
  idemKey: string,
) {
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return gate

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await withIdempotency(client, {
      userId,
      characterId: gate.character.id,
      key: idemKey,
      route: 'PUT /room/layout',
      body: { version, items },
      run: async () => {
        await ensureRoom(client, gate.character.id)
        const locked = await client.query<StyleRow>(
          `SELECT wall_color, floor_id, owned_floors, version, last_fun_bonus_day
           FROM room_style WHERE character_id = $1 FOR UPDATE`,
          [gate.character.id],
        )
        const style = locked.rows[0]!
        if (style.version !== version) {
          const room = await loadRoomState(client, {
            characterId: gate.character.id,
            username: (
              await client.query<{ username: string }>(`SELECT username FROM users WHERE id = $1`, [
                userId,
              ])
            ).rows[0]!.username,
            lodgingId: gate.character.lodging_id,
          })
          const f = roomFail('VERSION_CONFLICT')
          return {
            status: 409,
            body: { ok: false, error: f.error, code: f.code, room },
          }
        }

        const owned = await client.query<{ id: string; item_id: string; is_starter: boolean }>(
          `SELECT id, item_id, is_starter FROM room_items WHERE character_id = $1`,
          [gate.character.id],
        )
        const ownedIds = new Set(owned.rows.map((r) => r.id))
        const payloadIds = new Set(items.map((i) => i.uid))
        if (ownedIds.size !== payloadIds.size || [...ownedIds].some((id) => !payloadIds.has(id))) {
          const missing = items.find((i) => !ownedIds.has(i.uid))
          const f = roomFail('NOT_OWNED', missing?.uid)
          return {
            status: f.http,
            body: { ok: false, error: f.error, code: f.code, uid: f.uid },
          }
        }

        const lodging = normalizeLodgingId(gate.character.lodging_id)
        const tier = ROOM_TIERS[lodging]
        const catalog = catalogMap(await loadCatalog(client))
        const byId = new Map(owned.rows.map((r) => [r.id, r]))

        const layoutItems: RoomItem[] = items.map((entry) => {
          const row = byId.get(entry.uid)!
          const def = catalog.get(row.item_id)
          const overTier = def && def.minTier > tier.tier
          return {
            uid: entry.uid,
            itemId: row.item_id,
            placed: overTier ? false : entry.placed,
            x: overTier || !entry.placed ? 0 : entry.x,
            z: overTier || !entry.placed ? 0 : entry.z,
            rotation: overTier || !entry.placed ? 0 : entry.rotation,
          }
        })

        const check = validateLayout(layoutItems, catalog, tier)
        if (!check.ok) {
          const f = roomFail(check.code, check.uid)
          return {
            status: f.http,
            body: { ok: false, error: f.error, code: f.code, uid: check.uid },
          }
        }

        for (const entry of layoutItems) {
          await client.query(
            `UPDATE room_items
             SET placed = $2, x = $3, z = $4, rotation = $5
             WHERE id = $1 AND character_id = $6`,
            [entry.uid, entry.placed, entry.x, entry.z, entry.rotation, gate.character.id],
          )
        }
        await bumpVersion(client, gate.character.id)
        const room = await loadRoomState(client, {
          characterId: gate.character.id,
          username: (
            await client.query<{ username: string }>(`SELECT username FROM users WHERE id = $1`, [
              userId,
            ])
          ).rows[0]!.username,
          lodgingId: gate.character.lodging_id,
        })
        return { status: 200, body: { ok: true, room } }
      },
    })

    await client.query('COMMIT')
    const body = result.body as Record<string, unknown>
    if (body.ok === true) {
      return { ok: true as const, room: body.room as RoomState }
    }
    return {
      ok: false as const,
      error: (body.error as string) ?? 'Request failed.',
      code: result.status,
      roomCode: body.code as string | undefined,
      uid: body.uid as string | undefined,
      room: body.room as RoomState | undefined,
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function saveStyle(
  userId: string,
  version: number,
  patch: { wallColor?: string; floorId?: RoomStyle['floorId'] },
  idemKey: string,
) {
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return gate

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await ensureGameState(client, gate.character.id, {
      cash: asMoney(gate.character.starting_cash ?? gate.character.cash),
      lodgingId: gate.character.lodging_id,
    })

    const result = await withIdempotency(client, {
      userId,
      characterId: gate.character.id,
      key: idemKey,
      route: 'PUT /room/style',
      body: { version, ...patch },
      run: async () => {
        await ensureRoom(client, gate.character.id)
        const locked = await client.query<StyleRow>(
          `SELECT wall_color, floor_id, owned_floors, version, last_fun_bonus_day
           FROM room_style WHERE character_id = $1 FOR UPDATE`,
          [gate.character.id],
        )
        const style = locked.rows[0]!
        if (style.version !== version) {
          const room = await loadRoomState(client, {
            characterId: gate.character.id,
            username: (
              await client.query<{ username: string }>(`SELECT username FROM users WHERE id = $1`, [
                userId,
              ])
            ).rows[0]!.username,
            lodgingId: gate.character.lodging_id,
          })
          const f = roomFail('VERSION_CONFLICT')
          return {
            status: 409,
            body: { ok: false, error: f.error, code: f.code, room },
          }
        }

        const lodging = normalizeLodgingId(gate.character.lodging_id)
        const tier = ROOM_TIERS[lodging]
        let wallColor = style.wall_color
        let floorId = style.floor_id as RoomStyle['floorId']
        let owned = [...(style.owned_floors ?? ['cement'])]
        let charge = 0
        const messages: string[] = []

        if (patch.wallColor != null) {
          if (!(ROOM_WALL_COLORS as readonly string[]).includes(patch.wallColor)) {
            const f = roomFail('BAD_COLOR')
            return { status: f.http, body: { ok: false, error: f.error, code: f.code } }
          }
          if (patch.wallColor !== wallColor) {
            if (patch.wallColor !== DEFAULT_ROOM_STYLE.wallColor) {
              charge += PAINT_PRICE
              messages.push('Repainted your room')
            }
            wallColor = patch.wallColor
          }
        }

        if (patch.floorId != null) {
          if (!tier.floorOptions.includes(patch.floorId)) {
            const f = roomFail('FLOOR_LOCKED')
            return { status: f.http, body: { ok: false, error: f.error, code: f.code } }
          }
          if (patch.floorId !== floorId) {
            if (!owned.includes(patch.floorId)) {
              charge += FLOOR_PRICE[patch.floorId]
              owned.push(patch.floorId)
              messages.push(`New floor: ${patch.floorId}`)
            }
            floorId = patch.floorId
          }
        }

        if (charge > 0) {
          const reason = messages[0] ?? 'Room style'
          const wrote = await applyCash(client, gate.character.id, -charge, reason, 'purchase')
          if (!wrote.ok) {
            const f = roomFail('INSUFFICIENT_FUNDS')
            return { status: f.http, body: { ok: false, error: f.error, code: f.code } }
          }
        }

        await client.query(
          `UPDATE room_style
           SET wall_color = $2, floor_id = $3, owned_floors = $4::text[],
               version = version + 1, updated_at = NOW()
           WHERE character_id = $1`,
          [gate.character.id, wallColor, floorId, owned],
        )

        const room = await loadRoomState(client, {
          characterId: gate.character.id,
          username: (
            await client.query<{ username: string }>(`SELECT username FROM users WHERE id = $1`, [
              userId,
            ])
          ).rows[0]!.username,
          lodgingId: gate.character.lodging_id,
        })
        return {
          status: 200,
          body: {
            ok: true,
            room,
            charged: charge,
            message: messages.join(' · ') || 'Room style updated.',
            _needState: true,
          },
        }
      },
    })

    await client.query('COMMIT')
    const body = result.body as Record<string, unknown>
    if (body.ok !== true) {
      return {
        ok: false as const,
        error: (body.error as string) ?? 'Request failed.',
        code: result.status,
        roomCode: body.code as string | undefined,
        room: body.room as RoomState | undefined,
      }
    }
    const pub = await publicStateOk(userId)
    if (!pub.ok) return pub
    return {
      ok: true as const,
      room: body.room as RoomState,
      state: pub.state,
      charged: body.charged as number,
      message: body.message as string,
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function sellRoomItem(userId: string, uid: string, idemKey: string) {
  const gate = await requireEconomySetup(userId)
  if (!gate.ok) return gate

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await ensureGameState(client, gate.character.id, {
      cash: asMoney(gate.character.starting_cash ?? gate.character.cash),
      lodgingId: gate.character.lodging_id,
    })

    const result = await withIdempotency(client, {
      userId,
      characterId: gate.character.id,
      key: idemKey,
      route: 'POST /room/sell',
      body: { uid },
      run: async () => {
        await ensureRoom(client, gate.character.id)
        const found = await client.query<{
          id: string
          item_id: string
          is_starter: boolean
        }>(
          `SELECT id, item_id, is_starter FROM room_items
           WHERE character_id = $1 AND id = $2 FOR UPDATE`,
          [gate.character.id, uid],
        )
        const row = found.rows[0]
        if (!row) {
          const f = roomFail('NOT_OWNED', uid)
          return { status: f.http, body: { ok: false, error: f.error, code: f.code, uid } }
        }
        if (row.is_starter) {
          const f = roomFail('CANT_SELL_STARTER')
          return { status: f.http, body: { ok: false, error: f.error, code: f.code } }
        }
        const def = FURNITURE_BY_ID.get(row.item_id) ?? (await loadCatalog(client)).find((c) => c.id === row.item_id)
        if (!def) {
          const f = roomFail('UNKNOWN_ITEM', uid)
          return { status: f.http, body: { ok: false, error: f.error, code: f.code, uid } }
        }
        const refunded = Math.floor(def.price * 0.4)
        if (refunded > 0) {
          const wrote = await applyCash(
            client,
            gate.character.id,
            refunded,
            `Sold ${def.name}`,
            'refund',
          )
          if (!wrote.ok) {
            return { status: 400, body: { ok: false, error: wrote.error } }
          }
        }
        await client.query(`DELETE FROM room_items WHERE id = $1`, [uid])
        await bumpVersion(client, gate.character.id)
        const room = await loadRoomState(client, {
          characterId: gate.character.id,
          username: (
            await client.query<{ username: string }>(`SELECT username FROM users WHERE id = $1`, [
              userId,
            ])
          ).rows[0]!.username,
          lodgingId: gate.character.lodging_id,
        })
        return {
          status: 200,
          body: {
            ok: true,
            room,
            refunded,
            message: `Sold ${def.name} for ₦${refunded.toLocaleString()}.`,
            _needState: true,
          },
        }
      },
    })

    await client.query('COMMIT')
    const body = result.body as Record<string, unknown>
    if (body.ok !== true) {
      return {
        ok: false as const,
        error: (body.error as string) ?? 'Request failed.',
        code: result.status,
        roomCode: body.code as string | undefined,
        uid: body.uid as string | undefined,
      }
    }
    const pub = await publicStateOk(userId)
    if (!pub.ok) return pub
    return {
      ok: true as const,
      room: body.room as RoomState,
      state: pub.state,
      refunded: body.refunded as number,
      message: body.message as string,
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

/** Sleep energy multiplier from room comfort (1 + pct/100). Cap so full room never more than doubles. */
export async function sleepEnergyMultiplier(
  client: PoolClient,
  characterId: string,
  lodgingId: string | null,
): Promise<number> {
  try {
    await ensureRoom(client, characterId)
    const usernameRow = await client.query<{ username: string }>(
      `SELECT u.username FROM users u JOIN characters c ON c.user_id = u.id WHERE c.id = $1`,
      [characterId],
    )
    const room = await loadRoomState(client, {
      characterId,
      username: usernameRow.rows[0]?.username ?? 'player',
      lodgingId,
    })
    const pct = Math.min(100, Math.max(0, room.comfort.sleepEnergyBonusPct))
    return 1 + pct / 100
  } catch {
    return 1
  }
}

/** Apply daily fun bonus once per game day. Returns fun points added. */
export async function applyDailyFunBonus(
  client: PoolClient,
  characterId: string,
  lodgingId: string | null,
  gameDay: number,
  currentFun: number,
): Promise<{ fun: number; granted: number }> {
  await ensureRoom(client, characterId)
  const style = await client.query<{ last_fun_bonus_day: number | null }>(
    `SELECT last_fun_bonus_day FROM room_style WHERE character_id = $1 FOR UPDATE`,
    [characterId],
  )
  const last = style.rows[0]?.last_fun_bonus_day
  if (last != null && last >= gameDay) {
    return { fun: currentFun, granted: 0 }
  }

  const usernameRow = await client.query<{ username: string }>(
    `SELECT u.username FROM users u JOIN characters c ON c.user_id = u.id WHERE c.id = $1`,
    [characterId],
  )
  const room = await loadRoomState(client, {
    characterId,
    username: usernameRow.rows[0]?.username ?? 'player',
    lodgingId,
  })
  const granted = Math.max(0, room.comfort.dailyFunBonus)
  // Cap: never more than double from a "full" room path — dailyFunBonus max is floor(30/6)=5
  const nextFun = Math.min(100, currentFun + granted)
  await client.query(
    `UPDATE room_style SET last_fun_bonus_day = $2, updated_at = NOW() WHERE character_id = $1`,
    [characterId, gameDay],
  )
  return { fun: nextFun, granted }
}
