import { pool } from '../db.js'

/*
 * Phone → Music. Track metadata (titles, art, files) lives in the frontend (lib/music/tracks.ts);
 * the server only needs to know which ids are real, so it can count hearts and streams.
 */
export const MUSIC_TRACK_IDS = ['amapiano-bala', 'amapiano-drift', 'shakara', 'abena'] as const
export const STREAM_COOLDOWN_MINUTES = 60

export const isTrackId = (id: string) => (MUSIC_TRACK_IDS as readonly string[]).includes(id)

export type TrackStats = { id: string; streams: number; likes: number; liked: boolean }

export async function listTrackStats(userId: string): Promise<TrackStats[]> {
  const { rows } = await pool.query<TrackStats>(
    `SELECT t.id,
            (SELECT COUNT(*)::int FROM music_streams s WHERE s.track_id = t.id) AS streams,
            (SELECT COUNT(*)::int FROM music_likes l WHERE l.track_id = t.id) AS likes,
            EXISTS (SELECT 1 FROM music_likes l WHERE l.track_id = t.id AND l.user_id = $2) AS liked
       FROM unnest($1::text[]) AS t(id)`,
    [[...MUSIC_TRACK_IDS], userId],
  )
  return rows
}

async function trackStats(userId: string, trackId: string): Promise<TrackStats> {
  return (await listTrackStats(userId)).find((t) => t.id === trackId)!
}

/** Idempotent: liking twice leaves one heart, unliking twice leaves none. */
export async function setLike(userId: string, trackId: string, liked: boolean) {
  if (!isTrackId(trackId)) return { ok: false as const, error: 'No such song.', code: 404 }
  if (liked) {
    await pool.query(`INSERT INTO music_likes (user_id, track_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [userId, trackId])
  } else {
    await pool.query(`DELETE FROM music_likes WHERE user_id = $1 AND track_id = $2`, [userId, trackId])
  }
  return { ok: true as const, track: await trackStats(userId, trackId) }
}

/** Counts one stream unless this player already streamed this track in the last hour. */
export async function countStream(userId: string, trackId: string) {
  if (!isTrackId(trackId)) return { ok: false as const, error: 'No such song.', code: 404 }
  const client = await pool.connect()
  let counted = false
  try {
    await client.query('BEGIN')
    // Serialise a player's racing requests for the same track so both cannot pass the check
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`music:${userId}:${trackId}`])
    const res = await client.query(
      `INSERT INTO music_streams (user_id, track_id)
       SELECT $1, $2
        WHERE NOT EXISTS (
          SELECT 1 FROM music_streams
           WHERE user_id = $1 AND track_id = $2 AND created_at > NOW() - make_interval(mins => $3::int))`,
      [userId, trackId, STREAM_COOLDOWN_MINUTES],
    )
    counted = (res.rowCount ?? 0) > 0
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
  return { ok: true as const, counted, track: await trackStats(userId, trackId) }
}
