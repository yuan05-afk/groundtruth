/**
 * Capture README product screenshots from the live (or local) GroundTruth app.
 * Run: node docs/capture-readme-shots.mjs
 * Optional: GT_URL=http://127.0.0.1:5173 node docs/capture-readme-shots.mjs
 */
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const out = path.join(__dirname, 'screenshots')
const BASE = (process.env.GT_URL || 'https://groundtruth-ph.vercel.app').replace(/\/$/, '')

// Featured Currimao case (index from featured.json)
const CURRIMAO_ID = 947

await mkdir(out, { recursive: true })

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
})

async function waitSettled(ms = 2000) {
  await page.waitForLoadState('networkidle', { timeout: 120000 }).catch(() => {})
  await page.waitForTimeout(ms)
}

async function shot(name, extraWait = 0, { type = 'png', quality } = {}) {
  if (extraWait) await page.waitForTimeout(extraWait)
  const ext = type === 'jpeg' ? 'jpg' : 'png'
  const dest = path.join(out, `${name}.${ext}`)
  const opts = { path: dest, fullPage: false, type }
  if (type === 'jpeg') opts.quality = quality ?? 82
  await page.screenshot(opts)
  console.log('saved', name)
}

console.log('BASE', BASE)

await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 120000 })
await waitSettled(3500)
await shot('01-landing-hero')

await page.evaluate(() => window.scrollTo({ top: 720, behavior: 'instant' }))
await page.waitForTimeout(900)
await shot('02-landing-featured')

await page.goto(`${BASE}/#/queue`, { waitUntil: 'domcontentloaded', timeout: 120000 })
await waitSettled(4500)
await page.waitForSelector('.row', { timeout: 90000 }).catch(() => {})
await shot('03-queue-map')

await page.goto(`${BASE}/#/queue/${CURRIMAO_ID}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
await waitSettled(4500)
await shot('04-evidence-currimao')

// Prefer map / satellite control if present
const sat = page.locator('.segmented button').nth(1)
if (await sat.count()) {
  await sat.click().catch(() => {})
  await page.waitForTimeout(1800)
  await shot('05-evidence-satellite', 0, { type: 'jpeg', quality: 82 })
}

await page.goto(`${BASE}/#/method`, { waitUntil: 'domcontentloaded', timeout: 120000 })
await waitSettled(2500)
await shot('06-method')

await browser.close()
console.log('done →', out)
