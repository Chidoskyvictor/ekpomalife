// Local check (dev database only): screenshots of the main logged-in screens at 360x740, light and dark.
// node design-check.mjs <account.json> <outDir>
import { chromium } from '@playwright/test'
import fs from 'node:fs'

const [account, out] = process.argv.slice(2)
const acct = JSON.parse(fs.readFileSync(account, 'utf8'))
fs.mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] })
const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR', e.message))

await page.goto('http://127.0.0.1:3000/login', { timeout: 240000 })
await page.locator('input[autocomplete="username"]').waitFor({ timeout: 120000 })
await page.waitForTimeout(2000)
await page.locator('input[autocomplete="username"]').fill(acct.username)
await page.locator('input[type="password"]').fill(acct.password)
await page.getByRole('button', { name: /Enter Ekpoma/ }).click()
await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 90000 })

async function clear() {
  for (let i = 0; i < 8; i++) {
    const b = page.getByRole('button', { name: /^(Cancel|Skip|Got it|Not now|Close|Later|OK)$/ }).first()
    if (await b.isVisible().catch(() => false)) { await b.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(700); continue }
    if (!(await page.locator('[role="dialog"]').last().isVisible().catch(() => false))) break
    await page.keyboard.press('Escape'); await page.waitForTimeout(600)
  }
}
const tapText = (t) => page.evaluate((t) => {
  const els = [...document.querySelectorAll('*')].filter((e) => e.childElementCount === 0 && e.textContent.trim() === t && e.getBoundingClientRect().width)
  els.at(-1)?.click(); return els.length
}, t)
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` })

for (const theme of ['light', 'dark']) {
  await page.evaluate((t) => localStorage.setItem('ekpoma-theme', t), theme)
  await page.goto('http://127.0.0.1:3000/', { timeout: 240000 })
  await page.waitForTimeout(18000)
  await clear()
  await shot(`${theme}-1-home`)
  await page.mouse.click(323, 712) // Phone tab (bottom right)
  await page.waitForTimeout(3000)
  await shot(`${theme}-2-phone`)
  for (const [app, n] of [['Settings', 3], ['Messages', 4], ['Bank', 5], ['Games', 6]]) {
    const found = await tapText(app)
    await page.waitForTimeout(3500)
    await shot(`${theme}-${n}-${app.toLowerCase()}${found ? '' : '-notfound'}`)
    await page.keyboard.press('Escape').catch(() => {})
    await page.getByRole('button', { name: /^(Back|Close)$/ }).first().click({ timeout: 2000 }).catch(() => {})
    await page.waitForTimeout(1500)
  }
}
await browser.close()
