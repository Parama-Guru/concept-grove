import type { CardProgress, DailyActivity, Difficulty, Flashcard, Rating, StudyMode, StudyState, SubjectId } from '../types'

export const STORAGE_KEY = 'recall-studio:v1'

const DAY_MS = 86_400_000
const AGAIN_INTERVAL = 10 / 1440
const MAX_INTERVAL = 365
const MIN_EASE = 1.3
const MAX_EASE = 3
const INITIAL_EASE = 2.5
const MAX_COUNT = Number.MAX_SAFE_INTEGER
const MAX_TIMESTAMP = 8_640_000_000_000_000 // JavaScript Date's upper bound, in milliseconds.
const MAX_BACKUP_BYTES = 2 * 1024 * 1024
const SUBJECT_NAMES: Record<SubjectId, string> = {
  ml: 'Machine Learning',
  dl: 'Deep Learning',
  nlp: 'Natural Language Processing',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function ownValue<T>(record: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined
}

function isSafeId(id: unknown): id is string {
  return typeof id === 'string' && id.trim().length > 0
    && id !== '__proto__' && id !== 'constructor' && id !== 'prototype'
}

function isBoundedNumber(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

function isBoundedInteger(value: unknown, min: number, max: number): value is number {
  return isBoundedNumber(value, min, max) && Number.isSafeInteger(value)
}

function isRating(value: unknown): value is Rating {
  return value === 'again' || value === 'hard' || value === 'good' || value === 'easy'
}

function boundedNumber(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback
}

function count(value: unknown): number {
  return Math.floor(boundedNumber(value, 0, MAX_COUNT, 0))
}

function increment(value: number): number {
  return value < MAX_COUNT ? value + 1 : MAX_COUNT
}

function assertTimestamp(now: number): void {
  if (!isBoundedInteger(now, 0, MAX_TIMESTAMP)) {
    throw new RangeError('Review time must be a nonnegative integer within the JavaScript Date range.')
  }
}

function readProgress(value: unknown): CardProgress | undefined {
  if (!isRecord(value)) return undefined
  const reviews = ownValue(value, 'reviews')
  const interval = ownValue(value, 'interval')
  const ease = ownValue(value, 'ease')
  const due = ownValue(value, 'due')
  const lastReviewed = ownValue(value, 'lastReviewed')
  const lastRating = ownValue(value, 'lastRating')
  const streak = ownValue(value, 'streak')

  if (!isBoundedInteger(reviews, 1, MAX_COUNT)
    || !isBoundedNumber(interval, AGAIN_INTERVAL, MAX_INTERVAL)
    || !isBoundedNumber(ease, MIN_EASE, MAX_EASE)
    || !isBoundedInteger(due, 0, MAX_TIMESTAMP)
    || !isBoundedInteger(lastReviewed, 0, MAX_TIMESTAMP)
    || !isRating(lastRating)
    || !isBoundedInteger(streak, 0, reviews)) return undefined

  return { reviews, interval, ease, due, lastReviewed, lastRating, streak }
}

function readActivity(value: unknown): DailyActivity | undefined {
  if (!isRecord(value)) return undefined
  const reviews = ownValue(value, 'reviews')
  const recalled = ownValue(value, 'recalled')
  if (!isBoundedInteger(reviews, 0, MAX_COUNT) || !isBoundedInteger(recalled, 0, reviews)) return undefined
  return { reviews, recalled }
}

function isDateKey(key: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false
  const year = Number(key.slice(0, 4))
  const month = Number(key.slice(5, 7))
  const day = Number(key.slice(8, 10))
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return month >= 1 && month <= 12 && day >= 1 && day <= (daysInMonth[month - 1] ?? 0)
}

export function defaultState(): StudyState {
  return { version: 1, progress: {}, bookmarks: [], activity: {}, dailyGoal: 20, animation: true }
}

/** Invalid roots/versions throw; malformed entries are discarded, not coerced or partially restored. */
export function decodeBackup(raw: string, validIds: ReadonlySet<string>): StudyState {
  if (typeof raw !== 'string') throw new TypeError('A study backup must be a JSON string.')
  // Check characters first so a huge input is rejected before allocating its UTF-8 encoding.
  if (raw.length > MAX_BACKUP_BYTES || new TextEncoder().encode(raw).byteLength > MAX_BACKUP_BYTES) {
    throw new RangeError('Study backups must not exceed 2 MiB of UTF-8 JSON.')
  }
  const root: unknown = JSON.parse(raw)
  if (!isRecord(root) || ownValue(root, 'version') !== 1) {
    throw new Error('Invalid or unsupported study backup: expected an object with version 1.')
  }

  const state = defaultState()
  const progress = ownValue(root, 'progress')
  if (isRecord(progress)) {
    for (const [id, candidate] of Object.entries(progress)) {
      if (!isSafeId(id) || !validIds.has(id)) continue
      const entry = readProgress(candidate)
      if (entry) state.progress[id] = entry
    }
  }

  const bookmarks = ownValue(root, 'bookmarks')
  if (Array.isArray(bookmarks)) {
    state.bookmarks = [...new Set(bookmarks.filter((id): id is string => isSafeId(id) && validIds.has(id)))]
  }

  const activity = ownValue(root, 'activity')
  if (isRecord(activity)) {
    for (const [key, candidate] of Object.entries(activity)) {
      if (!isDateKey(key)) continue
      const entry = readActivity(candidate)
      if (entry) state.activity[key] = entry
    }
  }

  const dailyGoal = ownValue(root, 'dailyGoal')
  const animation = ownValue(root, 'animation')
  if (isBoundedInteger(dailyGoal, 10, 100)) state.dailyGoal = dailyGoal
  if (typeof animation === 'boolean') state.animation = animation
  return state
}

export function parseStudyState(raw: string | null, validIds: ReadonlySet<string>): StudyState {
  if (raw === null) return defaultState()
  try {
    return decodeBackup(raw, validIds)
  } catch {
    return defaultState()
  }
}

/**
 * SM-2-inspired, not an exact SM-2 implementation. Intervals are days; timestamps are milliseconds.
 * Hard preserves fractional days (1.2×). Easy starts at four days after a confidence reset;
 * later easy reviews use the updated ease with a 1.3× bonus, rounded to whole days.
 */
export function scheduleReview(previous: CardProgress | undefined, rating: Rating, now = Date.now()): CardProgress {
  assertTimestamp(now)
  if (!isRating(rating)) throw new RangeError('Unknown review rating.')

  const previousReviews = count(previous?.reviews)
  const previousStreak = Math.min(previousReviews, count(previous?.streak))
  const previousInterval = boundedNumber(previous?.interval, AGAIN_INTERVAL, MAX_INTERVAL, 1)
  let ease = boundedNumber(previous?.ease, MIN_EASE, MAX_EASE, INITIAL_EASE)
  let streak = 0
  let interval: number

  switch (rating) {
    case 'again':
      ease = Math.max(MIN_EASE, ease - 0.2)
      interval = AGAIN_INTERVAL
      break
    case 'hard':
      ease = Math.max(MIN_EASE, ease - 0.15)
      interval = Math.max(1, previousReviews > 0 ? previousInterval * 1.2 : 1)
      break
    case 'good':
      streak = increment(previousStreak)
      interval = streak === 1 ? 1 : streak === 2 ? 3 : Math.max(1, Math.round(previousInterval * ease))
      break
    case 'easy':
      ease = Math.min(MAX_EASE, ease + 0.15)
      streak = increment(previousStreak)
      interval = streak === 1 ? 4 : Math.max(4, Math.round(previousInterval * ease * 1.3))
      break
  }

  interval = Math.min(MAX_INTERVAL, interval)
  return {
    reviews: increment(previousReviews),
    interval,
    ease,
    // An early review or a clock correction must not add the old future due date again.
    due: Math.min(MAX_TIMESTAMP, now + Math.round(interval * DAY_MS)),
    lastReviewed: now,
    lastRating: rating,
    streak,
  }
}

export function applyReview(state: StudyState, id: string, rating: Rating, now = Date.now()): StudyState {
  if (!isSafeId(id)) throw new RangeError('Invalid card ID.')
  const progress = scheduleReview(ownValue(state.progress, id), rating, now)
  const key = localDateKey(now)
  const previous = ownValue(state.activity, key)
  const previousReviews = count(previous?.reviews)
  const previousRecalled = Math.min(previousReviews, count(previous?.recalled))
  const reviews = increment(previousReviews)
  const recalled = rating === 'good' || rating === 'easy' ? increment(previousRecalled) : previousRecalled
  return {
    ...state,
    progress: { ...state.progress, [id]: progress },
    activity: { ...state.activity, [key]: { reviews, recalled: Math.min(reviews, recalled) } },
  }
}

export function toggleBookmark(state: StudyState, id: string): StudyState {
  if (!isSafeId(id)) throw new RangeError('Invalid card ID.')
  const bookmarks = new Set(state.bookmarks)
  if (bookmarks.has(id)) bookmarks.delete(id)
  else bookmarks.add(id)
  return { ...state, bookmarks: [...bookmarks] }
}

export function localDateKey(now = Date.now()): string {
  const date = new Date(now)
  const year = date.getFullYear()
  if (!Number.isFinite(date.getTime()) || year < 0 || year > 9999) {
    throw new RangeError('Expected a valid timestamp with a four-digit local calendar year.')
  }
  return `${String(year).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** A transparent mastery heuristic, not a claim of measured learning or recall. */
export function isMastered(progress: CardProgress | undefined): boolean {
  return progress !== undefined && Number.isSafeInteger(progress.streak) && progress.streak >= 3
    && Number.isFinite(progress.interval) && progress.interval >= 7
}

function hasReviews(progress: CardProgress | undefined): boolean {
  return progress !== undefined && isBoundedInteger(progress.reviews, 1, MAX_COUNT)
}

function isDue(progress: CardProgress | undefined, now: number): boolean {
  return !hasReviews(progress) || (progress !== undefined && progress.due <= now)
}

export function getStudyStats(state: StudyState, cards: readonly Flashcard[], now = Date.now()): {
  reviewed: number
  totalReviews: number
  mastered: number
  due: number
  recallRate: number
  todayReviews: number
  todayRecalled: number
  streak: number
  week: { key: string; label: string; reviews: number; recalled: number }[]
} {
  const todayKey = localDateKey(now)
  let reviewed = 0
  let mastered = 0
  let due = 0
  const seen = new Set<string>()
  for (const card of cards) {
    if (seen.has(card.id)) continue
    seen.add(card.id)
    const progress = ownValue(state.progress, card.id)
    if (hasReviews(progress)) {
      reviewed += 1
      if (isMastered(progress)) mastered += 1
    }
    if (isDue(progress, now)) due += 1
  }

  const days = new Map<string, DailyActivity>()
  let totalReviews = 0
  let totalRecalled = 0
  for (const [key, value] of Object.entries(state.activity)) {
    const entry = isDateKey(key) ? readActivity(value) : undefined
    if (!entry) continue
    days.set(key, entry)
    totalReviews += entry.reviews
    totalRecalled += entry.recalled
  }

  // Noon plus calendar arithmetic avoids duplicated/skipped dates at ordinary DST transitions.
  const today = new Date(now)
  today.setHours(12, 0, 0, 0)
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today.getTime())
    date.setDate(date.getDate() - (6 - index))
    const key = localDateKey(date.getTime())
    const entry = days.get(key)
    return { key, label: date.toLocaleDateString('en-US', { weekday: 'short' }), reviews: entry?.reviews ?? 0, recalled: entry?.recalled ?? 0 }
  })

  const cursor = new Date(today.getTime())
  if ((days.get(todayKey)?.reviews ?? 0) === 0) cursor.setDate(cursor.getDate() - 1)
  let streak = 0
  while (streak < days.size && (days.get(localDateKey(cursor.getTime()))?.reviews ?? 0) > 0) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }

  return {
    reviewed,
    totalReviews,
    mastered,
    due,
    recallRate: totalReviews === 0 ? 0 : Math.round((totalRecalled / totalReviews) * 100),
    todayReviews: days.get(todayKey)?.reviews ?? 0,
    todayRecalled: days.get(todayKey)?.recalled ?? 0,
    streak,
    week,
  }
}

/** Fisher-Yates; an injected random source must return finite samples in [0, 1). */
export function shuffleCards<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const shuffled = [...items]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const sample = random()
    if (!isBoundedNumber(sample, 0, 1) || sample === 1) throw new RangeError('Random samples must be in [0, 1).')
    const target = Math.floor(sample * (index + 1))
    // Both indices are in bounds, including when T itself permits undefined.
    const current = shuffled[index] as T
    shuffled[index] = shuffled[target] as T
    shuffled[target] = current
  }
  return shuffled
}

export function filterCards(cards: readonly Flashcard[], filters: {
  subject?: SubjectId | 'all'
  difficulty?: Difficulty | 'all'
  topic?: string
  query?: string
  mode?: StudyMode
}, state: StudyState, now = Date.now()): Flashcard[] {
  const topic = filters.topic?.trim()
  const query = filters.query?.trim().toLowerCase()
  const bookmarks = new Set(state.bookmarks)
  return cards.filter((card) => {
    if (filters.subject && filters.subject !== 'all' && card.subject !== filters.subject) return false
    if (filters.difficulty && filters.difficulty !== 'all' && card.difficulty !== filters.difficulty) return false
    if (topic && topic !== 'all' && card.topic !== topic) return false
    if (filters.mode === 'due' && !isDue(ownValue(state.progress, card.id), now)) return false
    if (filters.mode === 'saved' && !bookmarks.has(card.id)) return false
    return !query || [card.question, card.answer, card.takeaway, card.topic, card.subject, SUBJECT_NAMES[card.subject]]
      .some((text) => text.toLowerCase().includes(query))
  })
}