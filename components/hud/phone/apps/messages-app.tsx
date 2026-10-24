'use client'

import { Bell, ChevronLeft, Pin, Search, Send, SquarePen, Users } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { PlayerProfilePanel } from '@/components/profile/player-profile-panel'
import { useChat } from '@/hooks/use-chat'
import { useChatUnread } from '@/hooks/use-chat-unread'
import { useMyHostel } from '@/hooks/use-hostel'
import {
  CHAT_MESSAGE_MAX,
  fetchChats,
  fetchNeighbours,
  openDirectChat,
  searchPlayers,
  type ChatMessage,
  type ChatSender,
  type ChatSummary,
  type Neighbour,
  type PlayerCard,
} from '@/lib/game/hostels-api'
import { PHONE_APPS, type PhoneAppId } from '@/lib/game/phone'
import type { PhoneNotificationsResponse } from '@/lib/game/phone-api'
import styles from './messages.module.css'

type GameNotification = PhoneNotificationsResponse['items'][number]

type View =
  | { name: 'list' }
  | { name: 'compose' }
  | { name: 'notifications' }
  | { name: 'chat'; chat: ChatSummary }
  | { name: 'neighbours'; chat: ChatSummary }
  | { name: 'profile'; userId: string; back: View }

// —— Small helpers ——

/** iMessage-style stamp: time today, "Yesterday", weekday this week, else a short date. */
function stamp(iso: string) {
  const date = new Date(iso)
  const now = new Date()
  const days = Math.floor((new Date(now.toDateString()).getTime() - new Date(date.toDateString()).getTime()) / 86_400_000)
  try {
    if (days <= 0) return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date)
    if (days === 1) return 'Yesterday'
    if (days < 7) return new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(date)
    return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(date)
  } catch {
    return ''
  }
}

function clockTime(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
  } catch {
    return ''
  }
}

function Avatar({ person, size = 32 }: { person: ChatSender; size?: number }) {
  const initial = (person.displayName.trim()[0] || '?').toUpperCase()
  return (
    <span
      className={styles.avatar}
      style={{ background: person.avatar.color, width: size, height: size, fontSize: size * 0.45 }}
      aria-hidden="true"
    >
      {person.avatar.emoji || initial}
    </span>
  )
}

const SEEN_KEY = 'ekpoma-notifications-seen'

function readSeen(): Set<string> {
  try {
    return new Set(JSON.parse(window.localStorage.getItem(SEEN_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

function writeSeen(ids: string[]) {
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(ids.slice(-200)))
  } catch {
    /* ignore */
  }
}

// —— App ——

/** Phone → Messages. Hostel chat pinned on top (can't unpin); one-to-one chats by @username. */
export function MessagesApp({
  onHome,
  notifications,
  onOpenApp,
}: {
  onHome: () => void
  notifications: GameNotification[]
  onOpenApp: (id: PhoneAppId) => void
}) {
  const { hostel } = useMyHostel()
  const [chats, setChats] = useState<ChatSummary[] | null>(null)
  const [view, setView] = useState<View>({ name: 'list' })
  const [filter, setFilter] = useState('')
  const [seen, setSeen] = useState<Set<string>>(() => new Set())
  const totalUnread = useChatUnread()

  useEffect(() => setSeen(readSeen()), [])
  const unseenNotifications = notifications.filter((n) => !seen.has(n.id)).length

  const loadChats = useCallback(async () => {
    const res = await fetchChats()
    if (res.ok) setChats(res.chats)
  }, [])

  useEffect(() => {
    if (view.name === 'list') void loadChats()
  }, [view.name, loadChats, totalUnread, hostel?.id])

  const openChat = (chat: ChatSummary) => setView({ name: 'chat', chat })
  const openProfile = (userId: string) => setView({ name: 'profile', userId, back: view })

  if (view.name === 'chat') {
    return (
      <ChatView
        chat={view.chat}
        onBack={() => setView({ name: 'list' })}
        onNeighbours={() => setView({ name: 'neighbours', chat: view.chat })}
        onProfile={openProfile}
      />
    )
  }
  if (view.name === 'neighbours') {
    return (
      <NeighboursView
        chat={view.chat}
        onBack={() => setView({ name: 'chat', chat: view.chat })}
        onProfile={openProfile}
        onMessage={async (userId) => {
          const res = await openDirectChat(userId)
          if (res.ok) openChat(res.chat)
        }}
      />
    )
  }
  if (view.name === 'profile') {
    return (
      <div className={styles.screen}>
        <NavBar onBack={() => setView(view.back)} title="Profile" />
        <div className={styles.scroll}>
          <PlayerProfilePanel playerId={view.userId} compact />
        </div>
      </div>
    )
  }
  if (view.name === 'compose') {
    return <ComposeView onCancel={() => setView({ name: 'list' })} onOpen={openChat} />
  }
  if (view.name === 'notifications') {
    return (
      <NotificationsView
        items={notifications}
        seen={seen}
        onBack={() => {
          const ids = [...seen, ...notifications.map((n) => n.id)]
          writeSeen(ids)
          setSeen(new Set(ids))
          setView({ name: 'list' })
        }}
        onOpenApp={onOpenApp}
      />
    )
  }

  const q = filter.trim().toLowerCase()
  const visible = (chats ?? []).filter(
    (chat) =>
      !q ||
      chat.title.toLowerCase().includes(q) ||
      chat.peer?.username.toLowerCase().includes(q.replace(/^@/, '')) ||
      chat.lastMessage?.body.toLowerCase().includes(q),
  )
  const pinned = visible.filter((chat) => chat.pinned)
  const rest = visible.filter((chat) => !chat.pinned)

  return (
    <div className={styles.screen}>
      <div className={styles.topBar}>
        <button type="button" className={styles.navBack} onClick={onHome} aria-label="Back to home screen">
          <ChevronLeft size={22} aria-hidden="true" />
        </button>
        <div className={styles.topActions}>
          <button
            type="button"
            className={styles.iconBtn}
            aria-label={unseenNotifications ? `Notifications, ${unseenNotifications} new` : 'Notifications'}
            onClick={() => setView({ name: 'notifications' })}
          >
            <Bell size={18} aria-hidden="true" />
            {unseenNotifications > 0 ? (
              <span className={styles.iconBadge}>{unseenNotifications > 9 ? '9+' : unseenNotifications}</span>
            ) : null}
          </button>
          <button type="button" className={styles.iconBtn} aria-label="New message" onClick={() => setView({ name: 'compose' })}>
            <SquarePen size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
      <h2 className={styles.largeTitle}>Messages</h2>

      <label className={styles.searchField}>
        <Search size={15} aria-hidden="true" />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search"
          aria-label="Search chats"
          type="search"
        />
      </label>

      <div className={styles.scroll}>
        {chats == null ? <p className={styles.hint}>Loading…</p> : null}

        {pinned.map((chat) => (
          <ChatRow key={chat.id} chat={chat} onOpen={() => openChat(chat)} />
        ))}
        {pinned.length > 0 && rest.length > 0 ? <div className={styles.divider} /> : null}
        {rest.map((chat) => (
          <ChatRow key={chat.id} chat={chat} onOpen={() => openChat(chat)} />
        ))}

        {chats != null && visible.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>{q ? 'No chats match' : 'No messages yet'}</p>
            <p className={styles.emptyCopy}>
              {q ? 'Try another name.' : 'Tap the pencil to message someone by their @username.'}
            </p>
            {!q ? (
              <button type="button" className={styles.primary} onClick={() => setView({ name: 'compose' })}>
                New message
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function ChatRow({ chat, onOpen }: { chat: ChatSummary; onOpen: () => void }) {
  const last = chat.lastMessage
  const preview = last
    ? last.kind === 'system'
      ? last.body
      : chat.kind === 'hostel' && !last.mine && last.sender
        ? `${last.sender.displayName}: ${last.body}`
        : `${last.mine ? 'You: ' : ''}${last.body}`
    : 'Say hi to your neighbours 👋'
  return (
    <button type="button" className={styles.chatRow} onClick={onOpen}>
      <span className={`${styles.dot} ${chat.unread > 0 ? styles.dotOn : ''}`} aria-hidden="true" />
      {chat.peer ? (
        <Avatar person={chat.peer} size={44} />
      ) : (
        <span className={styles.groupIcon} aria-hidden="true">
          🏠
        </span>
      )}
      <span className={styles.chatText}>
        <span className={styles.chatTop}>
          <span className={styles.chatTitle}>
            {chat.title}
            {chat.pinned ? <Pin size={11} className={styles.pin} aria-label="Pinned" /> : null}
          </span>
          {last ? <span className={styles.chatTime}>{stamp(last.createdAt)}</span> : null}
        </span>
        <span className={styles.chatPreview}>{preview}</span>
      </span>
      {chat.unread > 0 ? <span className="sr-only">{chat.unread} unread</span> : null}
    </button>
  )
}

function NavBar({ title, onBack, right, backLabel = 'Back' }: { title: ReactNode; onBack: () => void; right?: ReactNode; backLabel?: string }) {
  return (
    <div className={styles.navBar}>
      <button type="button" className={styles.navBack} onClick={onBack} aria-label={backLabel}>
        <ChevronLeft size={22} aria-hidden="true" />
      </button>
      <div className={styles.navTitle}>{title}</div>
      <div className={styles.navRight}>{right}</div>
    </div>
  )
}

// —— Compose: "To: @username" ——

function ComposeView({ onCancel, onOpen }: { onCancel: () => void; onOpen: (chat: ChatSummary) => void }) {
  const [to, setTo] = useState('')
  const [results, setResults] = useState<PlayerCard[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const latest = useRef('')

  useEffect(() => {
    const q = to.trim().replace(/^@+/, '')
    latest.current = q
    setError(null)
    if (q.length < 2) {
      setResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    const timer = window.setTimeout(async () => {
      const res = await searchPlayers(q)
      if (latest.current !== q) return
      setSearching(false)
      if (res.ok) setResults(res.players)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [to])

  const pick = async (person: PlayerCard) => {
    const res = await openDirectChat(person.userId)
    if (res.ok) onOpen(res.chat)
    else setError(res.error)
  }

  const typed = to.trim().replace(/^@+/, '')

  return (
    <div className={styles.screen}>
      <div className={styles.navBar}>
        <span className={styles.navSpacer} />
        <div className={styles.navTitle}>New Message</div>
        <div className={styles.navRight}>
          <button type="button" className={styles.textBtn} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
      <label className={styles.toField}>
        <span className={styles.toLabel}>To:</span>
        <span className={styles.at}>@</span>
        <input
          value={to}
          autoFocus
          onChange={(e) => setTo(e.target.value.slice(0, 30))}
          placeholder="username"
          aria-label="Username to message"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </label>
      <div className={styles.scroll}>
        {typed.length < 2 ? <p className={styles.hint}>Type at least 2 letters of their username.</p> : null}
        {searching && results.length === 0 ? <p className={styles.hint}>Searching…</p> : null}
        {!searching && typed.length >= 2 && results.length === 0 ? (
          <p className={styles.hint}>No player called @{typed}. Check the spelling.</p>
        ) : null}
        {results.map((person) => (
          <button key={person.userId} type="button" className={styles.personRow} onClick={() => void pick(person)}>
            <Avatar person={person} size={38} />
            <span className={styles.personText}>
              <span className={styles.personName}>{person.displayName}</span>
              <span className={styles.personHandle}>@{person.username}</span>
            </span>
          </button>
        ))}
        {error ? <p className={styles.errorText}>{error}</p> : null}
      </div>
    </div>
  )
}

// —— Notifications (in-game) ——

function NotificationsView({
  items,
  seen,
  onBack,
  onOpenApp,
}: {
  items: GameNotification[]
  seen: Set<string>
  onBack: () => void
  onOpenApp: (id: PhoneAppId) => void
}) {
  const appMeta = useMemo(() => new Map(PHONE_APPS.map((app) => [app.id, app])), [])
  return (
    <div className={styles.screen}>
      <NavBar title="Notifications" onBack={onBack} />
      <div className={styles.scroll}>
        {items.length === 0 ? <p className={styles.hint}>You’re all caught up.</p> : null}
        {items.map((item) => {
          const app = appMeta.get(item.appId)
          return (
            <button key={item.id} type="button" className={styles.notification} onClick={() => onOpenApp(item.appId)}>
              <span className={styles.notifIcon} style={{ background: app?.tint ?? '#8e8e93' }} aria-hidden="true">
                {app?.emoji ?? '🔔'}
              </span>
              <span className={styles.notifText}>
                <span className={styles.notifTop}>
                  <span className={styles.notifTitle}>{item.title}</span>
                  <span className={styles.chatTime}>{stamp(item.createdAt)}</span>
                </span>
                <span className={styles.notifBody}>{item.body}</span>
              </span>
              {!seen.has(item.id) ? <span className={`${styles.dot} ${styles.dotOn}`} aria-label="New" /> : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// —— Chat ——

function ChatView({
  chat,
  onBack,
  onNeighbours,
  onProfile,
}: {
  chat: ChatSummary
  onBack: () => void
  onNeighbours: () => void
  onProfile: (userId: string) => void
}) {
  const { messages, hasMore, loading, loadingOlder, error, loadOlder, send, report } = useChat(chat.id, true)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const prevHeight = useRef(0)
  const prevFirst = useRef<string | null>(null)
  const direct = chat.kind === 'direct'

  // Stay on the newest message; hold position when older ones load above
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const first = messages[0]?.id ?? null
    if (prevFirst.current && first !== prevFirst.current && !stickToBottom.current) {
      el.scrollTop += el.scrollHeight - prevHeight.current
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight
    }
    prevFirst.current = first
    prevHeight.current = el.scrollHeight
  }, [messages])

  const onScroll = () => {
    const el = scroller.current
    if (!el) return
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
    prevHeight.current = el.scrollHeight
    if (el.scrollTop < 40 && hasMore && !loadingOlder) void loadOlder()
  }

  const submit = async () => {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    setSendError(null)
    const res = await send(body)
    setSending(false)
    if (res.ok) {
      setDraft('')
      stickToBottom.current = true
    } else {
      setSendError(res.error)
    }
  }

  const remaining = CHAT_MESSAGE_MAX - draft.length
  const title = direct && chat.peer ? (
    <button type="button" className={styles.peerTitle} onClick={() => onProfile(chat.peer!.userId)}>
      <Avatar person={chat.peer} size={30} />
      <span className={styles.peerName}>{chat.peer.displayName}</span>
    </button>
  ) : (
    <span className={styles.groupTitle}>{chat.title}</span>
  )

  return (
    <div className={styles.screen}>
      <NavBar
        title={title}
        onBack={onBack}
        right={
          direct ? null : (
            <button type="button" className={styles.iconBtn} onClick={onNeighbours} aria-label="Neighbours">
              <Users size={17} aria-hidden="true" />
            </button>
          )
        }
      />

      <div className={styles.messages} ref={scroller} onScroll={onScroll} aria-live="polite">
        {hasMore ? (
          <button type="button" className={styles.older} onClick={() => void loadOlder()} disabled={loadingOlder}>
            {loadingOlder ? 'Loading…' : 'Load earlier messages'}
          </button>
        ) : null}
        {loading ? <p className={styles.hint}>Loading messages…</p> : null}
        {error ? <p className={styles.errorText}>{error}</p> : null}
        {!loading && messages.length === 0 && direct && chat.peer ? (
          <p className={styles.hint}>Say hi to {chat.peer.displayName} 👋</p>
        ) : null}
        {messages.map((message, i) => {
          const prev = messages[i - 1]
          const grouped = Boolean(prev && prev.kind === 'text' && prev.sender?.userId === message.sender?.userId)
          return (
            <MessageRow
              key={message.id}
              message={message}
              grouped={grouped}
              showSender={!direct}
              menuOpen={menuFor === message.id}
              onToggleMenu={() => setMenuFor((current) => (current === message.id ? null : message.id))}
              onReport={async () => {
                setMenuFor(null)
                await report(message.id)
              }}
              onProfile={onProfile}
            />
          )
        })}
      </div>

      <form
        className={styles.composer}
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        {sendError ? (
          <p className={styles.sendError} role="alert">
            {sendError}
          </p>
        ) : null}
        <div className={styles.composerRow}>
          <textarea
            className={styles.input}
            value={draft}
            maxLength={CHAT_MESSAGE_MAX}
            rows={1}
            placeholder={direct ? 'Message' : 'Message your neighbours'}
            aria-label="Message"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void submit()
              }
            }}
          />
          <button type="submit" className={styles.send} disabled={!draft.trim() || sending} aria-label="Send">
            <Send size={15} aria-hidden="true" />
          </button>
        </div>
        {remaining <= 100 ? <span className={styles.counter}>{remaining}</span> : null}
      </form>
    </div>
  )
}

function MessageRow({
  message,
  grouped,
  showSender,
  menuOpen,
  onToggleMenu,
  onReport,
  onProfile,
}: {
  message: ChatMessage
  grouped: boolean
  /** Group chats show who said what; one-to-one chats don't need it. */
  showSender: boolean
  menuOpen: boolean
  onToggleMenu: () => void
  onReport: () => void
  onProfile: (userId: string) => void
}) {
  if (message.kind === 'system' || !message.sender) {
    return <p className={styles.system}>{message.body}</p>
  }
  const sender = message.sender
  if (message.mine) {
    return (
      <div className={`${styles.row} ${styles.rowMine} ${grouped ? styles.rowGrouped : ''}`}>
        <div className={`${styles.bubble} ${styles.bubbleMine}`} title={clockTime(message.createdAt)}>
          <p className={styles.body}>{message.body}</p>
        </div>
      </div>
    )
  }
  return (
    <div className={`${styles.row} ${grouped ? styles.rowGrouped : ''}`}>
      {showSender ? (
        grouped ? (
          <span className={styles.avatarSpacer} />
        ) : (
          <button type="button" className={styles.avatarBtn} onClick={() => onProfile(sender.userId)} aria-label={`${sender.displayName}'s profile`}>
            <Avatar person={sender} size={28} />
          </button>
        )
      ) : null}
      <div className={styles.bubbleWrap}>
        {showSender && !grouped ? (
          <button type="button" className={styles.senderName} onClick={() => onProfile(sender.userId)}>
            {sender.displayName}
          </button>
        ) : null}
        <div
          className={styles.bubble}
          title={clockTime(message.createdAt)}
          onClick={onToggleMenu}
          onContextMenu={(e) => {
            e.preventDefault()
            onToggleMenu()
          }}
        >
          <p className={styles.body}>{message.body}</p>
        </div>
        {menuOpen ? (
          <div className={styles.menu}>
            <span className={styles.menuTime}>{stamp(message.createdAt)} · {clockTime(message.createdAt)}</span>
            <button type="button" className={styles.report} onClick={onReport}>
              Report message
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

// —— Neighbours (hostel members) ——

function NeighboursView({
  chat,
  onBack,
  onProfile,
  onMessage,
}: {
  chat: ChatSummary
  onBack: () => void
  onProfile: (userId: string) => void
  onMessage: (userId: string) => void
}) {
  const [neighbours, setNeighbours] = useState<Neighbour[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!chat.hostelId) return
    void fetchNeighbours(chat.hostelId).then((res) => {
      if (res.ok) setNeighbours(res.neighbours)
      else setError(res.error)
    })
  }, [chat.hostelId])

  return (
    <div className={styles.screen}>
      <NavBar title="Neighbours" onBack={onBack} />
      <div className={styles.scroll}>
        {neighbours == null && !error ? <p className={styles.hint}>Loading…</p> : null}
        {error ? <p className={styles.errorText}>{error}</p> : null}
        {neighbours?.map((n) => (
          <div key={n.userId} className={styles.personRow}>
            <button type="button" className={styles.personMain} onClick={() => onProfile(n.userId)}>
              <Avatar person={n} size={38} />
              <span className={styles.personText}>
                <span className={styles.personName}>
                  {n.displayName}
                  {n.isMe ? <span className={styles.you}> · You</span> : null}
                </span>
              </span>
            </button>
            {n.isMe ? null : (
              <button type="button" className={styles.smallBtn} onClick={() => onMessage(n.userId)}>
                Message
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
