// Local check (dev DB): fake the clock to 10:01pm WAT and screenshot the "Sazza is live" notification, light and dark.
// node sazza-check.mjs <account.json> <outDir> <webBase>
import { chromium } from '@playwright/test'
import fs from 'node:fs'
const [account, out, base = 'http://127.0.0.1:3005'] = process.argv.slice(2)
const acct = JSON.parse(fs.readFileSync(account, 'utf8'))
const browser = await chromium.launch({ channel: 'chrome' })
const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
await page.goto(base + '/login', { timeout: 240000 })
await page.locator('input[autocomplete="username"]').waitFor({ timeout: 120000 })
await page.waitForTimeout(3000)
await page.locator('input[autocomplete="username"]').fill(acct.username)
await page.locator('input[type="password"]').fill(acct.password)
for (let attempt = 0; attempt < 4; attempt++) {
  await page.getByRole('button', { name: /Enter Ekpoma/ }).click({ timeout: 60000 }).catch(() => {})
  const ok = await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 }).then(() => true).catch(() => false)
  if (ok) break
  console.log('login retry', attempt)
}
// 22:01 WAT = 21:01 UTC today
const d = new Date()
d.setUTCHours(21, 1, 0, 0)
for (const theme of ['light', 'dark']) {
  await page.clock.install({ time: d })
  await page.evaluate((t) => {
    localStorage.setItem('ekpoma-theme', t)
    localStorage.removeItem('ekpoma-sazza-night')
    sessionStorage.setItem('ekpoma-welcomed', '1')
  }, theme)
  await page.goto(base + '/', { timeout: 240000 })
  const banner = page.getByText('Sazza is live')
  let shown = false
  for (let i = 0; i < 40 && !shown; i++) {
    await page.clock.runFor(1000)
    await page.waitForTimeout(500)
    shown = await banner.isVisible().catch(() => false)
  }
  console.log(theme, 'banner shown:', shown)
  for (let k = 0; k < 6; k++) { await page.clock.runFor(150); await page.waitForTimeout(120) }
  await page.screenshot({ path: `${out}/sazza-${theme}.png` })
}
await browser.close()
