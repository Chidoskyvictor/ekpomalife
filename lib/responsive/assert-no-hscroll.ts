/**
 * Shared predicate for Playwright / manual console checks.
 * Prefer `documentElement.clientWidth` over `window.innerWidth` on the second arg —
 * Chrome on Windows counts the classic scrollbar in `innerWidth` and false-positives overflow.
 */
export function hasHorizontalOverflow(scrollWidth: number, viewportWidth: number, slack = 2) {
  return scrollWidth > viewportWidth + slack
}
