import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { env } from './env.js'
import { pool } from './db.js'
import { runMigrations } from './migrations.js'
import { characterRoutes } from './routes/character.js'
import { economyRoutes } from './routes/economy.js'
import { roomRoutes } from './routes/room.js'
import { phoneRoutes } from './routes/phone.js'
import { forgotRoutes } from './routes/forgot.js'
import { gameRoutes } from './routes/game.js'
import { loginRoutes } from './routes/login.js'
import { meRoutes } from './routes/me.js'
import { signupRoutes } from './routes/signup.js'
import { statsRoutes } from './routes/stats.js'

const app = Fastify({
  logger: true,
  bodyLimit: 4096,
  // Render / Railway terminate TLS — trust X-Forwarded-* for HTTPS + client IP.
  trustProxy: true,
})

await app.register(helmet, { global: true })
const allowedOrigins = env.FRONTEND_ORIGIN.split(',').map((value) => value.trim()).filter(Boolean)

await app.register(cors, {
  origin(origin, callback) {
    // Same-origin tooling, curl, and health checks may omit Origin.
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
      return
    }
    callback(null, false)
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'OPTIONS'],
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
  stats: 'GET /stats',
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
  jobs: 'GET /jobs',
  jobsApply: 'POST /jobs/apply',
  jobsShift: 'POST /jobs/shift',
  shop: 'GET /shop',
  shopBuy: 'POST /shop/buy',
  inventory: 'GET /inventory',
  inventoryUse: 'POST /inventory/use',
  rent: 'GET /rent',
  rentPay: 'POST /rent/pay',
  hustles: 'GET /hustles',
  hustlesRun: 'POST /hustles/run',
  ledger: 'GET /ledger',
  room: 'GET /room',
  roomVisit: 'GET /room/:username',
  roomBuy: 'POST /room/buy',
  roomLayout: 'PUT /room/layout',
  roomStyle: 'PUT /room/style',
  roomSell: 'POST /room/sell',
  phone: 'GET /phone',
  phoneDataBuy: 'POST /phone/data/buy',
  phoneCharge: 'POST /phone/charge',
  phoneOpen: 'POST /phone/open',
  phoneSettings: 'PATCH /phone/settings',
  phoneNotifications: 'GET /phone/notifications',
  rideQuote: 'GET /ride/quote',
  ride: 'POST /ride',
}))

app.get('/health', async (request, reply) => {
  try {
    await pool.query('SELECT 1')
    return { ok: true, db: true }
  } catch (error) {
    request.log.error(error)
    return reply.code(503).send({ ok: false, db: false, error: 'Database unavailable' })
  }
})

await app.register(statsRoutes)
await app.register(signupRoutes)
await app.register(loginRoutes)
await app.register(meRoutes)
await app.register(forgotRoutes)
await app.register(characterRoutes)
await app.register(gameRoutes)
await app.register(economyRoutes)
await app.register(roomRoutes)
await app.register(phoneRoutes)

const shutdown = async () => {
  await app.close()
  await pool.end()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

await runMigrations()
await app.listen({ port: env.PORT, host: '0.0.0.0' })
