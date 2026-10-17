/** Shared predicate for Playwright / manual console checks. */
export function hasHorizontalOverflow(scrollWidth: number, innerWidth: number, slack = 1) {
  return scrollWidth > innerWidth + slack
}
