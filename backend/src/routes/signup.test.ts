import cookie from '@fastify/cookie'
import Fastify from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// In-memory users table: these tests never open a database connection.
const db = vi.hoisted(() => {
  process.env.DATABASE_URL ??= 'postgres://mock.invalid/none'
  type Row = { id: string; name: string; username: string; password_hash: string; email: string; created_at: number }
  const users: Row[] = []
  const query = async (sql: string, params: unknown[] = []) => {
    const ok = (rows: unknown[]) => ({ rows, rowCount: rows.length })
    if (sql.includes('AS username_taken')) {
      return ok([{
        username_taken: users.some((u) => u.username === params[0]),
        email_taken: users.some((u) => u.email.toLowerCase() === params[1]),
      }])
    }
    if (sql.startsWith('INSERT INTO users')) {
      const [id, name, username, password_hash, email] = params as string[]
      // Mirrors users_username_key and users_email_lower_unique
      if (users.some((u) => u.username === username)) throw Object.assign(new Error('dup'), { code: '23505', constraint: 'users_username_key' })
      if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) throw Object.assign(new Error('dup'), { code: '23505', constraint: 'users_email_lower_unique' })
      users.push({ id, name, username, password_hash, email, created_at: users.length })
      return ok([])
    }
    if (sql.includes('FROM users WHERE LOWER(email) = $1')) return ok(users.filter((u) => u.email.toLowerCase() === params[0]))
    if (sql.includes('FROM users WHERE username = $1')) return ok(users.filter((u) => u.username === params[0]))
    if (sql.startsWith('INSERT INTO sessions')) return ok([])
    throw new Error(`unexpected query: ${sql}`)
  }
  return { users, pool: { query } }
})
vi.mock('../db.js', () => ({ pool: db.pool, createPool: () => db.pool }))

const { signupRoutes, SIGNUP_FAILED } = await import('./signup.js')
const { loginRoutes } = await import('./login.js')

async function buildApp() {
  const app = Fastify()
  await app.register(cookie)
  await app.register((await import('@fastify/rate-limit')).default, { global: false })
  await app.register(signupRoutes)
  await app.register(loginRoutes)
  await app.ready()
  return app
}

const signup = (app: Awaited<ReturnType<typeof buildApp>>, username: string, email: string) =>
  app.inject({
    method: 'POST',
    url: '/auth/signup',
    payload: { name: 'Ada Test', username, password: 'test-pass-99', email, isAdult: true },
  })

describe('POST /auth/signup email uniqueness', () => {
  beforeEach(() => {
    db.users.length = 0
  })

  it('stores the email trimmed and lowercased', async () => {
    const app = await buildApp()
    expect((await signup(app, 'ada_one', '  Ada@Example.COM ')).statusCode).toBe(201)
    expect(db.users[0]?.email).toBe('ada@example.com')
  })

  it('rejects the same email in another case or with spaces, with the generic error', async () => {
    const app = await buildApp()
    expect((await signup(app, 'ada_one', 'ada@example.com')).statusCode).toBe(201)
    for (const [username, email] of [['ada_two', 'ADA@Example.com'], ['ada_three', '  ada@example.com  ']]) {
      const res = await signup(app, username, email)
      expect(res.statusCode).toBe(409)
      expect(res.json()).toEqual({ ok: false, error: SIGNUP_FAILED })
      expect(res.body.toLowerCase()).not.toContain('email')
    }
    expect(db.users).toHaveLength(1)
  })

  it('returns the generic error when the unique index catches a race (23505)', async () => {
    const app = await buildApp()
    db.users.push({ id: 'x', name: 'X', username: 'someone', password_hash: '', email: 'race@example.com', created_at: 0 })
    const original = db.pool.query
    // Pretend the pre-check ran before the other signup committed.
    db.pool.query = async (sql: string, params?: unknown[]) =>
      sql.includes('AS username_taken') ? { rows: [{ username_taken: false, email_taken: false }], rowCount: 1 } : original(sql, params)
    try {
      const res = await signup(app, 'racer', 'Race@Example.com')
      expect(res.statusCode).toBe(409)
      expect(res.json().error).toBe(SIGNUP_FAILED)
    } finally {
      db.pool.query = original
    }
  })

  it('still says when a username is taken', async () => {
    const app = await buildApp()
    await signup(app, 'ada_one', 'a@example.com')
    const res = await signup(app, 'ada_one', 'b@example.com')
    expect(res.json().error).toBe('That username is taken.')
  })
})

describe('POST /auth/login with mixed-case input', () => {
  beforeEach(() => {
    db.users.length = 0
  })

  it('signs an existing user in by email or username in any case', async () => {
    const app = await buildApp()
    expect((await signup(app, 'ada_one', 'ada@example.com')).statusCode).toBe(201)
    for (const username of ['  ADA@Example.Com ', 'Ada_One']) {
      const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { username, password: 'test-pass-99' } })
      expect(res.statusCode).toBe(200)
      expect(res.json().account.username).toBe('ada_one')
    }
  })
})
