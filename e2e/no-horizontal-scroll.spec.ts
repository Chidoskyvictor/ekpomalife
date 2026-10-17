import { expect, test } from '@playwright/test'

/**
 * Fails if any listed route scrolls sideways at 375×812 (iPhone-ish).
 * Run: pnpm test:hscroll
 */
const ROUTES = ['/', '/login', '/signup', '/forgot', '/look', '/traits', '/dream', '/live', '/terms']

test.describe('no horizontal scroll @ 375px', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  for (const path of ROUTES) {
    test(`${path} does not overflow horizontally`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'domcontentloaded' })
      // AuthGate / loaders may redirect; settle briefly
      await page.waitForTimeout(400)
      const metrics = await page.evaluate(() => {
        const doc = document.documentElement
        const body = document.body
        return {
          innerWidth: window.innerWidth,
          scrollWidth: Math.max(doc.scrollWidth, body.scrollWidth),
        }
      })
      expect(
        metrics.scrollWidth,
        `${path}: scrollWidth ${metrics.scrollWidth} > innerWidth ${metrics.innerWidth}`,
      ).toBeLessThanOrEqual(metrics.innerWidth + 1)
    })
  }
})
