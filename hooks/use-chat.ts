'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchMessages,
  markChatRead,
  reportChatMessage,
  sendChatMessage,
  type ChatMessage,
} from '@/lib/game/hostels-api'
import { refreshChatUnread } from './use-chat-unread'

/** New messages are fetched this often while the chat is open (no polling when closed). */
const POLL_MS = 4000

function mergeById(current: ChatMessage[], incoming: ChatMessage[]) {
  const seen = new Set(current.map((m) => m.id))
  const fresh = incoming.filter((m) => !seen.has(m.id))
  return fresh.length ? [...current, ...fresh].sort((a, b) => Number(a.id) - Number(b.id)) : current
}

export function useChat(chatId: string | null, open: boolean) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const newest = useRef<string | null>(null)
  const lastRead = useRef<string | null>(null)

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
    setLoading(true)
    setError(null)
    void fetchMessages(chatId).then((res) => {
      if (cancelled) return
      setLoading(false)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setMessages(res.messages)
      setHasMore(res.hasMore)
      newest.current = res.messages.at(-1)?.id ?? null
      markRead(newest.current)
    })
    return () => {
      cancelled = true
    }
  }, [chatId, open, markRead])

  // Poll for newer messages only while open
  useEffect(() => {
    if (!chatId || !open) return
    const timer = window.setInterval(async () => {
      if (document.hidden) return
      const res = await fetchMessages(chatId, newest.current ? { after: newest.current } : {})
      if (!res.ok || res.messages.length === 0) return
      setMessages((current) => mergeById(current, res.messages))
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
    async (body: string): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!chatId) return { ok: false, error: 'Join a hostel to chat.' }
      const res = await sendChatMessage(chatId, body)
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

  return { messages, hasMore, loading, loadingOlder, error, loadOlder, send, report }
}
