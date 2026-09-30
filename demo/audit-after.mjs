import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const out = path.join(__dirname, 'audit')
const BASE = process.env.GT_URL || 'https://groundtruth-ph.vercel.app'

await mkdir(out, { recursive: true })
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })

const notes = []
const fails = []

async function shot(name, url, wait = 3000) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForTimeout(wait)
  await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: false })
  notes.push(`${name}: ${page.url()}`)
  console.log('saved', name)
}

await shot('11-brief-after', `${BASE}/`, 5000)

const wordmark = await page.locator('.wordmark-text').first().textContent()
notes.push(`wordmark: ${wordmark}`)
if (!wordmark?.includes('GroundTruth')) fails.push('missing wordmark')

const locators = await page.locator('.locator svg, svg.locator').count()
const land = await page.locator('.locator-land').count()
const pins = await page.locator('.locator-pin').count()
notes.push(`locators: ${locators}, land paths: ${land}, pins: ${pins}`)
if (land === 0) fails.push('no locator-land strokes')
if (pins === 0) fails.push('no locator pins on brief')

const paper = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--paper').trim())
const ink = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ink').trim())
notes.push(`tokens paper=${paper} ink=${ink}`)
if (paper.toLowerCase() !== '#ffffff' && paper !== '#fff') fails.push(`paper not white: ${paper}`)
if (!ink.toLowerCase().includes('0a0a0a') && ink !== '#000' && ink !== '#000000') fails.push(`ink not black: ${ink}`)

await shot('12-queue-after', `${BASE}/#/queue`, 7000)
const rows = await page.locator('.row').count()
notes.push(`queue rows: ${rows}`)
if (rows === 0) fails.push('queue has no rows')

const filterToggle = await page.locator('.filter-toggle').count()
notes.push(`filter toggle: ${filterToggle}`)
if (filterToggle === 0) fails.push('missing filter disclosure')

if (rows > 0) {
  await page.locator('.row').first().click()
  await page.waitForTimeout(2500)
  await page.screenshot({ path: path.join(out, '13-evidence-after.png'), fullPage: false })
  const card = await page.locator('aside.card').count()
  notes.push(`evidence cards: ${card}`)
  if (card === 0) fails.push('evidence card did not open')
  const mapCanvas = await page.locator('.maplibregl-canvas, canvas.maplibregl-canvas').count()
  notes.push(`map canvases: ${mapCanvas}`)
  if (mapCanvas === 0) fails.push('map did not load')
}

await shot('14-method-after', `${BASE}/#/method`, 2500)
const tables = await page.locator('.method-table').count()
notes.push(`method tables: ${tables}`)
if (tables === 0) fails.push('method tables missing')

const favicon = await page.evaluate(async () => {
  const link = document.querySelector('link[rel*="icon"]')
  return link?.getAttribute('href') || ''
})
notes.push(`favicon href: ${favicon}`)
if (favicon.includes('vite') || favicon.includes('favicon.ico') === false && !favicon.includes('favicon')) {
  // soft check only
}

await writeFile(path.join(out, 'notes-after.txt'), [...notes, '', fails.length ? `FAILS:\n${fails.join('\n')}` : 'PASS'].join('\n'))
await browser.close()
console.log(notes.join('\n'))
if (fails.length) {
  console.error('FAILS:\n' + fails.join('\n'))
  process.exit(1)
}
console.log('audit after-pass done - PASS')
