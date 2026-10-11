import { randomBytes } from 'node:crypto'

export function createId() {
  return randomBytes(16).toString('base64url')
}
