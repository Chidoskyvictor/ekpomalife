/** Client-side display name checks (mirror backend/src/game/display-name.ts). */

const SLUR_PATTERNS: RegExp[] = [
  /\bnigg(a|er|as)?\b/i,
  /\bfag(got)?s?\b/i,
  /\bretard(ed)?s?\b/i,
  /\bwhore?s?\b/i,
  /\bbitch(es)?\b/i,
  /\bcunt?s?\b/i,
  /\bchink?s?\b/i,
  /\bspic?s?\b/i,
  /\bkike?s?\b/i,
  /\btranny\b/i,
]

export function containsBlockedLanguage(value: string): boolean {
  const normalized = value.normalize('NFKC').toLowerCase()
  return SLUR_PATTERNS.some((pattern) => pattern.test(normalized))
}

export function validateDisplayName(value: string): { ok: true; name: string } | { ok: false; error: string } {
  const trimmed = value.normalize('NFKC').trim()
  if (trimmed.length < 3) {
    return { ok: false, error: 'Name needs at least 3 characters.' }
  }
  if (trimmed.length > 20) {
    return { ok: false, error: 'Name can be 20 characters at most.' }
  }
  if (/\s{2,}/.test(trimmed) || /^[ .'-]|[ .'-]$/.test(trimmed)) {
    return { ok: false, error: 'Trim spaces and avoid names that start or end with punctuation.' }
  }
  if (!/^[\p{L}\p{N}][\p{L}\p{N} .'-]*$/u.test(trimmed)) {
    return { ok: false, error: 'Use letters, numbers, spaces, or a simple hyphen.' }
  }
  if (containsBlockedLanguage(trimmed)) {
    return { ok: false, error: 'Pick a name that keeps the vibe friendly.' }
  }
  return { ok: true, name: trimmed }
}
