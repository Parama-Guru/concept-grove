import { mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const destination = resolve(dirname(fileURLToPath(import.meta.url)), '../docs/images')
await mkdir(destination, { recursive: true })
const browser = await chromium.launch()
try {
  for (const colorScheme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1200 }, colorScheme, reducedMotion: 'reduce', deviceScaleFactor: 1 })
    const page = await context.newPage()
    await page.goto('http://127.0.0.1:5173/')
    await page.locator(`html[data-theme="${colorScheme}"]`).waitFor()
    await page.locator('.flashcard').waitFor()
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: join(destination, `${colorScheme}.png`), animations: 'disabled', fullPage: true })
    await context.close()
  }
} finally {
  await browser.close()
}
console.log('Captured fresh light and dark documentation screenshots.')