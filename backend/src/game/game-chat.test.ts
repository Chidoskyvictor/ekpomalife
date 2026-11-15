import { describe, expect, it, vi } from 'vitest'

// game-chat.ts imports the db pool (never connects here); env just needs a URL to parse
vi.hoisted(() => {
  process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test'
})
import { cleanGameChat, GAME_CHAT_MAX, GAME_CHAT_RATE, maskBadWords, RateLimiter } from './game-chat-rules.js'
import { chatTicket, gameVoiceAccess, GameChatRoom, type SeatLookup } from './game-chat.js'
import { verifyJwt } from './livekit.js'

describe('word filter', () => {
  it('masks slurs, insults and sexual words, keeping the first letter', () => {
    expect(maskBadWords('you are a mumu').text).toBe('you are a m***')
    expect(maskBadWords('Shit happens').text).toBe('S*** happens')
    expect(maskBadWords('f u c k').masked).toBe(true)
    expect(maskBadWords('fuuuuck off').masked).toBe(true)
    expect(maskBadWords('sh1t').masked).toBe(true)
  })
  it('leaves normal words and names alone', () => {
    for (const ok of ['good game', 'Dickson played well', 'Essex is nice', 'assist me', 'your move bro', 'ludo 6!']) {
      expect(maskBadWords(ok).masked).toBe(false)
    }
  })
})

describe('cleanGameChat', () => {
  it('trims, limits length and masks', () => {
    expect(cleanGameChat('  hi   there ')).toEqual({ ok: true, text: 'hi there' })
    expect(cleanGameChat('x'.repeat(GAME_CHAT_MAX + 1)).ok).toBe(false)
    expect(cleanGameChat('   ').ok).toBe(false)
    expect(cleanGameChat(42).ok).toBe(false)
    expect(cleanGameChat('you idiot')).toEqual({ ok: true, text: 'you i****' })
  })
  it('blocks links and phone numbers', () => {
    for (const bad of ['https://evil.com', 'go to www.x.ng', 'join t.me/abc', 'call 0803 123 4567', 'my number +234 803-123-4567', 'visit scam.xyz']) {
      expect(cleanGameChat(bad).ok).toBe(false)
    }
    expect(cleanGameChat('I scored 100 points in 3 rounds').ok).toBe(true)
  })
})

describe('rate limit', () => {
  it('allows the burst, then blocks until the window passes', () => {
    const r = new RateLimiter()
    for (let i = 0; i < GAME_CHAT_RATE.max; i++) expect(r.take('a', 1000 + i)).toBe(true)
    expect(r.take('a', 1100)).toBe(false)
    expect(r.take('b', 1100)).toBe(true) // per player
    expect(r.take('a', 1000 + GAME_CHAT_RATE.windowMs + 10)).toBe(true)
  })
  it('is enforced inside a room', () => {
    const room = new GameChatRoom('match:1')
    room.join('u1', { name: 'ada', seat: 0 }, { send: () => {} })
    let blocked = 0
    for (let i = 0; i < 8; i++) if (!room.say('u1', `hi ${i}`, 5000).ok) blocked++
    expect(blocked).toBe(8 - GAME_CHAT_RATE.max)
  })
})

describe('only seated players', () => {
  const seated: SeatLookup = async (userId, kind, id) => (userId === 'ada' && kind === 'match' && id === 'm1' ? { name: 'ada', seat: 0 } : null)
  it('gives a chat ticket only to someone at that game', async () => {
    expect(await chatTicket('ada', 'match', 'm1', seated)).toMatchObject({ seat: 0 })
    expect(await chatTicket('eve', 'match', 'm1', seated)).toBeNull()
    expect(await chatTicket('ada', 'ludo', 'm1', seated)).toBeNull()
  })
  it('gives a voice token only to someone at that game, scoped to the game room', async () => {
    const cfg = { url: 'wss://x.test', apiKey: 'k', apiSecret: 's' }
    expect(await gameVoiceAccess('eve', 'match', 'm1', cfg, seated)).toBeNull()
    const ok = await gameVoiceAccess('ada', 'match', 'm1', cfg, seated)
    const claims = verifyJwt(ok!.token, 's') as { video: { room: string } }
    expect(claims.video.room).toBe('game_match_m1')
  })
  it('delivers lines only to people in the room, and never from outsiders', () => {
    const room = new GameChatRoom('match:m1')
    const got: Record<string, unknown[]> = { ada: [], bob: [], eve: [] }
    room.join('ada', { name: 'ada', seat: 0 }, { send: (m) => got.ada!.push(m) })
    room.join('bob', { name: 'bob', seat: 1 }, { send: (m) => got.bob!.push(m) })
    expect(room.say('eve', 'let me in').ok).toBe(false) // never joined
    expect(room.say('ada', 'gl hf').ok).toBe(true)
    expect(got.ada!.filter((m) => (m as { t: string }).t === 'msg')).toHaveLength(1)
    expect(got.bob!.filter((m) => (m as { t: string }).t === 'msg')).toHaveLength(1)
    expect(got.eve).toHaveLength(0)
  })
  it('stops delivering after a player leaves, and keeps a short history for late joiners', () => {
    const room = new GameChatRoom('match:m1')
    const sink = { send: () => {} }
    room.join('ada', { name: 'ada', seat: 0 }, sink)
    room.say('ada', 'hello')
    room.leave('ada', sink)
    expect(room.say('ada', 'again').ok).toBe(false)
    const late: unknown[] = []
    room.join('bob', { name: 'bob', seat: 1 }, { send: (m) => late.push(m) })
    expect((late[0] as { history: unknown[] }).history).toHaveLength(1)
  })
})
