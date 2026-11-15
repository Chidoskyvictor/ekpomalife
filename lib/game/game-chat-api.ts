import { apiPost } from '@/lib/api/client'

/** Which live thing the chat belongs to: a match (Snooker, Tic tac toe, Chess, Ludo), a Whot table or a Ludo table. */
export type GameChatKind = 'match' | 'whot' | 'ludo'
export type GameChatTarget = { kind: GameChatKind; id: string }

export type GameChatLine = { id: number; seat: number; name: string; text: string; at: number }

export const gameChatTicket = (t: GameChatTarget) =>
  apiPost<{ ok: true; ticket: string; seat: number; voice: boolean }>('/game-chat/ticket', t)

export const gameChatVoice = (t: GameChatTarget) => apiPost<{ ok: true; url: string; token: string }>('/game-chat/voice', t)
