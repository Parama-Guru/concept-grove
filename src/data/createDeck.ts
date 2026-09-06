import type { Difficulty, Flashcard, SubjectId } from '../types'

export type CardSeed = readonly [
  question: string,
  answer: string,
  takeaway: string,
  difficulty: Difficulty,
]

export interface TopicSeed {
  topic: string
  cards: readonly CardSeed[]
}

export function createDeck(subject: SubjectId, topics: readonly TopicSeed[]): Flashcard[] {
  let index = 0
  return topics.flatMap(({ topic, cards }) =>
    cards.map(([question, answer, takeaway, difficulty]) => ({
      id: `${subject}-${String(++index).padStart(3, '0')}`,
      subject,
      topic,
      question,
      answer,
      takeaway,
      difficulty,
    })),
  )
}