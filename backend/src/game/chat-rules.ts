/** Pure rules for chat replies, reactions and read receipts (no database). */

export const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const
export const isReactionEmoji = (value: string): boolean => (REACTION_EMOJIS as readonly string[]).includes(value)

/** Kinds you can quote or react to: not the slim system / nudge lines. */
export const canInteractWith = (kind: string): boolean => kind !== 'system' && kind !== 'nudge' && kind !== 'bae'

/** A short one-line preview used inside a quote box. */
export function quotePreview(kind: string, body: string): string {
  if (kind === 'sticker') return 'Sticker'
  if (kind === 'money') return `₦${Number(body).toLocaleString('en-NG')}`
  if (kind === 'invite') return 'Invite to a place'
  if (kind === 'visit') return 'Place visit'
  if (kind === 'game') return 'Game challenge'
  return (body.split('\n')[0] ?? '').slice(0, 120)
}

/**
 * Validate a reply target. `original` is the quoted message row (or undefined if it doesn't exist).
 * Returns an error message, or null when the reply is fine.
 */
export function replyError(original: { chat_id: string; kind: string } | undefined, chatId: string): string | null {
  if (!original || original.chat_id !== chatId) return 'That message isn’t in this chat.'
  if (!canInteractWith(original.kind)) return 'You can’t reply to that.'
  return null
}

export type Member = { delivered: number; read: number }
export type ReceiptMarkers = { delivered: string; read: string }

/**
 * Markers for one viewer's own messages: a message with seq <= `delivered` reached everyone else
 * (✓✓ grey), <= `read` was opened by everyone else (✓✓ blue). Read implies delivered. With the
 * viewer's own switch off they never get a read marker, like WhatsApp. `others` excludes the viewer;
 * an empty list means nobody to deliver to, so nothing is ticked beyond "sent".
 */
export function receiptMarkers(others: Member[], viewerReceiptsOn: boolean): ReceiptMarkers {
  if (others.length === 0) return { delivered: '0', read: '0' }
  const read = Math.min(...others.map((m) => m.read))
  const delivered = Math.max(Math.min(...others.map((m) => m.delivered)), read)
  return { delivered: String(delivered), read: viewerReceiptsOn ? String(read) : '0' }
}
