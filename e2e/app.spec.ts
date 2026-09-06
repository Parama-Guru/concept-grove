/// <reference lib="dom" />

import { Buffer } from 'node:buffer'
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test as base } from '@playwright/test'
import type { Locator, Page, TestInfo } from '@playwright/test'
import type { Rating, StudyState } from '../src/types.ts'

const STORAGE_KEY = 'recall-studio:v1'
const TODAY = '2026-09-06'
const NOW = Date.parse(`${TODAY}T12:00:00.000Z`)
const DAY_MS = 86_400_000

// Contract examples from the actual decks, not the unrelated unit-test fixtures.
// Expected UI results deliberately do not call the application's filter/scheduler.
const ML_QUESTIONS = [
  'What is the difference between supervised and unsupervised learning?',
  'How do regression and classification differ as prediction tasks?',
  'What are features, labels, and observations in a supervised dataset?',
  'Why are training, validation, and test sets assigned different roles?',
  'What evidence suggests that a model is overfitting?',
] as const
const ML_ANSWER = 'Supervised learning uses examples paired with target labels to learn a prediction rule. Unsupervised learning uses data without those target labels to discover structure, such as clusters, low-dimensional representations, or density patterns.'
const ML_TAKEAWAY = 'Supervised learning learns targets; unsupervised learning discovers unlabeled structure.'
const TOKENIZATION_ANSWER = 'Tokenization divides text into units such as words, subwords, or bytes for subsequent processing. Spaces alone cannot resolve punctuation, contractions, or languages without explicit word boundaries, and the chosen units affect vocabulary size and sequence length.'
const SUBJECTS = [
  { id: 'ml', name: 'Machine Learning', chip: 'Machine Learning', question: ML_QUESTIONS[0] },
  { id: 'dl', name: 'Deep Learning', chip: 'Deep Learning', question: 'What is backpropagation, and what does it compute in a neural network?' },
  { id: 'nlp', name: 'Natural Language Processing', chip: 'NLP', question: 'What is tokenization, and why is splitting text on spaces often insufficient?' },
] as const
const LEVELS = [
  { value: 'foundation', label: 'Foundation', question: ML_QUESTIONS[0] },
  { value: 'intermediate', label: 'Intermediate', question: 'What objective does empirical risk minimization optimize?' },
  { value: 'advanced', label: 'Advanced', question: 'With calibrated positive-class probability p, false-positive cost 3, and false-negative cost 12, when is predicting positive optimal?' },
] as const
const RATING_LABELS: Record<Rating, string> = { again: 'Again', hard: 'Hard', good: 'Good', easy: 'Easy' }
const CORRUPT_WARNING = 'Saved progress could not be read. Any original data is kept until you make a change. You can restore a backup in Preferences.'
const STORAGE_WARNING = 'Browser storage is unavailable or full. Your progress works for this visit; export a backup in Preferences to keep it.'

const test = base.extend<{ browserHealth: void }>({
  browserHealth: [async ({ page, baseURL }, runTest, testInfo) => {
    if (!baseURL) throw new Error('The preview baseURL must be configured.')
    const origin = new URL(baseURL).origin
    const errors: string[] = []
    const externalRequests: string[] = []
    const onError = (error: Error) => errors.push(error.message)
    page.on('pageerror', onError)

    // Freeze calendar time, not timers/RAF: idle loading and WebGL still run normally.
    await page.clock.setFixedTime(NOW)
    await page.route(/^https?:\/\//, async (route) => {
      const url = route.request().url()
      if (new URL(url).origin === origin) {
        await route.continue()
      } else {
        externalRequests.push(url)
        await route.abort('blockedbyclient')
      }
    })

    try {
      await runTest()
    } finally {
      page.off('pageerror', onError)
      if (errors.length || externalRequests.length) {
        await testInfo.attach('browser-health', {
          body: JSON.stringify({ errors, externalRequests }, null, 2),
          contentType: 'application/json',
        })
      }
      expect.soft(errors, 'Unhandled browser exceptions').toEqual([])
      expect.soft(externalRequests, 'The app and its fonts must load locally').toEqual([])
    }
  }, { auto: true }],
})

function emptyState(overrides: Partial<StudyState> = {}): StudyState {
  return { version: 1, progress: {}, bookmarks: [], activity: {}, dailyGoal: 20, animation: true, ...overrides }
}

function existingHistory(): StudyState {
  return emptyState({
    progress: {
      'ml-001': { reviews: 3, interval: 8, ease: 2.5, due: NOW + 8 * DAY_MS, lastReviewed: NOW, lastRating: 'good', streak: 3 },
    },
    bookmarks: ['ml-001', 'nlp-001'],
    activity: { [TODAY]: { reviews: 3, recalled: 3 } },
    dailyGoal: 35,
    animation: false,
  })
}

function mlId(index: number): string {
  // createDeck assigns one-based, three-digit IDs across each 200-card subject.
  return `ml-${String(index).padStart(3, '0')}`
}

async function seedStorage(page: Page, value: StudyState | string): Promise<void> {
  await page.addInitScript(({ key, value }) => {
    if (window.top !== window) return
    // Never re-seed an existing value on reload: that would hide persistence bugs.
    if (window.localStorage.getItem(key) === null) {
      window.localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value))
    }
  }, { key: STORAGE_KEY, value })
}

async function rawStorage(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY)
}

async function storedState(page: Page): Promise<StudyState> {
  const raw = await rawStorage(page)
  if (raw === null) throw new Error('Expected an intentional change to persist a version 1 study state.')
  const state: unknown = JSON.parse(raw)
  expect(state).toMatchObject({ version: 1 })
  return state as StudyState
}

async function fontsReady(page: Page): Promise<void> {
  await page.evaluate(async () => { await document.fonts.ready })
}

async function chooseSelect(page: Page, trigger: Locator, label: string): Promise<void> {
  await trigger.click()
  const options = page.getByRole('listbox')
  await expect(options).toBeVisible()
  await options.getByRole('option', { name: label, exact: true }).click()
  await expect(options).toHaveCount(0)
  await expect(trigger).toHaveText(label)
}

async function openApp(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'A little focus. A lot of progress.', exact: true })).toBeVisible()
  await fontsReady(page)
}

function studySpace(page: Page): Locator {
  return page.getByRole('region', { name: 'Let’s make it stick.', exact: true })
}

function flashcard(page: Page): Locator {
  return studySpace(page).getByRole('article', { name: 'Current flashcard', exact: true })
}

function question(page: Page): Locator {
  return flashcard(page).getByRole('heading', { level: 3 })
}

function modes(page: Page): Locator {
  return studySpace(page).getByRole('group', { name: 'Study mode', exact: true })
}

function library(page: Page, savedOnly = false): Locator {
  return page.getByRole('region', { name: savedOnly ? 'Saved flashcards' : 'Flashcard library', exact: true })
}

function resultHeading(panel: Locator): Locator {
  return panel.getByRole('heading', { level: 2 })
}

function pagination(panel: Locator): Locator {
  return panel.getByRole('navigation', { name: 'Library pagination', exact: true })
}

function subjectCard(page: Page, name: string): Locator {
  return page.getByRole('region', { name: 'Find your focus.', exact: true })
    .getByRole('button').filter({ has: page.getByRole('heading', { level: 3, name, exact: true }) })
}

function metric(page: Page, label: string): Locator {
  return page.locator('dl[aria-label="All-time study statistics"] .progress-stat')
    .filter({ has: page.getByText(label, { exact: true }) }).locator('.progress-stat-value')
}

async function goToView(page: Page, name: 'Study space' | 'Card library' | 'Saved cards' | 'My progress'): Promise<void> {
  const button = page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('button', { name, exact: true })
  await button.click()
  await expect(button).toHaveAttribute('aria-current', 'page')
}

async function openPreferences(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Open preferences', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Make this space yours.', exact: true })
  await expect(dialog).toBeVisible()
  return dialog
}

async function dismissNotice(page: Page): Promise<void> {
  const dismiss = page.getByRole('button', { name: 'Dismiss notification', exact: true })
  if (await dismiss.isVisible()) await dismiss.click()
}

async function revealAndRate(page: Page, rating: Rating): Promise<void> {
  await flashcard(page).getByRole('button', { name: 'Reveal answer', exact: true }).click()
  await studySpace(page).getByRole('button', { name: `Rate ${RATING_LABELS[rating]}`, exact: true }).click()
}

async function chooseBackup(page: Page, dialog: Locator, buffer: Buffer): Promise<void> {
  await expect(dialog.getByLabel('Import progress backup', { exact: true })).toHaveAttribute('type', 'file')
  const chooserPromise = page.waitForEvent('filechooser')
  await dialog.getByRole('button', { name: 'Import backup', exact: true }).click()
  const chooser = await chooserPromise
  await chooser.setFiles({ name: 'recall-studio-backup.json', mimeType: 'application/json', buffer })
}

async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  await expect.poll(() => page.evaluate(() => {
    const problems: string[] = []
    const viewport = window.innerWidth
    const pageWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)
    if (pageWidth > viewport + 1) problems.push(`document: ${pageWidth}px exceeds ${viewport}px`)
    for (const selector of ['main', '.library-panel', 'dialog[open]']) {
      for (const element of document.querySelectorAll<HTMLElement>(selector)) {
        if (!element.getClientRects().length) continue
        const bounds = element.getBoundingClientRect()
        if (element.scrollWidth > element.clientWidth + 1) {
          problems.push(`${selector}: content ${element.scrollWidth}px exceeds ${element.clientWidth}px`)
        }
        if (bounds.left < -1 || bounds.right > viewport + 1) {
          problems.push(`${selector}: bounds ${bounds.left}–${bounds.right}px escape the viewport`)
        }
      }
    }
    return problems
  }), { message: `${label}: no document or panel horizontal overflow` }).toEqual([])
}

async function expectReadableStudyText(page: Page, label: string): Promise<void> {
  const text = page.locator([
    '.page-heading > div > p:last-child', '.hero-copy > p', '.hero-actions .button',
    '.overview-card p', '.overview-card strong > span', '.subject-card h3', '.subject-card > p',
    '.subject-card-details', '.mode-tabs button', '.select-trigger', '.subject-pill',
    '.difficulty-pill', '.card-topic', '.card-question', '.card-answer', '.card-takeaway p',
    '.reveal-button', '.navigation-button', '.session-indicator', '.rating-button small',
    '.daily-goal-panel > p', '.study-tip > p:not(.eyebrow)', '.keyboard-help',
  ].join(', '))
  await expect.poll(() => text.evaluateAll((elements) => elements
    .filter((element) => element.getClientRects().length > 0)
    .flatMap((element) => {
      const size = Number.parseFloat(getComputedStyle(element).fontSize)
      return size < 12 ? [`${element.className}: ${size}px`] : []
    })), { message: `${label}: study text stays at least 12px instead of shrinking to fit` }).toEqual([])
}

async function expectAccessible(page: Page, testInfo: TestInfo, label: string): Promise<void> {
  await fontsReady(page)
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  // Keep every violation (including color contrast), but omit noisy HTML dumps.
  const violations = results.violations.map(({ id, impact, help, helpUrl, nodes }) => ({
    id, impact, help, helpUrl,
    nodes: nodes.map(({ target, failureSummary }) => ({
      target, issue: failureSummary?.replace(/\s+/g, ' ').trim(),
    })),
  }))
  if (violations.length) {
    await testInfo.attach(`accessibility-${label}`, {
      body: JSON.stringify(violations, null, 2),
      contentType: 'application/json',
    })
  }
  expect.soft(violations, `${label}: WCAG 2 A/AA and 2.1 AA`).toEqual([])
}

test.describe('Concept Grove app verification', () => {
  test('initial dashboard has 600 cards, three 200-card decks, and no reduced-motion 3D load', async ({ page }) => {
    const threeRequests: string[] = []
    const threeResource = /ambientScene|(?:^|[/_.-])three(?:[/_.-]|$)/i
    page.on('request', (request) => {
      if (threeResource.test(new URL(request.url()).pathname)) threeRequests.push(request.url())
    })
    await openApp(page)

    await expect(page).toHaveTitle('Study space · Concept Grove')
    const overview = page.getByRole('region', { name: 'Your study overview', exact: true })
    await expect(overview.getByText('600 original cards', { exact: true })).toBeVisible()
    for (const subject of SUBJECTS) {
      const deck = subjectCard(page, subject.name)
      await expect(deck).toBeVisible()
      await expect(deck.getByText('200 cards', { exact: true })).toBeVisible()
      await expect(deck).toHaveAttribute('aria-pressed', String(subject.id === 'ml'))
    }
    await expect(question(page)).toHaveText(ML_QUESTIONS[0])
    await expect(flashcard(page).getByText('01 / 200', { exact: true })).toBeVisible()
    await expect(modes(page).getByRole('button', { name: 'Due 200', exact: true })).toBeVisible()
    await expect(studySpace(page).getByRole('button', { name: 'Previous card', exact: true })).toBeDisabled()
    await expect(page.getByRole('img', { name: '0 of 20 daily reviews complete', exact: true })).toBeVisible()
    const week = page.getByRole('group', { name: 'Study activity this week', exact: true })
    await expect(week.getByRole('img')).toHaveCount(7)
    for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
      await expect(week.getByRole('img', { name: `${day}: 0 reviews`, exact: true })).toBeVisible()
    }
    expect(await rawStorage(page)).toBeNull()

    expect(await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
    // Give the component's idle-loading policy an opportunity to run, without sleeping.
    await page.evaluate(() => new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        window.requestIdleCallback(() => resolve(), { timeout: 1200 })
      }))
    }))
    const resources = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name))
    expect(threeRequests).toEqual([])
    expect(resources.filter((url) => threeResource.test(new URL(url).pathname))).toEqual([])
    await expect(page.locator('canvas')).toHaveCount(0)
    await expect(page.locator('.ambient-artwork .artwork-fallback')).toHaveCSS('opacity', '1')
  })

  test('revealing, rating, advancing, and bookmarking survive a reload', async ({ page }) => {
    await openApp(page)
    await flashcard(page).getByRole('button', { name: 'Reveal answer', exact: true }).click()
    await expect(flashcard(page).getByText(ML_ANSWER, { exact: true })).toBeVisible()
    await expect(flashcard(page).getByText(ML_TAKEAWAY, { exact: true })).toBeVisible()
    await flashcard(page).getByRole('button', { name: 'Back to question', exact: true }).click()
    await expect(flashcard(page).getByText(ML_ANSWER, { exact: true })).toHaveCount(0)
    await revealAndRate(page, 'good')
    await expect(question(page)).toHaveText(ML_QUESTIONS[1])
    await expect(studySpace(page).locator('.session-indicator')).toHaveText('1 of 200 reviewed')
    await flashcard(page).getByRole('button', { name: 'Save current card', exact: true }).click()
    await dismissNotice(page)

    const expected = emptyState({
      progress: { 'ml-001': { reviews: 1, interval: 1, ease: 2.5, due: NOW + DAY_MS, lastReviewed: NOW, lastRating: 'good', streak: 1 } },
      bookmarks: ['ml-002'],
      activity: { [TODAY]: { reviews: 1, recalled: 1 } },
    })
    expect(await storedState(page)).toEqual(expected)
    await page.reload()
    await expect(question(page)).toHaveText(ML_QUESTIONS[0])
    await expect(page.getByRole('img', { name: '1 of 20 daily reviews complete', exact: true })).toBeVisible()
    await expect(page.getByRole('group', { name: 'Study activity this week' }).getByRole('img', { name: 'Sun: 1 reviews', exact: true })).toBeVisible()
    await studySpace(page).getByRole('button', { name: 'Next card', exact: true }).click()
    await expect(question(page)).toHaveText(ML_QUESTIONS[1])
    await expect(flashcard(page).getByRole('button', { name: 'Unsave current card', exact: true })).toHaveAttribute('aria-pressed', 'true')
    expect(await storedState(page)).toEqual(expected)
  })

  test('the 600-card due queue is a snapshot and never skips the next reviewed neighbor', async ({ page }) => {
    await openApp(page)
    await chooseSelect(page, studySpace(page).getByRole('combobox', { name: 'Study subject', exact: true }), 'All subjects')
    await modes(page).getByRole('button', { name: 'Due 600', exact: true }).click()
    await expect(question(page)).toHaveText(ML_QUESTIONS[0])
    await revealAndRate(page, 'good')
    await expect(question(page)).toHaveText(ML_QUESTIONS[1])
    await expect(flashcard(page).getByText('02 / 600', { exact: true })).toBeVisible()
    await expect(modes(page).getByRole('button', { name: 'Due 599', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await revealAndRate(page, 'easy')
    await expect(question(page)).toHaveText(ML_QUESTIONS[2])
    await expect(flashcard(page).getByText('03 / 600', { exact: true })).toBeVisible()
    await expect(studySpace(page).locator('.session-indicator')).toHaveText('2 of 600 reviewed')
    await expect(modes(page).getByRole('button', { name: 'Due 598', exact: true })).toBeVisible()

    await studySpace(page).getByRole('button', { name: 'Previous card', exact: true }).click()
    await expect(question(page)).toHaveText(ML_QUESTIONS[1])
    await flashcard(page).getByRole('button', { name: 'Reveal answer', exact: true }).click()
    await expect(studySpace(page).getByRole('button', { name: /^Rate / })).toHaveCount(0)
    await expect(studySpace(page).getByText('Already reviewed here. Come back when this card is due.', { exact: true })).toBeVisible()
    await chooseSelect(page, studySpace(page).getByRole('combobox', { name: 'Study subject', exact: true }), 'Machine Learning')
    await expect(question(page)).toHaveText(ML_QUESTIONS[2])
    await expect(flashcard(page).getByText('01 / 198', { exact: true })).toBeVisible()
    expect(Object.keys((await storedState(page)).progress)).toEqual(['ml-001', 'ml-002'])
  })

  test('each subject card selects its own first question and 200-card deck', async ({ page }) => {
    await openApp(page)
    for (const subject of [SUBJECTS[1], SUBJECTS[2], SUBJECTS[0]]) {
      await subjectCard(page, subject.name).click()
      await expect(subjectCard(page, subject.name)).toHaveAttribute('aria-pressed', 'true')
      await expect(studySpace(page).getByRole('combobox', { name: 'Study subject', exact: true })).toHaveAttribute('data-value', subject.id)
      await expect(question(page)).toHaveText(subject.question)
      await expect(flashcard(page).getByText(subject.name, { exact: true })).toBeVisible()
      await expect(flashcard(page).getByText('01 / 200', { exact: true })).toBeVisible()
      await expect(modes(page).getByRole('button', { name: 'All cards', exact: true })).toHaveAttribute('aria-pressed', 'true')
    }
  })

  test('difficulty filters change actual study questions and library results', async ({ page }) => {
    await openApp(page)
    const difficulty = studySpace(page).getByRole('combobox', { name: 'Study difficulty', exact: true })
    for (const level of LEVELS) {
      await chooseSelect(page, difficulty, level.label)
      await expect(question(page)).toHaveText(level.question)
      await expect(flashcard(page).getByText(level.label, { exact: true })).toBeVisible()
    }
    await chooseSelect(page, difficulty, 'All levels')
    await expect(question(page)).toHaveText(ML_QUESTIONS[0])
    await expect(flashcard(page).getByText('01 / 200', { exact: true })).toBeVisible()

    await goToView(page, 'Card library')
    const panel = library(page)
    await panel.getByRole('group', { name: 'Filter by subject', exact: true }).getByRole('button', { name: 'Machine Learning', exact: true }).click()
    await chooseSelect(page, panel.getByRole('combobox', { name: 'Difficulty', exact: true }), 'Advanced')
    await expect(panel.getByRole('article').first().getByRole('heading', { level: 3 })).toHaveText(LEVELS[2].question)
    const badges = panel.locator('.library-difficulty')
    expect(await badges.count()).toBeGreaterThan(0)
    await expect(badges).toHaveText(Array<string>(await badges.count()).fill('Advanced'))
  })

  test('bookmarks add and remove in study and saved views, including the empty saved queue', async ({ page }) => {
    await openApp(page)
    await expect(flashcard(page).getByRole('button', { name: 'Save current card', exact: true })).toHaveAttribute('aria-pressed', 'false')
    await flashcard(page).getByRole('button', { name: 'Save current card', exact: true }).click()
    await expect(flashcard(page).getByRole('button', { name: 'Unsave current card', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await dismissNotice(page)
    await flashcard(page).getByRole('button', { name: 'Unsave current card', exact: true }).click()
    await expect(flashcard(page).getByRole('button', { name: 'Save current card', exact: true })).toHaveAttribute('aria-pressed', 'false')
    expect((await storedState(page)).bookmarks).toEqual([])
    await dismissNotice(page)
    await flashcard(page).getByRole('button', { name: 'Save current card', exact: true }).click()
    await dismissNotice(page)
    await modes(page).getByRole('button', { name: 'Saved 1', exact: true }).click()
    await expect(flashcard(page).getByText('01 / 1', { exact: true })).toBeVisible()

    await goToView(page, 'Saved cards')
    const panel = library(page, true)
    await expect(resultHeading(panel)).toHaveText('1 saved card')
    await panel.getByRole('article', { name: ML_QUESTIONS[0], exact: true }).getByRole('button', { name: 'Unsave card', exact: true }).click()
    await dismissNotice(page)
    await expect(resultHeading(panel)).toHaveText('0 saved cards')
    await expect(panel.getByRole('heading', { name: 'Keep your lightbulb moments.', exact: true })).toBeVisible()
    await expect(panel.getByRole('article')).toHaveCount(0)
    await expect(pagination(panel)).toHaveCount(0)
    expect((await storedState(page)).bookmarks).toEqual([])
    await goToView(page, 'Study space')
    await expect(studySpace(page).getByRole('heading', { name: 'Your favorites start here.', exact: true })).toBeVisible()
    await studySpace(page).getByRole('button', { name: 'Explore all cards', exact: true }).click()
    await expect(question(page)).toHaveText(ML_QUESTIONS[0])
  })

  test('the library reports 600 total, 200 per subject, and nonempty tokenization search results', async ({ page }) => {
    await openApp(page)
    await goToView(page, 'Card library')
    const panel = library(page)
    const subjects = panel.getByRole('group', { name: 'Filter by subject', exact: true })
    await expect(resultHeading(panel)).toHaveText('600 cards')
    await expect(panel.getByRole('article')).toHaveCount(12)
    for (const subject of SUBJECTS) {
      const chip = subjects.getByRole('button', { name: subject.chip, exact: true })
      await chip.click()
      await expect(chip).toHaveAttribute('aria-pressed', 'true')
      await expect(resultHeading(panel)).toHaveText('200 cards')
      await expect(panel.locator('.library-card-subject')).toHaveText(Array<string>(12).fill(subject.name))
    }
    await subjects.getByRole('button', { name: 'All subjects', exact: true }).click()
    await expect(resultHeading(panel)).toHaveText('600 cards')
    await panel.getByRole('searchbox', { name: 'Search cards', exact: true }).fill('  ToKeNiZaTiOn  ')
    await expect(panel.getByRole('article').first()).toContainText(/tokenization/i)
    await expect(resultHeading(panel)).toHaveText(/^[1-9]\d* cards$/)
    await expect(panel.locator('#library-results')).toHaveAttribute('aria-busy', 'false')
    const matches = await panel.getByRole('article').allTextContents()
    expect(matches.length, 'Search must not pass vacuously with zero cards').toBeGreaterThan(0)
    for (const match of matches) expect(match.toLowerCase()).toContain('tokenization')
  })

  test('no-match search, clear search, and clear filters restore usable results and focus', async ({ page }) => {
    await openApp(page)
    await page.getByRole('button', { name: 'Find a card', exact: true }).click()
    const panel = library(page)
    const search = panel.getByRole('searchbox', { name: 'Search cards', exact: true })
    await expect(search).toBeFocused()
    await search.fill('zzzz-no-such-recall-card-982734')
    await expect(resultHeading(panel)).toHaveText('0 cards')
    await expect(panel.getByRole('heading', { name: 'No cards found', exact: true })).toBeVisible()
    await expect(panel.getByRole('article')).toHaveCount(0)
    await panel.getByRole('button', { name: 'Clear search', exact: true }).click()
    await expect(search).toBeFocused()
    await expect(search).toHaveValue('')
    await expect(resultHeading(panel)).toHaveText('600 cards')

    await panel.getByRole('group', { name: 'Filter by subject', exact: true }).getByRole('button', { name: 'NLP', exact: true }).click()
    await chooseSelect(page, panel.getByRole('combobox', { name: 'Difficulty', exact: true }), 'Advanced')
    await chooseSelect(page, panel.getByRole('combobox', { name: 'Topic', exact: true }), 'Text Preprocessing')
    await search.fill('zzzz-no-such-recall-card-982734')
    await expect(resultHeading(panel)).toHaveText('0 cards')
    // There are two "Clear filters" buttons in the empty state; target the toolbar.
    await panel.locator('.library-filter-controls').getByRole('button', { name: 'Clear filters', exact: true }).click()
    await expect(search).toBeFocused()
    await expect(search).toHaveValue('')
    await expect(panel.getByRole('combobox', { name: 'Difficulty', exact: true })).toHaveText('All levels')
    await expect(panel.getByRole('combobox', { name: 'Topic', exact: true })).toHaveText('All topics')
    await expect(panel.getByRole('group', { name: 'Filter by subject', exact: true }).getByRole('button', { name: 'All subjects', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(resultHeading(panel)).toHaveText('600 cards')
    await expect(panel.locator('#library-result-range')).toHaveText('Showing 1–12 of 600')
  })

  test('pagination shows 12 cards, distinct next-page results, and a correctly bounded partial last page', async ({ page }) => {
    await openApp(page)
    await goToView(page, 'Card library')
    const panel = library(page)
    const pages = pagination(panel)
    await expect(pages.locator('.library-page-indicator')).toHaveText('Page 1 of 50')
    await expect(pages.getByRole('button', { name: 'Previous page', exact: true })).toBeDisabled()
    const firstPage = await panel.getByRole('article').getByRole('heading', { level: 3 }).allTextContents()
    expect(firstPage).toHaveLength(12)
    await pages.getByRole('button', { name: 'Next page', exact: true }).click()
    await expect(panel.locator('#library-result-range')).toHaveText('Showing 13–24 of 600')
    await expect(pages.locator('.library-page-indicator')).toHaveText('Page 2 of 50')
    await expect(resultHeading(panel)).toBeFocused()
    const secondPage = await panel.getByRole('article').getByRole('heading', { level: 3 }).allTextContents()
    expect(secondPage).toHaveLength(12)
    expect(secondPage.filter((text) => firstPage.includes(text))).toEqual([])

    // A real 20-card topic exercises the partial final page without 49 Next clicks.
    await panel.getByRole('group', { name: 'Filter by subject', exact: true }).getByRole('button', { name: 'Machine Learning', exact: true }).click()
    await chooseSelect(page, panel.getByRole('combobox', { name: 'Topic', exact: true }), 'Learning Foundations')
    await expect(resultHeading(panel)).toHaveText('20 cards')
    await expect(pages.locator('.library-page-indicator')).toHaveText('Page 1 of 2')
    await expect(panel.getByRole('article')).toHaveCount(12)
    await pages.getByRole('button', { name: 'Next page', exact: true }).click()
    await expect(panel.locator('#library-result-range')).toHaveText('Showing 13–20 of 20')
    await expect(panel.getByRole('article')).toHaveCount(8)
    await expect(pages.locator('.library-page-indicator')).toHaveText('Page 2 of 2')
    await expect(panel.getByRole('article').last().getByRole('heading', { level: 3 })).toHaveAttribute('id', 'library-question-ml-020')
    await expect(pages.getByRole('button', { name: 'Next page', exact: true })).toBeDisabled()
    await pages.getByRole('button', { name: 'Previous page', exact: true }).click()
    await expect(panel.locator('#library-result-range')).toHaveText('Showing 1–12 of 20')
    await expect(pages.getByRole('button', { name: 'Previous page', exact: true })).toBeDisabled()
  })

  test('native answer details toggle and Study card opens the selected non-first question', async ({ page }) => {
    await openApp(page)
    await goToView(page, 'Card library')
    const panel = library(page)
    await panel.getByRole('group', { name: 'Filter by subject', exact: true }).getByRole('button', { name: 'NLP', exact: true }).click()
    const item = panel.getByRole('article', { name: SUBJECTS[2].question, exact: true })
    const details = item.locator('details')
    const summary = details.locator('summary').filter({ hasText: 'Peek at answer' })
    await expect(details).toHaveJSProperty('open', false)
    await expect(details.getByText(TOKENIZATION_ANSWER, { exact: true })).toBeHidden()
    await summary.click()
    await expect(details).toHaveJSProperty('open', true)
    await expect(details.getByText(TOKENIZATION_ANSWER, { exact: true })).toBeVisible()
    await expect(details.getByText('Token boundaries are modeling choices, not simply spaces.', { exact: true })).toBeVisible()
    await summary.press('Enter')
    await expect(details).toHaveJSProperty('open', false)

    const selectedQuestion = 'How does lemmatization differ from stemming?'
    await panel.getByRole('article', { name: selectedQuestion, exact: true }).getByRole('button', { name: 'Study card', exact: true }).click()
    await expect(question(page)).toHaveText(selectedQuestion)
    await expect(studySpace(page).getByRole('combobox', { name: 'Study subject', exact: true })).toHaveText('NLP')
    await expect(flashcard(page).getByText('02 / 200', { exact: true })).toBeVisible()
    await expect(flashcard(page).getByRole('button', { name: 'Reveal answer', exact: true })).toBeVisible()
    await studySpace(page).getByRole('button', { name: 'Previous card', exact: true }).click()
    await expect(question(page)).toHaveText(SUBJECTS[2].question)
  })

  test('removing the only card on a saved final page clamps 13 bookmarks to page one', async ({ page }) => {
    const bookmarks = Array.from({ length: 13 }, (_, index) => mlId(index + 1))
    await seedStorage(page, emptyState({ bookmarks }))
    await openApp(page)
    await goToView(page, 'Saved cards')
    const panel = library(page, true)
    await expect(resultHeading(panel)).toHaveText('13 saved cards')
    await pagination(panel).getByRole('button', { name: 'Next page', exact: true }).click()
    await expect(panel.locator('#library-result-range')).toHaveText('Showing 13–13 of 13')
    await expect(panel.getByRole('article')).toHaveCount(1)
    await expect(panel.getByRole('article').getByRole('heading', { level: 3 })).toHaveAttribute('id', 'library-question-ml-013')
    await panel.getByRole('article').getByRole('button', { name: 'Unsave card', exact: true }).click()
    await expect(resultHeading(panel)).toHaveText('12 saved cards')
    await expect(resultHeading(panel)).toBeFocused()
    await expect(panel.locator('#library-result-range')).toHaveText('Showing 1–12 of 12')
    await expect(panel.getByRole('article')).toHaveCount(12)
    await expect(pagination(panel).locator('.library-page-indicator')).toHaveText('Page 1 of 1')
    await expect(pagination(panel).getByRole('button', { name: 'Next page', exact: true })).toBeDisabled()
    await expect(pagination(panel).getByRole('button', { name: 'Previous page', exact: true })).toBeDisabled()
    expect((await storedState(page)).bookmarks).toEqual(bookmarks.slice(0, 12))
    await page.reload()
    await goToView(page, 'Saved cards')
    await expect(resultHeading(panel)).toHaveText('12 saved cards')
    await expect(pagination(panel).locator('.library-page-indicator')).toHaveText('Page 1 of 1')
  })

  test('a mixed quick session reviews exactly 20 distinct cards and completes', async ({ page }) => {
    await openApp(page)
    await page.getByRole('button', { name: 'Start a quick session', exact: true }).click()
    await expect(studySpace(page).getByRole('combobox', { name: 'Study subject', exact: true })).toHaveText('All subjects')
    await expect(modes(page).getByRole('button', { name: 'Due 600', exact: true })).toHaveAttribute('aria-pressed', 'true')
    const seen = new Set<string>()
    for (let index = 0; index < 20; index += 1) {
      await expect(studySpace(page).locator('.session-indicator')).toHaveText(`${index} of 20 reviewed · Quick session`)
      await expect(flashcard(page).getByText(`${String(index + 1).padStart(2, '0')} / 20`, { exact: true })).toBeVisible()
      const text = await question(page).innerText()
      expect(seen.has(text), `Quick session repeated question ${index + 1}: ${text}`).toBe(false)
      seen.add(text)
      await revealAndRate(page, 'good')
    }
    await expect(studySpace(page).getByRole('heading', { name: 'A little more connected.', exact: true })).toBeVisible()
    await expect(studySpace(page).locator('.session-complete').getByText('20 cards', { exact: true })).toBeVisible()
    await expect(flashcard(page)).toHaveCount(0)
    await expect(page.getByRole('img', { name: '20 of 20 daily reviews complete', exact: true })).toBeVisible()
    const state = await storedState(page)
    expect(Object.keys(state.progress)).toHaveLength(20)
    expect(state.activity[TODAY]).toEqual({ reviews: 20, recalled: 20 })
    expect(Object.values(state.progress).every((entry) => entry.reviews === 1 && entry.lastRating === 'good')).toBe(true)
    await studySpace(page).getByRole('button', { name: 'Start another session', exact: true }).click()
    await expect(studySpace(page).locator('.session-indicator')).toHaveText('0 of 20 reviewed · Quick session')
    await expect(modes(page).getByRole('button', { name: 'Due 580', exact: true })).toBeVisible()
    expect(seen.has(await question(page).innerText())).toBe(false)
  })

  test('Space, B, arrows, and ratings 1–4 work without hijacking focused controls or inputs', async ({ page }) => {
    await openApp(page)
    await page.getByRole('main').focus()
    await page.keyboard.press('1')
    expect(await rawStorage(page)).toBeNull()
    await page.keyboard.press('Space')
    await expect(flashcard(page).getByText(ML_ANSWER, { exact: true })).toBeVisible()
    await page.keyboard.press('Space')
    await expect(flashcard(page).getByText(ML_ANSWER, { exact: true })).toBeVisible()
    await page.keyboard.press('b')
    await expect(flashcard(page).getByRole('button', { name: 'Unsave current card', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.press('B')
    await expect(flashcard(page).getByRole('button', { name: 'Save current card', exact: true })).toHaveAttribute('aria-pressed', 'false')
    await page.keyboard.press('ArrowRight')
    await expect(question(page)).toHaveText(ML_QUESTIONS[1])
    await page.keyboard.press('ArrowLeft')
    await expect(question(page)).toHaveText(ML_QUESTIONS[0])
    await dismissNotice(page)
    await page.getByRole('main').focus()

    const ratings: Rating[] = ['again', 'hard', 'good', 'easy']
    for (const [index, rating] of ratings.entries()) {
      await expect(question(page)).toHaveText(ML_QUESTIONS[index])
      await page.keyboard.press('Space')
      await expect(studySpace(page).getByRole('button', { name: `Rate ${RATING_LABELS[rating]}`, exact: true })).toBeVisible()
      await page.keyboard.press(String(index + 1))
      await expect(question(page)).toHaveText(ML_QUESTIONS[index + 1])
      expect((await storedState(page)).progress[mlId(index + 1)]?.lastRating).toBe(rating)
    }
    const before = await storedState(page)
    expect(before.activity[TODAY]).toEqual({ reviews: 4, recalled: 2 })
    const reveal = flashcard(page).getByRole('button', { name: 'Reveal answer', exact: true })
    await reveal.focus()
    await page.keyboard.press('b')
    await page.keyboard.press('ArrowRight')
    await expect(question(page)).toHaveText(ML_QUESTIONS[4])
    await reveal.press('Space') // Native button activation, not the global study shortcut.
    const back = flashcard(page).getByRole('button', { name: 'Back to question', exact: true })
    await back.focus()
    await page.keyboard.press('4')
    await page.keyboard.press('ArrowLeft')
    await expect(question(page)).toHaveText(ML_QUESTIONS[4])
    expect(await storedState(page)).toEqual(before)
    await back.press('Space')
    await expect(reveal).toBeVisible()

    const dialog = await openPreferences(page)
    const goal = dialog.getByRole('spinbutton', { name: 'Daily goal', exact: true })
    await goal.fill('')
    await goal.pressSequentially('14')
    await goal.press('ArrowLeft')
    await expect(goal).toHaveValue('14')
    expect(await storedState(page)).toEqual(before)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(question(page)).toHaveText(ML_QUESTIONS[4])
    await expect(page.getByRole('button', { name: 'Open preferences', exact: true })).toBeFocused()
    await page.getByRole('main').focus()
    await page.keyboard.press('/')
    const search = library(page).getByRole('searchbox', { name: 'Search cards', exact: true })
    await expect(search).toBeFocused()
    await search.fill('tokenization')
    await search.press('/')
    await expect(search).toHaveValue('tokenization/')
    expect(await storedState(page)).toEqual(before)
  })

  test('preferences enforce integer goals from 10 to 100 and persist both boundaries', async ({ page }) => {
    await openApp(page)
    let dialog = await openPreferences(page)
    const goal = dialog.getByRole('spinbutton', { name: 'Daily goal', exact: true })
    await expect(goal).toHaveAttribute('min', '10')
    await expect(goal).toHaveAttribute('max', '100')
    for (const invalid of ['9', '101', '10.5']) {
      await goal.fill(invalid)
      await dialog.getByRole('button', { name: 'Save preferences', exact: true }).click()
      await expect(dialog).toBeVisible()
      expect(await goal.evaluate((input: HTMLInputElement) => input.validity.valid)).toBe(false)
      expect(await rawStorage(page)).toBeNull()
    }
    for (const value of [10, 100]) {
      await dialog.getByRole('spinbutton', { name: 'Daily goal', exact: true }).fill(String(value))
      await dialog.getByRole('button', { name: 'Save preferences', exact: true }).click()
      await expect(dialog).toHaveCount(0)
      await expect(page.getByRole('img', { name: `0 of ${value} daily reviews complete`, exact: true })).toBeVisible()
      expect((await storedState(page)).dailyGoal).toBe(value)
      await page.reload()
      dialog = await openPreferences(page)
      await expect(dialog.getByRole('spinbutton', { name: 'Daily goal', exact: true })).toHaveValue(String(value))
    }
    await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click()
  })

  test('mouse study actions hand Space and Tab back to the card without repeating or rating', async ({ page }) => {
    await openApp(page)
    await studySpace(page).getByRole('button', { name: 'Next card', exact: true }).click()
    await expect(question(page)).toHaveText(ML_QUESTIONS[1])
    await expect(flashcard(page)).toBeFocused()
    await page.keyboard.press('Space')
    await expect(flashcard(page).locator('.card-answer')).toBeVisible()
    await page.keyboard.press('Space')
    await expect(flashcard(page).locator('.card-answer')).toBeVisible()
    await expect(question(page)).toHaveText(ML_QUESTIONS[1])
    expect(await rawStorage(page)).toBeNull()

    await page.keyboard.press('Tab')
    await expect(question(page)).toHaveText(ML_QUESTIONS[2])
    await expect(flashcard(page).locator('.card-answer')).toHaveCount(0)
    await page.keyboard.press('Shift+Tab')
    await expect(question(page)).toHaveText(ML_QUESTIONS[1])
    expect(await rawStorage(page)).toBeNull()
    await studySpace(page).getByRole('button', { name: 'Previous card', exact: true }).click()
    await flashcard(page).getByRole('button', { name: 'Save current card', exact: true }).click()
    await page.keyboard.press('Space')
    await expect(flashcard(page).getByText(ML_ANSWER, { exact: true })).toBeVisible()
    expect((await storedState(page)).bookmarks).toEqual(['ml-001'])

    await studySpace(page).getByRole('button', { name: 'Rate Good', exact: true }).click()
    await page.keyboard.press('Space')
    await expect(question(page)).toHaveText(ML_QUESTIONS[1])
    await expect(flashcard(page).locator('.card-answer')).toBeVisible()
    expect(Object.keys((await storedState(page)).progress)).toEqual(['ml-001'])
    expect((await storedState(page)).activity[TODAY]).toEqual({ reviews: 1, recalled: 1 })

    await page.keyboard.press('Escape')
    await expect(studySpace(page).getByRole('button', { name: 'Enable study keys', exact: true })).toHaveAttribute('aria-pressed', 'false')
    await page.keyboard.press('Tab')
    const save = flashcard(page).getByRole('button', { name: 'Save current card', exact: true })
    await expect(save).toBeFocused()
    await page.keyboard.press('Space')
    expect((await storedState(page)).bookmarks).toEqual(['ml-001', 'ml-002'])
    expect(Object.keys((await storedState(page)).progress)).toEqual(['ml-001'])
  })

  test('study mode has safe bounds, an exit control, and no composition shortcuts', async ({ page }) => {
    const original = emptyState({ bookmarks: ['ml-001'] })
    await seedStorage(page, original)
    await openApp(page)
    await modes(page).getByRole('button', { name: 'Saved 1', exact: true }).click()
    await flashcard(page).click()
    await flashcard(page).dispatchEvent('keydown', { key: ' ', code: 'Space', isComposing: true, bubbles: true, cancelable: true })
    await expect(flashcard(page).locator('.card-answer')).toHaveCount(0)
    await page.keyboard.press('Tab')
    await page.keyboard.press('Shift+Tab')
    await expect(question(page)).toHaveText(ML_QUESTIONS[0])
    await expect(flashcard(page).getByText('01 / 1', { exact: true })).toBeVisible()
    await expect(flashcard(page)).toBeFocused()
    expect(await storedState(page)).toEqual(original)
    await studySpace(page).getByRole('button', { name: 'Exit study keys', exact: true }).click()
    await expect(studySpace(page).getByRole('button', { name: 'Enable study keys', exact: true })).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(flashcard(page).getByRole('button', { name: 'Unsave current card', exact: true })).toBeFocused()
    await studySpace(page).getByRole('button', { name: 'Enable study keys', exact: true }).click()
    await expect(flashcard(page)).toBeFocused()
    await page.keyboard.press('Space')
    await expect(flashcard(page).locator('.card-answer')).toBeVisible()
    expect(await storedState(page)).toEqual(original)
  })

  test('styled topic menus scroll, support typeahead, stay in bounds, and restore focus', async ({ page }, testInfo) => {
    await openApp(page)
    await goToView(page, 'Card library')
    const panel = library(page)
    const topic = panel.getByRole('combobox', { name: 'Topic', exact: true })
    await topic.focus()
    await page.keyboard.press('Space')
    const list = page.getByRole('listbox', { name: 'Topic options', exact: true })
    await expect(list).toBeVisible()
    await expect(list.getByRole('option')).toHaveCount(31)
    await expect.poll(() => list.evaluate((element) => {
      const box = element.getBoundingClientRect()
      return box.left >= 0 && box.right <= innerWidth + 1 && box.top >= 0 && box.bottom <= innerHeight + 1 && box.height <= 361
    })).toBe(true)
    await expectAccessible(page, testInfo, 'open-topic-dropdown')
    await page.keyboard.press('End')
    await expect(list.getByRole('option', { name: 'Trees & Ensembles', exact: true })).toBeFocused()
    await page.keyboard.press('Home')
    await expect(list.getByRole('option', { name: 'All topics', exact: true })).toBeFocused()
    await page.keyboard.type('Backpropagation')
    await expect(list.getByRole('option', { name: 'Backpropagation', exact: true })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(list).toHaveCount(0)
    await expect(topic).toBeFocused()
    await expect(topic).toHaveText('Backpropagation')
    await expect(resultHeading(panel)).toHaveText('20 cards')
    await topic.click()
    await page.keyboard.press('/')
    await expect(list).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(topic).toBeFocused()
    await expect(topic).toHaveText('Backpropagation')
    await panel.getByRole('group', { name: 'Filter by subject', exact: true }).getByRole('button', { name: 'NLP', exact: true }).click()
    await expect(topic).toHaveText('All topics')
    await topic.click()
    await expect(list.getByRole('option')).toHaveCount(11)
    await expect(list.getByRole('option', { name: 'Backpropagation', exact: true })).toHaveCount(0)
    await page.keyboard.press('Escape')
    expect(await rawStorage(page)).toBeNull()
  })

  test('study dropdown keyboard input never reveals or advances a card', async ({ page }, testInfo) => {
    await openApp(page)
    const subject = studySpace(page).getByRole('combobox', { name: 'Study subject', exact: true })
    await subject.focus()
    await page.keyboard.press('Space')
    const list = page.getByRole('listbox', { name: 'Study subject options', exact: true })
    await expect(list).toBeVisible()
    await expectAccessible(page, testInfo, 'open-study-dropdown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Escape')
    await expect(subject).toBeFocused()
    await expect(question(page)).toHaveText(ML_QUESTIONS[0])
    await expect(flashcard(page).locator('.card-answer')).toHaveCount(0)
    await page.keyboard.press('Tab')
    await expect(studySpace(page).getByRole('combobox', { name: 'Study difficulty', exact: true })).toBeFocused()
    await page.keyboard.press('Space')
    const levels = page.getByRole('listbox', { name: 'Study difficulty options', exact: true })
    await expect(levels.getByRole('option', { name: 'All levels', exact: true })).toBeFocused()
    await page.keyboard.press('End')
    await expect(levels.getByRole('option', { name: 'Advanced', exact: true })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(question(page)).toHaveText(LEVELS[2].question)
    await page.keyboard.press('Space')
    await expect(flashcard(page).locator('.card-answer')).toBeVisible()
    expect(await rawStorage(page)).toBeNull()
  })

  test('invalid, unsupported, and oversized backups alert without changing original progress', async ({ page }) => {
    const original = existingHistory()
    await seedStorage(page, original)
    await openApp(page)
    const dialog = await openPreferences(page)
    const invalidBackups = [
      Buffer.from('{"version":'),
      Buffer.from(JSON.stringify({ ...original, version: 2 })),
      Buffer.alloc(2 * 1024 * 1024 + 1, ' '),
    ]
    for (const backup of invalidBackups) {
      await chooseBackup(page, dialog, backup)
      await expect(dialog.getByRole('alert')).toHaveText('This backup could not be read. Choose a valid Concept Grove or Recall Studio version 1 JSON backup, smaller than 2 MB.')
      await expect(dialog.getByLabel('Import progress backup', { exact: true })).toHaveValue('')
      await expect(dialog.getByRole('button', { name: 'Confirm import', exact: true })).toHaveCount(0)
      await expect(dialog.getByRole('spinbutton', { name: 'Daily goal', exact: true })).toHaveValue('35')
      expect(await rawStorage(page)).toBe(JSON.stringify(original))
    }
    await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click()
    await goToView(page, 'My progress')
    await expect(metric(page, 'Total reviews')).toHaveText('3')
    await goToView(page, 'Saved cards')
    await expect(resultHeading(library(page, true))).toHaveText('2 saved cards')
  })

  test('export streams valid JSON and import replaces changed state only after confirmation', async ({ page }) => {
    const original = existingHistory()
    await seedStorage(page, original)
    await openApp(page)
    let dialog = await openPreferences(page)
    const downloadPromise = page.waitForEvent('download')
    await dialog.getByRole('button', { name: 'Export backup', exact: true }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe(`concept-grove-${TODAY}.json`)
    const stream = await download.createReadStream()
    const chunks: Uint8Array[] = []
    for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    const backup = Buffer.concat(chunks)
    const exported: unknown = JSON.parse(backup.toString('utf8'))
    expect(exported).toEqual(original)
    expect(await download.failure()).toBeNull()

    await dialog.getByRole('spinbutton', { name: 'Daily goal', exact: true }).fill('100')
    await dialog.getByRole('switch', { name: /^Ambient animation\b/ }).check()
    await dialog.getByRole('button', { name: 'Save preferences', exact: true }).click()
    await dismissNotice(page)
    await flashcard(page).getByRole('button', { name: 'Unsave current card', exact: true }).click()
    await dismissNotice(page)
    await revealAndRate(page, 'again')
    const changed = await storedState(page)
    expect(changed).not.toEqual(original)
    expect(changed.dailyGoal).toBe(100)
    expect(changed.bookmarks).toEqual(['nlp-001'])
    expect(changed.progress['ml-001']?.reviews).toBe(4)

    dialog = await openPreferences(page)
    await chooseBackup(page, dialog, backup)
    await expect(dialog.getByRole('heading', { name: 'Replace current progress?', exact: true })).toBeVisible()
    await expect(dialog.getByRole('status')).toContainText('1 reviewed cards and 2 saved cards')
    expect(await storedState(page)).toEqual(changed)
    await dialog.getByRole('button', { name: 'Cancel import', exact: true }).click()
    await expect(dialog.getByRole('button', { name: 'Confirm import', exact: true })).toHaveCount(0)
    expect(await storedState(page)).toEqual(changed)
    await chooseBackup(page, dialog, backup)
    await dialog.getByRole('button', { name: 'Confirm import', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    expect(await storedState(page)).toEqual(original)
    await page.reload()
    expect(await storedState(page)).toEqual(original)
    dialog = await openPreferences(page)
    await expect(dialog.getByRole('spinbutton', { name: 'Daily goal', exact: true })).toHaveValue('35')
    await expect(dialog.getByRole('switch', { name: /^Ambient animation\b/ })).not.toBeChecked()
    await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click()
    await goToView(page, 'Saved cards')
    await expect(resultHeading(library(page, true))).toHaveText('2 saved cards')
  })

  test('reset requires confirmation, preserves a cancellation, and clears all data when confirmed', async ({ page }) => {
    const original = existingHistory()
    await seedStorage(page, original)
    await openApp(page)
    const dialog = await openPreferences(page)
    await dialog.getByRole('button', { name: 'Reset all study data', exact: true }).click()
    await expect(dialog.getByRole('heading', { name: 'A fresh start?', exact: true })).toBeVisible()
    expect(await storedState(page)).toEqual(original)
    await dialog.getByRole('button', { name: 'Keep my progress', exact: true }).click()
    await expect(dialog.getByRole('button', { name: 'Yes, clear study data', exact: true })).toHaveCount(0)
    expect(await storedState(page)).toEqual(original)
    await dialog.getByRole('button', { name: 'Reset all study data', exact: true }).click()
    await dialog.getByRole('button', { name: 'Yes, clear study data', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    expect(await storedState(page)).toEqual(emptyState())
    await page.reload()
    expect(await storedState(page)).toEqual(emptyState())
    await expect(page.getByRole('img', { name: '0 of 20 daily reviews complete', exact: true })).toBeVisible()
    await goToView(page, 'Saved cards')
    await expect(resultHeading(library(page, true))).toHaveText('0 saved cards')
    await goToView(page, 'My progress')
    await expect(metric(page, 'Total reviews')).toHaveText('0')
    await expect(page.getByRole('heading', { name: 'Your first review starts your story.', exact: true })).toBeVisible()
  })

  test('corrupted storage is preserved through navigation, cancellation, and reload until an intentional change', async ({ page }) => {
    const corrupt = '{"version":1,"progress":'
    await seedStorage(page, corrupt)
    await openApp(page)
    const warning = page.getByRole('status').filter({ hasText: CORRUPT_WARNING })
    await expect(warning).toBeVisible()
    await expect(question(page)).toHaveText(ML_QUESTIONS[0])
    expect(await rawStorage(page)).toBe(corrupt)
    await goToView(page, 'Card library')
    await expect(resultHeading(library(page))).toHaveText('600 cards')
    const dialog = await openPreferences(page)
    await dialog.getByRole('spinbutton', { name: 'Daily goal', exact: true }).fill('100')
    await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click()
    expect(await rawStorage(page)).toBe(corrupt)
    await page.reload()
    await expect(warning).toBeVisible()
    expect(await rawStorage(page)).toBe(corrupt)
    await flashcard(page).getByRole('button', { name: 'Save current card', exact: true }).click()
    await expect(warning).toHaveCount(0)
    expect(await storedState(page)).toEqual(emptyState({ bookmarks: ['ml-001'] }))
    await page.reload()
    await expect(warning).toHaveCount(0)
    await expect(flashcard(page).getByRole('button', { name: 'Unsave current card', exact: true })).toHaveAttribute('aria-pressed', 'true')
  })

  test('unavailable localStorage warns while ratings and bookmarks still work in memory', async ({ page }) => {
    await page.addInitScript((key) => {
      const original = Storage.prototype.setItem
      Storage.prototype.setItem = function (this: Storage, name: string, value: string) {
        if (this === window.localStorage && name === key) throw new DOMException('Simulated full storage', 'QuotaExceededError')
        original.call(this, name, value)
      }
    }, STORAGE_KEY)
    await openApp(page)
    await revealAndRate(page, 'good')
    await expect(question(page)).toHaveText(ML_QUESTIONS[1])
    await expect(page.getByRole('status').filter({ hasText: STORAGE_WARNING })).toBeVisible()
    await flashcard(page).getByRole('button', { name: 'Save current card', exact: true }).click()
    await expect(flashcard(page).getByRole('button', { name: 'Unsave current card', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await dismissNotice(page)
    expect(await rawStorage(page)).toBeNull()
    await goToView(page, 'My progress')
    await expect(metric(page, 'Unique cards reviewed')).toHaveText('1 / 600')
    await expect(metric(page, 'Total reviews')).toHaveText('1')
    await expect(metric(page, 'Self-rated recall')).toHaveText('100%')
    await goToView(page, 'Saved cards')
    await expect(resultHeading(library(page, true))).toHaveText('1 saved card')
    await expect(library(page, true).getByRole('article', { name: ML_QUESTIONS[1], exact: true })).toBeVisible()
    expect(await rawStorage(page)).toBeNull()
  })

  test('progress distinguishes unique cards, repeat reviews, mastery, recall, and local-day activity', async ({ page }) => {
    await openApp(page)
    for (let review = 0; review < 3; review += 1) {
      if (review > 0) await modes(page).getByRole('button', { name: 'All cards', exact: true }).click()
      await expect(question(page)).toHaveText(ML_QUESTIONS[0])
      await revealAndRate(page, 'good')
      await expect(question(page)).toHaveText(ML_QUESTIONS[1])
    }
    await revealAndRate(page, 'again')
    const state = await storedState(page)
    expect(state.progress['ml-001']).toMatchObject({ reviews: 3, streak: 3, interval: 8 })
    expect(state.activity[TODAY]).toEqual({ reviews: 4, recalled: 3 })
    await expect(page.getByRole('img', { name: '4 of 20 daily reviews complete', exact: true })).toBeVisible()
    await goToView(page, 'My progress')
    await expect(metric(page, 'Unique cards reviewed')).toHaveText('2 / 600')
    await expect(metric(page, 'Total reviews')).toHaveText('4')
    await expect(metric(page, 'Mastered')).toHaveText('1')
    await expect(metric(page, 'Self-rated recall')).toHaveText('75%')
    const activity = page.getByRole('region', { name: 'Daily activity', exact: true })
    await expect(activity.getByText('4 reviews', { exact: true })).toBeVisible()
    const dailyGoal = activity.getByRole('progressbar', { name: "Today's review goal", exact: true })
    await expect(dailyGoal).toHaveAttribute('aria-valuenow', '4')
    await expect(dailyGoal).toHaveAttribute('aria-valuemax', '20')
    await expect(dailyGoal).toHaveAttribute('aria-valuetext', '4 reviews completed toward a goal of 20 today')
    const table = activity.getByRole('table', { name: 'Review activity for the last seven local calendar days', exact: true })
    await expect(table.getByRole('row')).toHaveCount(8)
    const today = table.getByRole('row').filter({ has: page.locator(`time[datetime="${TODAY}"]`) })
    await expect(today.getByRole('cell')).toHaveText('4')
    for (const subject of SUBJECTS) {
      await expect(page.getByRole('progressbar', { name: `${subject.name}: cards reviewed`, exact: true })).toHaveAttribute('aria-valuenow', subject.id === 'ml' ? '2' : '0')
      await expect(page.getByRole('progressbar', { name: `${subject.name}: cards mastered`, exact: true })).toHaveAttribute('aria-valuenow', subject.id === 'ml' ? '1' : '0')
    }
    await expect(page.getByRole('heading', { name: 'A guide, not a grade', exact: true })).toBeVisible()
  })

  test('study, library, progress, and confirmation dialogs fit responsive viewports', async ({ page, isMobile }) => {
    await openApp(page)
    // Desktop covers CSS breakpoints; the touch project retains its real mobile emulation.
    const viewports = isMobile
      ? [{ width: 375, height: 812 }]
      : [320, 375, 768, 1024, 1440].map((width) => ({ width, height: 1000 }))
    for (const viewport of viewports) {
      await test.step(`${viewport.width} × ${viewport.height}`, async () => {
        await page.setViewportSize(viewport)
        await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(viewport.width)
        await goToView(page, 'Study space')
        await expect(question(page)).toHaveText(ML_QUESTIONS[0])
        await expectNoHorizontalOverflow(page, `${viewport.width}: study front`)
        await expectReadableStudyText(page, `${viewport.width}: study front`)
        await flashcard(page).getByRole('button', { name: 'Reveal answer', exact: true }).click()
        await expectNoHorizontalOverflow(page, `${viewport.width}: revealed answer`)
        await expectReadableStudyText(page, `${viewport.width}: revealed answer`)
        await goToView(page, 'Card library')
        const panel = library(page)
        await expect(resultHeading(panel)).toHaveText('600 cards')
        await panel.getByRole('article').first().locator('summary').click()
        await expectNoHorizontalOverflow(page, `${viewport.width}: library with answer`)
        await goToView(page, 'My progress')
        await expect(page.getByRole('heading', { name: 'Daily activity', exact: true })).toBeVisible()
        await expectNoHorizontalOverflow(page, `${viewport.width}: progress`)
        // A hidden table previously expanded the mobile viewport and displaced this fixed nav.
        await goToView(page, 'Saved cards')
        await expect(resultHeading(library(page, true))).toHaveText('0 saved cards')
        await goToView(page, 'My progress')
        await expect(page.getByRole('heading', { name: 'Daily activity', exact: true })).toBeVisible()
        const dialog = await openPreferences(page)
        await dialog.getByRole('button', { name: 'Reset all study data', exact: true }).click()
        await expect(dialog.getByRole('heading', { name: 'A fresh start?', exact: true })).toBeVisible()
        await expectNoHorizontalOverflow(page, `${viewport.width}: preferences and reset confirmation`)
        await dialog.getByRole('button', { name: 'Keep my progress', exact: true }).click()
        await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click()
      })
    }
  })

  test('WCAG scans cover dashboard front, answer, library, progress, preferences, and help', async ({ page }, testInfo) => {
    await openApp(page)
    await expectAccessible(page, testInfo, 'dashboard-front')
    await flashcard(page).getByRole('button', { name: 'Reveal answer', exact: true }).click()
    await expectAccessible(page, testInfo, 'dashboard-answer')
    await goToView(page, 'Card library')
    await expect(resultHeading(library(page))).toHaveText('600 cards')
    await library(page).getByRole('article').first().locator('summary').click()
    await expectAccessible(page, testInfo, 'library')
    await goToView(page, 'My progress')
    await expect(page.getByRole('heading', { name: 'Daily activity', exact: true })).toBeVisible()
    await expectAccessible(page, testInfo, 'progress')
    const preferences = await openPreferences(page)
    await expectAccessible(page, testInfo, 'preferences')
    await preferences.getByRole('button', { name: 'Close dialog', exact: true }).click()
    await goToView(page, 'Study space')
    const helpOpener = studySpace(page).getByRole('button', { name: 'Made for your keyboard', exact: true })
    await helpOpener.click()
    const help = page.getByRole('dialog', { name: 'A little guide to better recall.', exact: true })
    await expect(help).toBeVisible()
    await expectAccessible(page, testInfo, 'help')
    await help.getByRole('button', { name: 'Let’s learn something', exact: true }).focus()
    await page.keyboard.press('Tab')
    await expect(help.getByRole('button', { name: 'Close dialog', exact: true })).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(help.getByRole('button', { name: 'Let’s learn something', exact: true })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(help).toHaveCount(0)
    await expect(helpOpener).toBeFocused()

    // Embedded hosts may deliver keydown without generating native dialog cancellation.
    await helpOpener.click()
    await expect(help).toBeVisible()
    await help.dispatchEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    await expect(help).toHaveCount(0)
    await expect(helpOpener).toBeFocused()
  })

  test('WebGL renders within its budget, pauses offscreen, honors preferences, and survives context loss', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    // Probe an independent canvas BEFORE loading the app. A broken app renderer must fail,
    // never be mistaken for an unsupported environment merely because it shows its fallback.
    const available = await page.evaluate(() => {
      const probe = document.createElement('canvas')
      const context = probe.getContext('webgl2')
      if (!context) return false
      context.getExtension('WEBGL_lose_context')?.loseContext()
      return true
    })
    test.skip(!available, 'This Chromium environment cannot create an independent WebGL2 context.')
    await openApp(page)
    const artwork = page.locator('.ambient-artwork')
    const canvas = artwork.locator('canvas[data-renderer="threejs"]')
    await artwork.scrollIntoViewIfNeeded()
    await expect(canvas).toBeVisible()
    await expect(artwork).toHaveClass(/\bis-ready\b/)
    await expect(canvas).toHaveAttribute('data-rendering', 'true')
    await expect(canvas).toHaveAttribute('data-fps-cap', '30')
    const pixelRatio = Number(await canvas.getAttribute('data-pixel-ratio'))
    expect(pixelRatio).toBeGreaterThan(0)
    expect(pixelRatio).toBeLessThanOrEqual(1.5)
    expect(pixelRatio).toBe(await page.evaluate(() => Math.min(window.devicePixelRatio || 1, 1.5)))
    expect(await canvas.evaluate((element: HTMLCanvasElement) => element.width > 0 && element.height > 0)).toBe(true)

    await flashcard(page).evaluate((element) => element.scrollIntoView({ block: 'start', behavior: 'instant' }))
    await expect(artwork).not.toBeInViewport()
    await expect(canvas).toHaveAttribute('data-rendering', 'false')
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
    await expect(artwork).toBeInViewport({ ratio: 0.05 })
    await expect(canvas).toHaveAttribute('data-rendering', 'true')

    let dialog = await openPreferences(page)
    await dialog.getByRole('switch', { name: /^Ambient animation\b/ }).uncheck()
    await dialog.getByRole('button', { name: 'Save preferences', exact: true }).click()
    await expect(canvas).toHaveCount(0)
    await expect(artwork.locator('.artwork-fallback')).toHaveCSS('opacity', '1')
    expect((await storedState(page)).animation).toBe(false)
    await page.reload()
    await fontsReady(page)
    await expect(canvas).toHaveCount(0)

    // Re-enable in the same test so the actual rendered scene handles context loss too.
    dialog = await openPreferences(page)
    await dialog.getByRole('switch', { name: /^Ambient animation\b/ }).check()
    await dialog.getByRole('button', { name: 'Save preferences', exact: true }).click()
    await artwork.scrollIntoViewIfNeeded()
    await expect(canvas).toBeVisible()
    await expect(canvas).toHaveAttribute('data-rendering', 'true')
    await canvas.evaluate((element: HTMLCanvasElement) => {
      const extension = element.getContext('webgl2')?.getExtension('WEBGL_lose_context')
      if (!extension) throw new Error('The rendered WebGL2 context must expose WEBGL_lose_context for this test.')
      return new Promise<void>((resolve) => {
        element.addEventListener('webglcontextlost', () => resolve(), { once: true })
        extension.loseContext()
      })
    })
    await expect(canvas).toHaveCount(0)
    await expect(artwork).not.toHaveClass(/\bis-ready\b/)
    await expect(artwork.locator('.artwork-fallback')).toHaveCSS('opacity', '1')
    await expect(artwork.locator('.artwork-fallback .hero-visual')).toBeVisible()
    await flashcard(page).getByRole('button', { name: 'Reveal answer', exact: true }).click()
    await expect(flashcard(page).getByText(ML_ANSWER, { exact: true })).toBeVisible()
  })

  test('appearance follows the device, persists an explicit choice, and preserves study backups', async ({ page }) => {
    const original = existingHistory()
    await seedStorage(page, original)
    await page.emulateMedia({ colorScheme: 'dark' })
    await openApp(page)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.getByRole('button', { name: 'Switch to light mode', exact: true })).toBeVisible()
    const before = await rawStorage(page)
    await page.emulateMedia({ colorScheme: 'light' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    expect(await rawStorage(page)).toBe(before)
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#111c16')
    expect(await page.evaluate(() => localStorage.getItem('concept-grove:theme:v1'))).toBe('dark')

    let dialog = await openPreferences(page)
    await expect(dialog.getByRole('radio', { name: 'Dark', exact: true })).toBeChecked()
    await dialog.getByRole('radio', { name: 'Light', exact: true }).check()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    dialog = await openPreferences(page)
    await dialog.getByRole('radio', { name: 'System', exact: true }).check()
    await dialog.getByRole('button', { name: 'Save preferences', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    expect(await storedState(page)).toEqual(original)
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })

  test('dark appearance remains usable when storage is unavailable', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(Storage.prototype, 'getItem', { value: () => { throw new Error('Storage disabled') } })
      Object.defineProperty(Storage.prototype, 'setItem', { value: () => { throw new Error('Storage disabled') } })
    })
    await openApp(page)
    await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.getByRole('status').filter({ hasText: 'Appearance could not be saved' })).toBeVisible()
    await flashcard(page).getByRole('button', { name: 'Reveal answer', exact: true }).click()
    await expect(flashcard(page).getByText(ML_ANSWER, { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  })

  test('dark mode has readable contrast across study, dropdowns, progress, and dialogs', async ({ page }, testInfo) => {
    await seedStorage(page, existingHistory())
    await page.emulateMedia({ colorScheme: 'dark' })
    await openApp(page)
    await expectAccessible(page, testInfo, 'dark-dashboard')
    await flashcard(page).getByRole('button', { name: 'Reveal answer', exact: true }).click()
    await expectAccessible(page, testInfo, 'dark-answer')
    await goToView(page, 'Card library')
    const panel = library(page)
    await expect(resultHeading(panel)).toHaveText('600 cards')
    await expectAccessible(page, testInfo, 'dark-library')
    await panel.getByRole('combobox', { name: 'Topic', exact: true }).click()
    await expect(page.getByRole('listbox')).toBeVisible()
    await expectAccessible(page, testInfo, 'dark-dropdown')
    await page.keyboard.press('Escape')
    await goToView(page, 'My progress')
    await expect(page.getByRole('heading', { name: 'Daily activity', exact: true })).toBeVisible()
    await expectAccessible(page, testInfo, 'dark-progress')
    await expectNoHorizontalOverflow(page, 'dark-progress')
    const dialog = await openPreferences(page)
    await dialog.getByRole('button', { name: 'Reset all study data', exact: true }).click()
    await expectAccessible(page, testInfo, 'dark-preferences-confirmation')
    await dialog.getByRole('button', { name: 'Keep my progress', exact: true }).click()
    await page.keyboard.press('Escape')
    await goToView(page, 'Study space')
    await studySpace(page).getByRole('button', { name: 'Made for your keyboard', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expectAccessible(page, testInfo, 'dark-help')
  })

  test('versioned footer links invite contributions without making automatic network requests', async ({ page }) => {
    await openApp(page)
    const footer = page.getByRole('contentinfo', { name: 'Project and contribution links', exact: true })
    await expect(footer.getByText('v1.0.0', { exact: true })).toBeVisible()
    const links: [RegExp, string][] = [
      [/Star on GitHub/, 'https://github.com/Parama-Guru/concept-grove'],
      [/^Source code$/, 'https://github.com/Parama-Guru/concept-grove'],
      [/^Add flashcards$/, 'https://github.com/Parama-Guru/concept-grove/blob/main/CONTRIBUTING.md#adding-flashcards'],
      [/^Contribute a feature$/, 'https://github.com/Parama-Guru/concept-grove/blob/main/CONTRIBUTING.md'],
      [/^Report an issue$/, 'https://github.com/Parama-Guru/concept-grove/issues/new/choose'],
      [/^MIT License$/, 'https://github.com/Parama-Guru/concept-grove/blob/main/LICENSE'],
    ]
    for (const [name, href] of links) {
      const link = footer.getByRole('link', { name })
      await expect(link).toHaveAttribute('href', href)
      await expect(link).toHaveAttribute('target', '_blank')
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    }
    await expectNoHorizontalOverflow(page, 'community-footer')
  })
})