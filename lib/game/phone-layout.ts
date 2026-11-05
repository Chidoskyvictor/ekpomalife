import type { PhoneAppId } from './phone'

/** Home-screen arrangement: apps on the grid (in order) and apps pinned to the dock (in order). */
export type PhoneLayout = { grid: PhoneAppId[]; dock: PhoneAppId[] }

export const PHONE_LAYOUT_KEY = 'ekpoma-phone-layout'
export const DOCK_MAX = 4
export const DEFAULT_DOCK: PhoneAppId[] = ['messages', 'bank', 'ride', 'market']

/**
 * Turn whatever was saved into a valid layout for the apps that exist now: unknown or duplicate ids
 * are dropped, apps added since the save land at the end of the grid, and no save gives the default.
 */
export function resolveLayout(saved: unknown, allIds: PhoneAppId[]): PhoneLayout {
  const known = new Set(allIds)
  const seen = new Set<PhoneAppId>()
  const clean = (list: unknown, limit: number): PhoneAppId[] => {
    const out: PhoneAppId[] = []
    if (!Array.isArray(list)) return out
    for (const id of list) {
      if (typeof id === 'string' && known.has(id as PhoneAppId) && !seen.has(id as PhoneAppId) && out.length < limit) {
        seen.add(id as PhoneAppId)
        out.push(id as PhoneAppId)
      }
    }
    return out
  }
  const obj = saved && typeof saved === 'object' ? (saved as Record<string, unknown>) : null
  if (!obj) {
    const dock = DEFAULT_DOCK.filter((id) => known.has(id))
    return { dock, grid: allIds.filter((id) => !dock.includes(id)) }
  }
  const dock = clean(obj.dock, DOCK_MAX)
  const grid = clean(obj.grid, allIds.length)
  for (const id of allIds) if (!seen.has(id)) grid.push(id)
  return { dock, grid }
}

/** Pin to the dock (end). Returns null when the dock is full. */
export function pinApp(layout: PhoneLayout, id: PhoneAppId): PhoneLayout | null {
  if (layout.dock.includes(id)) return layout
  if (layout.dock.length >= DOCK_MAX) return null
  return { dock: [...layout.dock, id], grid: layout.grid.filter((x) => x !== id) }
}

/** Unpin back to the end of the grid. */
export function unpinApp(layout: PhoneLayout, id: PhoneAppId): PhoneLayout {
  if (!layout.dock.includes(id)) return layout
  return { dock: layout.dock.filter((x) => x !== id), grid: [...layout.grid, id] }
}

/** Move one step earlier (-1) or later (+1) inside wherever the app currently sits. */
export function moveApp(layout: PhoneLayout, id: PhoneAppId, step: -1 | 1): PhoneLayout {
  const where = layout.dock.includes(id) ? 'dock' : 'grid'
  const list = [...layout[where]]
  const from = list.indexOf(id)
  const to = from + step
  if (from < 0 || to < 0 || to >= list.length) return layout
  ;[list[from], list[to]] = [list[to]!, list[from]!]
  return { ...layout, [where]: list }
}

export function loadLayout(allIds: PhoneAppId[]): PhoneLayout {
  try {
    const raw = localStorage.getItem(PHONE_LAYOUT_KEY)
    return resolveLayout(raw ? JSON.parse(raw) : null, allIds)
  } catch {
    return resolveLayout(null, allIds)
  }
}

export function saveLayout(layout: PhoneLayout) {
  try {
    localStorage.setItem(PHONE_LAYOUT_KEY, JSON.stringify(layout))
  } catch {
    /* ignore */
  }
}
