import { describe, expect, it } from 'vitest'
import { canInteractWith, isReactionEmoji, quotePreview, receiptMarkers, replyError } from './chat-rules.js'

describe('reply validation', () => {
  it('accepts a message from the same chat', () => {
    expect(replyError({ chat_id: 'c1', kind: 'text' }, 'c1')).toBeNull()
    expect(replyError({ chat_id: 'c1', kind: 'sticker' }, 'c1')).toBeNull()
  })
  it('rejects a missing message or one from another chat', () => {
    expect(replyError(undefined, 'c1')).not.toBeNull()
    expect(replyError({ chat_id: 'c2', kind: 'text' }, 'c1')).not.toBeNull()
  })
  it('rejects system and nudge lines', () => {
    expect(replyError({ chat_id: 'c1', kind: 'system' }, 'c1')).not.toBeNull()
    expect(replyError({ chat_id: 'c1', kind: 'nudge' }, 'c1')).not.toBeNull()
    expect(canInteractWith('nudge')).toBe(false)
    expect(canInteractWith('money')).toBe(true)
  })
  it('quotes one line', () => {
    expect(quotePreview('text', 'first line\nsecond')).toBe('first line')
    expect(quotePreview('sticker', 'wave')).toBe('Sticker')
    expect(quotePreview('text', 'x'.repeat(300))).toHaveLength(120)
  })
})

describe('reactions', () => {
  it('allows only the six quick reactions', () => {
    for (const e of ['👍', '❤️', '😂', '😮', '😢', '🙏']) expect(isReactionEmoji(e)).toBe(true)
    expect(isReactionEmoji('🔥')).toBe(false)
    expect(isReactionEmoji('')).toBe(false)
  })
})

describe('receipt markers', () => {
  it('direct chat: sent → delivered → read', () => {
    expect(receiptMarkers([{ delivered: 0, read: 0 }], true)).toEqual({ delivered: '0', read: '0' })
    expect(receiptMarkers([{ delivered: 12, read: 5 }], true)).toEqual({ delivered: '12', read: '5' })
    expect(receiptMarkers([{ delivered: 12, read: 12 }], true)).toEqual({ delivered: '12', read: '12' })
  })
  it('group: needs every member (the slowest one sets the tick)', () => {
    const members = [
      { delivered: 20, read: 20 },
      { delivered: 15, read: 9 },
      { delivered: 30, read: 25 },
    ]
    expect(receiptMarkers(members, true)).toEqual({ delivered: '15', read: '9' })
  })
  it('read implies delivered', () => {
    expect(receiptMarkers([{ delivered: 3, read: 8 }], true)).toEqual({ delivered: '8', read: '8' })
  })
  it('your switch off hides blue ticks but keeps delivered', () => {
    expect(receiptMarkers([{ delivered: 12, read: 12 }], false)).toEqual({ delivered: '12', read: '0' })
  })
  it('nobody else in the chat: nothing beyond sent', () => {
    expect(receiptMarkers([], true)).toEqual({ delivered: '0', read: '0' })
  })
})
