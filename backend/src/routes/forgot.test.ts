import cookie from '@fastify/cookie'
import Fastify from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Fake database and a slow fake mailer: these tests never touch Neon or send real email.
const fake = vi.hoisted(() => {
  process.env.DATABASE_URL ??= 'postgres://mock.invalid/none'
  const users = [{ id: 'u1', name: 'Ada', email: 'ada@example.com' }]
  const writes: string[] = []
  const sent: string[] = []
  const query = async (sql: string, params: unknown[] = []) => {
    const ok = (rows: unknown[]) => ({ rows, rowCount: rows.length })
    if (sql.includes('COUNT(*)::int AS count')) return ok([{ count: 0 }])
    if (sql.includes('SELECT id, name, email FROM users')) return ok(users.filter((u) => u.email === params[0]))
    if (sql.includes('UPDATE password_resets') || sql.includes('INSERT INTO password_resets')) {
      writes.push(sql.trim().split(/\s+/)[0]!)
      return ok([])
    }
    throw new Error(`unexpected query: ${sql}`)
  }
  const sendMail = async ({ to }: { to: string }) => {
    await new Promise((r) => setTimeout(r, 400))
    sent.push(to)
  }
  return { pool: { query }, writes, sent, sendMail }
})
vi.mock('../db.js', () => ({ pool: fake.pool, createPool: () => fake.pool }))
vi.mock('../mail/send.js', () => ({ sendMail: fake.sendMail }))

const { forgotRoutes } = await import('./forgot.js')

async function buildApp() {
  const app = Fastify()
  await app.register(cookie)
  await app.register((await import('@fastify/rate-limit')).default, { global: false })
  await app.register(forgotRoutes)
  await app.ready()
  return app
}

const forgot = (app: Awaited<ReturnType<typeof buildApp>>, email: string) =>
  app.inject({ method: 'POST', url: '/auth/forgot', payload: { email } })

const settle = () => new Promise((r) => setTimeout(r, 600))

describe('POST /auth/forgot does not reveal accounts', () => {
  beforeEach(() => {
    fake.writes.length = 0
    fake.sent.length = 0
  })

  it('gives the same status and body for a known and an unknown email', async () => {
    const app = await buildApp()
    const known = await forgot(app, '  ADA@Example.com ')
    const unknown = await forgot(app, 'nobody@example.com')
    expect(known.statusCode).toBe(200)
    expect(unknown.statusCode).toBe(known.statusCode)
    expect(unknown.body).toBe(known.body)
    expect(known.json()).toEqual({ ok: true })
    await settle() // let the background send finish so it doesn't spill into the next test
  })

  it('replies before the slow email send finishes, then still issues the code', async () => {
    const app = await buildApp()
    const started = Date.now()
    await forgot(app, 'ada@example.com')
    expect(Date.now() - started).toBeLessThan(300) // the fake mailer takes 400ms
    expect(fake.sent).toEqual([])
    await settle()
    expect(fake.writes).toEqual(['UPDATE', 'INSERT'])
    expect(fake.sent).toEqual(['ada@example.com'])
  })

  it('stores no code and sends no email for an unknown address', async () => {
    const app = await buildApp()
    await forgot(app, 'nobody@example.com')
    await settle()
    expect(fake.writes).toEqual([])
    expect(fake.sent).toEqual([])
  })
})
