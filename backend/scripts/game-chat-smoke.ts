/*
 * Socket-level smoke test of the in-game chat with two fake seated players and one outsider.
 * No database or LiveKit needed:  npx tsx --env-file=<any env with DATABASE_URL> scripts/game-chat-smoke.ts
 */
import Fastify from 'fastify'
import websocket from '@fastify/websocket'
import WebSocket from 'ws'
import { chatTicket, joinGameChat, type SeatLookup } from '../src/game/game-chat.js'

const seats: Record<string, { name: string; seat: number }> = { u1: { name: 'ada', seat: 0 }, u2: { name: 'bob', seat: 1 } }
const lookup: SeatLookup = async (userId, kind, id) => (kind === 'match' && id === 'm1' ? (seats[userId] ?? null) : null)

const app = Fastify()
await app.register(websocket)
app.post('/t/:user', async (req) => (await chatTicket((req.params as { user: string }).user, 'match', 'm1', lookup)) ?? { error: 'not seated' })
app.get('/ws', { websocket: true }, (socket, req) => joinGameChat(socket, (req.query as { ticket?: string }).ticket))
await app.listen({ port: 0, host: '127.0.0.1' })
const port = (app.server.address() as { port: number }).port

const open = async (user: string) => {
  const t = (await (await fetch(`http://127.0.0.1:${port}/t/${user}`, { method: 'POST' })).json()) as { ticket?: string }
  if (!t.ticket) return null
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?ticket=${t.ticket}`)
  const got: Record<string, unknown>[] = []
  ws.on('message', (d) => got.push(JSON.parse(String(d))))
  await new Promise((r) => ws.once('open', r))
  return { ws, got }
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

const a = (await open('u1'))!
const b = (await open('u2'))!
const eve = await open('eve')
console.log('outsider got a ticket:', eve !== null)
a.ws.send(JSON.stringify({ t: 'say', text: 'gl hf you mumu' }))
a.ws.send(JSON.stringify({ t: 'say', text: 'call 08031234567' }))
await wait(300)
console.log('bob got:', b.got.filter((m) => m.t === 'msg').map((m) => (m.line as { text: string }).text))
console.log('ada errors:', a.got.filter((m) => m.t === 'error').map((m) => m.error))
for (let i = 0; i < 8; i++) a.ws.send(JSON.stringify({ t: 'say', text: `spam ${i}` }))
await wait(300)
console.log('rate-limit errors:', a.got.filter((m) => m.error === 'Slow down a little.').length)
a.ws.close()
b.ws.close()
await app.close()
process.exit(0)
