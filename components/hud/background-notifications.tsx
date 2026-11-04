'use client'

import { useEffect, useRef } from 'react'
import { OPEN_CHAT_EVENT } from '@/lib/game/open-chat'
import { requestOpenGames } from '@/lib/game/open-games'
import { ensureWorker, NOTIFICATION_OPEN_EVENT, notifyInBackground, type NotifyScreen } from '@/lib/notify'

function openScreen(screen: NotifyScreen | null) {
  if (screen === 'messages') window.dispatchEvent(new CustomEvent(OPEN_CHAT_EVENT))
  else if (screen === 'games') requestOpenGames()
}

/** Turns new chats and game challenges into notifications while the game is hidden. */
export function BackgroundNotifications({ chatUnread, challenges }: { chatUnread: number; challenges: number }) {
  const lastChat = useRef(chatUnread)
  const lastChallenges = useRef(challenges)

  useEffect(() => {
    if (chatUnread > lastChat.current) {
      const body = chatUnread === 1 ? 'You have a new chat message.' : `You have ${chatUnread} unread messages.`
      void notifyInBackground('New message', body, 'messages', 'chat')
    }
    lastChat.current = chatUnread
  }, [chatUnread])

  useEffect(() => {
    if (challenges > lastChallenges.current) {
      void notifyInBackground('New challenge', 'Someone challenged you to a game.', 'games', 'challenge')
    }
    lastChallenges.current = challenges
  }, [challenges])

  // Tapping a notification: the worker focuses this tab and says which screen to open
  useEffect(() => {
    ensureWorker()
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { type?: string; screen?: NotifyScreen | null } | null
      if (data?.type === NOTIFICATION_OPEN_EVENT) openScreen(data.screen ?? null)
    }
    navigator.serviceWorker?.addEventListener('message', onMessage)
    // Opened fresh from a notification (no tab was open): /?open=messages
    const params = new URLSearchParams(window.location.search)
    const open = params.get('open')
    if (open === 'messages' || open === 'games') {
      params.delete('open')
      const qs = params.toString()
      window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`)
      window.setTimeout(() => openScreen(open), 600)
    }
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage)
  }, [])

  return null
}
