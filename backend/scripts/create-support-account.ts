// Creates (or resets the password of) the Support account.
//   cd backend && SUPPORT_PASSWORD='your-password' npx tsx --env-file=.env scripts/create-support-account.ts [username]
// Uses whichever database DATABASE_URL in .env points at.
import { hashPassword } from '../src/auth/password.js'
import { pool } from '../src/db.js'
import { createId } from '../src/ids.js'

const username = (process.argv[2] ?? 'support').toLowerCase()
const password = process.env.SUPPORT_PASSWORD ?? ''
if (password.length < 12) {
  console.error('Set SUPPORT_PASSWORD (12+ characters).')
  process.exit(1)
}
const hash = await hashPassword(password)
await pool.query(
  `INSERT INTO users (id, name, username, password_hash, is_support) VALUES ($1, 'Ekpoma Life Support', $2, $3, true)
   ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash, is_support = true`,
  [createId(), username, hash],
)
console.log(`Support account "${username}" is ready.`)
await pool.end()
