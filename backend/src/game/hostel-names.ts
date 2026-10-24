/** Hostel name rules — pure, shared by search, create and tests. */

export const HOSTEL_NAME_MIN = 2
export const HOSTEL_NAME_MAX = 60

/**
 * Key used to spot duplicates: lowercase, punctuation removed, the word "hostel(s)" dropped,
 * "saint" collapsed to "st". "St. Louis Hostel", "Saint Louis" and "st louis" all → "st louis".
 */
export function normalizeHostelName(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word && word !== 'hostel' && word !== 'hostels')
    .map((word) => (word === 'saint' ? 'st' : word))
    .join(' ')
}

/** Display name as typed, tidied: trimmed, single spaces, length-capped. */
export function cleanHostelName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, HOSTEL_NAME_MAX)
}

export function validateHostelName(raw: string): { ok: true; name: string; normalized: string } | { ok: false; error: string } {
  const name = cleanHostelName(raw)
  if (name.length < HOSTEL_NAME_MIN) return { ok: false, error: 'Type the hostel name.' }
  const normalized = normalizeHostelName(name)
  if (normalized.length < HOSTEL_NAME_MIN) return { ok: false, error: 'Add the hostel’s actual name, not just “Hostel”.' }
  return { ok: true, name, normalized }
}
