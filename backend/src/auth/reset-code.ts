import { createHash, randomInt } from 'node:crypto'
import { env } from '../env.js'

const CODE_TTL_MS = 12 * 60 * 1000

export function createResetCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

export function hashResetCode(code: string, userId: string) {
  return createHash('sha256').update(`${env.RESET_CODE_PEPPER}:${userId}:${code}`).digest('hex')
}

export function resetExpiry() {
  return new Date(Date.now() + CODE_TTL_MS)
}
