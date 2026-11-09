import { apiGet, apiPost } from '@/lib/api/client'

/*
 * What you can do with another player in a home (display side; the server in
 * backend/src/game/interactions.ts decides who may do what, rewards, cooldowns and chances).
 */

export type Tier = 'friendly' | 'close' | 'romantic'
export type Level = 'stranger' | 'padi' | 'close' | 'crush' | 'partner'

export type Interaction = {
  id: string
  emoji: string
  label: string
  tier: Tier
  /** Shown on the card. */
  gains: string[]
  /** Success % for risky ones. */
  chance?: number
  /** Only for visitors of the host. */
  visitorOnly?: boolean
  /** Looks like a two-person move: both characters hop in the dance pose. */
  lively?: boolean
  /** Bubble line when it plays. */
  bubble: string
}

export const INTERACTIONS: Interaction[] = [
  { id: 'love-house', emoji: '🏠', label: 'Love your house', tier: 'friendly', gains: ['+Social'], visitorOnly: true, bubble: '🏠 Love this place!' },
  { id: 'hello', emoji: '👋🏾', label: 'Say Hello', tier: 'friendly', gains: ['+Social'], bubble: '👋🏾 Hello!' },
  { id: 'gist', emoji: '💬', label: 'Gist', tier: 'friendly', gains: ['+Fun', '+Social'], bubble: '💬 *gisting*' },
  { id: 'joke', emoji: '😂', label: 'Crack Joke', tier: 'friendly', gains: ['+Fun', '+Social'], chance: 70, bubble: '😂 Joke!' },
  { id: 'compliment', emoji: '✨', label: 'Compliment', tier: 'friendly', gains: ['+Fun', '+Social'], bubble: '✨ Nice one!' },
  { id: 'shade', emoji: '😏', label: 'Throw Shade', tier: 'friendly', gains: ['+Fun', '+Social'], chance: 60, bubble: '😏 Shade...' },
  { id: 'handshake', emoji: '🤝🏾', label: 'Bro handshake', tier: 'friendly', gains: ['+Social'], lively: true, bubble: '🤝🏾 My guy!' },
  { id: 'sneakers', emoji: '👟', label: 'Show sneakers', tier: 'friendly', gains: ['+Fun', '+Social'], bubble: '👟 Check my kicks' },
  { id: 'fifa', emoji: '🎮', label: 'Play FIFA', tier: 'friendly', gains: ['+Fun', '+Social'], lively: true, bubble: '🎮 FIFA time!' },
  { id: 'arm-wrestle', emoji: '💪🏾', label: 'Arm wrestle', tier: 'friendly', gains: ['+Fun', '+Social', '−Energy'], chance: 50, lively: true, bubble: '💪🏾 Arm wrestle!' },
  { id: 'japa-plans', emoji: '✈️', label: 'Japa plans', tier: 'friendly', gains: ['+Fun', '+Social'], bubble: '✈️ Japa plans...' },
  { id: 'together', emoji: '📸', label: 'Together', tier: 'friendly', gains: ['+Fun', '+Social', '+Padi'], lively: true, bubble: '📸 Memory kept!' },
  { id: 'hug', emoji: '🤗', label: 'Hug', tier: 'close', gains: ['+Social', '+Fun'], bubble: '🤗 Hug' },
  { id: 'kiss-cheek', emoji: '😚', label: 'Cheek kiss', tier: 'close', gains: ['+Social', '+Fun'], bubble: '😚 Kiss on the cheek' },
  { id: 'hold-hands', emoji: '🤝', label: 'Hold hands', tier: 'romantic', gains: ['+Social', '+Fun'], bubble: '🤝 Holding hands' },
  { id: 'cuddle', emoji: '🛋️', label: 'Cuddle on sofa', tier: 'romantic', gains: ['+Social', '+Fun'], bubble: '🛋️ Cuddling' },
  { id: 'slow-dance', emoji: '💃🏾', label: 'Slow dance', tier: 'romantic', gains: ['+Social', '+Fun'], bubble: '💃🏾 Slow dance' },
  { id: 'kiss', emoji: '💋', label: 'Kiss', tier: 'romantic', gains: ['+Social', '+Fun'], bubble: '💋 Kiss' },
]

export const interactionById = (id: string) => INTERACTIONS.find((i) => i.id === id)

export const LEVEL_LABEL: Record<Level, string> = {
  stranger: 'Stranger',
  padi: 'Padi',
  close: 'Close friend',
  crush: 'Crush',
  partner: 'Partner',
}

export type Relation = {
  points: number
  level: Level
  partnerYou: boolean
  mutualPartners: boolean
  blockedByYou: boolean
  withUsername: string
}

export const fetchRelation = (username: string) => apiGet<{ ok: true; relation: Relation }>(`/people/${encodeURIComponent(username)}/relation`)
export const setPartner = (username: string, on: boolean) => apiPost<{ ok: true; relation: Relation }>(`/people/${encodeURIComponent(username)}/partner`, { on })
export const setBlock = (username: string, on: boolean) => apiPost<{ ok: true; relation: Relation }>(`/people/${encodeURIComponent(username)}/block`, { on })
export const reportPlayer = (username: string, reason: string) => apiPost<{ ok: true }>(`/people/${encodeURIComponent(username)}/report`, { reason })
export const interact = (username: string, home: string, action: string) =>
  apiPost<{ ok: true; pending: boolean; landed?: boolean }>(`/people/${encodeURIComponent(username)}/act`, { action, home })
export const respondToAsk = (id: string, accept: boolean) => apiPost<{ ok: true; accepted: boolean }>(`/interactions/${encodeURIComponent(id)}/respond`, { accept })

/** Why this one is locked for you right now, or null (the server checks again). */
export function lockedReason(i: Interaction, r: Relation | null): string | null {
  if (i.tier === 'close' && !(r && (r.points >= 30 || r.mutualPartners))) return 'Close friends only'
  if (i.tier === 'romantic' && !r?.mutualPartners) return 'Partners only'
  return null
}
