'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  clearMessageReaction,
  fetchChatSync,
  fetchMessages,
  reactToMessage,
  markChatRead,
  reportChatMessage,
  sendChatMessage,
  sendChatMoney,
  type ChatMessage,
  type ReceiptMarkers,
} from '@/lib/game/hostels-api'
import { refreshChatUnread } from './use-chat-unread'
import { playSfx } from '@/lib/audio/sfx'

/** New messages are fetched this often while the chat is open (no polling when closed). */
const POLL_MS = 4000

function mergeById(current: ChatMessage[], incoming: ChatMessage[]) {
  const seen = new Set(current.map((m) => m.id))
  const fresh = incoming.filter((m) => !seen.has(m.id))
  return fresh.length ? [...current, ...fresh].sort((a, b) => Number(a.id) - Number(b.id)) : current
}

/** Last page seen per chat (this visit): reopening a chat shows it at once while it refreshes. */
const recent = new Map<string, { messages: ChatMessage[]; hasMore: boolean }>()

/** sent → delivered (grey ✓✓) → read (blue ✓✓) for one of your messages. Blue needs read receipts on. */
export type Tick = 'sent' | 'delivered' | 'read'
export function tickFor(messageId: string, receipts: ReceiptMarkers | null): Tick {
  if (!receipts) return 'sent'
  const id = Number(messageId)
  if (id <= Number(receipts.read)) return 'read'
  if (id <= Number(receipts.delivered)) return 'delivered'
  return 'sent'
}

function sameReactions(a: ChatMessage['reactions'], b: ChatMessage['reactions']) {
  const x = a ?? []
  const y = b ?? []
  return x.length === y.length && x.every((r, i) => r.userId === y[i]!.userId && r.emoji === y[i]!.emoji)
}

/** Replace reactions on every loaded message from `from` on (a missing entry means none left). */
function applyReactions(current: ChatMessage[], byId: Record<string, NonNullable<ChatMessage['reactions']>>, from: string | null) {
  let changed = false
  const next = current.map((m) => {
    if (m.kind === 'system' || (from && Number(m.id) < Number(from))) return m
    const fresh = byId[m.id] ?? []
    if (sameReactions(m.reactions, fresh)) return m
    changed = true
    return { ...m, reactions: fresh }
  })
  return changed ? next : current
}

/** `onMoneyIn` runs when someone sends you money while the chat is open (refresh your wallet). */
export function useChat(chatId: string | null, open: boolean, onMoneyIn?: () => void) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [receipts, setReceipts] = useState<ReceiptMarkers | null>(null)
  const oldestId = useRef<string | null>(null)
  const messagesRef = useRef<ChatMessage[]>([])
  messagesRef.current = messages
  const newest = useRef<string | null>(null)
  const lastRead = useRef<string | null>(null)
  const moneyIn = useRef(onMoneyIn)
  moneyIn.current = onMoneyIn

  const markRead = useCallback(
    (id: string | null) => {
      if (!chatId || !id || id === lastRead.current) return
      lastRead.current = id
      void markChatRead(chatId, id).then(() => refreshChatUnread())
    },
    [chatId],
  )

  // First page whenever the chat opens
  useEffect(() => {
    if (!chatId || !open) return
    let cancelled = false
    const cached = recent.get(chatId)
    setMessages(cached?.messages ?? [])
    setHasMore(cached?.hasMore ?? false)
    newest.current = cached?.messages.at(-1)?.id ?? null
    // Skeleton only the first time; after that the cached messages show while fresh ones load
    setLoading(!cached)
    setError(null)
    setReceipts(null)
    void fetchMessages(chatId).then((res) => {
      if (cancelled) return
      setLoading(false)
      if (!res.ok) {
        setError(res.error)
        return
      }
      // Keep anything newer we already had (sent while the fetch was out)
      setMessages((current) => mergeById(res.messages, current))
      setHasMore(res.hasMore)
      if (res.receipts) setReceipts(res.receipts)
      newest.current = res.messages.at(-1)?.id ?? null
      markRead(newest.current)
    })
    return () => {
      cancelled = true
    }
  }, [chatId, open, markRead])

  useEffect(() => {
    oldestId.current = messages[0]?.id ?? null
  }, [messages])

  // Remember the latest messages for an instant reopen
  useEffect(() => {
    if (chatId && !loading) recent.set(chatId, { messages: messages.slice(-60), hasMore: hasMore || messages.length > 60 })
  }, [chatId, messages, hasMore, loading])

  // Poll for newer messages only while open
  useEffect(() => {
    if (!chatId || !open) return
    const timer = window.setInterval(async () => {
      if (document.hidden) return
      const [res, sync] = await Promise.all([
        fetchMessages(chatId, newest.current ? { after: newest.current } : {}),
        fetchChatSync(chatId, oldestId.current ?? '0'),
      ])
      // Reactions + ticks on messages we already have
      if (sync.ok) {
        setReceipts(sync.receipts)
        setMessages((current) => applyReactions(current, sync.reactions, oldestId.current))
      }
      if (!res.ok || res.messages.length === 0) return
      if (res.receipts) setReceipts(res.receipts)
      setMessages((current) => mergeById(current, res.messages))
      if (res.messages.some((m) => m.kind === 'money' && !m.mine)) moneyIn.current?.()
      if (res.messages.some((m) => !m.mine)) {
        const incoming = res.messages.filter((m) => !m.mine)
        playSfx(incoming.some((m) => m.kind === 'money') ? 'coin' : incoming.some((m) => m.kind === 'invite') ? 'invite' : 'notify')
      }
      newest.current = res.messages.at(-1)!.id
      markRead(newest.current)
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [chatId, open, markRead])

  const loadOlder = useCallback(async () => {
    if (!chatId || !hasMore || loadingOlder) return
    const oldest = messages[0]?.id
    if (!oldest) return
    setLoadingOlder(true)
    const res = await fetchMessages(chatId, { before: oldest })
    setLoadingOlder(false)
    if (!res.ok) return
    setHasMore(res.hasMore)
    setMessages((current) => mergeById(res.messages, current))
  }, [chatId, hasMore, loadingOlder, messages])

  const send = useCallback(
    async (
      body: string,
      kind: 'text' | 'sticker' | 'invite' | 'visit' = 'text',
      replyTo?: string | null,
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!chatId) return { ok: false, error: 'Join a hostel to chat.' }
      const res = await sendChatMessage(chatId, body, kind, replyTo)
      if (!res.ok) return { ok: false, error: res.error }
      playSfx('sent')
      setMessages((current) => mergeById(current, [res.message]))
      newest.current = res.message.id
      lastRead.current = res.message.id
      return { ok: true }
    },
    [chatId],
  )

  const sendMoney = useCallback(
    async (amount: number): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!chatId) return { ok: false, error: 'Open a chat first.' }
      const res = await sendChatMoney(chatId, amount)
      if (!res.ok) return { ok: false, error: res.error }
      setMessages((current) => mergeById(current, [res.message]))
      newest.current = res.message.id
      lastRead.current = res.message.id
      return { ok: true }
    },
    [chatId],
  )

  /** Report hides the message for this player straight away. */
  const report = useCallback(async (messageId: string) => {
    const res = await reportChatMessage(messageId)
    if (res.ok) setMessages((current) => current.filter((m) => m.id !== messageId))
    return res.ok
  }, [])

  /** Pick an emoji on a message; picking the one you already have removes it. */
  const react = useCallback(async (messageId: string, emoji: string, myUsername: string) => {
    const mineNow = (m: ChatMessage) => (m.reactions ?? []).find((r) => r.username === myUsername)
    const had = messagesRef.current.find((m) => m.id === messageId)
    const hadEmoji = had ? mineNow(had)?.emoji : undefined
    setMessages((current) =>
      current.map((m) => {
        if (m.id !== messageId) return m
        const others = (m.reactions ?? []).filter((r) => r.username !== myUsername)
        return { ...m, reactions: hadEmoji === emoji ? others : [...others, { emoji, userId: 'me', username: myUsername }] }
      }),
    )
    const res = hadEmoji === emoji ? await clearMessageReaction(messageId) : await reactToMessage(messageId, emoji)
    if (res.ok) setMessages((current) => current.map((m) => (m.id === messageId ? { ...m, reactions: res.reactions } : m)))
    return res.ok
  }, [])

  return { messages, hasMore, loading, loadingOlder, error, receipts, loadOlder, send, sendMoney, report, react }
}
