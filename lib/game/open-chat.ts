import type { ChatSummary } from './hostels-api'

/*
 * Open the phone straight into a chat from anywhere (e.g. "Message" in a club's People
 * list). The HUD opens the phone, the phone opens Messages, Messages takes the chat.
 */

export const OPEN_CHAT_EVENT = 'ekpoma:open-chat'
/** The Messages app was opened (any way): the new-message chip goes away. */
export const MESSAGES_OPENED_EVENT = 'ekpoma:messages-opened'

let pending: ChatSummary | null = null

export function requestOpenChat(chat: ChatSummary) {
  pending = chat
  window.dispatchEvent(new CustomEvent(OPEN_CHAT_EVENT))
}

/** The chat waiting to be shown, once (Messages calls this when it opens). */
export function takePendingChat(): ChatSummary | null {
  const chat = pending
  pending = null
  return chat
}
