import { apiGet, apiPatch, apiPost, apiPut } from '@/lib/api/client'
import type { ApiFail } from '@/lib/api/errors'
import { apiUrl } from '@/lib/game/api'

/** Hostels + hostel group chat — mirrors backend/src/routes/hostels.ts */

export const CHAT_MESSAGE_MAX = 500

export type HostelSummary = { id: string; name: string; members: number }
export type HostelSearchHit = HostelSummary & { exact: boolean }

export type ChatSender = {
  userId: string
  /** Present on chat messages. */
  username?: string
  displayName: string
  /** look = the player's character appearance (drawn as their face picture) */
  avatar: { color: string; emoji: string | null; look?: unknown }
}

export type ChatMessage = {
  id: string
  chatId: string
  /** sticker: body = sticker id · invite: body = host username · visit: body = visited username · money: body = naira amount · game: body = JSON {matchId, game, stake} */
  kind: 'text' | 'system' | 'sticker' | 'invite' | 'visit' | 'money' | 'game' | 'nudge' | 'bae' | 'voice'
  body: string
  createdAt: string
  sender: ChatSender | null
  mine: boolean
  /** The quoted message when this is a reply (older servers don't send it). */
  replyTo?: { id: string; name: string; text: string; kind: ChatMessage['kind'] } | null
  /** One reaction per player (older servers don't send it). */
  reactions?: ChatReaction[]
}

export type ChatReaction = { emoji: string; userId: string; username: string }
/** Tick markers for your own messages: id <= delivered → ✓✓ grey, id <= read → ✓✓ blue. */
export type ReceiptMarkers = { delivered: string; read: string }

export const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const

export type PlayerCard = ChatSender & { username: string }

export type ChatSummary = {
  id: string
  kind: 'hostel' | 'direct'
  /** Hostel name, or the other player's name in a direct chat. */
  title: string
  hostelId: string | null
  peer: PlayerCard | null
  /** When the other player in a direct chat was last active (online = within 5 minutes). */
  peerLastSeen?: string | null
  pinned: boolean
  unread: number
  lastMessage: ChatMessage | null
}

export type Neighbour = ChatSender & { joinedAt: string; isMe: boolean }

export function searchHostels(q: string) {
  return apiGet<{ ok: true; normalized: string; results: HostelSearchHit[]; exactMatch: boolean }>(
    `/hostels/search?q=${encodeURIComponent(q)}`,
  )
}

export function fetchMyHostel() {
  return apiGet<{ ok: true; hostel: HostelSummary | null; chatId: string | null }>('/hostels/me')
}

/** 409 HOSTEL_EXISTS / SIMILAR_EXISTS carries the hostel(s) to join instead. */
export type HostelExistsFail = ApiFail & { matches?: HostelSummary[] }

export function createHostel(name: string) {
  return apiPost<{ ok: true; hostel: HostelSummary; created: true }>('/hostels', { name }) as Promise<
    { ok: true; hostel: HostelSummary; created: true } | HostelExistsFail
  >
}

export const isHostelExists = (fail: ApiFail): fail is HostelExistsFail =>
  fail.code === 'HOSTEL_EXISTS' || fail.code === 'SIMILAR_EXISTS'

export function joinHostel(id: string) {
  return apiPost<{ ok: true; hostel: HostelSummary; chatId: string }>(`/hostels/${encodeURIComponent(id)}/join`, {})
}

export function leaveHostel() {
  return apiPost<{ ok: true }>('/hostels/leave', {})
}

export function fetchNeighbours(hostelId: string) {
  return apiGet<{ ok: true; neighbours: Neighbour[] }>(`/hostels/${encodeURIComponent(hostelId)}/members`)
}

export function fetchChats() {
  return apiGet<{ ok: true; chats: ChatSummary[]; unread: number }>('/chats')
}

/** "Message someone: @user" */
export function searchPlayers(q: string) {
  return apiGet<{ ok: true; players: PlayerCard[] }>(`/players/search?q=${encodeURIComponent(q)}`)
}

/** Find or start the direct chat with another player. */
export function openDirectChat(userId: string) {
  return apiPost<{ ok: true; chat: ChatSummary }>('/chats/direct', { userId })
}

export function fetchChatUnread() {
  return apiGet<{ ok: true; unread: number }>('/chats/unread')
}

export function fetchMessages(chatId: string, cursor: { before?: string; after?: string } = {}) {
  const query = new URLSearchParams()
  if (cursor.before) query.set('before', cursor.before)
  if (cursor.after) query.set('after', cursor.after)
  const qs = query.toString()
  return apiGet<{ ok: true; messages: ChatMessage[]; hasMore: boolean; receipts?: ReceiptMarkers }>(
    `/chats/${encodeURIComponent(chatId)}/messages${qs ? `?${qs}` : ''}`,
  )
}

export function sendChatMessage(
  chatId: string,
  body: string,
  kind: 'text' | 'sticker' | 'invite' | 'visit' = 'text',
  replyTo?: string | null,
) {
  return apiPost<{ ok: true; message: ChatMessage }>(`/chats/${encodeURIComponent(chatId)}/messages`, {
    body,
    kind,
    ...(replyTo ? { replyTo: Number(replyTo) } : {}),
  })
}

/** Reactions on messages from `from` on, plus the tick markers (polled while a chat is open). */
export function fetchChatSync(chatId: string, from: string) {
  return apiGet<{ ok: true; reactions: Record<string, ChatReaction[]>; receipts: ReceiptMarkers }>(
    `/chats/${encodeURIComponent(chatId)}/sync?from=${encodeURIComponent(from)}`,
  )
}

export function reactToMessage(messageId: string, emoji: string) {
  return apiPut<{ ok: true; reactions: ChatReaction[] }>(`/chats/messages/${encodeURIComponent(messageId)}/reaction`, { emoji })
}

export function clearMessageReaction(messageId: string) {
  return apiPost<{ ok: true; reactions: ChatReaction[] }>(`/chats/messages/${encodeURIComponent(messageId)}/reaction/clear`, {})
}

export function fetchChatSettings() {
  return apiGet<{ ok: true; readReceipts: boolean }>('/chats/settings')
}

export function saveChatSettings(readReceipts: boolean) {
  return apiPatch<{ ok: true; readReceipts: boolean }>('/chats/settings', { readReceipts })
}

/** Send naira to the other player in a direct chat (₦100 – ₦500,000). */
export const TRANSFER_MIN = 100
/** No upper limit: you can send up to your whole balance. */
export const TRANSFER_MAX = Number.MAX_SAFE_INTEGER

export function sendChatMoney(chatId: string, amount: number) {
  return apiPost<{ ok: true; message: ChatMessage; cash: number; version: number }>(
    `/chats/${encodeURIComponent(chatId)}/money`,
    { amount },
  )
}

export type HostCard = {
  userId: string
  username: string
  displayName: string
  appearance: unknown
  lodgingId: string | null
}

/** Name + look of the player whose place you are visiting. */
export function fetchHostCard(username: string) {
  return apiGet<{ ok: true; host: HostCard }>(`/players/by-username/${encodeURIComponent(username)}/home`)
}

export function markChatRead(chatId: string, seq: string) {
  return apiPost<{ ok: true }>(`/chats/${encodeURIComponent(chatId)}/read`, { seq: Number(seq) })
}

export function reportChatMessage(messageId: string, reason?: string) {
  return apiPost<{ ok: true }>(`/chats/messages/${encodeURIComponent(messageId)}/report`, reason ? { reason } : {})
}

export type HostelApiFail = ApiFail

/** Send a recorded voice note: the raw audio is the body, its length and waveform ride in the query. */
export async function sendChatVoice(
  chatId: string,
  audio: Blob,
  ms: number,
  peaks: number[],
  replyTo?: string | null,
): Promise<{ ok: true; message: ChatMessage } | { ok: false; error: string }> {
  const query = new URLSearchParams({ ms: String(Math.round(ms)), peaks: peaks.map((p) => p.toFixed(2)).join(',') })
  if (replyTo) query.set('replyTo', replyTo)
  try {
    const res = await fetch(`${apiUrl()}/chats/${encodeURIComponent(chatId)}/voice?${query}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': audio.type || 'audio/webm' },
      body: audio,
      signal: AbortSignal.timeout(30_000),
    })
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: ChatMessage; error?: string }
    if (res.ok && data.ok && data.message) return { ok: true, message: data.message }
    return { ok: false, error: data.error ?? 'Couldn’t send the voice note.' }
  } catch {
    return { ok: false, error: 'No connection. The voice note wasn’t sent.' }
  }
}

const voiceUrls = new Map<string, Promise<string | null>>()

/** A playable blob: URL for a voice note (fetched once with the login cookie, then reused). */
export function voiceNoteUrl(messageId: string): Promise<string | null> {
  let found = voiceUrls.get(messageId)
  if (!found) {
    found = fetch(`${apiUrl()}/chats/voice/${encodeURIComponent(messageId)}`, { credentials: 'include' })
      .then(async (res) => (res.ok ? URL.createObjectURL(await res.blob()) : null))
      .catch(() => null)
    found.then((url) => {
      if (!url) voiceUrls.delete(messageId)
    })
    voiceUrls.set(messageId, found)
  }
  return found
}
