// Records film-mode shots frame by frame (smooth whatever the PC speed), with motion blur.
// usage: node launch-video/rec/film-shot.mjs <out-dir> "<shot>:<from>:<to>[,<shot>:<from>:<to>...]" [fps] [query]
// e.g.   node launch-video/rec/film-shot.mjs launch-video/clips/film-test "chase:0:2.5,wheel:2.5:5" 30
// Each output frame averages SUB sub-frames spread over half the frame time (a 180° shutter), saved as PNG.
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const [outDir, plan, fpsArg, extra] = process.argv.slice(2)
const FPS = Number(fpsArg ?? 30)
const SUB = 3
const shots = plan.split(',').map((p) => {
  // optional 4th field: playback speed (0.35 = slow motion: more frames over the same film time)
  const [shot, from, to, rate] = p.split(':')
  return { shot, from: Number(from), to: Number(to), rate: Number(rate ?? 1) }
})
fs.mkdirSync(path.join(outDir, 'sub'), { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] })
const ctx = await browser.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
// Late afternoon light by default (the owner found morning too bright); `extra` can pass time=HH:MM
const url = `http://localhost:3000/dev-film?shot=${shots[0].shot}${extra && extra.includes('time=') ? '' : '&time=16:45'}${extra ? '&' + extra : ''}`
await page.goto(url, { timeout: 240000 })
// Wait until the 3D view has sized itself (setting the film clock earlier stops it from sizing: it stays 300×150)
page.on('pageerror', (e) => console.log('pageerror:', e.message.slice(0, 200)))
// The dev server sometimes fails to serve a chunk ("This page couldn't load"): reload until the view is up
let ready = false
for (let attempt = 0; attempt < 6 && !ready; attempt++) {
  if (attempt) await page.goto(url, { timeout: 240000 }).catch(() => {})
  for (let i = 0; i < 90; i++) {
    const s = await page.evaluate(() => ({ w: document.querySelector('canvas')?.width ?? 0, broken: /couldn.t load/i.test(document.body.innerText) })).catch(() => ({ w: 0, broken: true }))
    if (s.w > 400) { ready = true; break }
    if (s.broken) break
    await page.waitForTimeout(1000)
  }
}
if (!ready) throw new Error('film page never loaded')
const frame = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))))
await page.evaluate(() => (window.__filmT = 0))
// Run the whole scene on the film clock: blinking hazards, walkers and traffic read performance.now(), so
// without this they race ahead while each frame takes ~2 s to capture, and look sped up in the video
await page.evaluate(() => {
  const base = performance.now()
  const real = performance.now.bind(performance)
  window.__realNow = real
  performance.now = () => base + (typeof window.__filmT === 'number' ? window.__filmT * 1000 : real() - base)
})
// Let the town around the start stream in
await page.waitForTimeout(17000)
// Hide the Next.js dev badge (added after load: injecting it earlier stopped the 3D canvas from sizing)
await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' })
const state = await page.evaluate(() => { const c = document.querySelector('canvas'); return { w: c?.width, h: c?.height, body: document.body.innerText.slice(0, 80) } })
console.log('page:', JSON.stringify(state))
await page.screenshot({ path: path.join(outDir, 'check.png') })

let n = 0
for (const { shot, from, to, rate } of shots) {
  await page.evaluate((s) => (window.__filmShot = s), shot)
  const frames = Math.round(((to - from) * FPS) / rate)
  for (let i = 0; i < frames; i++) {
    for (let k = 0; k < SUB; k++) {
      const file = path.join(outDir, 'sub', `${String(n).padStart(5, '0')}_${k}.png`)
      // Resume: a re-run skips what an earlier run already captured
      if (fs.existsSync(file)) continue
      const t = from + (i / FPS + (k / SUB) * (0.5 / FPS)) * rate
      // The dev server sometimes stalls a moment: retry a slow screenshot rather than lose the run
      for (let attempt = 0; ; attempt++) {
        try {
          await page.evaluate((v) => (window.__filmT = v), t)
          await frame()
          await frame()
          await page.screenshot({ path: file, timeout: 120000 })
          break
        } catch (error) {
          if (attempt >= 4) throw error
          console.log(`retry frame ${n}.${k}:`, String(error).slice(0, 80))
          await page.waitForTimeout(5000)
        }
      }
    }
    n++
    if (n % 15 === 0) console.log(`frame ${n}`)
  }
}
await browser.close()
console.log(`done: ${n} frames`)
