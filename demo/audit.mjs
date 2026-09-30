import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const out = path.join(__dirname, 'audit')
const BASE = process.env.GT_URL || 'https://groundtruth-ph.vercel.app'

await mkdir(out, { recursive: true })
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })

const notes = []
async function shot(name, url, wait = 3000) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForTimeout(wait)
  await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: false })
  notes.push(`${name}: ${page.url()}`)
  console.log('saved', name)
}

await shot('01-brief-before', `${BASE}/`, 4000)
const heroSvg = await page.locator('.locator, .figure-placeholder, .hero-figure').count()
notes.push(`hero locator/placeholder count: ${heroSvg}`)

await shot('02-queue-before', `${BASE}/#/queue`, 6000)
const rows = await page.locator('.row').count()
notes.push(`queue rows: ${rows}`)
if (rows > 0) {
  await page.locator('.row').first().click()
  await page.waitForTimeout(2000)
  await page.screenshot({ path: path.join(out, '03-evidence-before.png'), fullPage: false })
  notes.push('evidence card opened')
}

await shot('04-method-before', `${BASE}/#/method`, 2500)

await import('node:fs/promises').then((fs) => fs.writeFile(path.join(out, 'notes-before.txt'), notes.join('\n')))
await browser.close()
console.log(notes.join('\n'))
console.log('audit baseline done')
