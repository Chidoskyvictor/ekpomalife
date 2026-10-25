import { apiGet, apiPost } from '@/lib/api/client'
import type { ApiFail } from '@/lib/api/errors'

/** Hostels + hostel group chat — mirrors backend/src/routes/hostels.ts */

export const CHAT_MESSAGE_MAX = 500

export type HostelSummary = { id: string; name: string; members: number }
export type HostelSearchHit = HostelSummary & { exact: boolean }

export type ChatSender = {
  userId: string
  /** Present on chat messages. */
  username?: string
  displayName: string
  avatar: { color: string; emoji: string | null }
}

export type ChatMessage = {
  id: string
  chatId: string
  /** sticker: body = sticker id · invite: body = host username · visit: body = visited username · money: body = naira amount */
  kind: 'text' | 'system' | 'sticker' | 'invite' | 'visit' | 'money'
  body: string
  createdAt: string
  sender: ChatSender | null
  mine: boolean
}

export type PlayerCard = ChatSender & { username: string }

export type ChatSummary = {
  id: string
  kind: 'hostel' | 'direct'
  /** Hostel name, or the other player's name in a direct chat. */
  title: string
  hostelId: string | null
  peer: PlayerCard | null
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
  return apiGet<{ ok: true; messages: ChatMessage[]; hasMore: boolean }>(
    `/chats/${encodeURIComponent(chatId)}/messages${qs ? `?${qs}` : ''}`,
  )
}

export function sendChatMessage(chatId: string, body: string, kind: 'text' | 'sticker' | 'invite' | 'visit' = 'text') {
  return apiPost<{ ok: true; message: ChatMessage }>(`/chats/${encodeURIComponent(chatId)}/messages`, { body, kind })
}

/** Send naira to the other player in a direct chat (₦100 – ₦500,000). */
export const TRANSFER_MIN = 100
export const TRANSFER_MAX = 500_000

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
