import { env } from '../env.js'

export function isPhoneFreeForAll() {
  return env.PHONE_FREE_FOR_ALL
}
