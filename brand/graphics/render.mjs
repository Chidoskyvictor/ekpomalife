// Render an Ekpoma Life announcement graphic to PNG.
//   node brand/graphics/render.mjs brand/graphics/posts/downtime-apology.json brand/graphics/out/downtime-apology.png
// Copy a post JSON, change the words, render again: same brand every time.
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const [postFile, outFile] = process.argv.slice(2)
if (!postFile || !outFile) throw new Error('usage: node render.mjs <post.json> <out.png>')
const post = JSON.parse(fs.readFileSync(postFile, 'utf8'))
const page = pathToFileURL(path.join(import.meta.dirname, 'announcement.html')).href

const browser = await chromium.launch({ channel: 'chrome' })
const ctx = await browser.newContext({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 })
const tab = await ctx.newPage()
await tab.addInitScript((p) => {
  window.POST = p
}, post)
await tab.goto(page)
await tab.evaluate(() => document.fonts.ready)
await tab.waitForTimeout(300)
fs.mkdirSync(path.dirname(outFile), { recursive: true })
await tab.screenshot({ path: outFile, type: 'png' })
await browser.close()
console.log('saved', outFile)
