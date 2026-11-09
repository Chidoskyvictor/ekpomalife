import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import { getSessionUser } from '../auth/current-user.js'
import { missionProgressFor } from '../game/missions.js'
import {
  CHAT_MESSAGE_MAX,
  clearReaction,
  getChatSync,
  getHostCard,
  getReadReceiptsPref,
  setReaction,
  setReadReceiptsPref,
  getMessages,
  listChats,
  markRead,
  openDirectChat,
  reportMessage,
  searchPlayers,
  sendMessage,
  sendMoney,
  unreadTotal,
} from '../game/chat.js'
import { HOSTEL_NAME_MAX } from '../game/hostel-names.js'
import { createHostel, getMyHostel, joinHostel, leaveHostel, listNeighbours, searchHostels } from '../game/hostels.js'

function fail(reply: FastifyReply, result: { status: number; code: string; error: string }) {
  return reply.code(result.status).send({ ok: false, code: result.code, error: result.error })
}

const notLoggedIn = (reply: FastifyReply) => reply.code(401).send({ ok: false, error: 'Log in to play.' })

const searchSchema = z.object({ q: z.string().max(HOSTEL_NAME_MAX).default('') })
const createSchema = z.object({ name: z.string().min(1).max(HOSTEL_NAME_MAX * 2) })
const pageSchema = z.object({
  before: z.coerce.number().int().positive().optional(),
  after: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
})
const sendSchema = z.object({
  body: z.string().max(CHAT_MESSAGE_MAX * 2).default(''),
  kind: z.enum(['text', 'sticker', 'invite', 'visit']).default('text'),
  replyTo: z.coerce.number().int().positive().optional(),
})
const reactionSchema = z.object({ emoji: z.string().min(1).max(16) })
const syncSchema = z.object({ from: z.coerce.number().int().min(0).default(0) })
const prefsSchema = z.object({ readReceipts: z.boolean() })
const moneySchema = z.object({ amount: z.coerce.number().int() })
const readSchema = z.object({ seq: z.coerce.number().int().min(0) })
const reportSchema = z.object({ reason: z.string().max(200).optional() })
const playerSearchSchema = z.object({ q: z.string().max(40).default('') })
const directSchema = z.object({ userId: z.string().min(1).max(64) })

export async function hostelRoutes(app: FastifyInstance) {
  // —— Hostels ——
  app.get('/hostels/search', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const parsed = searchSchema.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'Search is too long.' })
    const { normalized, results } = await searchHostels(parsed.data.q)
    return reply.send({ ok: true, normalized, results, exactMatch: results.some((hit) => hit.exact) })
  })

  app.get('/hostels/me', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const mine = await getMyHostel(user.id)
    return reply.send({ ok: true, hostel: mine?.hostel ?? null, chatId: mine?.chatId ?? null })
  })

  app.post('/hostels', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const parsed = createSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'Type the hostel name.' })
    const result = await createHostel(user.id, parsed.data.name)
    if (!result.ok) {
      // Already on the list: send the match(es) so the client can offer "Join"
      const matches = 'matches' in result ? result.matches : undefined
      return reply.code(result.status).send({ ok: false, code: result.code, error: result.error, matches })
    }
    return reply.code(201).send({ ok: true, hostel: result.hostel, created: true })
  })

  app.post('/hostels/:id/join', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const { id } = request.params as { id: string }
    const result = await joinHostel(user.id, id)
    if (!result.ok) return fail(reply, result)
    return reply.send({ ok: true, hostel: result.hostel, chatId: result.chatId })
  })

  app.post('/hostels/leave', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const result = await leaveHostel(user.id)
    if (!result.ok) return fail(reply, result)
    return reply.send({ ok: true })
  })

  app.get('/hostels/:id/members', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const { id } = request.params as { id: string }
    const result = await listNeighbours(user.id, id)
    if (!result.ok) return fail(reply, result)
    return reply.send({ ok: true, neighbours: result.neighbours })
  })

  // —— Chat ——
  app.get('/chats', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const chats = await listChats(user.id)
    return reply.send({ ok: true, chats, unread: chats.reduce((sum, chat) => sum + chat.unread, 0) })
  })

  // "Message someone: @user"
  app.get('/players/search', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const parsed = playerSearchSchema.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'Search is too long.' })
    return reply.send({ ok: true, players: await searchPlayers(user.id, parsed.data.q) })
  })

  app.post('/chats/direct', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const parsed = directSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'Pick someone to message.' })
    const result = await openDirectChat(user.id, parsed.data.userId)
    if (!result.ok) return fail(reply, result)
    return reply.send({ ok: true, chat: result.chat })
  })

  app.get('/chats/unread', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    return reply.send({ ok: true, unread: await unreadTotal(user.id) })
  })

  app.get('/chats/:id/messages', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const { id } = request.params as { id: string }
    const parsed = pageSchema.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'Bad page.' })
    const result = await getMessages(user.id, id, parsed.data)
    if (!result.ok) return fail(reply, result)
    return reply.send({ ok: true, messages: result.messages, hasMore: result.hasMore, receipts: result.receipts })
  })

  app.post('/chats/:id/messages', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const { id } = request.params as { id: string }
    const parsed = sendSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, code: 'TOO_LONG', error: `Keep it under ${CHAT_MESSAGE_MAX} characters.` })
    }
    const result = await sendMessage(user.id, id, parsed.data.body, parsed.data.kind, parsed.data.replyTo)
    if (!result.ok) return fail(reply, result)
    await missionProgressFor(user.id, 'text')
    return reply.code(201).send({ ok: true, message: result.message })
  })

  // Send naira to the other player in a direct chat
  app.post('/chats/:id/money', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const { id } = request.params as { id: string }
    const parsed = moneySchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, code: 'BAD_AMOUNT', error: 'Enter an amount.' })
    const result = await sendMoney(user.id, id, parsed.data.amount)
    if (!result.ok) return fail(reply, result)
    return reply.code(201).send({ ok: true, message: result.message, cash: result.cash, version: result.version })
  })

  // Name + look of a player whose place you're visiting
  app.get('/players/by-username/:username/home', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const { username } = request.params as { username: string }
    const host = await getHostCard(username.slice(0, 40))
    if (!host) return reply.code(404).send({ ok: false, code: 'NOT_FOUND', error: 'Player not found.' })
    return reply.send({ ok: true, host })
  })

  // Reactions + tick markers for the open chat (polled with the new-message check)
  app.get('/chats/:id/sync', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const { id } = request.params as { id: string }
    const parsed = syncSchema.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'Bad request.' })
    const result = await getChatSync(user.id, id, parsed.data.from)
    if (!result.ok) return fail(reply, result)
    return reply.send({ ok: true, reactions: result.reactions, receipts: result.receipts })
  })

  // One reaction per player per message: PUT sets or replaces it, POST .../clear removes it (no DELETE: the CORS list has none)
  app.put('/chats/messages/:seq/reaction', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const seq = Number((request.params as { seq: string }).seq)
    if (!Number.isInteger(seq) || seq <= 0) return reply.code(400).send({ ok: false, error: 'Bad message.' })
    const parsed = reactionSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, code: 'BAD_EMOJI', error: 'Pick one of the reactions.' })
    const result = await setReaction(user.id, seq, parsed.data.emoji)
    if (!result.ok) return fail(reply, result)
    return reply.send({ ok: true, reactions: result.reactions })
  })

  app.post('/chats/messages/:seq/reaction/clear', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const seq = Number((request.params as { seq: string }).seq)
    if (!Number.isInteger(seq) || seq <= 0) return reply.code(400).send({ ok: false, error: 'Bad message.' })
    const result = await clearReaction(user.id, seq)
    if (!result.ok) return fail(reply, result)
    return reply.send({ ok: true, reactions: result.reactions })
  })

  // Chat preferences: read receipts (default on)
  app.get('/chats/settings', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    return reply.send({ ok: true, readReceipts: await getReadReceiptsPref(user.id) })
  })

  app.patch('/chats/settings', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const parsed = prefsSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'Bad setting.' })
    await setReadReceiptsPref(user.id, parsed.data.readReceipts)
    return reply.send({ ok: true, readReceipts: parsed.data.readReceipts })
  })

  app.post('/chats/:id/read', async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const { id } = request.params as { id: string }
    const parsed = readSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'Bad read marker.' })
    await markRead(user.id, id, parsed.data.seq)
    return reply.send({ ok: true })
  })

  app.post('/chats/messages/:seq/report', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    const user = await getSessionUser(request)
    if (!user) return notLoggedIn(reply)
    const seq = Number((request.params as { seq: string }).seq)
    if (!Number.isInteger(seq) || seq <= 0) return reply.code(400).send({ ok: false, error: 'Bad message.' })
    const parsed = reportSchema.safeParse(request.body ?? {})
    const result = await reportMessage(user.id, seq, parsed.success ? parsed.data.reason : undefined)
    if (!result.ok) return fail(reply, result)
    return reply.send({ ok: true })
  })
}
