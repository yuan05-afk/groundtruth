/**
 * Capture calm product screenshots for the GroundTruth demo AVP.
 * Run: npx playwright install chromium && node capture.mjs
 */
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const out = path.join(__dirname, 'frames')
const BASE = process.env.GT_URL || 'http://127.0.0.1:4173'

await mkdir(out, { recursive: true })

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
})

async function shot(name, url, waitMs = 2500) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 })
  await page.waitForTimeout(waitMs)
  await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: false })
  console.log('saved', name)
}

await shot('01-brief', `${BASE}/`)
await shot('02-brief-cases', `${BASE}/`, 1200)
await page.evaluate(() => window.scrollTo({ top: 900, behavior: 'instant' }))
await page.waitForTimeout(800)
await page.screenshot({ path: path.join(out, '02-brief-cases.png'), fullPage: false })

await shot('03-queue', `${BASE}/#/queue`, 4000)

// open first flagged row if present
await page.waitForSelector('.row', { timeout: 60000 })
await page.locator('.row').first().click()
await page.waitForTimeout(2200)
await page.screenshot({ path: path.join(out, '04-evidence.png'), fullPage: false })
console.log('saved 04-evidence')

await page.locator('.segmented button').nth(1).click().catch(() => {})
await page.waitForTimeout(1500)
await page.screenshot({ path: path.join(out, '05-satellite.png'), fullPage: false })
console.log('saved 05-satellite')

await shot('06-method', `${BASE}/#/method`, 2000)

await browser.close()
console.log('done')
