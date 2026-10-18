import { createHash } from 'node:crypto'
import type { PoolClient } from 'pg'
import { pool } from '../db.js'

export type IdempotentRecord = {
  statusCode: number
  body: unknown
}

export type IdempotencyResult = {
  status: number
  body: unknown
  replay?: boolean
}

/** Stable JSON for request hashing (sorted object keys). */
export function stableJSON(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(obj).sort()) {
      out[key] = sortKeys(obj[key])
    }
    return out
  }
  return value
}

export function hashIdempotencyRequest(route: string, body: unknown): string {
  return createHash('sha256').update(`${route}\n${stableJSON(body)}`).digest('hex')
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
  const found = await db.query<{ status_code: number; body: unknown; response: unknown }>(
    `SELECT status_code, body, response FROM idempotency_keys
     WHERE user_id = $1 AND route = $2 AND key = $3`,
    [userId, route, key],
  )
  const row = found.rows[0]
  if (!row) return null
  return { statusCode: row.status_code, body: row.response ?? row.body }
}

export async function saveIdempotentResponse(
  userId: string,
  route: string,
  key: string,
  statusCode: number,
  body: unknown,
  client?: PoolClient,
  extras?: { characterId?: string; requestHash?: string },
): Promise<void> {
  const db = client ?? pool
  const json = JSON.stringify(body)
  await db.query(
    `INSERT INTO idempotency_keys (user_id, route, key, status_code, body, response, character_id, request_hash)
     VALUES ($1, $2, $3, $4, $5::jsonb, $5::jsonb, $6, $7)
     ON CONFLICT (user_id, route, key) DO NOTHING`,
    [
      userId,
      route,
      key,
      statusCode,
      json,
      extras?.characterId ?? null,
      extras?.requestHash ?? '',
    ],
  )
}

/**
 * Room-contract idempotency inside an open transaction.
 * Advisory lock → hash match → store 2xx and 4xx business results.
 */
export async function withIdempotency(
  client: PoolClient,
  opts: {
    userId: string
    characterId: string
    key: string
    route: string
    body: unknown
    run: () => Promise<IdempotencyResult>
  },
): Promise<IdempotencyResult> {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
    `${opts.characterId}:${opts.key}`,
  ])

  const requestHash = hashIdempotencyRequest(opts.route, opts.body)
  const found = await client.query<{
    status_code: number
    body: unknown
    response: unknown
    request_hash: string
  }>(
    `SELECT status_code, body, response, request_hash FROM idempotency_keys
     WHERE user_id = $1 AND route = $2 AND key = $3`,
    [opts.userId, opts.route, opts.key],
  )

  if (found.rows[0]) {
    const row = found.rows[0]
    const prevHash = row.request_hash ?? ''
    if (prevHash && prevHash !== requestHash) {
      return {
        status: 409,
        body: {
          ok: false,
          error: 'This request does not match the first attempt.',
          code: 'IDEMPOTENCY_CONFLICT',
        },
        replay: true,
      }
    }
    return {
      status: row.status_code,
      body: row.response ?? row.body,
      replay: true,
    }
  }

  const result = await opts.run()
  await saveIdempotentResponse(
    opts.userId,
    opts.route,
    opts.key,
    result.status,
    result.body,
    client,
    { characterId: opts.characterId, requestHash },
  )

  // Opportunistic purge older than 24h
  await client.query(`DELETE FROM idempotency_keys WHERE created_at < NOW() - INTERVAL '24 hours'`)

  return { ...result, replay: false }
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

/** UUID v4 shape (contract). */
export function isUuidV4(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
