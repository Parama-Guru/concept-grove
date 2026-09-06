import { describe, expect, it } from 'vitest'
import { cards, originalCards, subjects, subjectCounts } from './index'
import { communityCards } from './community'

describe('the original exam-preparation question bank', () => {
  it('contains 600 unique cards and stable IDs', () => {
    expect(originalCards).toHaveLength(600)
    expect(new Set(originalCards.map((card) => card.id)).size).toBe(600)
    expect(new Set(originalCards.map((card) => card.question.toLowerCase().trim())).size).toBe(600)
    expect(new Set(originalCards.map((card) => card.answer.trim())).size).toBe(600)
  })

  for (const subject of subjects) {
    it(`includes 200 substantial ${subject.name} cards across 10 topics`, () => {
      const deck = originalCards.filter((card) => card.subject === subject.id)
      const topics = new Set(deck.map((card) => card.topic))
      expect(deck).toHaveLength(200)
      expect(topics.size).toBe(10)
      for (const topic of topics) {
        expect(deck.filter((card) => card.topic === topic)).toHaveLength(20)
      }
      expect(deck.filter((card) => card.difficulty === 'advanced').length).toBeGreaterThanOrEqual(35)
      expect(deck.filter((card) => card.difficulty === 'foundation').length).toBeGreaterThanOrEqual(45)
      for (const card of deck) {
        expect(card.question.length).toBeGreaterThan(20)
        expect(card.answer.length).toBeGreaterThan(70)
        expect(card.takeaway.length).toBeGreaterThan(15)
        expect(card.id).toMatch(new RegExp(`^${subject.id}-\\d{3}$`))
        expect(card.question + card.answer).not.toMatch(/\b(TODO|placeholder|lorem ipsum)\b/i)
      }
    })
  }

  it('preserves reviewed arithmetic examples and clear introductory questions', () => {
    expect(cards[0]?.question).toBe('What is the difference between supervised and unsupervised learning?')
    expect(cards.find((card) => card.question.includes('12 input features to 8 dense units'))?.answer).toContain('104')
    expect(cards.find((card) => card.question.includes('128 tokens including two special tokens'))?.answer).toContain('14')
    expect(cards.find((card) => card.question.includes('false-positive cost 3'))?.answer).toContain('0.2')
  })

  it('keeps the published bank unique, balanced, and substantial as contributions grow', () => {
    expect(cards.length).toBeGreaterThanOrEqual(600)
    expect(new Set(cards.map((card) => card.id)).size).toBe(cards.length)
    expect(new Set(cards.map((card) => card.question.toLowerCase().trim())).size).toBe(cards.length)
    expect(new Set(cards.map((card) => card.answer.trim())).size).toBe(cards.length)
    expect(new Set(subjects.map(({ id }) => subjectCounts[id].cards)).size).toBe(1)
    expect(cards.slice(0, 600)).toEqual(originalCards)
    for (const card of communityCards) {
      expect(card.id).toMatch(new RegExp(`^${card.subject}-community-[a-z0-9]+(?:-[a-z0-9]+)*$`))
      expect(subjects.map(({ id }) => id)).toContain(card.subject)
      expect(['foundation', 'intermediate', 'advanced']).toContain(card.difficulty)
      expect(card.topic.trim().length).toBeGreaterThan(0)
      expect(card.question.trim().length).toBeGreaterThan(20)
      expect(card.answer.trim().length).toBeGreaterThan(70)
      expect(card.takeaway.trim().length).toBeGreaterThan(15)
      expect(card.question + card.answer).not.toMatch(/\b(TODO|placeholder|lorem ipsum)\b/i)
    }
  })
})