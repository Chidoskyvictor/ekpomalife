// One labelled still per shot: node launch-video/rec/film-debug.mjs "shot:t,shot:t,..."
import { chromium } from '@playwright/test'
import fs from 'node:fs'
const plan = (process.argv[2] ?? '').split(',').map((p) => p.split(':')).map(([s, t]) => [s, Number(t)])
fs.mkdirSync('launch-video/clips/film-debug', { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] })
const page = await (await browser.newContext({ viewport: { width: 360, height: 640 } })).newPage()
await page.goto('http://localhost:3000/dev-film?shot=chase&time=16:45&s=6880', { timeout: 240000 })
for (let i = 0; i < 90; i++) { const w = await page.evaluate(() => document.querySelector('canvas')?.width ?? 0); if (w > 300) break; await page.waitForTimeout(1000) }
await page.evaluate(() => (window.__filmT = 0))
await page.waitForTimeout(15000)
await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' })
for (const [shot, t] of plan) {
  await page.evaluate(([s, v]) => { window.__filmShot = s; window.__filmT = v }, [shot, t])
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `launch-video/clips/film-debug/${shot}.png` })
}
await browser.close()
