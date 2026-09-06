export type SubjectId = 'ml' | 'dl' | 'nlp'
export type Difficulty = 'foundation' | 'intermediate' | 'advanced'
export type Rating = 'again' | 'hard' | 'good' | 'easy'
export type View = 'study' | 'library' | 'saved' | 'progress'
export type StudyMode = 'all' | 'due' | 'saved'

export interface Flashcard {
  id: string
  subject: SubjectId
  topic: string
  difficulty: Difficulty
  question: string
  answer: string
  takeaway: string
}

export interface CardProgress {
  reviews: number
  interval: number
  ease: number
  due: number
  lastReviewed: number
  lastRating: Rating
  streak: number
}

export interface DailyActivity {
  reviews: number
  recalled: number
}

export interface StudyState {
  version: 1
  progress: Record<string, CardProgress>
  bookmarks: string[]
  activity: Record<string, DailyActivity>
  dailyGoal: number
  animation: boolean
}