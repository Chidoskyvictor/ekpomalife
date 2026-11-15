/** Pure rules for the in-game chat (no database, no sockets): length, word filter, links/numbers, rate limit. */

export const GAME_CHAT_MAX = 200
/** At most this many messages per window per player. */
export const GAME_CHAT_RATE = { max: 5, windowMs: 10_000 }
/** Messages kept per room, for players who join late or reconnect. */
export const GAME_CHAT_KEEP = 40

// Slurs, insults and sexual words (English + Pidgin + common Nigerian insults). Matched as whole
// words after de-leeting, and also with letters spaced/repeated so "f u c k" or "fuuuck" don't slip by.
const BAD_WORDS = [
  'fuck', 'fucker', 'fucking', 'fck', 'shit', 'bitch', 'bastard', 'asshole', 'dick', 'pussy', 'cunt', 'whore', 'slut', 'porn', 'sex',
  'nude', 'nudes', 'penis', 'vagina', 'boobs', 'cum', 'rape', 'nigger', 'nigga', 'faggot', 'retard', 'idiot', 'stupid', 'mumu',
  'olodo', 'oloshi', 'ashawo', 'oloribu', 'motherfucker', 'agbaya', 'yeye',
]

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's', '!': 'i' }

const deleet = (text: string) => text.replace(/[013457@$!]/g, (c) => LEET[c] ?? c)
const squeeze = (text: string) => text.replace(/(.)\1{2,}/g, '$1$1')
const squeezeAll = (text: string) => text.replace(/(.)\1+/g, '$1')
const isBad = (word: string) => {
  const plain = deleet(word.toLowerCase())
  return [squeeze(plain), squeezeAll(plain)].some((w) => BAD_WORDS.includes(w) || BAD_WORDS.includes(w.replace(/s$/, '')))
}

/** Mask bad words with asterisks, keeping the first letter. Returns the cleaned text and whether anything was masked. */
export function maskBadWords(text: string): { text: string; masked: boolean } {
  let masked = false
  const out = text.replace(/[\p{L}\p{N}@$!]+/gu, (word) => {
    if (isBad(word)) {
      masked = true
      return word[0] + '*'.repeat(Math.max(2, word.length - 1))
    }
    return word
  })
  // "f u c k" spelled out with single letters between spaces/dots
  const spaced = out.replace(/\b(?:[a-z][\s.\-_*]){3,}[a-z]\b/gi, (m) => {
    const letters = m.replace(/[\s.\-_*]/g, '').toLowerCase()
    if (BAD_WORDS.includes(letters)) {
      masked = true
      return '*'.repeat(letters.length)
    }
    return m
  })
  return { text: spaced, masked }
}

const URL_RE = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|ng|io|me|co|app|xyz|info|link|gg|tv|ly)\b|t\.me\/|wa\.me\/|bit\.ly)/i
const DIGITS_RE = /(?:\+?\d[\s\-().]*){9,}/

/** A link or phone number (9+ digits, spaces/dashes allowed) can't be sent. */
export function hasLinkOrNumber(text: string): boolean {
  return URL_RE.test(text) || DIGITS_RE.test(text)
}

export type CleanResult = { ok: true; text: string } | { ok: false; error: string }

/** Trim, check length, block links/numbers and mask bad words. */
export function cleanGameChat(raw: unknown): CleanResult {
  if (typeof raw !== 'string') return { ok: false, error: 'Type a message.' }
  const text = raw.replace(/\s+/g, ' ').trim()
  if (!text) return { ok: false, error: 'Type a message.' }
  if (text.length > GAME_CHAT_MAX) return { ok: false, error: `Keep it under ${GAME_CHAT_MAX} characters.` }
  if (hasLinkOrNumber(text)) return { ok: false, error: 'No links or phone numbers in game chat.' }
  return { ok: true, text: maskBadWords(text).text }
}

/** Sliding-window limiter, one instance per room. */
export class RateLimiter {
  private hits = new Map<string, number[]>()
  constructor(
    private readonly max = GAME_CHAT_RATE.max,
    private readonly windowMs = GAME_CHAT_RATE.windowMs,
  ) {}
  /** true if allowed (and counted), false if the player is sending too fast. */
  take(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs)
    if (recent.length >= this.max) {
      this.hits.set(key, recent)
      return false
    }
    recent.push(now)
    this.hits.set(key, recent)
    return true
  }
}
