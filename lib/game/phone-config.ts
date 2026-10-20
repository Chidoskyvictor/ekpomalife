/** When true, every player can use the phone without buying one (shop listing hidden). */
export const PHONE_FREE_FOR_ALL = true

export function playerHasPhone(hasPhoneFlag = false) {
  return PHONE_FREE_FOR_ALL || hasPhoneFlag
}
