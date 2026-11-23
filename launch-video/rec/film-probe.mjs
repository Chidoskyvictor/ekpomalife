import { chromium } from '@playwright/test'
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] })
const page = await (await browser.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 })).newPage()
const logs = []
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text().slice(0, 200)) })
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message.slice(0, 300)))
await page.goto('http://localhost:3000/dev-film?shot=chase&time=08:30', { timeout: 240000 })
for (const s of [10, 25, 45]) {
  await page.waitForTimeout(s === 10 ? 10000 : 15000)
  const info = await page.evaluate(() => { const c = document.querySelector('canvas'); const gl = c && (c.getContext('webgl2') || c.getContext('webgl')); return { canvases: document.querySelectorAll('canvas').length, w: c?.width, h: c?.height, gl: !!gl, lost: gl?.isContextLost?.(), body: document.body.innerText.slice(0, 120) } })
  console.log(s, JSON.stringify(info))
}
await page.evaluate(() => (window.__filmT = 0.5))
await page.waitForTimeout(1500)
await page.screenshot({ path: 'launch-video/clips/film-probe.png' })
console.log(logs.slice(0, 12).join('\n'))
await browser.close()
