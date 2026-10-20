/** Canonical production origin (apex, no www). */
export const SITE_URL = 'https://ekpomalife.app'

export const SITE_NAME = 'Ekpoma Life'

export const DEFAULT_TITLE = 'Ekpoma Life — live your AAU story'

export const DEFAULT_DESCRIPTION =
  'A browser life-simulation game set in Ekpoma, Edo State. Study at Ambrose Alli University, hustle for naira, eat at the bukka, pay rent, and chase your campus dream.'

export function absoluteUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${SITE_URL}${normalized}`
}
