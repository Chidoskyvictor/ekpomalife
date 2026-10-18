/** Server `error` strings we handle specially (and friendly toast codes). */
export const API_ERROR_CODES = [
  'INSUFFICIENT_FUNDS',
  'NO_ENERGY',
  'NOT_ELIGIBLE',
  'VERSION_CONFLICT',
  'SETUP_INCOMPLETE',
  'UNAUTHORIZED',
] as const

export type ApiErrorCode = (typeof API_ERROR_CODES)[number]

export type ApiFail = {
  ok: false
  error: string
  /** Known economy codes or route-specific strings (e.g. NO_PHONE, BATTERY_DEAD). */
  code?: ApiErrorCode | string
  conflict?: boolean
  status?: number
  network?: boolean
}

const CODE_SET = new Set<string>(API_ERROR_CODES)

export function asApiErrorCode(value: string | undefined | null): ApiErrorCode | undefined {
  if (!value) return undefined
  if (CODE_SET.has(value)) return value as ApiErrorCode
  // Human strings from mocks / older responses
  if (/insufficient.?funds|no get money|money reach/i.test(value)) return 'INSUFFICIENT_FUNDS'
  if (/^NO_ENERGY$/i.test(value) || /too tired|need a rest|no energy/i.test(value)) return 'NO_ENERGY'
  if (/not.?eligible|cannot take this job|locked/i.test(value)) return 'NOT_ELIGIBLE'
  if (/version.?conflict/i.test(value)) return 'VERSION_CONFLICT'
  if (/setup.?incomplete/i.test(value)) return 'SETUP_INCOMPLETE'
  if (/unauthorized|log in to play|please log in/i.test(value)) return 'UNAUTHORIZED'
  return undefined
}

/** Gentle copy — never shame the player. */
export function friendlyApiMessage(fail: ApiFail): string {
  const code = fail.code ?? asApiErrorCode(fail.error)
  if (fail.network) return "Can't reach the server, retrying…"
  switch (code) {
    case 'INSUFFICIENT_FUNDS':
      return fail.error && !CODE_SET.has(fail.error)
        ? fail.error
        : 'Your pocket is a bit light for that right now.'
    case 'NO_ENERGY':
      return fail.error && !CODE_SET.has(fail.error)
        ? fail.error
        : 'You need a rest before that one.'
    case 'NOT_ELIGIBLE':
      return fail.error && !CODE_SET.has(fail.error)
        ? fail.error
        : "You're not set up for that yet."
    case 'VERSION_CONFLICT':
      return 'Things moved on the server — try again.'
    case 'SETUP_INCOMPLETE':
      return 'Finish setting up your character first.'
    case 'UNAUTHORIZED':
      return 'Please log in again.'
    default:
      return fail.error || 'Something went wrong. Try again.'
  }
}
