// Local check (dev DB): the "sorry for the downtime" gift popup, light and dark. node gift-check.mjs <account.json> <outDir>
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
for (let a = 0; a < 4; a++) {
  await page.getByRole('button', { name: /Enter Ekpoma/ }).click({ timeout: 60000 }).catch(() => {})
  if (await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 60000 }).then(() => true).catch(() => false)) break
}
const dlg = page.getByRole('dialog', { name: 'Sorry for the downtime' })
await dlg.waitFor({ timeout: 90000 }).catch(() => {})
console.log('popup shown:', await dlg.isVisible().catch(() => false))
await page.waitForTimeout(2200)
await page.screenshot({ path: `${out}/gift-light.png` })
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
await page.waitForTimeout(500)
await page.screenshot({ path: `${out}/gift-dark.png` })
await page.getByRole('button', { name: 'Check your bank' }).click().catch(() => console.log('no bank button'))
await page.waitForTimeout(4000)
await page.screenshot({ path: `${out}/gift-bank.png` })
console.log('bank shows gift:', await page.getByText('Sorry for the downtime').first().isVisible().catch(() => false))
await page.reload(); await page.waitForTimeout(20000)
console.log('popup again after reload:', await dlg.isVisible().catch(() => false))
await browser.close()
