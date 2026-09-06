/// <reference lib="dom" />

import { expect, test } from '@playwright/test'
import type { Page, Response } from '@playwright/test'

const FIRST_QUESTION = 'What is the difference between supervised and unsupervised learning?'
const PROGRESS_SCRIPT = /\/assets\/ProgressView-[^/]+\.js$/
const PROGRESS_STYLES = /\/assets\/ProgressView-[^/]+\.css$/
const CONTENT_TYPES: Record<string, RegExp> = {
  document: /^text\/html(?:;|$)/i,
  stylesheet: /^text\/css(?:;|$)/i,
  script: /^(?:text|application)\/(?:javascript|ecmascript)(?:;|$)/i,
  font: /^font\/woff2(?:;|$)/i,
}

function expectDocument(response: Response | null, mount: URL): void {
  if (!response) throw new Error(`No document response for ${mount.href}`)
  expect(response.url()).toBe(mount.href)
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toMatch(CONTENT_TYPES.document)
}

async function expectStudyReady(page: Page, mount: URL): Promise<void> {
  await expect(page).toHaveURL(mount.href)
  await expect(page).toHaveTitle('Study space · Concept Grove')
  const heading = page.getByRole('heading', { level: 1, name: 'A little focus. A lot of progress.', exact: true })
  await expect(heading).toBeVisible()
  await expect(page.getByRole('article', { name: 'Current flashcard', exact: true })
    .getByRole('heading', { level: 3 })).toHaveText(FIRST_QUESTION)
  await expect(page.getByRole('region', { name: 'Your study overview', exact: true })
    .getByText('600 original cards', { exact: true })).toBeVisible()

  const logoURL = new URL('grove.svg', mount).href
  await expect(page.locator('link[rel="icon"]')).toHaveJSProperty('href', logoURL)
  const logo = page.getByRole('button', { name: 'Concept Grove home', exact: true }).locator('img')
  await expect(logo).toBeVisible()
  await expect(logo).toHaveJSProperty('currentSrc', logoURL)
  await expect(logo).toHaveJSProperty('complete', true)
  await expect.poll(() => logo.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)

  // fonts.ready alone also resolves after font failures; require both actual faces.
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready
    const loadedFonts: Array<{ family: string; status: string }> = []
    document.fonts.forEach((font) => {
      loadedFonts.push({ family: font.family.replace(/["']/g, ''), status: font.status })
    })
    return loadedFonts
  })
  expect(fonts).toEqual(expect.arrayContaining([
    { family: 'DM Sans Variable', status: 'loaded' },
    { family: 'Manrope Variable', status: 'loaded' },
  ]))
  await expect(page.locator('body')).toHaveCSS('font-family', /DM Sans Variable/)
  await expect(heading).toHaveCSS('font-family', /Manrope Variable/)
}

// One scenario runs in each Pages project: two independent production subpaths.
test('relative production assets, library filters, reload, and lazy progress work below the Pages mount', async ({ page, baseURL }, testInfo) => {
  if (!baseURL) throw new Error('A Pages preview baseURL must be configured.')
  const mount = new URL(baseURL)
  expect(mount.pathname).not.toBe('/')
  expect(mount.pathname.endsWith('/')).toBe(true)
  const issues: string[] = []
  const requests: string[] = []
  const resources: Array<{ url: string; status: number; type: string; contentType: string }> = []

  // Observe real requests without routing, rewriting, aborting, or mocking them.
  page.on('request', (request) => {
    const url = new URL(request.url())
    requests.push(url.href)
    if (url.origin !== mount.origin) issues.push(`External request: ${url.href}`)
    else if (!url.pathname.startsWith(mount.pathname)) issues.push(`Request escaped ${mount.pathname}: ${url.href}`)
  })
  page.on('requestfailed', (request) => {
    issues.push(`Request failed: ${request.url()} (${request.failure()?.errorText ?? 'unknown error'})`)
  })
  page.on('pageerror', (error) => { issues.push(`Page error: ${error.message}`) })
  page.on('console', (message) => { issues.push(`Console ${message.type()}: ${message.text()}`) })
  page.on('response', (response) => {
    const resource = {
      url: response.url(),
      status: response.status(),
      type: response.request().resourceType(),
      contentType: response.headers()['content-type'] ?? '',
    }
    const cached = resources.find((previous) => previous.url === resource.url && previous.status === 200)
    resources.push(resource)
    // Reload can revalidate a previously checked body with 304 and no MIME header.
    // Only accept that response if this test already observed its successful load.
    if (resource.status === 304 && cached) return
    if (resource.status !== 200) issues.push(`HTTP ${resource.status}: ${resource.url}`)
    const expectedType = new URL(resource.url).pathname.endsWith('.svg')
      ? /^image\/svg\+xml(?:;|$)/i
      : CONTENT_TYPES[resource.type]
    // A fallback HTML page with status 200 is not a successfully loaded asset.
    if (expectedType && !expectedType.test(resource.contentType)) {
      issues.push(`Unexpected MIME ${resource.contentType}: ${resource.url}`)
    }
  })

  try {
    expectDocument(await page.goto('./'), mount)
    await expectStudyReady(page, mount)

    const navigation = page.getByRole('navigation', { name: 'Main navigation', exact: true })
    await navigation.getByRole('button', { name: 'Card library', exact: true }).click()
    await expect(page).toHaveTitle('Card library · Concept Grove')
    const library = page.getByRole('region', { name: 'Flashcard library', exact: true })
    await expect(library.getByRole('heading', { level: 2 })).toHaveText('600 cards')
    await expect(library.getByRole('article')).toHaveCount(12)
    await library.getByRole('group', { name: 'Filter by subject', exact: true })
      .getByRole('button', { name: 'Machine Learning', exact: true }).click()
    await expect(library.getByRole('heading', { level: 2 })).toHaveText('200 cards')

    const topic = library.getByRole('combobox', { name: 'Topic', exact: true })
    await topic.click()
    // Radix portals its listbox outside the library region.
    const options = page.getByRole('listbox')
    await expect(options).toBeVisible()
    await options.getByRole('option', { name: 'Learning Foundations', exact: true }).click()
    await expect(options).toHaveCount(0)
    await expect(topic).toHaveText('Learning Foundations')
    await expect(library.getByRole('heading', { level: 2 })).toHaveText('20 cards')
    await expect(library.getByRole('article')).toHaveCount(12)
    await expect(library.getByRole('article').first().getByRole('heading', { level: 3 })).toHaveText(FIRST_QUESTION)

    // The app has no router: reload the same subpath and recover the study view.
    expectDocument(await page.reload(), mount)
    await expectStudyReady(page, mount)
    expect(requests.filter((url) => PROGRESS_SCRIPT.test(new URL(url).pathname)
      || PROGRESS_STYLES.test(new URL(url).pathname)), 'Progress assets must remain lazy').toEqual([])

    const [script, styles] = await Promise.all([
      page.waitForResponse((response) => PROGRESS_SCRIPT.test(new URL(response.url()).pathname)),
      page.waitForResponse((response) => PROGRESS_STYLES.test(new URL(response.url()).pathname)),
      navigation.getByRole('button', { name: 'My progress', exact: true }).click(),
    ])
    expect(script.status()).toBe(200)
    expect(script.headers()['content-type']).toMatch(CONTENT_TYPES.script)
    expect(styles.status()).toBe(200)
    expect(styles.headers()['content-type']).toMatch(CONTENT_TYPES.stylesheet)
    for (const asset of [script, styles]) {
      expect(new URL(asset.url()).pathname.startsWith(`${mount.pathname}assets/`)).toBe(true)
    }
    await expect(page).toHaveURL(mount.href)
    await expect(page).toHaveTitle('My progress · Concept Grove')
    await expect(page.getByRole('heading', { level: 2, name: 'Your first review starts your story.', exact: true })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Daily activity', exact: true })).toBeVisible()
    await expect(page.locator('.progress-main-grid')).toHaveCSS('display', 'grid')

    // Require each asset class so an empty network audit cannot pass vacuously.
    expect(resources.map((resource) => resource.type)).toEqual(expect.arrayContaining([
      'document', 'script', 'stylesheet', 'font', 'image',
    ]))
    const fontURLs = new Set(resources.filter((resource) => resource.type === 'font').map((resource) => resource.url))
    expect(fontURLs.size).toBeGreaterThanOrEqual(2)
    const logo = resources.find((resource) => resource.url === new URL('grove.svg', mount).href)
    expect(logo?.status).toBe(200)
    expect(logo?.contentType).toMatch(/^image\/svg\+xml(?:;|$)/i)
  } finally {
    await testInfo.attach('pages-asset-audit', {
      body: JSON.stringify({ mount: mount.href, requests, resources, issues }, null, 2),
      contentType: 'application/json',
    })
    expect.soft(issues, 'No failed, external, out-of-mount, wrong-MIME, or noisy production requests').toEqual([])
  }
})