import type { PoolClient } from 'pg'
import { pool } from '../db.js'

export type IdempotentRecord = {
  statusCode: number
  body: unknown
}

/**
 * Lookup a stored mutating response. Table created in sql/008 — reuse forever.
 */
export async function getIdempotentResponse(
  userId: string,
  route: string,
  key: string,
  client?: PoolClient,
): Promise<IdempotentRecord | null> {
  const db = client ?? pool
  const found = await db.query<{ status_code: number; body: unknown }>(
    `SELECT status_code, body FROM idempotency_keys
     WHERE user_id = $1 AND route = $2 AND key = $3`,
    [userId, route, key],
  )
  const row = found.rows[0]
  if (!row) return null
  return { statusCode: row.status_code, body: row.body }
}

export async function saveIdempotentResponse(
  userId: string,
  route: string,
  key: string,
  statusCode: number,
  body: unknown,
  client?: PoolClient,
): Promise<void> {
  const db = client ?? pool
  await db.query(
    `INSERT INTO idempotency_keys (user_id, route, key, status_code, body)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (user_id, route, key) DO NOTHING`,
    [userId, route, key, statusCode, JSON.stringify(body)],
  )
}

export function readIdempotencyKey(headers: Record<string, unknown> | undefined): string | null {
  if (!headers) return null
  const raw =
    headers['idempotency-key'] ??
    headers['Idempotency-Key'] ??
    (headers as { 'idempotency-key'?: string })['idempotency-key']
  if (typeof raw !== 'string') return null
  const key = raw.trim()
  if (!key || key.length > 128) return null
  return key
}
