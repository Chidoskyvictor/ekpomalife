type AppRouter = { push: (href: string) => void; replace: (href: string) => void }

const OSCILLATION_WINDOW_MS = 4_000
const recentHardNav: { path: string; at: number }[] = []

function normalizePath(raw: string) {
  const pathOnly = raw.split('?')[0] ?? raw
  const trimmed = pathOnly.replace(/\/$/, '')
  return trimmed === '' ? '/' : trimmed
}

function wouldOscillate(nextPath: string) {
  const next = normalizePath(nextPath)
  const now = Date.now()
  while (recentHardNav.length > 0 && now - recentHardNav[0]!.at > OSCILLATION_WINDOW_MS) {
    recentHardNav.shift()
  }
  if (recentHardNav.some((entry) => entry.path === next)) {
    return true
  }
  if (recentHardNav.length >= 2) {
    const a = recentHardNav[recentHardNav.length - 2]!.path
    const b = recentHardNav[recentHardNav.length - 1]!.path
    if (a === next && b !== next) return true
  }
  return false
}

/** Compare pathnames (ignore trailing slash; ignore query on dest). */
export function pathsEqual(a: string, b: string) {
  const norm = (raw: string) => {
    const pathOnly = raw.split('?')[0] ?? raw
    const trimmed = pathOnly.replace(/\/$/, '')
    return trimmed === '' ? '/' : trimmed
  }
  return norm(a) === norm(b)
}

export function currentPathname() {
  if (typeof window === 'undefined') return ''
  return window.location.pathname
}

export function assignNavigation(url: string) {
  if (process.env.NODE_ENV === 'development') {
    console.trace('[nav] location.assign', url)
  }
  if (typeof window === 'undefined') return
  const path = url.startsWith('http') ? new URL(url, window.location.origin).pathname : (url.split('?')[0] ?? url)
  const normalized = normalizePath(path)
  if (pathsEqual(path, window.location.pathname)) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[nav] skipped same-path location.assign', url)
    }
    return
  }
  if (wouldOscillate(normalized)) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[nav] blocked oscillating hard navigation', url, recentHardNav)
    }
    return
  }
  recentHardNav.push({ path: normalized, at: Date.now() })
  window.location.assign(url)
}

export function replaceNavigation(router: AppRouter, dest: string, currentPath?: string | null) {
  if (process.env.NODE_ENV === 'development') {
    console.trace('[nav] router.replace', dest)
  }
  const cur = currentPath ?? currentPathname()
  if (pathsEqual(dest, cur)) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[nav] skipped same-path router.replace', dest)
    }
    return
  }
  router.replace(dest)
}

export function pushNavigation(router: AppRouter, dest: string, currentPath?: string | null) {
  if (process.env.NODE_ENV === 'development') {
    console.trace('[nav] router.push', dest)
  }
  const cur = currentPath ?? currentPathname()
  if (pathsEqual(dest, cur)) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[nav] skipped same-path router.push', dest)
    }
    return
  }
  router.push(dest)
}
