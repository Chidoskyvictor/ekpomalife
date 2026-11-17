// Local test (dev database only): two test players at the same place join the nearby voice.
// node nearby-mic-test.mjs <accA.json> <accB.json> <outDir>
import { chromium } from '@playwright/test'
import fs from 'node:fs'

const [accA, accB, out] = process.argv.slice(2)
fs.mkdirSync(out, { recursive: true })
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
})

async function player(account) {
  const acct = JSON.parse(fs.readFileSync(account, 'utf8'))
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, permissions: ['microphone'] })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log(acct.username, 'PAGEERROR', e.message))
  await page.goto('http://127.0.0.1:3000/login', { timeout: 240000 })
  await page.locator('input[autocomplete="username"]').waitFor({ timeout: 120000 })
  await page.waitForTimeout(3000)
  await page.locator('input[autocomplete="username"]').fill(acct.username)
  await page.locator('input[type="password"]').fill(acct.password)
  await page.getByRole('button', { name: /Enter Ekpoma/ }).click({ timeout: 180000 })
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 90000 })
  return { page, name: acct.username }
}
async function clear(page) {
  for (let i = 0; i < 10; i++) {
    const b = page.getByRole('button', { name: /^(Cancel|Skip|Got it|Not now|Close|Later|OK|Continue|Choose)$/ }).first()
    if (await b.isVisible().catch(() => false)) { await b.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(700); continue }
    const dlg = page.locator('[role="dialog"]').last()
    if (!(await dlg.isVisible().catch(() => false))) break
    await page.keyboard.press('Escape'); await page.waitForTimeout(600)
    if (await dlg.isVisible().catch(() => false)) await dlg.getByRole('button').first().click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(700)
  }
}
const api = (page, path, body) => page.evaluate(async ([p, b]) => {
  const r = await fetch('http://127.0.0.1:4000' + p, { method: b ? 'POST' : 'GET', credentials: 'include', headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() }, body: b ? JSON.stringify(b) : undefined })
  return r.json()
}, [path, body])

const A = await player(accA)
A.page.on('console', (m) => { if (/error|warn|livekit/i.test(m.type() + m.text())) console.log('console', m.type(), m.text().slice(0, 200)) })
await A.page.waitForTimeout(15000)
await clear(A.page)
await A.page.getByRole('button', { name: /Talk to people here/ }).click({ timeout: 20000 })
for (let i = 0; i < 10; i++) {
  await A.page.waitForTimeout(2000)
  const st = await A.page.evaluate(() => [...document.querySelectorAll('button[aria-label]')].map((b) => b.getAttribute('aria-label')).filter((l) => /mic|voice|Talk/i.test(l)))
  console.log(i, JSON.stringify(st))
}
await browser.close()
