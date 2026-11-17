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
const B = await player(accB)
await Promise.all([A.page.waitForTimeout(15000), B.page.waitForTimeout(15000)])
for (const P of [A, B]) {
  await clear(P.page)
}

// Same place for both: walk B to wherever A is
const sa = await api(A.page, '/nearby/voice')
const sb = await api(B.page, '/nearby/voice')
console.log('A at', sa.place, 'B at', sb.place, 'available', sa.available)
if (sa.place !== sb.place) {
  const t = await api(B.page, '/travel/trek', { to: sa.place })
  console.log('B travel', t.ok, t.error ?? '')
  await B.page.reload(); await B.page.waitForTimeout(15000)
  await clear(B.page)
  console.log('B now at', (await api(B.page, '/nearby/voice')).place)
}

const micA = A.page.getByRole('button', { name: /Talk to people here/ })
console.log('A sees mic:', await micA.isVisible().catch(() => false))
await A.page.screenshot({ path: `${out}/A-before.png` })
await clear(A.page)
await micA.click({ timeout: 10000 })
await A.page.getByRole('button', { name: 'Mute your mic' }).waitFor({ timeout: 25000 }).catch(() => {})
await A.page.screenshot({ path: `${out}/A-joined.png` })
console.log('A mic on:', await A.page.getByRole('button', { name: 'Mute your mic' }).isVisible().catch(() => false))

// B's badge should count A after the next refresh
await B.page.reload(); await B.page.waitForTimeout(25000)
await clear(B.page)
await B.page.getByRole('button', { name: /Talk to people here/ }).waitFor({ timeout: 40000 }).catch(() => {})
console.log('B count from server:', (await api(B.page, '/nearby/voice')).count)
const micB = B.page.getByRole('button', { name: /Talk to people here/ })
console.log('B mic label:', await micB.getAttribute('aria-label').catch(() => 'none'))
await B.page.screenshot({ path: `${out}/B-badge.png` })
await clear(B.page)
await micB.click({ timeout: 10000 })
await B.page.getByRole('button', { name: 'Mute your mic' }).waitFor({ timeout: 25000 }).catch(() => {})
await A.page.waitForTimeout(4000)
await A.page.screenshot({ path: `${out}/A-both.png` })
await B.page.screenshot({ path: `${out}/B-both.png` })
console.log('A badge:', await A.page.locator('[aria-label="Mute your mic"] span').innerText().catch(() => 'none'))

// Leave
await A.page.getByRole('button', { name: 'Leave the voice here' }).click().catch(() => console.log('no leave'))
await A.page.waitForTimeout(2000)
console.log('A left, mic button back:', await micA.isVisible().catch(() => false))
await browser.close()
