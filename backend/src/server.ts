import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { env } from './env.js'
import { pool } from './db.js'
import { characterRoutes } from './routes/character.js'
import { loginRoutes } from './routes/login.js'
import { signupRoutes } from './routes/signup.js'

const app = Fastify({
  logger: true,
  bodyLimit: 4096,
  trustProxy: true,
})

await app.register(helmet, { global: true })
await app.register(cors, {
  origin: env.FRONTEND_ORIGIN,
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
})
await app.register(cookie)
await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
})

app.get('/', async () => ({
  ok: true,
  name: 'Ekpoma Life API',
  health: '/health',
  signup: 'POST /auth/signup',
  login: 'POST /auth/login',
  dream: 'POST /character/dream',
  dreamCheck: 'POST /character/dream/check',
}))
app.get('/health', async () => ({ ok: true }))
await app.register(signupRoutes)
await app.register(loginRoutes)
await app.register(characterRoutes)

const shutdown = async () => {
  await app.close()
  await pool.end()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

await app.listen({ port: env.PORT, host: '0.0.0.0' })
