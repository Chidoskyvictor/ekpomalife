'use client'

import { Mail } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { playSfx } from '@/lib/audio/sfx'
import { MESSAGES_OPENED_EVENT, OPEN_CHAT_EVENT } from '@/lib/game/open-chat'
import styles from './message-chip.module.css'

/** Sound is skipped for the first poll after the game opens (old unread isn't "new"). */
const QUIET_MS = 4000

/**
 * New-message chip under the cash pill: slides in from the right when a new chat message arrives
 * (with the message sound), shows the unread count and opens the phone in Messages. It goes away once
 * Messages has been opened any way, and comes back only for a message that arrives after that.
 * The count comes from the shared chat-unread poll (no poller of its own).
 */
export function MessageChip({ unread, hidden }: { unread: number; hidden: boolean }) {
  // How many unread messages the player had already been shown / opened Messages for
  const [seen, setSeen] = useState(0)
  const unreadRef = useRef(unread)
  unreadRef.current = unread
  const prev = useRef(unread)
  const mountedAt = useRef(0)

  useEffect(() => {
    mountedAt.current = Date.now()
  }, [])

  // Messages opened (chip, or phone → Messages): everything unread now counts as seen
  useEffect(() => {
    const onOpened = () => setSeen(unreadRef.current)
    window.addEventListener(MESSAGES_OPENED_EVENT, onOpened)
    return () => window.removeEventListener(MESSAGES_OPENED_EVENT, onOpened)
  }, [])

  // Reading chats lowers the count: the next new message must beat the lower mark
  useEffect(() => {
    setSeen((s) => (unread < s ? unread : s))
  }, [unread])

  // A new message arrived: ping
  useEffect(() => {
    if (unread > prev.current && !hidden && Date.now() - mountedAt.current > QUIET_MS) playSfx('notify')
    prev.current = unread
  }, [unread, hidden])

  const show = !hidden && unread > seen
  return (
    <div className={`${styles.wrap} ${show ? styles.in : ''}`} aria-hidden={!show}>
      <button
        type="button"
        className={styles.chip}
        tabIndex={show ? 0 : -1}
        aria-label={`${unread} new ${unread === 1 ? 'message' : 'messages'}. Open Messages`}
        onClick={() => window.dispatchEvent(new CustomEvent(OPEN_CHAT_EVENT))}
      >
        <Mail size={18} aria-hidden="true" />
        <span className={styles.count}>{unread > 9 ? '9+' : unread}</span>
      </button>
    </div>
  )
}
