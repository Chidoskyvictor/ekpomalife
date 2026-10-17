import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { env } from './env.js'
import { pool } from './db.js'
import { characterRoutes } from './routes/character.js'
import { forgotRoutes } from './routes/forgot.js'
import { gameRoutes } from './routes/game.js'
import { loginRoutes } from './routes/login.js'
import { meRoutes } from './routes/me.js'
import { signupRoutes } from './routes/signup.js'

const app = Fastify({
  logger: true,
  bodyLimit: 4096,
  trustProxy: true,
})

await app.register(helmet, { global: true })
const allowedOrigins = env.FRONTEND_ORIGIN.split(',').map((value) => value.trim()).filter(Boolean)

await app.register(cors, {
  origin(origin, callback) {
    // Same-origin Next /api proxy, curl, and mobile WebViews may omit Origin.
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
      return
    }
    callback(null, false)
  },
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
  me: 'GET /auth/me',
  forgot: 'POST /auth/forgot',
  reset: 'POST /auth/reset',
  character: 'GET /character',
  look: 'POST /character/look',
  traits: 'POST /character/traits',
  dream: 'POST /character/dream',
  dreamCheck: 'POST /character/dream/check',
  startingMoney: 'POST /character/starting-money',
  setup: 'POST /character/setup',
  gameState: 'GET /game/state',
  gameAction: 'POST /game/action',
}))
app.get('/health', async () => ({ ok: true }))
await app.register(signupRoutes)
await app.register(loginRoutes)
await app.register(meRoutes)
await app.register(forgotRoutes)
await app.register(characterRoutes)
await app.register(gameRoutes)

const shutdown = async () => {
  await app.close()
  await pool.end()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

await app.listen({ port: env.PORT, host: '0.0.0.0' })
