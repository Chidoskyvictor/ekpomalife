import { PHONE_FREE_FOR_ALL } from '@/lib/flags'

export { PHONE_FREE_FOR_ALL }

/** When true, every player can use the phone without buying one (shop listing hidden). */
export function playerHasPhone(hasPhoneFlag = false) {
  return PHONE_FREE_FOR_ALL || hasPhoneFlag
}
