import { useDeferredValue, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  Bookmark,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Lightbulb,
  RotateCcw,
  Search,
  SearchX,
  X,
} from 'lucide-react'
import { cards, difficultyNames, subjectName, subjects } from '../data'
import { filterCards } from '../lib/study'
import type { Difficulty, Flashcard, StudyState, SubjectId } from '../types'
import SelectField from './SelectField'
import './CardLibrary.css'

type CardLibraryProps = {
  state: StudyState
  savedOnly: boolean
  onBookmark: (id: string) => void
  onStudy: (card: Flashcard) => void
}

const PAGE_SIZE = 12

export default function CardLibrary({ state, savedOnly, onBookmark, onStudy }: CardLibraryProps) {
  const [query, setQuery] = useState('')
  const [subject, setSubject] = useState<SubjectId | 'all'>('all')
  const [difficulty, setDifficulty] = useState<Difficulty | 'all'>('all')
  const [topic, setTopic] = useState('all')
  const deferredQuery = useDeferredValue(query)
  const searchInput = useRef<HTMLInputElement>(null)
  const resultsHeading = useRef<HTMLHeadingElement>(null)
  const mode = savedOnly ? 'saved' : 'all'
  const searchPending = query !== deferredQuery

  const bookmarks = useMemo(() => new Set(state.bookmarks), [state.bookmarks])
  // Search does not narrow the topic menu, so a query cannot hide the active filter.
  const topics = useMemo(() => [...new Set(
    filterCards(cards, { subject, difficulty, mode }, state).map((card) => card.topic),
  )].sort((left, right) => left.localeCompare(right)), [subject, difficulty, mode, state])
  const selectedTopic = topics.includes(topic) ? topic : 'all'
  const matches = useMemo(() => filterCards(cards, {
    query: deferredQuery,
    subject,
    difficulty,
    topic: selectedTopic,
    mode,
  }, state), [deferredQuery, subject, difficulty, selectedTopic, mode, state])

  const filterScope = JSON.stringify([savedOnly, query, deferredQuery, subject, difficulty, selectedTopic])
  const [pagination, setPagination] = useState(() => ({ scope: filterScope, index: 0 }))
  const pageCount = Math.max(1, Math.ceil(matches.length / PAGE_SIZE))
  const pageIndex = pagination.scope === filterScope ? Math.min(pagination.index, pageCount - 1) : 0

  // Guarded render-time adjustments avoid committing a stale or out-of-range page.
  // Persist the clamp so adding a bookmark later cannot resurrect an old page index.
  if (pagination.scope !== filterScope || pagination.index !== pageIndex) {
    setPagination({ scope: filterScope, index: pageIndex })
  }
  if (topic !== selectedTopic) setTopic(selectedTopic)

  const firstIndex = pageIndex * PAGE_SIZE
  const lastIndex = Math.min(firstIndex + PAGE_SIZE, matches.length)
  const visibleCards = matches.slice(firstIndex, lastIndex)
  const hasFilters = query.length > 0 || subject !== 'all' || difficulty !== 'all' || selectedTopic !== 'all'
  const emptySaved = savedOnly && !cards.some((card) => bookmarks.has(card.id))

  function clearFilters() {
    setQuery('')
    setSubject('all')
    setDifficulty('all')
    setTopic('all')
    setPagination({ scope: filterScope, index: 0 })
    searchInput.current?.focus({ preventScroll: true })
  }

  function showPage(index: number) {
    setPagination({ scope: filterScope, index: Math.max(0, Math.min(index, pageCount - 1)) })
    resultsHeading.current?.focus()
  }

  function handleBookmark(id: string) {
    // Removing a saved card unmounts its button; give keyboard focus a stable home.
    if (savedOnly) resultsHeading.current?.focus({ preventScroll: true })
    onBookmark(id)
  }

  return (
    <section className="library-panel" aria-label={savedOnly ? 'Saved flashcards' : 'Flashcard library'}>
      <div className="library-toolbar">
        <div className="library-search" role="search" aria-label="Search flashcards">
          <Search className="library-search-icon" size={20} aria-hidden="true" />
          <label className="sr-only" htmlFor="library-search">Search cards</label>
          <input
            ref={searchInput}
            id="library-search"
            className="library-search-input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search questions, topics, or answers…"
            autoComplete="off"
            aria-controls="library-results"
          />
          {query.length > 0 && (
            <button
              className="icon-button library-search-clear"
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQuery('')
                searchInput.current?.focus({ preventScroll: true })
              }}
            >
              <X size={18} aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="library-subjects" role="group" aria-label="Filter by subject">
          <button
            className="library-subject-chip"
            type="button"
            aria-pressed={subject === 'all'}
            onClick={() => { setSubject('all'); setTopic('all') }}
          >
            All subjects
          </button>
          {subjects.map((item) => (
            <button
              key={item.id}
              className="library-subject-chip"
              type="button"
              aria-pressed={subject === item.id}
              onClick={() => { setSubject(item.id); setTopic('all') }}
            >
              <span className={`subject-dot ${item.id}`} aria-hidden="true" />
              {item.id === 'nlp' ? item.shortName : item.name}
            </button>
          ))}
        </div>

        <div className="library-filter-controls">
          <SelectField<Difficulty | 'all'>
            label="Difficulty"
            value={difficulty}
            onChange={(value) => { setDifficulty(value); setTopic('all') }}
            options={[{ value: 'all', label: 'All levels' }, ...Object.entries(difficultyNames).map(([value, label]) => ({ value: value as Difficulty, label }))]}
          />
          <SelectField
            label="Topic"
            value={selectedTopic}
            onChange={setTopic}
            options={[{ value: 'all', label: 'All topics' }, ...topics.map((name) => ({ value: name, label: name }))]}
          />
          {hasFilters && (
            <button className="button button-secondary library-clear-filters" type="button" onClick={clearFilters}>
              <RotateCcw size={16} aria-hidden="true" />
              Clear filters
            </button>
          )}
        </div>
      </div>

      <section id="library-results" className="library-results" aria-labelledby="library-results-heading" aria-busy={searchPending}>
        <div className="library-results-header" role="status" aria-live="polite" aria-atomic="true">
          <h2
            ref={resultsHeading}
            id="library-results-heading"
            className="library-result-count"
            tabIndex={-1}
            aria-describedby="library-result-range"
          >
            {matches.length.toLocaleString()} {savedOnly ? 'saved ' : ''}{matches.length === 1 ? 'card' : 'cards'}
          </h2>
          <p id="library-result-range" className="library-result-range">
            {searchPending
              ? 'Updating results…'
              : matches.length > 0 ? `Showing ${firstIndex + 1}–${lastIndex} of ${matches.length.toLocaleString()}` : ''}
          </p>
        </div>

        {emptySaved ? (
          <div className="empty-state library-empty">
            <div className="library-empty-icon"><Lightbulb size={28} aria-hidden="true" /></div>
            <p className="eyebrow library-empty-eyebrow">A little collection of clarity</p>
            <h3 className="library-empty-title">Keep your lightbulb moments.</h3>
            <p className="library-empty-message">
              Bookmark cards while studying, and they’ll be waiting here whenever you want to revisit an idea.
            </p>
          </div>
        ) : matches.length === 0 ? (
          <div className="empty-state library-empty">
            <div className="library-empty-icon"><SearchX size={28} aria-hidden="true" /></div>
            <h3 className="library-empty-title">No cards found</h3>
            <p className="library-empty-message">Try a different word, or clear your filters to give curiosity a little more room.</p>
            <button className="button button-primary library-empty-reset" type="button" onClick={clearFilters}>
              <RotateCcw size={16} aria-hidden="true" />
              Clear filters
            </button>
          </div>
        ) : (
          <>
            <div className="library-grid" data-search-pending={searchPending}>
              {visibleCards.map((card) => {
                const saved = bookmarks.has(card.id)
                const questionId = `library-question-${card.id}`

                return (
                  <article className="library-card" key={card.id} aria-labelledby={questionId}>
                    <div className="library-card-header">
                      <div className="library-card-context">
                        <span className="library-card-subject">
                          <span className={`subject-dot ${card.subject}`} aria-hidden="true" />
                          {subjectName(card.subject)}
                        </span>
                        <p className="eyebrow library-card-topic">{card.topic}</p>
                      </div>
                      <button
                        className="icon-button library-bookmark"
                        type="button"
                        aria-label={saved ? 'Unsave card' : 'Save card'}
                        aria-pressed={saved}
                        aria-describedby={questionId}
                        onClick={() => handleBookmark(card.id)}
                      >
                        <Bookmark size={19} fill={saved ? 'currentColor' : 'none'} aria-hidden="true" />
                      </button>
                    </div>
                    <h3 id={questionId} className="library-card-question">{card.question}</h3>
                    <details className="library-answer">
                      <summary>
                        <span>Peek at answer</span>
                        <ChevronDown className="library-answer-chevron" size={16} aria-hidden="true" />
                      </summary>
                      <div className="library-answer-body">
                        <p className="library-answer-text">{card.answer}</p>
                        <div className="library-takeaway">
                          <p className="library-takeaway-label">Takeaway</p>
                          <p className="library-answer-text">{card.takeaway}</p>
                        </div>
                      </div>
                    </details>
                    <div className="library-card-footer">
                      <span className={`library-difficulty library-difficulty-${card.difficulty}`}>
                        {difficultyNames[card.difficulty]}
                      </span>
                      <button
                        className="button button-secondary library-study-button"
                        type="button"
                        aria-describedby={questionId}
                        onClick={() => onStudy(card)}
                      >
                        Study card
                        <ArrowRight size={16} aria-hidden="true" />
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>

            <nav className="library-pagination" aria-label="Library pagination">
              <button
                className="button button-secondary library-page-button"
                type="button"
                aria-label="Previous page"
                disabled={pageIndex === 0 || searchPending}
                onClick={() => showPage(pageIndex - 1)}
              >
                <ChevronLeft size={16} aria-hidden="true" />
                Previous
              </button>
              <p className="library-page-indicator">Page <strong>{pageIndex + 1}</strong> of <strong>{pageCount}</strong></p>
              <button
                className="button button-secondary library-page-button"
                type="button"
                aria-label="Next page"
                disabled={pageIndex === pageCount - 1 || searchPending}
                onClick={() => showPage(pageIndex + 1)}
              >
                Next
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </nav>
          </>
        )}
      </section>
    </section>
  )
}