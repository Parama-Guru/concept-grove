import { chromium, expect } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'

const url = 'https://parama-guru.github.io/concept-grove/'
const browser = await chromium.launch()
try {
  for (const width of [1440, 375]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: 'dark', reducedMotion: 'reduce' })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('response', (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`) })
    const response = await page.goto(url)
    expect(response?.status()).toBe(200)
    await expect(page).toHaveTitle('Study space · Concept Grove')
    await page.evaluate(() => document.fonts.ready)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    const card = page.getByRole('article', { name: 'Current flashcard', exact: true })
    await expect(card.getByRole('heading')).toContainText('supervised and unsupervised')
    await page.getByRole('button', { name: 'Next card', exact: true }).click()
    await page.keyboard.press('Space')
    await expect(card.locator('.card-answer')).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(card.getByRole('heading')).toContainText('features, labels, and observations')
    expect(await page.evaluate(() => localStorage.getItem('recall-studio:v1'))).toBeNull()

    const nav = page.getByRole('navigation', { name: 'Main navigation', exact: true })
    await nav.getByRole('button', { name: 'Card library', exact: true }).click()
    await page.getByRole('combobox', { name: 'Topic', exact: true }).click()
    await page.getByRole('option', { name: 'Backpropagation', exact: true }).click()
    await expect(page.getByRole('heading', { name: '20 cards', exact: true })).toBeVisible()
    await nav.getByRole('button', { name: 'My progress', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Daily activity', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    expect(accessibility.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(({ target }) => target) }))).toEqual([])

    await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click()
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    const footer = page.getByRole('contentinfo', { name: 'Project and contribution links' })
    await expect(footer.getByText('v1.0.0', { exact: true })).toBeVisible()
    await expect(footer.getByRole('link', { name: /^Star on GitHub/ })).toHaveAttribute('href', 'https://github.com/Parama-Guru/concept-grove')
    const notices = await context.request.get(new URL('THIRD_PARTY_NOTICES.txt', url).href)
    expect(notices.status()).toBe(200)
    expect(await notices.text()).toContain('SIL OPEN FONT LICENSE')
    expect(errors).toEqual([])
    console.log(`${width}px: live assets, study keys, filters, progress, theme persistence, accessibility, footer and licenses verified`)
    await context.close()
  }
} finally {
  await browser.close()
}