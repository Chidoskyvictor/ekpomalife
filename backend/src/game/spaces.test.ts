import { describe, expect, it } from 'vitest'
import {
  autoEndReason,
  canPublish,
  canStartScheduled,
  checkScheduleSlot,
  checkComment,
  checkTitle,
  createCapReached,
  joinCodeFrom,
  lagosDayStart,
  normalizeJoinCode,
  participantMinutes,
  spacesBudget,
  DEFAULT_DAILY_MINUTES,
  LIVEKIT_FREE_MONTHLY_MINUTES,
  scheduleSlots,
} from './spaces-rules.js'
import { joinToken, signJwt, verifyJwt, verifyWebhook } from './livekit.js'
import { createHash } from 'node:crypto'

const MIN = 60_000
// 14:07 Lagos time = 13:07 UTC
const NOW = new Date('2026-10-26T13:07:00Z')

describe('checkTitle', () => {
  it('accepts a normal title and tidies spaces', () => {
    expect(checkTitle('  Ekpoma   gist  night ')).toEqual({ ok: true, title: 'Ekpoma gist night' })
  })
  it('rejects empty and too-long titles', () => {
    expect(checkTitle('   ')).toMatchObject({ ok: false, code: 'EMPTY_TITLE' })
    expect(checkTitle('a'.repeat(61))).toMatchObject({ ok: false, code: 'TITLE_TOO_LONG' })
    expect(checkTitle('a'.repeat(60))).toMatchObject({ ok: true })
  })
  it.each([
    'Send me something abeg',
    'FREE COINS for first 10',
    'Big GIVEAWAY tonight',
    'Airtime for everybody',
    'dash me small',
    'drop account number',
    'S3nd-me c0ins!!',
    's e n d m e',
    'Give away 5k',
  ])('blocks begging/giveaway title: %s', (title) => {
    expect(checkTitle(title)).toMatchObject({ ok: false, code: 'TITLE_BLOCKED' })
  })
  it.each(['Who will send meals to hostel?', 'Cash outfit ideas', 'Bitcoin talk', 'Send-off party plans', 'Accountancy exam prep'])(
    'does not block innocent title: %s',
    (title) => {
      expect(checkTitle(title)).toMatchObject({ ok: true })
    },
  )
})

describe('scheduling slots (Africa/Lagos)', () => {
  it('accepts quarter-hour slots within 7 days', () => {
    expect(checkScheduleSlot(new Date('2026-10-26T13:15:00Z'), NOW)).toMatchObject({ ok: true }) // 14:15 Lagos
    expect(checkScheduleSlot(new Date('2026-11-02T13:00:00Z'), NOW)).toMatchObject({ ok: true })
  })
  it('rejects off-slot, past and too-far times', () => {
    expect(checkScheduleSlot(new Date('2026-10-26T13:20:00Z'), NOW)).toMatchObject({ ok: false, code: 'BAD_SLOT' })
    expect(checkScheduleSlot(new Date('2026-10-26T13:15:30Z'), NOW)).toMatchObject({ ok: false, code: 'BAD_SLOT' })
    expect(checkScheduleSlot(new Date('2026-10-26T13:00:00Z'), NOW)).toMatchObject({ ok: false, code: 'SLOT_PAST' })
    expect(checkScheduleSlot(new Date('2026-11-02T13:15:00Z'), NOW)).toMatchObject({ ok: false, code: 'SLOT_TOO_FAR' })
    expect(checkScheduleSlot(new Date('nope'), NOW)).toMatchObject({ ok: false, code: 'BAD_SLOT' })
  })
  it('lists every slot from the next quarter hour to 7 days ahead', () => {
    const slots = scheduleSlots(NOW)
    expect(slots[0]!.toISOString()).toBe('2026-10-26T13:15:00.000Z')
    expect(slots.at(-1)!.toISOString()).toBe('2026-11-02T13:00:00.000Z')
    expect(slots.length).toBe(7 * 96)
    for (const s of slots) expect(checkScheduleSlot(s, NOW).ok).toBe(true)
  })
  it('Lagos day starts at 23:00 UTC', () => {
    expect(lagosDayStart(NOW).toISOString()).toBe('2026-10-25T23:00:00.000Z')
    expect(lagosDayStart(new Date('2026-10-26T23:30:00Z')).toISOString()).toBe('2026-10-26T23:00:00.000Z')
  })
  it('scheduled rooms open 10 minutes early and expire 30 minutes late', () => {
    const at = new Date('2026-10-26T13:15:00Z')
    expect(canStartScheduled(at, NOW)).toBe(true) // 8 minutes early
    expect(canStartScheduled(at, new Date(at.getTime() - 11 * MIN))).toBe(false)
    expect(canStartScheduled(at, new Date(at.getTime() - 10 * MIN))).toBe(true)
    expect(canStartScheduled(at, new Date(at.getTime() + 30 * MIN))).toBe(true)
    expect(canStartScheduled(at, new Date(at.getTime() + 31 * MIN))).toBe(false)
    expect(canStartScheduled(null, NOW)).toBe(true)
  })
})

describe('caps and budget', () => {
  it('3 rooms a day', () => {
    expect(createCapReached(2)).toBe(false)
    expect(createCapReached(3)).toBe(true)
  })
  it('counts participant-minutes: people × minutes, open sessions up to now, rounded up', () => {
    // 3 people for 10 minutes each = 30
    const joined = [10, 10, 10].map((m) => new Date(NOW.getTime() - m * MIN))
    expect(participantMinutes(0, joined, NOW)).toBe(30)
    // plus 95 finished seconds → 31.58 → 32
    expect(participantMinutes(95, joined, NOW)).toBe(32)
    // a 20-person room for 8 minutes costs 160, the whole default day
    expect(participantMinutes(0, Array(20).fill(new Date(NOW.getTime() - 8 * MIN)), NOW)).toBe(160)
    expect(participantMinutes(0, [], NOW)).toBe(0)
    expect(participantMinutes(0, [new Date(NOW.getTime() + MIN)], NOW)).toBe(0)
  })
  it('budget gates starting, joining and ends rooms when spent', () => {
    expect(spacesBudget(0, 160)).toMatchObject({ remaining: 160, canStart: true, canJoin: true, exhausted: false })
    expect(spacesBudget(151, 160)).toMatchObject({ remaining: 9, canStart: false, canJoin: true, exhausted: false })
    expect(spacesBudget(150, 160)).toMatchObject({ canStart: true })
    expect(spacesBudget(160, 160)).toMatchObject({ remaining: 0, canStart: false, canJoin: false, exhausted: true })
    expect(spacesBudget(200, 160)).toMatchObject({ remaining: 0, exhausted: true })
    expect(spacesBudget(0, 0)).toMatchObject({ canStart: false, canJoin: false, exhausted: true })
  })
  it('default daily budget fits the LiveKit free plan even in a 31-day month', () => {
    expect(DEFAULT_DAILY_MINUTES * 31).toBeLessThanOrEqual(LIVEKIT_FREE_MONTHLY_MINUTES)
  })
})

describe('autoEndReason', () => {
  const base = {
    status: 'live' as const,
    now: NOW,
    scheduledAt: null,
    startedAt: new Date(NOW.getTime() - 20 * MIN),
    capMinutes: 60,
    hostConnected: true as boolean | null,
    hostJoinedAt: new Date(NOW.getTime() - 20 * MIN),
    presentCount: 3,
    lastActivityAt: new Date(NOW.getTime() - MIN),
  }
  it('keeps a healthy room', () => expect(autoEndReason(base)).toBeNull())
  it('hard 60-minute cap', () => {
    expect(autoEndReason({ ...base, startedAt: new Date(NOW.getTime() - 60 * MIN) })).toBe('cap')
    expect(autoEndReason({ ...base, startedAt: new Date(NOW.getTime() - 25 * MIN), capMinutes: 25 })).toBe('cap')
  })
  it('host gone (after a 2-minute connect grace)', () => {
    expect(autoEndReason({ ...base, hostConnected: false })).toBe('host_left')
    expect(autoEndReason({ ...base, hostConnected: false, hostJoinedAt: new Date(NOW.getTime() - MIN) })).toBeNull()
    expect(autoEndReason({ ...base, hostConnected: null })).toBeNull()
  })
  it('empty for 5 minutes', () => {
    expect(autoEndReason({ ...base, presentCount: 0, lastActivityAt: new Date(NOW.getTime() - 4 * MIN) })).toBeNull()
    expect(autoEndReason({ ...base, presentCount: 0, lastActivityAt: new Date(NOW.getTime() - 5 * MIN) })).toBe('empty')
  })
  it('scheduled no-show after 30 minutes', () => {
    const sched = { ...base, status: 'scheduled' as const, startedAt: null }
    expect(autoEndReason({ ...sched, scheduledAt: new Date(NOW.getTime() - 29 * MIN) })).toBeNull()
    expect(autoEndReason({ ...sched, scheduledAt: new Date(NOW.getTime() - 31 * MIN) })).toBe('no_show')
  })
})

describe('join codes and roles', () => {
  it('makes 6-char codes without look-alike letters', () => {
    const code = joinCodeFrom(new Uint8Array([0, 1, 2, 3, 250, 255]))
    expect(code).toHaveLength(6)
    expect(code).not.toMatch(/[01OIL]/)
    expect(normalizeJoinCode(` ${code.toLowerCase()} `)).toBe(code)
    expect(normalizeJoinCode('ABC12')).toBeNull()
    expect(normalizeJoinCode('ABCDE0')).toBeNull()
  })
  it('only host and speakers publish', () => {
    expect(canPublish('host')).toBe(true)
    expect(canPublish('speaker')).toBe(true)
    expect(canPublish('listener')).toBe(false)
  })
})

describe('LiveKit tokens', () => {
  const cfg = { url: 'wss://x.livekit.cloud', apiKey: 'APIkey', apiSecret: 'secret-secret-secret-secret' }
  it('listener token can subscribe but not publish', () => {
    const token = joinToken(cfg, { spaceId: 'abc', userId: 'u1', name: 'ada', canPublish: false, ttlSeconds: 600 }, 1_000_000)
    const claims = verifyJwt(token, cfg.apiSecret, 1_000_000) as { iss: string; sub: string; exp: number; video: Record<string, unknown> }
    expect(claims.iss).toBe('APIkey')
    expect(claims.sub).toBe('u1')
    expect(claims.exp).toBe(1_000_600)
    expect(claims.video).toMatchObject({ room: 'space_abc', roomJoin: true, canSubscribe: true, canPublish: false, canPublishSources: [], recorder: false })
  })
  it('speaker token is microphone-only', () => {
    const token = joinToken(cfg, { spaceId: 'abc', userId: 'u1', name: 'ada', canPublish: true, ttlSeconds: 600 }, 1_000_000)
    const claims = verifyJwt(token, cfg.apiSecret, 1_000_000) as { video: Record<string, unknown> }
    expect(claims.video).toMatchObject({ canPublish: true, canPublishSources: ['microphone'], canPublishData: false })
  })
  it('rejects tampered, wrong-secret and expired tokens', () => {
    const token = signJwt({ a: 1, exp: 100 }, 's')
    expect(verifyJwt(token, 'other', 50)).toBeNull()
    expect(verifyJwt(token.slice(0, -2) + 'xx', 's', 50)).toBeNull()
    expect(verifyJwt(token, 's', 200)).toBeNull()
    expect(verifyJwt(token, 's', 50)).toMatchObject({ a: 1 })
  })
  it('verifies webhook body hash', () => {
    const body = JSON.stringify({ event: 'participant_left', room: { name: 'space_abc' }, participant: { identity: 'u1' } })
    const sha256 = createHash('sha256').update(body).digest('base64')
    const now = Math.floor(Date.now() / 1000)
    const auth = signJwt({ iss: cfg.apiKey, sha256, nbf: now - 1, exp: now + 60 }, cfg.apiSecret)
    expect(verifyWebhook(cfg, body, auth)).toMatchObject({ event: 'participant_left' })
    expect(verifyWebhook(cfg, body + ' ', auth)).toBeNull()
    expect(verifyWebhook(cfg, body, undefined)).toBeNull()
  })
})

describe('checkComment', () => {
  it('accepts and tidies a normal comment', () => {
    expect(checkComment('  Ekpoma   na   home ')).toEqual({ ok: true, body: 'Ekpoma na home' })
  })
  it('rejects empty and over-long comments', () => {
    expect(checkComment('  ')).toMatchObject({ ok: false, code: 'EMPTY_COMMENT' })
    expect(checkComment('a'.repeat(201))).toMatchObject({ ok: false, code: 'COMMENT_TOO_LONG' })
    expect(checkComment('a'.repeat(200)).ok).toBe(true)
  })
  it('blocks begging and giveaway bait, even disguised', () => {
    expect(checkComment('please send me money')).toMatchObject({ ok: false, code: 'COMMENT_BLOCKED' })
    expect(checkComment('S3nd-me c0ins')).toMatchObject({ ok: false, code: 'COMMENT_BLOCKED' })
    expect(checkComment('1b giveaway join now')).toMatchObject({ ok: false, code: 'COMMENT_BLOCKED' })
  })
})
