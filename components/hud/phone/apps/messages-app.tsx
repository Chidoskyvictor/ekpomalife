'use client'

import { PlayerFace } from '@/components/look/player-face'
import { Bell, Check, CheckCheck, ChevronLeft, DoorOpen, Home, MoreHorizontal, Reply, Search, Send, Smile, SquarePen, User, Users, X, Lock, Mic, ChevronUp, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { PlayerProfilePanel } from '@/components/profile/player-profile-panel'
import { tickFor, useChat, type Tick } from '@/hooks/use-chat'
import { useGameOptional } from '@/hooks/use-game'
import { useChatUnread } from '@/hooks/use-chat-unread'
import { useMyHostel } from '@/hooks/use-hostel'
import {
  CHAT_MESSAGE_MAX,
  REACTION_EMOJIS,
  TRANSFER_MAX,
  TRANSFER_MIN,
  fetchChats,
  fetchNeighbours,
  openDirectChat,
  searchPlayers,
  type ChatMessage,
  type ChatReaction,
  type ChatSender,
  type ChatSummary,
  type Neighbour,
  type PlayerCard,
} from '@/lib/game/hostels-api'
import { PHONE_APPS, type PhoneAppId } from '@/lib/game/phone'
import { STICKERS, stickerById } from '@/lib/game/stickers'
import { OPEN_CHAT_EVENT, takePendingChat } from '@/lib/game/open-chat'
import { requestOpenGames } from '@/lib/game/open-games'
import type { PhoneNotificationsResponse } from '@/lib/game/phone-api'
import { FamilyRequestCard } from './family-request-card'
import { canRecordVoice, clock, useVoiceRecorder, VoiceBubble, VOICE_MAX_MS } from './voice-note'
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

/** "online" within 5 minutes, else "last seen …". */
function seenLabel(iso: string | null | undefined): { online: boolean; text: string } | null {
  if (!iso) return null
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 5) return { online: true, text: 'online' }
  if (mins < 60) return { online: false, text: `last seen ${mins}m ago` }
  const hours = Math.floor(mins / 60)
  if (hours < 24) return { online: false, text: `last seen ${hours}h ago` }
  const days = Math.floor(hours / 24)
  return { online: false, text: days === 1 ? 'last seen yesterday' : `last seen ${days}d ago` }
}

/** Blue verified tick shown next to the Support account's name. */
function VerifiedTick({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Verified" style={{ marginLeft: 4, verticalAlign: '-2px', flex: 'none' }}>
      <path d="M12 1.5l2.6 1.9 3.2-.1 1 3 2.6 1.9-1 3 1 3-2.6 1.9-1 3-3.2-.1L12 22.5l-2.6-1.9-3.2.1-1-3-2.6-1.9 1-3-1-3 2.6-1.9 1-3 3.2.1z" fill="#f5b301" />
      <path d="M7.5 12.3l3 3 6-6.3" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Avatar({ person, size = 32 }: { person: ChatSender; size?: number }) {
  // The Support account has a real picture, not a character face
  if (person.avatar.image) {
    return <img className={styles.avatar} src={person.avatar.image} alt="" draggable={false} style={{ width: size, height: size, borderRadius: 999, flex: 'none', objectFit: 'cover' }} aria-hidden="true" />
  }
  // Their character's face (falls back to the coloured initial while it's drawn)
  return <PlayerFace className={styles.avatar} look={person.avatar.look} color={person.avatar.color} label={person.displayName} size={size} />
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
  supportMode = false,
}: {
  onHome: () => void
  notifications: GameNotification[]
  onOpenApp: (id: PhoneAppId) => void
  /** The Support inbox: no visiting or inviting (the account has no place). */
  supportMode?: boolean
}) {
  const { hostel } = useMyHostel()
  // Last list seen (this visit) shows at once on reopen; a fresh one replaces it when it lands
  const [chats, setChatsState] = useState<ChatSummary[] | null>(() => lastChats)
  const setChats = (next: ChatSummary[]) => {
    lastChats = next
    setChatsState(next)
  }
  const [view, setView] = useState<View>(() => {
    const chat = takePendingChat()
    return chat ? { name: 'chat', chat } : { name: 'list' }
  })
  // Asked to open a chat while Messages is already showing
  useEffect(() => {
    const onOpenChat = () => {
      const chat = takePendingChat()
      if (chat) setView({ name: 'chat', chat })
    }
    window.addEventListener(OPEN_CHAT_EVENT, onOpenChat)
    return () => window.removeEventListener(OPEN_CHAT_EVENT, onOpenChat)
  }, [])
  const [filter, setFilter] = useState('')
  const [seen, setSeen] = useState<Set<string>>(() => new Set())
  const totalUnread = useChatUnread()

  useEffect(() => setSeen(readSeen()), [])
  const unseenNotifications = notifications.filter((n) => !seen.has(n.id)).length

  const loadChats = useCallback(async () => {
    const res = await fetchChats()
    if (res.ok) setChats(res.chats)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setChats only writes state and the module cache
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
        supportMode={supportMode}
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
        {chats == null ? <ChatListSkeleton /> : null}

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

const naira = (amount: number) => `₦${amount.toLocaleString('en-NG')}`

/** One-line summary of a message for the chat list. */
function previewText(message: ChatMessage) {
  if (message.kind === 'sticker') return `${stickerById(message.body)?.emoji ?? '✨'} Sticker`
  if (message.kind === 'invite') return message.mine ? 'You invited them over 🏠' : 'Invited you over 🏠'
  if (message.kind === 'visit') return message.mine ? 'You visited them 🚪' : 'Visited your place 🚪'
  if (message.kind === 'money') return `💸 ${message.mine ? 'Sent' : 'Received'} ${naira(Number(message.body))}`
  if (message.kind === 'game') return message.mine ? 'You sent a 🎮 challenge' : '🎮 Challenged you'
  if (message.kind === 'nudge') return nudgeLine(message)
  if (message.kind === 'bae') return '💕 Request'
  if (message.kind === 'voice') return '🎤 Voice note'
  return message.body
}

/** Quick actions done in person ("@x said Hello"), shown as a slim line in the middle of the chat. */
const NUDGE: Record<string, { emoji: string; did: string }> = {
  hello: { emoji: '👋', did: 'said Hello' },
  gist: { emoji: '💬', did: 'gisted with' },
  joke: { emoji: '😂', did: 'cracked a joke for' },
  compliment: { emoji: '🌟', did: 'complimented' },
  date: { emoji: '🍽️', did: 'took out' },
}
function nudgeLine(message: ChatMessage) {
  const n = NUDGE[message.body] ?? { emoji: '👋', did: 'said Hello' }
  const name = message.sender?.username ? `@${message.sender.username}` : 'They'
  if (message.body === 'hello') return message.mine ? `${n.emoji} You said Hello` : `${n.emoji} ${name} said Hello`
  if (message.body === 'date') return message.mine ? `${n.emoji} You took them on a date` : `${n.emoji} ${name} took you on a date`
  return message.mine ? `${n.emoji} You ${n.did} them` : `${n.emoji} ${name} ${n.did} you`
}

let lastChats: ChatSummary[] | null = null

/** Grey placeholder rows while the chat list loads. */
function ChatListSkeleton() {
  return (
    <div role="status" aria-label="Loading chats">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className={styles.skelRow} aria-hidden="true">
          <span className={`${styles.skel} ${styles.skelAvatar}`} />
          <span className={styles.skelLines}>
            <span className={`${styles.skel} ${styles.skelLine}`} style={{ width: `${45 + ((i * 17) % 30)}%` }} />
            <span className={`${styles.skel} ${styles.skelLine}`} style={{ width: `${60 + ((i * 23) % 30)}%` }} />
          </span>
        </div>
      ))}
    </div>
  )
}

/** Placeholder bubbles while a chat's messages load. */
function MessagesSkeleton() {
  const rows: { mine: boolean; w: number }[] = [
    { mine: false, w: 58 },
    { mine: false, w: 40 },
    { mine: true, w: 52 },
    { mine: false, w: 66 },
    { mine: true, w: 38 },
    { mine: true, w: 60 },
  ]
  return (
    <div role="status" aria-label="Loading messages">
      {rows.map((r, i) => (
        <div key={i} className={`${styles.skelBubbleRow} ${r.mine ? styles.skelMine : ''}`} aria-hidden="true">
          <span className={`${styles.skel} ${styles.skelBubble}`} style={{ width: `${r.w}%` }} />
        </div>
      ))}
    </div>
  )
}

function ChatRow({ chat, onOpen }: { chat: ChatSummary; onOpen: () => void }) {
  const last = chat.lastMessage
  const text = last ? previewText(last) : ''
  const preview = last
    ? last.kind === 'system'
      ? last.body
      : chat.kind === 'hostel' && !last.mine && last.sender
        ? `${last.sender.displayName}: ${text}`
        : `${last.mine ? 'You: ' : ''}${text}`
    : 'Say hi to your neighbours 👋'
  const seen = chat.peer ? seenLabel(chat.peerLastSeen) : null
  const unread = chat.unread > 0
  return (
    <button type="button" className={styles.chatRow} onClick={onOpen}>
      <span className={styles.avatarWrap}>
        {chat.peer ? (
          <Avatar person={chat.peer} size={46} />
        ) : (
          <span className={styles.groupIcon} aria-hidden="true">
            🏠
          </span>
        )}
        {seen?.online ? <span className={styles.onlineDot} aria-label="Online" /> : null}
      </span>
      <span className={styles.chatText}>
        <span className={styles.chatTop}>
          <span className={`${styles.chatTitle} ${unread ? styles.chatTitleUnread : ''}`}>
            {chat.title}
            {chat.peer?.avatar.support ? <VerifiedTick /> : null}
            {chat.pinned ? <span className={styles.pinnedTag}>Pinned</span> : null}
          </span>
          {last ? <span className={`${styles.chatTime} ${unread ? styles.chatTimeUnread : ''}`}>{stamp(last.createdAt)}</span> : null}
        </span>
        <span className={styles.chatBottom}>
          <span className={`${styles.chatPreview} ${unread ? styles.chatPreviewUnread : ''}`}>{preview}</span>
          {unread ? <span className={styles.unreadBadge}>{chat.unread > 99 ? '99+' : chat.unread}</span> : null}
        </span>
      </span>
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
              <span className={styles.personName}>@{person.username}</span>
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
  supportMode = false,
}: {
  chat: ChatSummary
  onBack: () => void
  onNeighbours: () => void
  onProfile: (userId: string) => void
  supportMode?: boolean
}) {
  const router = useRouter()
  const game = useGameOptional()
  const state = game?.state ?? null
  const refreshServer = game?.refreshServer ?? (async () => {})
  const { messages, hasMore, loading, loadingOlder, error, receipts, loadOlder, send, sendVoice, sendMoney, report, react } = useChat(
    chat.id,
    true,
    () => void refreshServer(),
  )
  const [draft, setDraft] = useState('')
  const [stickersOpen, setStickersOpen] = useState(false)
  const [moneyOpen, setMoneyOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  const [reactorsFor, setReactorsFor] = useState<string | null>(null)
  const [flashId, setFlashId] = useState<string | null>(null)
  const draftBox = useRef<HTMLTextAreaElement>(null)
  const myName = state?.username ?? ''
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
    const res = await send(body, 'text', replyTo?.id)
    setSending(false)
    if (res.ok) {
      setDraft('')
      setReplyTo(null)
      stickToBottom.current = true
    } else {
      setSendError(res.error)
    }
  }

  const sendExtra = async (body: string, kind: 'sticker' | 'invite' | 'visit') => {
    setSendError(null)
    stickToBottom.current = true
    const quoted = kind === 'sticker' ? replyTo?.id : undefined
    const res = await send(body, kind, quoted)
    if (!res.ok) setSendError(res.error)
    else if (quoted) setReplyTo(null)
    return res.ok
  }

  // —— Voice notes (like WhatsApp): hold the mic to record, release to send, slide left to cancel,
  // slide up to lock and keep talking hands-free (then 🗑 deletes, ➤ sends) ——
  const holdX = useRef<number | null>(null)
  const holdY = useRef<number | null>(null)
  const [voiceHint, setVoiceHint] = useState<string | null>(null)
  const [slideCancel, setSlideCancel] = useState(false)
  const [locked, setLocked] = useState(false)
  /** How far up the finger has slid (0..1 of the way to locking), to animate the lock pill. */
  const [lift, setLift] = useState(0)
  const LOCK_PX = 70
  const finishVoice = async () => {
    holdX.current = null
    holdY.current = null
    setLocked(false)
    setLift(0)
    const take = await recorder.stop()
    if (!take) {
      setVoiceHint('Hold to record, release to send')
      return
    }
    setSending(true)
    setSendError(null)
    stickToBottom.current = true
    const res = await sendVoice(take.blob, take.ms, take.peaks, replyTo?.id)
    setSending(false)
    if (res.ok) setReplyTo(null)
    else setSendError(res.error)
  }
  const recorder = useVoiceRecorder(() => void finishVoice())
  useEffect(() => {
    if (!voiceHint) return
    const t = window.setTimeout(() => setVoiceHint(null), 2200)
    return () => window.clearTimeout(t)
  }, [voiceHint])
  const micDown = async (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    holdX.current = e.clientX
    holdY.current = e.clientY
    setSlideCancel(false)
    setLocked(false)
    setLift(0)
    setVoiceHint(null)
    setStickersOpen(false)
    const started = await recorder.start()
    if (started === 'denied') setVoiceHint('Allow the microphone to send voice notes')
  }
  const micMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (holdX.current == null || holdY.current == null || !recorder.recording || locked) return
    const up = holdY.current - e.clientY
    const left = holdX.current - e.clientX
    if (up >= LOCK_PX && left < 40) {
      // Locked: letting go no longer sends; the strip shows 🗑 and ➤ instead
      setLocked(true)
      setLift(0)
      setSlideCancel(false)
      holdX.current = null
      holdY.current = null
      if (navigator.vibrate) navigator.vibrate(15)
      return
    }
    setLift(Math.max(0, Math.min(1, up / LOCK_PX)))
    setSlideCancel(left > 90 && up < 30)
  }
  const micUp = () => {
    if (holdX.current == null) return
    holdX.current = null
    holdY.current = null
    setLift(0)
    if (slideCancel) {
      setSlideCancel(false)
      recorder.cancel()
      return
    }
    void finishVoice()
  }
  const deleteVoice = () => {
    setLocked(false)
    setSlideCancel(false)
    recorder.cancel()
  }
  const showMic = !draft.trim() && canRecordVoice()

  const startReply = (message: ChatMessage) => {
    setReplyTo(message)
    setPickerFor(null)
    window.setTimeout(() => draftBox.current?.focus({ preventScroll: true }), 0)
  }

  // Tap a quote: scroll to the original and flash it
  const jumpTo = (id: string) => {
    const el = scroller.current?.querySelector<HTMLElement>(`[data-mid="${id}"]`)
    if (!el) return
    stickToBottom.current = false
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    setFlashId(null)
    window.setTimeout(() => setFlashId(id), 20)
    window.setTimeout(() => setFlashId((cur) => (cur === id ? null : cur)), 1500)
  }

  const reactTo = (message: ChatMessage, emoji: string) => {
    setPickerFor(null)
    setReactorsFor(null)
    void react(message.id, emoji, myName)
  }

  // Leaves a "You visited @x" pill in the chat, then goes over
  const visit = (username: string | undefined) => {
    if (!username) return
    void sendExtra('', 'visit')
    router.push(`/room/${encodeURIComponent(username)}`)
  }

  const remaining = CHAT_MESSAGE_MAX - draft.length
  const seen = direct ? seenLabel(chat.peerLastSeen) : null
  const invite = async () => {
    setMoreOpen(false)
    if (await sendExtra('', 'invite')) setNotice(`Invite sent to ${chat.peer!.displayName}`)
  }

  return (
    <div className={styles.screen}>
      {/* One slim row: back, avatar, name + online/last seen, and ⋯ for Invite / Visit / Send money */}
      <div className={styles.chatHead}>
        <button type="button" className={styles.navBack} onClick={onBack} aria-label="Back to chats">
          <ChevronLeft size={22} aria-hidden="true" />
        </button>
        {direct && chat.peer ? (
          <button type="button" className={styles.chatHeadWho} onClick={() => (chat.peer!.avatar.support ? undefined : onProfile(chat.peer!.userId))}>
            <span className={styles.avatarWrap}>
              <Avatar person={chat.peer} size={34} />
              {seen?.online ? <span className={styles.onlineDot} aria-hidden="true" /> : null}
            </span>
            <span className={styles.chatHeadText}>
              <span className={styles.chatHeadName}>
                @{chat.peer.username}
                {chat.peer.avatar.support ? <VerifiedTick /> : null}
              </span>
              {seen ? <span className={`${styles.chatHeadSeen} ${seen.online ? styles.chatHeadOnline : ''}`}>{seen.text}</span> : null}
            </span>
          </button>
        ) : (
          <span className={styles.chatHeadWho}>
            <span className={styles.groupIcon} aria-hidden="true" style={{ width: 34, height: 34, fontSize: 17 }}>
              🏠
            </span>
            <span className={styles.chatHeadText}>
              <span className={styles.chatHeadName}>{chat.title}</span>
              <span className={styles.chatHeadSeen}>Hostel chat</span>
            </span>
          </span>
        )}
        {direct && chat.peer && !chat.peer.avatar.support ? (
          // Send money sits up here, so the message bar has room and the mic isn't jammed at the edge
          <button type="button" className={styles.headMoney} aria-label="Send money" onClick={() => setMoneyOpen(true)}>
            ₦
          </button>
        ) : null}
        {direct && chat.peer && !chat.peer.avatar.support ? (
          <div className={styles.moreWrap}>
            <button type="button" className={styles.iconBtn} aria-label="More" aria-expanded={moreOpen} onClick={() => setMoreOpen((o) => !o)}>
              <MoreHorizontal size={18} aria-hidden="true" />
            </button>
            {moreOpen ? (
              <>
                <button type="button" className={styles.moreScrim} aria-label="Close menu" onClick={() => setMoreOpen(false)} />
                <div className={styles.moreMenu} role="menu">
                  {supportMode ? null : (
                    <>
                      <button type="button" role="menuitem" onClick={() => void invite()}>
                        <Home size={16} aria-hidden="true" /> Invite to my place
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMoreOpen(false)
                          visit(chat.peer!.username)
                        }}
                      >
                        <DoorOpen size={16} aria-hidden="true" /> Visit their place
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMoreOpen(false)
                      setMoneyOpen(true)
                    }}
                  >
                    <span className={styles.nairaIcon} aria-hidden="true">₦</span> Send money
                  </button>
                  {chat.peer!.avatar.support ? null : (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMoreOpen(false)
                        onProfile(chat.peer!.userId)
                      }}
                    >
                      <User size={16} aria-hidden="true" /> View profile
                    </button>
                  )}
                </div>
              </>
            ) : null}
          </div>
        ) : (
          <button type="button" className={styles.iconBtn} onClick={onNeighbours} aria-label="Neighbours">
            <Users size={17} aria-hidden="true" />
          </button>
        )}
      </div>
      {notice ? (
        <p className={styles.notice} role="status" onAnimationEnd={() => setNotice(null)}>
          {notice}
        </p>
      ) : null}

      <div className={styles.messages} ref={scroller} onScroll={onScroll} aria-live="polite">
        {hasMore ? (
          <button type="button" className={styles.older} onClick={() => void loadOlder()} disabled={loadingOlder}>
            {loadingOlder ? 'Loading…' : 'Load earlier messages'}
          </button>
        ) : null}
        {loading ? <MessagesSkeleton /> : null}
        {error ? <p className={styles.errorText}>{error}</p> : null}
        {/* Like WhatsApp's note at the top of a chat: who can see it (true to how the server checks) */}
        {!loading && !hasMore ? (
          <p className={styles.privacyNote}>
            <Lock size={12} aria-hidden="true" />
            {direct && chat.peer
              ? `This chat is private. Only you and @${chat.peer.username} can see these messages.`
              : `Everyone in ${chat.title || 'this hostel'} can see this group chat.`}
          </p>
        ) : null}
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
              onVisit={visit}
              tick={message.mine ? tickFor(message.id, receipts) : null}
              flash={flashId === message.id}
              pickerOpen={pickerFor === message.id}
              myName={myName}
              onReply={() => startReply(message)}
              onOpenPicker={() => {
                setMenuFor(null)
                setPickerFor(message.id)
              }}
              onClosePicker={() => setPickerFor(null)}
              onReact={(emoji) => reactTo(message, emoji)}
              onShowReactors={() => setReactorsFor(message.id)}
              onJump={jumpTo}
            />
          )
        })}
      </div>

      {stickersOpen ? (
        <div className={styles.stickerTray} role="group" aria-label="Stickers">
          {STICKERS.map((sticker) => (
            <button
              key={sticker.id}
              type="button"
              className={styles.stickerPick}
              aria-label={sticker.label}
              onClick={() => {
                setStickersOpen(false)
                void sendExtra(sticker.id, 'sticker')
              }}
            >
              <StickerArt id={sticker.id} size={34} />
            </button>
          ))}
        </div>
      ) : null}

      {reactorsFor ? (
        <ReactorsSheet
          message={messages.find((m) => m.id === reactorsFor) ?? null}
          myName={myName}
          onClose={() => setReactorsFor(null)}
          onRemove={(message, emoji) => reactTo(message, emoji)}
        />
      ) : null}

      {moneyOpen && chat.peer ? (
        <MoneySheet
          peerName={chat.peer.displayName}
          balance={state?.cash ?? null}
          onClose={() => setMoneyOpen(false)}
          onSend={async (amount) => {
            stickToBottom.current = true
            const res = await sendMoney(amount)
            if (res.ok) {
              setMoneyOpen(false)
              void refreshServer()
            }
            return res
          }}
        />
      ) : null}

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
        {replyTo ? (
          <div className={styles.replyStrip}>
            <span className={styles.replyText}>
              <strong>Replying to {replyTo.mine ? 'yourself' : replyTo.sender?.username ? `@${replyTo.sender.username}` : (replyTo.sender?.displayName ?? 'them')}</strong>
              <span>{previewText(replyTo).split('\n')[0]}</span>
            </span>
            <button type="button" className={styles.replyClose} onClick={() => setReplyTo(null)} aria-label="Cancel reply">
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        ) : null}
        {voiceHint ? <p className={styles.voiceHint}>{voiceHint}</p> : null}
        <div className={styles.composerRow}>
          {recorder.recording ? (
            <div className={`${styles.recStrip} ${slideCancel ? styles.recCancel : ''}`} aria-live="polite">
              {locked ? (
                <button type="button" className={styles.recTrash} onClick={deleteVoice} aria-label="Delete voice note">
                  <Trash2 size={20} aria-hidden="true" />
                </button>
              ) : null}
              <span className={styles.recDot} style={{ transform: `scale(${1 + recorder.level * 0.6})` }} aria-hidden="true" />
              <span className={styles.recTime}>
                {clock(recorder.elapsed)}
                <span className={styles.recMax}> / {clock(VOICE_MAX_MS)}</span>
              </span>
              <span className={styles.recSlide}>
                {locked ? 'Recording…' : slideCancel ? 'Release to cancel' : '‹ Slide to cancel'}
              </span>
            </div>
          ) : null}
          <button
            type="button"
            hidden={recorder.recording}
            className={`${styles.stickerBtn} ${stickersOpen ? styles.stickerBtnOn : ''}`}
            aria-label="Stickers"
            aria-expanded={stickersOpen}
            onClick={() => setStickersOpen((open) => !open)}
          >
            <Smile size={24} aria-hidden="true" />
          </button>
          <textarea
            ref={draftBox}
            hidden={recorder.recording}
            className={styles.input}
            value={draft}
            maxLength={CHAT_MESSAGE_MAX}
            rows={1}
            placeholder={direct ? 'Message' : 'Message your neighbours'}
            aria-label="Message"
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => setStickersOpen(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void submit()
              }
            }}
          />
          {recorder.recording && locked ? (
            <button type="button" className={styles.send} onClick={() => void finishVoice()} aria-label="Send voice note">
              <Send size={19} aria-hidden="true" />
            </button>
          ) : showMic ? (
            <span className={styles.micWrap}>
              {recorder.recording && !slideCancel ? (
                <span className={styles.lockPill} style={{ transform: `translateY(${-lift * 24}px)` }} aria-hidden="true">
                  <Lock size={16} />
                  <ChevronUp size={14} />
                </span>
              ) : null}
            <button
              type="button"
              className={`${styles.send} ${styles.mic} ${recorder.recording ? styles.micOn : ''}`}
              disabled={sending}
              aria-label="Hold to record a voice note"
              onPointerDown={(e) => void micDown(e)}
              onPointerMove={micMove}
              onPointerUp={micUp}
              onPointerCancel={micUp}
              onContextMenu={(e) => e.preventDefault()}
            >
              <Mic size={20} aria-hidden="true" />
            </button>
            </span>
          ) : (
            <button type="submit" className={styles.send} disabled={!draft.trim() || sending} aria-label="Send">
              <Send size={19} aria-hidden="true" />
            </button>
          )}
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
  onVisit,
  tick,
  flash,
  pickerOpen,
  myName,
  onReply,
  onOpenPicker,
  onClosePicker,
  onReact,
  onShowReactors,
  onJump,
}: {
  message: ChatMessage
  grouped: boolean
  /** Group chats show who said what; one-to-one chats don't need it. */
  showSender: boolean
  menuOpen: boolean
  onToggleMenu: () => void
  onReport: () => void
  onProfile: (userId: string) => void
  onVisit: (username: string | undefined) => void
  /** Ticks on your own messages (null on theirs). */
  tick: Tick | null
  flash: boolean
  pickerOpen: boolean
  myName: string
  onReply: () => void
  onOpenPicker: () => void
  onClosePicker: () => void
  onReact: (emoji: string) => void
  onShowReactors: () => void
  onJump: (id: string) => void
}) {
  if (message.kind === 'system' || !message.sender) {
    return <p className={styles.system}>{message.body}</p>
  }
  if (message.kind === 'invite' || message.kind === 'visit') {
    return <NoticePill message={message} onVisit={onVisit} />
  }
  if (message.kind === 'game') return <GameNotice message={message} />
  if (message.kind === 'nudge') return <p className={styles.nudge}>{nudgeLine(message)}</p>
  if (message.kind === 'bae') return <FamilyRequestCard id={message.body} />
  const sender = message.sender
  const content = <MessageContent message={message} onVisit={onVisit} />
  // Stickers and cards sit on their own; text and voice notes get the chat bubble
  const special = message.kind !== 'text' && message.kind !== 'voice'
  const reactions = message.reactions ?? []
  const quote = message.replyTo ? (
    <button
      type="button"
      className={styles.quote}
      onClick={(e) => {
        e.stopPropagation()
        onJump(message.replyTo!.id)
      }}
    >
      <strong>{message.replyTo.name === myName ? 'You' : `@${message.replyTo.name}`}</strong>
      <span>{message.replyTo.text}</span>
    </button>
  ) : null
  const chip = reactions.length ? (
    <ReactionChip reactions={reactions} mine={message.mine} onOpen={onShowReactors} />
  ) : null
  const hoverReply = (
    <button type="button" className={styles.hoverReply} onClick={onReply} aria-label="Reply">
      <Reply size={15} aria-hidden="true" />
    </button>
  )
  const rowClass = `${styles.row} ${grouped ? styles.rowGrouped : ''} ${reactions.length ? styles.rowReacted : ''} ${flash ? styles.flash : ''}`
  const picker = pickerOpen ? (
    <>
      <button type="button" className={styles.moreScrim} aria-label="Close reactions" onClick={onClosePicker} />
      <div className={`${styles.pickerRow} ${message.mine ? styles.pickerMine : ''}`} role="group" aria-label="React">
        {REACTION_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className={`${styles.pickEmoji} ${reactions.some((r) => r.username === myName && r.emoji === emoji) ? styles.pickEmojiOn : ''}`}
            onClick={() => onReact(emoji)}
            aria-label={`React ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </>
  ) : null

  if (message.mine) {
    return (
      <>
        <div className={`${rowClass} ${styles.rowMine}`} data-mid={message.id}>
          {hoverReply}
          <div className={styles.mineWrap}>
            <Gesture onReply={onReply} onPicker={onOpenPicker}>
              {special ? (
                <div title={clockTime(message.createdAt)}>{content}</div>
              ) : (
                <div className={`${styles.bubble} ${styles.bubbleMine}`} title={clockTime(message.createdAt)}>
                  {quote}
                  {content}
                  <span className={`${styles.bubbleTime} ${styles.bubbleTimeMine}`}>
                    <span>{clockTime(message.createdAt)}</span>
                    {tick ? <Ticks tick={tick} onDark /> : null}
                  </span>
                </div>
              )}
            </Gesture>
            {special && tick ? (
              <span className={styles.tickRow}>
                <Ticks tick={tick} />
              </span>
            ) : null}
            {chip}
          </div>
        </div>
        {picker}
      </>
    )
  }
  return (
    <>
      <div className={rowClass} data-mid={message.id}>
        {showSender ? (
          grouped ? (
            <span className={styles.avatarSpacer} />
          ) : (
            <button type="button" className={styles.avatarBtn} onClick={() => (sender.avatar.support ? undefined : onProfile(sender.userId))} aria-label={`${sender.displayName}'s profile`}>
              <Avatar person={sender} size={28} />
            </button>
          )
        ) : null}
        <div className={styles.bubbleWrap}>
          {showSender && !grouped ? (
            <button type="button" className={styles.senderName} onClick={() => (sender.avatar.support ? undefined : onProfile(sender.userId))}>
              {sender.username ? `@${sender.username}` : sender.displayName}
              {sender.avatar.support ? <VerifiedTick size={12} /> : null}
            </button>
          ) : null}
          <Gesture onReply={onReply} onPicker={onOpenPicker}>
            <div
              className={special ? undefined : styles.bubble}
              title={clockTime(message.createdAt)}
              onClick={onToggleMenu}
              onContextMenu={(e) => {
                e.preventDefault()
                onToggleMenu()
              }}
            >
              {quote}
              {content}
              {message.kind === 'text' ? <span className={styles.bubbleTime}>{clockTime(message.createdAt)}</span> : null}
            </div>
          </Gesture>
          {chip}
          {menuOpen ? (
            <div className={styles.menu}>
              <span className={styles.menuTime}>{stamp(message.createdAt)} · {clockTime(message.createdAt)}</span>
              <button type="button" className={styles.report} onClick={onReport}>
                Report message
              </button>
            </div>
          ) : null}
        </div>
        {hoverReply}
      </div>
      {picker}
    </>
  )
}

/**
 * Touch gestures on a bubble: swipe right ~60px to reply (springs back), long-press ~450ms to react.
 * On desktop: hover reply button and double-click to react (no drag, so text can still be selected).
 */
function Gesture({ onReply, onPicker, children }: { onReply: () => void; onPicker: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const st = useRef({ x: 0, y: 0, dx: 0, down: false, swiping: false, suppress: false, timer: 0, armed: false })
  const SWIPE_AT = 60

  const setOffset = (dx: number) => {
    const el = ref.current
    if (!el) return
    const shown = Math.min(Math.max(dx, 0), 100) * 0.6
    el.style.transition = 'none'
    el.style.transform = shown ? `translateX(${shown}px)` : ''
    el.style.setProperty('--swipe', String(Math.min(shown / (SWIPE_AT * 0.6), 1)))
  }
  const springBack = () => {
    const el = ref.current
    if (!el) return
    el.style.transition = 'transform 0.22s cubic-bezier(0.2, 1.3, 0.4, 1)'
    el.style.transform = ''
    el.style.setProperty('--swipe', '0')
  }
  const cancelPress = () => window.clearTimeout(st.current.timer)

  return (
    <div
      ref={ref}
      className={styles.gesture}
      onDoubleClick={(e) => {
        e.preventDefault()
        onPicker()
      }}
      onClickCapture={(e) => {
        if (st.current.suppress) {
          e.stopPropagation()
          e.preventDefault()
          st.current.suppress = false
        }
      }}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse') return
        const cur = st.current
        cur.x = e.clientX
        cur.y = e.clientY
        cur.dx = 0
        cur.down = true
        cur.swiping = false
        cur.armed = false
        cur.suppress = false
        cancelPress()
        cur.timer = window.setTimeout(() => {
          cur.suppress = true
          cur.down = false
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(10)
          onPicker()
        }, 450)
      }}
      onPointerMove={(e) => {
        const cur = st.current
        if (!cur.down) return
        const dx = e.clientX - cur.x
        const dy = e.clientY - cur.y
        if (!cur.swiping && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
          cancelPress()
          if (Math.abs(dx) > Math.abs(dy) * 1.2 && dx > 0) {
            cur.swiping = true
            try {
              e.currentTarget.setPointerCapture(e.pointerId)
            } catch {}
          } else {
            cur.down = false
            return
          }
        }
        if (!cur.swiping) return
        cur.dx = dx
        setOffset(dx)
        if (dx >= SWIPE_AT && !cur.armed) {
          cur.armed = true
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(10)
        } else if (dx < SWIPE_AT) {
          cur.armed = false
        }
      }}
      onPointerUp={() => {
        const cur = st.current
        cancelPress()
        if (cur.swiping) {
          cur.suppress = true
          window.setTimeout(() => (cur.suppress = false), 60)
          if (cur.dx >= SWIPE_AT) onReply()
        }
        cur.down = false
        cur.swiping = false
        springBack()
      }}
      onPointerCancel={() => {
        cancelPress()
        st.current.down = false
        st.current.swiping = false
        springBack()
      }}
    >
      <span className={styles.swipeIcon} aria-hidden="true">
        <Reply size={16} />
      </span>
      {children}
    </div>
  )
}

/** ✓ sent · ✓✓ delivered · ✓✓ blue read. `onDark` = on the blue bubble. */
function Ticks({ tick, onDark = false }: { tick: Tick; onDark?: boolean }) {
  const Icon = tick === 'sent' ? Check : CheckCheck
  const label = tick === 'read' ? 'Read' : tick === 'delivered' ? 'Delivered' : 'Sent'
  return (
    <span
      role="img"
      aria-label={label}
      className={`${styles.tick} ${onDark ? styles.tickOnDark : ''} ${tick === 'read' ? styles.tickRead : ''}`}
    >
      <Icon size={15} strokeWidth={2.6} aria-hidden="true" />
    </span>
  )
}

/** Small pill at the bubble's bottom corner: the emojis used (and how many people if more than one). */
function ReactionChip({ reactions, mine, onOpen }: { reactions: ChatReaction[]; mine: boolean; onOpen: () => void }) {
  const emojis = [...new Set(reactions.map((r) => r.emoji))].slice(0, 3)
  return (
    <button
      type="button"
      className={`${styles.chip} ${mine ? styles.chipMine : ''}`}
      onClick={onOpen}
      aria-label={`${reactions.length} reaction${reactions.length === 1 ? '' : 's'}: who reacted`}
    >
      <span>{emojis.join('')}</span>
      {reactions.length > 1 ? <span className={styles.chipCount}>{reactions.length}</span> : null}
    </button>
  )
}

/** Who reacted with what. Tap your own line to take your reaction back. */
function ReactorsSheet({
  message,
  myName,
  onClose,
  onRemove,
}: {
  message: ChatMessage | null
  myName: string
  onClose: () => void
  onRemove: (message: ChatMessage, emoji: string) => void
}) {
  const reactions = message?.reactions ?? []
  return (
    <div className={styles.sheetBackdrop} onClick={onClose}>
      <div className={styles.sheet} role="dialog" aria-label="Reactions" onClick={(e) => e.stopPropagation()}>
        <div className={styles.sheetHead}>
          <strong>Reactions · {reactions.length}</strong>
          <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Close">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <ul className={styles.reactorList}>
          {reactions.map((r) => {
            const you = r.username === myName
            return (
              <li key={r.userId + r.emoji}>
                <button
                  type="button"
                  className={styles.reactorRow}
                  disabled={!you || !message}
                  onClick={() => message && onRemove(message, r.emoji)}
                >
                  <span className={styles.reactorEmoji}>{r.emoji}</span>
                  <span className={styles.reactorName}>{you ? 'You' : `@${r.username}`}</span>
                  {you ? <span className={styles.reactorHint}>Tap to remove</span> : null}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

/**
 * Invites and visits as cards with a button: "Accept invite" goes to their place, "Visit now"
 * pays them a visit back. Your own invites / visits show what happened.
 */
function NoticePill({ message, onVisit }: { message: ChatMessage; onVisit: (username: string | undefined) => void }) {
  const name = message.sender?.username ? `@${message.sender.username}` : (message.sender?.displayName ?? 'They')
  const invite = message.kind === 'invite'
  const title = invite
    ? message.mine
      ? 'You invited them over'
      : `${name} invited you over`
    : message.mine
      ? `You visited @${message.body}`
      : `${name} visited your place`
  const sub = invite ? (message.mine ? 'Waiting for them to come' : 'Come and hang out at their place') : message.mine ? 'You stopped by' : 'Pay them a visit back'
  const action = message.mine ? null : invite ? 'Accept invite' : 'Visit now'
  const where = invite ? message.body || message.sender?.username : message.sender?.username
  return (
    <div className={`${styles.actionRow} ${message.mine ? styles.actionRowMine : ''}`}>
      <div className={`${styles.actionCard} ${invite ? styles.actionInvite : styles.actionVisit}`}>
        <span className={styles.actionIcon} aria-hidden="true">
          {invite ? <Home size={18} /> : <DoorOpen size={18} />}
        </span>
        <span className={styles.actionText}>
          <strong>{title}</strong>
          <span>{sub}</span>
        </span>
        <span className={styles.actionTime}>{clockTime(message.createdAt)}</span>
        {action ? (
          <button type="button" className={styles.actionBtn} onClick={() => onVisit(where)}>
            {action}
          </button>
        ) : null}
      </div>
    </div>
  )
}

/** "@x challenged you to Snooker" — Open goes to the Games app's challenges list. */
function GameNotice({ message }: { message: ChatMessage }) {
  let info: { matchId?: string; game?: string; stake?: number } = {}
  try {
    info = JSON.parse(message.body) as typeof info
  } catch {}
  const game = info.game === 'snooker' ? 'Snooker' : 'a game'
  const stake = info.stake ? ` · ${naira(info.stake)}` : ''
  const name = message.sender?.username ? `@${message.sender.username}` : 'They'
  const text = message.mine ? `🎮 You challenged them to ${game}${stake}` : `🎮 ${name} challenged you to ${game}${stake}`
  return (
    <div className={styles.noticeRow}>
      <span className={`${styles.noticePill} ${styles.noticeGame}`}>
        {text} · {clockTime(message.createdAt)}
        {!message.mine ? (
          <button type="button" className={styles.noticeLink} onClick={() => requestOpenGames({})}>
            Open
          </button>
        ) : null}
      </span>
    </div>
  )
}

function StickerArt({ id, size }: { id: string; size: number }) {
  const sticker = stickerById(id)
  if (!sticker) return <span style={{ fontSize: size * 0.8 }}>✨</span>
  if (sticker.src) return <img src={sticker.src} alt={sticker.label} width={size} height={size} draggable={false} />
  return (
    <span className={styles.stickerEmoji} style={{ fontSize: size * 0.86 }} role="img" aria-label={sticker.label}>
      {sticker.emoji}
    </span>
  )
}

/** What goes inside a message: text, a big sticker, a come-over card or a money card. */
function MessageContent({ message, onVisit }: { message: ChatMessage; onVisit: (username: string | undefined) => void }) {
  if (message.kind === 'voice') return <VoiceBubble messageId={message.id} body={message.body} mine={message.mine} />
  if (message.kind === 'sticker') {
    return (
      <span className={styles.sticker}>
        <StickerArt id={message.body} size={96} />
      </span>
    )
  }
  if (message.kind === 'money') {
    const amount = Number(message.body)
    return (
      <div className={`${styles.moneyCard} ${message.sender?.avatar.support ? styles.moneyCardSupport : ''}`}>
        <span className={styles.coin} aria-hidden="true">
          ₦
        </span>
        <span className={styles.moneyText}>
          <strong>{naira(amount)}</strong>
          <span className={styles.moneyStatus}>
            <Check size={13} aria-hidden="true" /> {message.mine ? 'Sent' : `Received from ${message.sender?.displayName ?? 'a friend'}`}
          </span>
        </span>
        <span className={styles.moneyTime}>{clockTime(message.createdAt)}</span>
      </div>
    )
  }
  return <p className={styles.body}>{message.body}</p>
}

const QUICK_AMOUNTS = [500, 1000, 2000, 5000]

/** Bottom sheet inside the phone: pick an amount and send it. */
function MoneySheet({
  peerName,
  balance,
  onClose,
  onSend,
}: {
  peerName: string
  balance: number | null
  onClose: () => void
  onSend: (amount: number) => Promise<{ ok: true } | { ok: false; error: string }>
}) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const amount = Number(value.replace(/[^0-9]/g, '')) || 0
  const tooMuch = balance != null && amount > balance
  const valid = amount >= TRANSFER_MIN && amount <= TRANSFER_MAX && !tooMuch

  const submit = async () => {
    if (!valid || busy) return
    setBusy(true)
    setError(null)
    const res = await onSend(amount)
    setBusy(false)
    if (!res.ok) setError(res.error)
  }

  return (
    <div className={styles.sheetBackdrop} onClick={onClose}>
      <div className={styles.sheet} role="dialog" aria-label={`Send money to ${peerName}`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.sheetHead}>
          <strong>Send money to {peerName}</strong>
          <button type="button" className={styles.iconBtn} onClick={onClose} aria-label="Close">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        {balance != null ? <p className={styles.sheetHint}>You have {naira(balance)}</p> : null}
        <label className={styles.amountField}>
          <span aria-hidden="true">₦</span>
          <input
            inputMode="numeric"
            autoFocus
            placeholder="0"
            aria-label="Amount in naira"
            value={amount ? amount.toLocaleString('en-NG') : ''}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit()
            }}
          />
        </label>
        <div className={styles.quickAmounts}>
          {QUICK_AMOUNTS.map((quick) => (
            <button key={quick} type="button" className={styles.quickAmount} onClick={() => setValue(String(quick))}>
              {naira(quick)}
            </button>
          ))}
        </div>
        {tooMuch ? <p className={styles.sendError}>That’s more than you have.</p> : null}
        {error ? <p className={styles.sendError}>{error}</p> : null}
        <button type="button" className={styles.sendMoney} disabled={!valid || busy} onClick={() => void submit()}>
          {busy ? 'Sending…' : amount ? `Send ${naira(amount)}` : 'Enter an amount'}
        </button>
        <p className={styles.sheetHint}>
          At least {naira(TRANSFER_MIN)}, up to your balance. Money can’t be taken back.
        </p>
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
            <button type="button" className={styles.personMain} onClick={() => (n.avatar.support ? undefined : onProfile(n.userId))}>
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
