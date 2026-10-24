'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { fetchChatUnread } from '@/lib/game/hostels-api'

/**
 * One shared unread count for chats (phone icon, Messages app icon, pinned chat).
 * Polls every 30s while anything that shows it is mounted; actions call refreshChatUnread().
 */
const POLL_MS = 30_000

let unread = 0
const listeners = new Set<() => void>()
let users = 0
let timer: number | undefined

function emit(next: number) {
  if (next === unread) return
  unread = next
  listeners.forEach((listener) => listener())
}

export async function refreshChatUnread() {
  const res = await fetchChatUnread()
  if (res.ok) emit(res.unread)
}

/** Optimistic local update (e.g. after reading a chat) before the next poll. */
export function setChatUnread(next: number) {
  emit(Math.max(0, next))
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useChatUnread(enabled = true): number {
  useEffect(() => {
    if (!enabled) return
    users += 1
    if (users === 1) {
      void refreshChatUnread()
      timer = window.setInterval(() => void refreshChatUnread(), POLL_MS)
    }
    return () => {
      users -= 1
      if (users === 0 && timer) {
        window.clearInterval(timer)
        timer = undefined
      }
    }
  }, [enabled])

  const value = useSyncExternalStore(subscribe, () => unread, () => 0)
  return enabled ? value : 0
}
