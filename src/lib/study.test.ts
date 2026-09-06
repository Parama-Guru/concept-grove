import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CardProgress, Flashcard, Rating, StudyState } from '../types'
import {
  applyReview, decodeBackup, defaultState, filterCards, getStudyStats, isMastered, localDateKey,
  parseStudyState, scheduleReview, shuffleCards, STORAGE_KEY, toggleBookmark,
} from './study'

const DAY_MS = 86_400_000
const NOW = new Date(2026, 8, 6, 12).getTime()
const TODAY = '2026-09-06'
const MAX_COUNT = Number.MAX_SAFE_INTEGER
const MAX_TIMESTAMP = 8_640_000_000_000_000
const BACKUP_LIMIT = 2 * 1024 * 1024
const cards: readonly Flashcard[] = Object.freeze([
  {
    id: 'ml-001', subject: 'ml', topic: 'Model evaluation', difficulty: 'foundation',
    question: 'How can held-out data reveal overfitting?',
    answer: 'A gap between training and unseen-data performance can expose memorization.',
    takeaway: 'Evaluate generalization, not just training performance.',
  },
  {
    id: 'ml-002', subject: 'ml', topic: 'Model evaluation', difficulty: 'advanced',
    question: 'Where should a preprocessing transform be fitted?',
    answer: 'Fit it on each training fold before applying it to the validation fold.',
    takeaway: 'Prevent leakage by estimating transformations only from the training split.',
  },
  {
    id: 'dl-001', subject: 'dl', topic: 'Attention', difficulty: 'intermediate',
    question: 'What changes when a query attends to different keys?',
    answer: 'Attention weights change the mixture of corresponding value vectors.',
    takeaway: 'Relevance determines how the available values are combined.',
  },
  {
    id: 'nlp-001', subject: 'nlp', topic: 'Language representations', difficulty: 'foundation',
    question: 'Why can one token have different contextual representations?',
    answer: 'Its representation depends on the surrounding tokens rather than only its identity.',
    takeaway: 'Context can distinguish different uses of the same token.',
  },
])
const validIds: ReadonlySet<string> = new Set(cards.map((card) => card.id))

function progress(overrides: Partial<CardProgress> = {}): CardProgress {
  return { reviews: 4, interval: 8, ease: 2.5, due: NOW + DAY_MS, lastReviewed: NOW, lastRating: 'good', streak: 3, ...overrides }
}

function backup(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ ...defaultState(), ...overrides })
}

function freezeState(state: StudyState): StudyState {
  Object.values(state.progress).forEach(Object.freeze)
  Object.values(state.activity).forEach(Object.freeze)
  Object.freeze(state.progress)
  Object.freeze(state.activity)
  Object.freeze(state.bookmarks)
  return Object.freeze(state)
}

function ids(deck: readonly Flashcard[]): string[] {
  return deck.map((card) => card.id)
}

afterEach(() => { vi.restoreAllMocks() })

describe('versioned study storage', () => {
  it('exports the storage key and fresh, independent defaults', () => {
    expect(STORAGE_KEY).toBe('recall-studio:v1')
    const first = defaultState()
    const second = defaultState()
    expect(first).toEqual({ version: 1, progress: {}, bookmarks: [], activity: {}, dailyGoal: 20, animation: true })
    expect(first).not.toBe(second)
    expect(first.progress).not.toBe(second.progress)
    expect(first.bookmarks).not.toBe(second.bookmarks)
    expect(first.activity).not.toBe(second.activity)
    first.bookmarks.push('ml-001')
    first.progress['ml-001'] = progress()
    first.activity[TODAY] = { reviews: 1, recalled: 1 }
    expect(second).toEqual(defaultState())
  })

  it.each(['', '{', 'null', '[]', 'true', '42', '"text"', '{}', '{"version":0}', '{"version":2}', '{"version":"1"}'])
    ('rejects unusable or unsupported JSON %s, with safe startup fallback', (raw) => {
      expect(() => decodeBackup(raw, validIds)).toThrow()
      expect(parseStudyState(raw, validIds)).toEqual(defaultState())
    })

  it('returns independent defaults for absent and corrupt local storage', () => {
    const absent = parseStudyState(null, validIds)
    const corrupt = parseStudyState('no JSON', validIds)
    expect(absent).toEqual(defaultState())
    expect(absent.progress).not.toBe(corrupt.progress)
    expect(absent.activity).not.toBe(corrupt.activity)
  })

  it('defaults missing or malformed containers in an otherwise valid root', () => {
    expect(decodeBackup('{"version":1}', validIds)).toEqual(defaultState())
    expect(decodeBackup(backup({ progress: [], bookmarks: {}, activity: null }), validIds)).toEqual(defaultState())
    expect(decodeBackup(backup({ progress: 'bad', bookmarks: null, activity: [] }), validIds)).toEqual(defaultState())
  })

  it('round-trips reviewed state, preferences, activity, and bookmarks without aliasing', () => {
    let state = applyReview(defaultState(), 'ml-001', 'good', NOW)
    state = applyReview(state, 'dl-001', 'again', NOW + 1)
    state = toggleBookmark(state, 'nlp-001')
    state.dailyGoal = 40
    state.animation = false
    const restored = decodeBackup(JSON.stringify(state), validIds)
    expect(restored).toEqual(state)
    expect(parseStudyState(JSON.stringify(state), validIds)).toEqual(state)
    expect(restored.progress['ml-001']).not.toBe(state.progress['ml-001'])
    expect(restored.activity[TODAY]).not.toBe(state.activity[TODAY])
    expect(restored.bookmarks).not.toBe(state.bookmarks)
  })

  it('drops unknown IDs and extra fields while deduplicating valid bookmarks in order', () => {
    const restored = decodeBackup(backup({
      progress: { 'ml-001': { ...progress(), extra: true }, missing: progress(), 'ml-002': null, 'nlp-001': [] },
      bookmarks: ['nlp-001', 'ml-001', 'nlp-001', 'missing', null, 7, {}],
      activity: { [TODAY]: { reviews: 2, recalled: 1, extra: true } },
      extra: { ignored: true },
    }), validIds)
    expect(restored.progress).toEqual({ 'ml-001': progress() })
    expect(restored.bookmarks).toEqual(['nlp-001', 'ml-001'])
    expect(restored.activity).toEqual({ [TODAY]: { reviews: 2, recalled: 1 } })
    expect(restored).not.toHaveProperty('extra')
    expect([...validIds]).toEqual(ids(cards))
  })

  it('cannot restore prototype-polluting IDs even when an allow-list contains them', () => {
    const entry = JSON.stringify(progress())
    const raw = `{"version":1,"__proto__":{"polluted":true},"progress":{"__proto__":${entry},"constructor":${entry},"prototype":${entry},"ml-001":${entry}},"bookmarks":["__proto__","constructor","prototype","ml-001"],"activity":{"__proto__":{"polluted":true},"${TODAY}":{"reviews":1,"recalled":1}}}`
    const restored = decodeBackup(raw, new Set([...validIds, '__proto__', 'constructor', 'prototype']))
    expect(restored.progress).toEqual({ 'ml-001': progress() })
    expect(restored.bookmarks).toEqual(['ml-001'])
    expect(restored.activity).toEqual({ [TODAY]: { reviews: 1, recalled: 1 } })
    for (const object of [restored, restored.progress, restored.activity]) {
      expect(Object.getPrototypeOf(object)).toBe(Object.prototype)
      expect(Object.hasOwn(object, '__proto__')).toBe(false)
    }
    expect(Object.prototype).not.toHaveProperty('polluted')
  })

  it.each<[keyof CardProgress, unknown]>([
    ['reviews', 0], ['reviews', -1], ['reviews', 1.5], ['reviews', MAX_COUNT + 1], ['reviews', '4'],
    ['interval', 0], ['interval', -1], ['interval', 10 / 1440 / 2], ['interval', 366], ['interval', NaN],
    ['ease', 1.29], ['ease', 3.01], ['ease', '2.5'], ['ease', Infinity],
    ['due', -1], ['due', 1.5], ['due', MAX_TIMESTAMP + 1], ['due', null],
    ['lastReviewed', -1], ['lastReviewed', 1.5], ['lastReviewed', MAX_TIMESTAMP + 1],
    ['lastRating', 'great'], ['lastRating', 1], ['lastRating', undefined],
    ['streak', -1], ['streak', 1.5], ['streak', 5], ['streak', MAX_COUNT + 1],
  ])('discards a progress entry with invalid %s = %s, not its valid neighbors', (field, value) => {
    const restored = decodeBackup(backup({ progress: {
      'ml-001': { ...progress(), [field]: value }, 'ml-002': progress(),
    } }), validIds)
    expect(restored.progress).toEqual({ 'ml-002': progress() })
  })

  it('rejects JSON numbers whose exponent parses as infinity', () => {
    const raw = backup({ progress: { 'ml-001': progress() } }).replace('"ease":2.5', '"ease":1e999')
    expect(decodeBackup(raw, validIds).progress).toEqual({})
  })

  it('accepts exact numeric boundaries, epoch timestamps, and future due dates', () => {
    const lower = progress({ reviews: 1, interval: 10 / 1440, ease: 1.3, due: 600_000, lastReviewed: 0, streak: 0, lastRating: 'again' })
    const upper = progress({ reviews: MAX_COUNT, streak: MAX_COUNT, interval: 365, ease: 3, due: MAX_TIMESTAMP, lastReviewed: MAX_TIMESTAMP - 1 })
    const restored = decodeBackup(backup({ progress: { 'ml-001': lower, 'ml-002': upper } }), validIds)
    expect(restored.progress).toEqual({ 'ml-001': lower, 'ml-002': upper })
  })

  it('validates actual Gregorian dates rather than accepting rolled-over date strings', () => {
    const keys = ['2024-02-29', '2000-02-29', TODAY, '2025-02-29', '1900-02-29', '2026-04-31', '2026-00-01', '2026-13-01', '2026-09-00', '2026-9-6', 'not-a-date']
    const activity = Object.fromEntries(keys.map((key) => [key, { reviews: 2, recalled: 1 }]))
    expect(Object.keys(decodeBackup(backup({ activity }), validIds).activity)).toEqual(['2024-02-29', '2000-02-29', TODAY])
  })

  it.each([
    null, [], {}, { reviews: '2', recalled: 1 }, { reviews: -1, recalled: 0 },
    { reviews: 1.5, recalled: 1 }, { reviews: MAX_COUNT + 1, recalled: 0 },
    { reviews: Infinity, recalled: 0 }, { reviews: 2, recalled: -1 },
    { reviews: 2, recalled: 3 }, { reviews: 2, recalled: 0.5 }, { reviews: 2, recalled: '1' },
  ])('drops invalid daily activity %#', (entry) => {
    const restored = decodeBackup(backup({ activity: { [TODAY]: entry, '2026-09-05': { reviews: 0, recalled: 0 } } }), validIds)
    expect(restored.activity).toEqual({ '2026-09-05': { reviews: 0, recalled: 0 } })
  })

  it.each([10, 20, 100])('keeps a valid integer goal of %s', (dailyGoal) => {
    expect(decodeBackup(backup({ dailyGoal, animation: false }), validIds)).toMatchObject({ dailyGoal, animation: false })
  })

  it.each([9, 101, 10.5, '20', null, Infinity])('defaults an invalid goal of %s', (dailyGoal) => {
    expect(decodeBackup(backup({ dailyGoal, animation: 'false' }), validIds)).toMatchObject({ dailyGoal: 20, animation: true })
  })

  it('accepts the 2 MiB boundary but refuses an oversized raw string before parsing', () => {
    const root = '{"version":1}'
    const raw = root + ' '.repeat(BACKUP_LIMIT - root.length)
    expect(decodeBackup(raw, validIds)).toEqual(defaultState())
    expect(() => decodeBackup(raw + ' ', validIds)).toThrow(/2 MiB/)
    expect(parseStudyState(raw + ' ', validIds)).toEqual(defaultState())
  })

  it('enforces the byte limit for multibyte UTF-8, not just the character count', () => {
    const raw = JSON.stringify({ version: 1, ignored: 'é'.repeat(BACKUP_LIMIT / 2) })
    expect(raw.length).toBeLessThan(BACKUP_LIMIT)
    expect(() => decodeBackup(raw, validIds)).toThrow(/2 MiB/)
  })
})

describe('SM-2-inspired review scheduling', () => {
  it.each<[Rating, number, number, number]>([
    ['again', 10 / 1440, 2.3, 0], ['hard', 1, 2.35, 0], ['good', 1, 2.5, 1], ['easy', 4, 2.65, 1],
  ])('schedules a first %s review with the correct units', (rating, interval, ease, streak) => {
    const next = scheduleReview(undefined, rating, NOW)
    expect(next).toMatchObject({ reviews: 1, interval, streak, lastReviewed: NOW, lastRating: rating })
    expect(next.ease).toBeCloseTo(ease)
    expect(next.due).toBe(NOW + Math.round(interval * DAY_MS))
  })

  it('uses confident intervals of 1, 3, 8, and 20 days at ease 2.5', () => {
    const first = scheduleReview(undefined, 'good', NOW)
    const second = scheduleReview(first, 'good', first.due)
    const third = scheduleReview(second, 'good', second.due)
    const fourth = scheduleReview(third, 'good', third.due)
    expect([first.interval, second.interval, third.interval, fourth.interval]).toEqual([1, 3, 8, 20])
    expect([first.streak, second.streak, third.streak, fourth.streak]).toEqual([1, 2, 3, 4])
    expect(fourth.reviews).toBe(4)
    expect(third.due).toBe(NOW + 12 * DAY_MS)
  })

  it('uses updated ease and a 1.3 bonus for subsequent easy reviews', () => {
    const first = scheduleReview(undefined, 'easy', NOW)
    const second = scheduleReview(first, 'easy', first.due)
    expect(second.ease).toBeCloseTo(2.8)
    expect(second.interval).toBe(15) // round(4 × 2.8 × 1.3) = round(14.56).
    expect(second.streak).toBe(2)
    const later = scheduleReview(progress({ interval: 10 }), 'easy', NOW)
    expect(later.interval).toBe(34) // round(10 × 2.65 × 1.3) = round(34.45).
  })

  it('counts mixed good/easy reviews as consecutive confidence', () => {
    const first = scheduleReview(undefined, 'good', NOW)
    const second = scheduleReview(first, 'easy', NOW)
    const third = scheduleReview(second, 'good', NOW)
    expect([first.streak, second.streak, third.streak]).toEqual([1, 2, 3])
    expect(second.interval).toBe(4)
    expect(third.interval).toBe(11) // round(4 × 2.65).
  })

  it('resets again to exactly ten minutes, lowers ease, and leaves prior progress untouched', () => {
    const previous = Object.freeze(progress({ interval: 100, due: NOW + 100 * DAY_MS }))
    const next = scheduleReview(previous, 'again', NOW)
    expect(next).toMatchObject({ interval: 10 / 1440, streak: 0, reviews: 5, due: NOW + 600_000 })
    expect(next.ease).toBeCloseTo(2.3)
    expect(previous).toEqual(progress({ interval: 100, due: NOW + 100 * DAY_MS }))
    expect(next).not.toBe(previous)
  })

  it('multiplies hard intervals by 1.2 without discarding fractional days', () => {
    const next = scheduleReview(progress({ interval: 3 }), 'hard', NOW)
    expect(next.interval).toBeCloseTo(3.6)
    expect(next.due).toBe(NOW + 311_040_000)
    expect(next.ease).toBeCloseTo(2.35)
    expect(next.streak).toBe(0)
    expect(scheduleReview(progress({ interval: 10 / 1440, streak: 0 }), 'hard', NOW).interval).toBe(1)
  })

  it.each<Rating>(['again', 'hard'])('restarts confident learning after %s', (rating) => {
    const reset = scheduleReview(progress({ interval: 100 }), rating, NOW)
    expect(scheduleReview(reset, 'good', NOW).interval).toBe(1)
    expect(scheduleReview(reset, 'easy', NOW).interval).toBe(4)
    expect(scheduleReview(reset, 'good', NOW).streak).toBe(1)
  })

  it.each<Rating>(['hard', 'good', 'easy'])('caps a growing %s interval at 365 days', (rating) => {
    const next = scheduleReview(progress({ interval: 350, ease: 3 }), rating, NOW)
    expect(next.interval).toBe(365)
    expect(next.due).toBe(NOW + 365 * DAY_MS)
  })

  it('bounds ease at 1.3 and 3.0', () => {
    expect(scheduleReview(progress({ ease: 1.3 }), 'again', NOW).ease).toBe(1.3)
    expect(scheduleReview(progress({ ease: 1.3 }), 'hard', NOW).ease).toBe(1.3)
    expect(scheduleReview(progress({ ease: 3 }), 'easy', NOW).ease).toBe(3)
    expect(scheduleReview(progress({ ease: 3 }), 'good', NOW).ease).toBe(3)
  })

  it('saturates reviews and confident streaks at safe integers', () => {
    const previous = progress({ reviews: MAX_COUNT, streak: MAX_COUNT })
    for (const rating of ['good', 'easy'] as const) {
      const next = scheduleReview(previous, rating, NOW)
      expect(next.reviews).toBe(MAX_COUNT)
      expect(next.streak).toBe(MAX_COUNT)
    }
    const overflowing = scheduleReview(progress({ reviews: MAX_COUNT * 2, streak: MAX_COUNT * 2 }), 'good', NOW)
    expect(overflowing.reviews).toBe(MAX_COUNT)
    expect(overflowing.streak).toBe(MAX_COUNT)
  })

  it('normalizes malformed in-memory numbers without emitting NaN or unsafe counters', () => {
    const next = scheduleReview(progress({ reviews: NaN, streak: Infinity, interval: Infinity, ease: NaN }), 'good', NOW)
    expect(next).toEqual({ reviews: 1, streak: 1, interval: 1, ease: 2.5, due: NOW + DAY_MS, lastReviewed: NOW, lastRating: 'good' })
    const fractional = scheduleReview(progress({ reviews: 2.9, streak: 9.5, ease: -1 }), 'good', NOW)
    expect(fractional.reviews).toBe(3)
    expect(fractional.streak).toBe(3)
    expect(fractional.ease).toBe(1.3)
  })

  it('anchors early reviews and clock corrections to now, never to a previous future timestamp', () => {
    const previous = progress({ due: NOW + 100 * DAY_MS, lastReviewed: NOW + 20 * DAY_MS })
    const next = scheduleReview(previous, 'good', NOW)
    expect(next.lastReviewed).toBe(NOW)
    expect(next.due).toBe(NOW + 20 * DAY_MS)
  })

  it('honors epoch zero, defaults to Date.now, and saturates overflowing due timestamps', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    expect(scheduleReview(undefined, 'again', 0).due).toBe(600_000)
    expect(scheduleReview(undefined, 'good').lastReviewed).toBe(NOW)
    const edge = scheduleReview(undefined, 'good', MAX_TIMESTAMP - 1)
    expect(edge.due).toBe(MAX_TIMESTAMP)
    expect(Number.isSafeInteger(edge.due)).toBe(true)
  })

  it.each([NaN, Infinity, -1, 1.5, MAX_TIMESTAMP + 1])('rejects invalid review time %s', (now) => {
    expect(() => scheduleReview(undefined, 'good', now)).toThrow(RangeError)
  })

  it('rejects a runtime-invalid rating rather than creating corrupt progress', () => {
    expect(() => scheduleReview(undefined, 'unknown' as Rating, NOW)).toThrow(/rating/)
  })
})

describe('immutable state transitions and mastery', () => {
  it('reviews frozen state without mutating nested records or unrelated preferences', () => {
    const state = defaultState()
    state.progress['dl-001'] = progress()
    state.activity['2026-09-05'] = { reviews: 2, recalled: 1 }
    state.dailyGoal = 30
    state.animation = false
    freezeState(state)
    const snapshot = JSON.stringify(state)
    const next = applyReview(state, 'ml-001', 'good', NOW)
    expect(JSON.stringify(state)).toBe(snapshot)
    expect(next).not.toBe(state)
    expect(next.progress).not.toBe(state.progress)
    expect(next.activity).not.toBe(state.activity)
    expect(next.progress['dl-001']).toBe(state.progress['dl-001'])
    expect(next.bookmarks).toBe(state.bookmarks)
    expect(next).toMatchObject({ dailyGoal: 30, animation: false })
    expect(next.activity[TODAY]).toEqual({ reviews: 1, recalled: 1 })
  })

  it('counts every review but counts only good/easy as recalled, globally across cards', () => {
    let state = defaultState()
    for (const rating of ['again', 'hard', 'good', 'easy'] as const) state = applyReview(state, 'ml-001', rating, NOW)
    expect(state.activity[TODAY]).toEqual({ reviews: 4, recalled: 2 })
    expect(state.progress['ml-001']?.reviews).toBe(4)
    state = applyReview(state, 'dl-001', 'good', NOW)
    expect(state.activity[TODAY]).toEqual({ reviews: 5, recalled: 3 })
    expect(state.progress['dl-001']?.reviews).toBe(1)
  })

  it('separates activity at local midnight', () => {
    const before = new Date(2026, 8, 6, 23, 59, 59).getTime()
    const after = new Date(2026, 8, 7, 0, 0, 1).getTime()
    const first = applyReview(defaultState(), 'ml-001', 'good', before)
    const second = applyReview(first, 'ml-001', 'again', after)
    expect(second.activity).toEqual({
      '2026-09-06': { reviews: 1, recalled: 1 },
      '2026-09-07': { reviews: 1, recalled: 0 },
    })
    expect(first.activity['2026-09-07']).toBeUndefined()
  })

  it('bounds activity counters during reviews', () => {
    const state = defaultState()
    state.activity[TODAY] = { reviews: MAX_COUNT, recalled: MAX_COUNT }
    expect(applyReview(state, 'ml-001', 'good', NOW).activity[TODAY]).toEqual({ reviews: MAX_COUNT, recalled: MAX_COUNT })
  })

  it('toggles saved cards immutably and removes duplicate bookmarks', () => {
    const initial = freezeState(defaultState())
    const saved = toggleBookmark(initial, 'ml-001')
    expect(saved.bookmarks).toEqual(['ml-001'])
    expect(initial.bookmarks).toEqual([])
    expect(saved.progress).toBe(initial.progress)
    expect(saved.activity).toBe(initial.activity)
    expect(toggleBookmark(saved, 'ml-001').bookmarks).toEqual([])
    expect(saved.bookmarks).toEqual(['ml-001'])
    const duplicated = { ...defaultState(), bookmarks: ['ml-001', 'ml-001', 'dl-001', 'dl-001'] }
    expect(toggleBookmark(duplicated, 'nlp-001').bookmarks).toEqual(['ml-001', 'dl-001', 'nlp-001'])
    expect(toggleBookmark(duplicated, 'ml-001').bookmarks).toEqual(['dl-001'])
    expect(duplicated.bookmarks).toHaveLength(4)
  })

  it.each(['__proto__', 'constructor', 'prototype', '', '   '])('refuses unsafe card ID %s', (id) => {
    const state = freezeState(defaultState())
    expect(() => applyReview(state, id, 'good', NOW)).toThrow(/card ID/)
    expect(() => toggleBookmark(state, id)).toThrow(/card ID/)
    expect(state).toEqual(defaultState())
  })

  it.each<[number, number, boolean]>([
    [2, 40, false], [3, 6.99, false], [3, 7, true], [4, 365, true], [0, 365, false],
    [NaN, 10, false], [Infinity, 10, false], [3, Infinity, false], [3.5, 10, false],
  ])('uses the mastery heuristic for streak %s and interval %s', (streak, interval, expected) => {
    expect(isMastered(progress({ streak, interval }))).toBe(expected)
  })

  it('does not consider an unseen card mastered', () => { expect(isMastered(undefined)).toBe(false) })
})

describe('local calendar and study statistics', () => {
  it('formats local dates with zero padding and without converting midnight to UTC', () => {
    expect(localDateKey(new Date(2026, 0, 2, 0, 1).getTime())).toBe('2026-01-02')
    expect(localDateKey(new Date(2026, 0, 2, 23, 59).getTime())).toBe('2026-01-02')
    expect(localDateKey(new Date(2024, 1, 29, 12).getTime())).toBe('2024-02-29')
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    expect(localDateKey()).toBe(TODAY)
    expect(() => localDateKey(NaN)).toThrow(RangeError)
  })

  it('marks every unseen card due and returns a zero-filled chronological local week', () => {
    const stats = getStudyStats(defaultState(), cards, NOW)
    expect(stats).toMatchObject({ reviewed: 0, totalReviews: 0, mastered: 0, due: 4, recallRate: 0, todayReviews: 0, todayRecalled: 0, streak: 0 })
    expect(stats.week.map((day) => day.key)).toEqual(['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', TODAY])
    expect(stats.week.map((day) => day.label)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
    expect(stats.week.every((day) => day.reviews === 0 && day.recalled === 0)).toBe(true)
  })

  it('counts known unique progress, due equality, mastery, and global activity independently', () => {
    const state = defaultState()
    state.progress = {
      'ml-001': progress({ due: NOW }),
      'ml-002': progress({ reviews: 1, streak: 1, interval: 1, due: NOW + 1 }),
      'nlp-001': progress({ reviews: 2, streak: 2, interval: 3, due: NOW - 1 }),
      unknown: progress({ reviews: 100 }),
    }
    state.activity = {
      [TODAY]: { reviews: 5, recalled: 3 },
      '2026-09-05': { reviews: 6, recalled: 4 },
      '2026-06-01': { reviews: 9, recalled: 6 },
    }
    freezeState(state)
    const stats = getStudyStats(state, [...cards, ...cards], NOW)
    expect(stats).toMatchObject({ reviewed: 3, totalReviews: 20, mastered: 1, due: 3, recallRate: 65, todayReviews: 5, todayRecalled: 3, streak: 2 })
    expect(stats.week.at(-1)).toEqual({ key: TODAY, label: 'Sun', reviews: 5, recalled: 3 })
    expect(stats.week.reduce((sum, day) => sum + day.reviews, 0)).toBe(11)
    expect(getStudyStats(state, cards.filter((card) => card.id === 'ml-002'), NOW))
      .toMatchObject({ reviewed: 1, mastered: 0, due: 0, totalReviews: 20, todayReviews: 5, todayRecalled: 3 })
  })

  it('treats zero-review progress and inherited object keys as unseen', () => {
    const state = defaultState()
    state.progress['ml-001'] = progress({ reviews: 0, streak: 0, due: NOW + DAY_MS })
    const inheritedCard: Flashcard = { id: 'toString', subject: 'ml', difficulty: 'foundation', topic: 'Safety', question: 'Question', answer: 'Answer', takeaway: 'Takeaway' }
    expect(getStudyStats(state, [...cards, inheritedCard], NOW)).toMatchObject({ reviewed: 0, due: 5, mastered: 0 })
    expect(ids(filterCards([inheritedCard], { mode: 'due' }, state, NOW))).toEqual(['toString'])
    const reviewed = applyReview(state, 'toString', 'good', NOW)
    expect(reviewed.progress['toString']?.reviews).toBe(1)
    expect(Object.getPrototypeOf(reviewed.progress)).toBe(Object.prototype)
  })

  it.each([[3, 1, 33], [3, 2, 67], [0, 0, 0], [4, 4, 100]])('rounds recall for %s reviews and %s recalled to %s percent', (reviews, recalled, expected) => {
    const state = defaultState()
    state.activity['2020-01-01'] = { reviews, recalled }
    expect(getStudyStats(state, [], NOW).recallRate).toBe(expected)
  })

  it.each<[number[], number]>([
    [[0, 1, 2], 3], [[1, 2], 2], [[0, 2, 3], 1], [[2, 3], 0], [[], 0],
    [[0], 1], [[1], 1], [[-1], 0], [[-1, 0], 1],
  ])('anchors streaks to today or yesterday for day offsets %j', (offsets, expected) => {
    const state = defaultState()
    for (const offset of offsets) {
      const day = new Date(NOW)
      day.setDate(day.getDate() - offset)
      state.activity[localDateKey(day.getTime())] = { reviews: 1, recalled: 0 }
    }
    expect(getStudyStats(state, [], NOW).streak).toBe(expected)
  })

  it('does not let a zero-review today erase yesterday’s active streak', () => {
    const state = defaultState()
    state.activity = {
      [TODAY]: { reviews: 0, recalled: 0 },
      '2026-09-05': { reviews: 1, recalled: 0 },
      '2026-09-04': { reviews: 1, recalled: 1 },
    }
    expect(getStudyStats(state, [], NOW).streak).toBe(2)
  })

  it('preserves yesterday’s streak just after midnight and ends it after a missed day', () => {
    const state = applyReview(defaultState(), 'ml-001', 'good', new Date(2026, 8, 6, 23, 59).getTime())
    const midnight = getStudyStats(state, cards, new Date(2026, 8, 7, 0, 1).getTime())
    expect(midnight).toMatchObject({ streak: 1, todayReviews: 0, todayRecalled: 0 })
    expect(midnight.week.at(-1)?.key).toBe('2026-09-07')
    expect(getStudyStats(state, cards, new Date(2026, 8, 8, 0, 1).getTime()).streak).toBe(0)
  })

  it.each([
    { now: new Date(2027, 0, 1, 0, 1).getTime(), keys: ['2026-12-30', '2026-12-31', '2027-01-01'] },
    { now: new Date(2024, 2, 1, 0, 1).getTime(), keys: ['2024-02-28', '2024-02-29', '2024-03-01'] },
  ])('crosses year boundaries and leap days using local calendar dates %#', ({ now, keys }) => {
    const state = defaultState()
    state.activity = Object.fromEntries(keys.map((key) => [key, { reviews: 1, recalled: 1 }]))
    const stats = getStudyStats(state, [], now)
    expect(stats.streak).toBe(3)
    expect(stats.week.slice(-3).map((day) => day.key)).toEqual(keys)
  })

  it.each([
    { now: new Date(2026, 2, 9, 0, 5).getTime(), keys: ['2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07', '2026-03-08', '2026-03-09'] },
    { now: new Date(2026, 10, 1, 23, 55).getTime(), keys: ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'] },
  ])('avoids duplicate/skipped days across spring/fall DST transitions %#', ({ now, keys }) => {
    const state = defaultState()
    state.activity = Object.fromEntries(keys.map((key) => [key, { reviews: 1, recalled: 1 }]))
    const stats = getStudyStats(state, [], now)
    expect(stats.week.map((day) => day.key)).toEqual(keys)
    expect(stats.streak).toBe(7)
    expect(stats.todayReviews).toBe(1)
  })

  it('includes all valid activity in totals but not future days in the current week or streak', () => {
    const state = defaultState()
    state.activity = { '2026-09-07': { reviews: 2, recalled: 1 }, invalid: { reviews: 100, recalled: 100 } }
    expect(getStudyStats(state, [], NOW)).toMatchObject({ totalReviews: 2, recallRate: 50, streak: 0, todayReviews: 0 })
  })

  it('uses the current clock by default for state transitions, statistics, and due filters', () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
    const state = applyReview(defaultState(), 'ml-001', 'good')
    expect(state.activity[TODAY]).toEqual({ reviews: 1, recalled: 1 })
    expect(getStudyStats(state, cards)).toMatchObject({ reviewed: 1, due: 3, todayReviews: 1 })
    expect(ids(filterCards(cards, { mode: 'due' }, state))).toEqual(['ml-002', 'dl-001', 'nlp-001'])
  })
})

describe('copying Fisher-Yates shuffle', () => {
  it('makes exactly n - 1 sampled swaps without modifying frozen input', () => {
    const input = Object.freeze([1, 2, 3, 4])
    const random = vi.fn().mockReturnValueOnce(0.1).mockReturnValueOnce(0.7).mockReturnValueOnce(0.4)
    const shuffled = shuffleCards(input, random)
    expect(shuffled).toEqual([2, 4, 3, 1])
    expect(input).toEqual([1, 2, 3, 4])
    expect(shuffled).not.toBe(input)
    expect(random).toHaveBeenCalledTimes(3)
  })

  it('handles both ends of the random range and preserves duplicates and undefined values', () => {
    expect(shuffleCards([1, 2, 3, 4], () => 0)).toEqual([2, 3, 4, 1])
    expect(shuffleCards([1, 2, 3], () => 1 - Number.EPSILON)).toEqual([1, 2, 3])
    expect(shuffleCards([undefined, 0, 1], () => 0)).toEqual([0, 1, undefined])
    expect(shuffleCards([1, 1, 2], () => 0)).toEqual([1, 2, 1])
  })

  it('copies empty and singleton inputs without asking for randomness', () => {
    const random = vi.fn(() => 0)
    const empty: number[] = []
    const single = [{}]
    expect(shuffleCards(empty, random)).toEqual([])
    expect(shuffleCards(empty, random)).not.toBe(empty)
    expect(shuffleCards(single, random)).not.toBe(single)
    expect(shuffleCards(single, random)[0]).toBe(single[0])
    expect(random).not.toHaveBeenCalled()
  })

  it('uses Math.random by default while preserving card object identities', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const shuffled = shuffleCards(cards)
    expect(new Set(shuffled)).toEqual(new Set(cards))
    expect(shuffled).not.toBe(cards)
    expect(Math.random).toHaveBeenCalledTimes(cards.length - 1)
  })

  it.each([-1, 1, NaN, Infinity])('rejects invalid random samples %s', (sample) => {
    const input = Object.freeze([1, 2])
    expect(() => shuffleCards(input, () => sample)).toThrow(RangeError)
    expect(input).toEqual([1, 2])
  })
})

describe('composable, order-preserving filters', () => {
  it('returns all cards for omitted, all, empty-topic, or whitespace-query filters', () => {
    const state = freezeState(defaultState())
    expect(filterCards(cards, {}, state, NOW)).toEqual(cards)
    expect(filterCards(cards, { subject: 'all', difficulty: 'all', topic: 'all', query: '  ', mode: 'all' }, state, NOW)).toEqual(cards)
    expect(filterCards(cards, { topic: '' }, state, NOW)).toEqual(cards)
    expect(filterCards(cards, {}, state, NOW)).not.toBe(cards)
  })

  it('combines subject, difficulty, topic, and query constraints with AND', () => {
    const filtered = filterCards(cards, { subject: 'ml', difficulty: 'advanced', topic: 'Model evaluation', query: ' leakage ' }, defaultState(), NOW)
    expect(ids(filtered)).toEqual(['ml-002'])
    expect(ids(filterCards(cards, { topic: 'Model evaluation' }, defaultState(), NOW))).toEqual(['ml-001', 'ml-002'])
    expect(filterCards(cards, { subject: 'nlp', difficulty: 'advanced' }, defaultState(), NOW)).toEqual([])
  })

  it.each<[string, string[]]>([
    ['  HELD-OUT  ', ['ml-001']],
    ['ATTENTION WEIGHTS', ['dl-001']],
    ['training split', ['ml-002']],
    ['language representations', ['nlp-001']],
    ['machine learning', ['ml-001', 'ml-002']],
    ['deep learning', ['dl-001']],
    ['natural language processing', ['nlp-001']],
    ['NLP', ['nlp-001']],
    ['not present anywhere', []],
  ])('searches questions, answers, takeaways, topics, and subject names for %s', (query, expected) => {
    expect(ids(filterCards(cards, { query }, defaultState(), NOW))).toEqual(expected)
  })

  it('includes unseen and due-at-now cards, but excludes future due dates', () => {
    const state = defaultState()
    state.progress = {
      'ml-001': progress({ due: NOW }),
      'ml-002': progress({ due: NOW + 1 }),
      'nlp-001': progress({ due: NOW - 1 }),
    }
    freezeState(state)
    const snapshot = JSON.stringify(state)
    expect(ids(filterCards(cards, { mode: 'due' }, state, NOW))).toEqual(['ml-001', 'dl-001', 'nlp-001'])
    expect(ids(filterCards(cards, { mode: 'due', subject: 'ml' }, state, NOW))).toEqual(['ml-001'])
    expect(JSON.stringify(state)).toBe(snapshot)
  })

  it('filters saved cards in deck order, ignoring duplicate and unknown bookmark IDs', () => {
    const state = freezeState({ ...defaultState(), bookmarks: ['nlp-001', 'ml-001', 'unknown', 'ml-001'] })
    expect(ids(filterCards(cards, { mode: 'saved' }, state, NOW))).toEqual(['ml-001', 'nlp-001'])
    expect(ids(filterCards(cards, { mode: 'saved', subject: 'nlp', query: 'context' }, state, NOW))).toEqual(['nlp-001'])
    expect(state.bookmarks).toEqual(['nlp-001', 'ml-001', 'unknown', 'ml-001'])
  })
})