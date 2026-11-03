import { pool } from '../db.js'

/*
 * Every player gets a house in the estates on the map (the hostel-house grids), like Lagos Life.
 * Plots are numbered the same way as lib/game/estates.ts on the app: the north grid row by row
 * (16 × 7 = 112), then the east grid (8 × 5 = 40). Each area of streets is a range of plots, and
 * a player is put in the area that matches where they live, or the next free plot anywhere.
 */

export const ESTATE_AREAS = [
  { id: 'ojo', name: 'Ojo Street', from: 0, to: 31 },
  { id: 'poultry', name: 'Poultry Road', from: 32, to: 79 },
  { id: 'g1', name: 'G1, College Road', from: 80, to: 111 },
  { id: 'ihumudumu', name: 'Ihumudumu', from: 112, to: 151 },
] as const

const LODGING_AREA: Record<string, (typeof ESTATE_AREAS)[number]['id']> = {
  'onebed-ojo': 'ojo',
  'single-poultry': 'poultry',
  'hostel-poultry': 'poultry',
  'selfcon-g2': 'g1',
}

const LODGING_KIND: Record<string, string> = {
  'hostel-poultry': 'Hostel bunk',
  'single-poultry': 'Single room',
  'selfcon-g2': 'Self-con',
  'onebed-ojo': 'One bedroom',
}

export const areaOfPlot = (plot: number) => ESTATE_AREAS.find((a) => plot >= a.from && plot <= a.to) ?? null

/** A session counts as "around" if it made a request this recently (same as the online counter). */
const ONLINE_WINDOW = '5 minutes'

/** Your plot, given the first time you ask (right after signup, or an old account's first visit). */
export async function ensurePlot(userId: string): Promise<number> {
  const found = await pool.query<{ plot: number }>(`SELECT plot FROM house_plots WHERE user_id = $1`, [userId])
  if (found.rows[0]) return found.rows[0].plot

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // One assignment at a time, so two new players never get the same plot
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('house_plots'))`)
    const again = await client.query<{ plot: number }>(`SELECT plot FROM house_plots WHERE user_id = $1`, [userId])
    if (again.rows[0]) {
      await client.query('COMMIT')
      return again.rows[0].plot
    }
    const lodging = await client.query<{ lodging_id: string | null }>(`SELECT lodging_id FROM characters WHERE user_id = $1`, [userId])
    const areaId = LODGING_AREA[lodging.rows[0]?.lodging_id ?? ''] ?? 'ihumudumu'
    const area = ESTATE_AREAS.find((a) => a.id === areaId)!
    const taken = await client.query<{ plot: number }>(`SELECT plot FROM house_plots`)
    const used = new Set(taken.rows.map((r) => r.plot))
    let plot = -1
    for (let p = area.from; p <= area.to; p++) {
      if (!used.has(p)) {
        plot = p
        break
      }
    }
    // That area is full: the lowest free plot anywhere (past the last grid the estate grows)
    if (plot < 0) {
      plot = 0
      while (used.has(plot)) plot++
    }
    await client.query(`INSERT INTO house_plots (user_id, plot) VALUES ($1, $2)`, [userId, plot])
    await client.query('COMMIT')
    return plot
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export type HouseView = {
  plot: number
  username: string
  userId: string
  /** "Single room", "Self-con"… */
  kind: string
  area: string
  /** Signed in lately and at their house right now. */
  home: boolean
  /** Furniture they've bought for their place. */
  items: number
}

/** Every taken plot with its owner, for the map. */
export async function listHouses(): Promise<HouseView[]> {
  const rows = await pool.query<{
    plot: number
    user_id: string
    username: string
    lodging_id: string | null
    location_id: string | null
    online: boolean
    items: number
  }>(
    `SELECT hp.plot, u.id AS user_id, u.username, c.lodging_id, gs.location_id,
            EXISTS (
              SELECT 1 FROM sessions s
              WHERE s.user_id = u.id AND s.last_seen_at > NOW() - $1::interval AND s.expires_at > NOW()
            ) AS online,
            (SELECT COUNT(*)::int FROM home_placements p WHERE p.character_id = c.id) AS items
     FROM house_plots hp
     JOIN users u ON u.id = hp.user_id
     LEFT JOIN characters c ON c.user_id = u.id
     LEFT JOIN game_state gs ON gs.character_id = c.id
     ORDER BY hp.plot`,
    [ONLINE_WINDOW],
  )
  return rows.rows.map((r) => ({
    plot: r.plot,
    userId: r.user_id,
    username: r.username,
    kind: LODGING_KIND[r.lodging_id ?? ''] ?? 'Room',
    area: areaOfPlot(r.plot)?.name ?? 'Ekpoma',
    home: r.online && (r.location_id === 'home' || r.location_id === null),
    items: r.items,
  }))
}
