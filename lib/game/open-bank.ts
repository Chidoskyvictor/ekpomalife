/* Open the phone's Bank app from anywhere (the gift popup's "Check your bank"). */
export const OPEN_BANK_EVENT = 'ekpoma:open-bank'

export function requestOpenBank() {
  window.dispatchEvent(new CustomEvent(OPEN_BANK_EVENT))
}
