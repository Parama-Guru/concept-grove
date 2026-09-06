import { deepLearningCards } from './deepLearning'
import { machineLearningCards } from './machineLearning'
import { naturalLanguageCards } from './naturalLanguage'
import { communityCards } from './community'
import type { SubjectId } from '../types'

export const originalCards = [...machineLearningCards, ...deepLearningCards, ...naturalLanguageCards]
export const cards = [...originalCards, ...communityCards]
export const cardIds = new Set(cards.map((card) => card.id))
export const cardById = new Map(cards.map((card) => [card.id, card]))

export const subjects: {
  id: SubjectId
  name: string
  shortName: string
  description: string
  eyebrow: string
}[] = [
  { id: 'ml', name: 'Machine Learning', shortName: 'ML', description: 'From patterns to predictions.', eyebrow: 'THE FOUNDATIONS' },
  { id: 'dl', name: 'Deep Learning', shortName: 'DL', description: 'Go a few layers deeper.', eyebrow: 'THE CONNECTIONS' },
  { id: 'nlp', name: 'Natural Language Processing', shortName: 'NLP', description: 'Make sense of every word.', eyebrow: 'THE LANGUAGE' },
]

export const subjectCounts = Object.fromEntries(subjects.map(({ id }) => {
  const deck = cards.filter((card) => card.subject === id)
  return [id, { cards: deck.length, topics: new Set(deck.map((card) => card.topic)).size }]
})) as Record<SubjectId, { cards: number; topics: number }>

export const subjectName = (id: SubjectId) => subjects.find((subject) => subject.id === id)?.name ?? id

export const difficultyNames = {
  foundation: 'Foundation',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
} as const