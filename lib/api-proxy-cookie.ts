/** Rewrite Set-Cookie so the browser scopes it to the Next frontend origin. */
export function sanitizeSetCookie(raw: string, requestUrl: string): string {
  const isHttps = new URL(requestUrl).protocol === 'https:'
  return raw
    .split(';')
    .map((part) => part.trim())
    .filter((part) => {
      const lower = part.toLowerCase()
      if (lower.startsWith('domain=')) return false
      if (!isHttps && lower === 'secure') return false
      return part.length > 0
    })
    .join('; ')
}
