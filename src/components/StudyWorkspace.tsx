import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft, ArrowLeftRight, ArrowRight, Bookmark, Check, CheckCheck,
  ChevronDown, Keyboard, Lightbulb, RotateCcw, Shuffle, Sparkles, Target,
} from 'lucide-react'
import { cards, difficultyNames, subjectName, subjects } from '../data'
import { filterCards, getStudyStats, scheduleReview, shuffleCards } from '../lib/study'
import type { Difficulty, Flashcard, Rating, StudyMode, StudyState, SubjectId } from '../types'
import SelectField from './SelectField'

export interface StudyRequest {
  revision: number
  subject: SubjectId | 'all'
  difficulty: Difficulty | 'all'
  mode: StudyMode
  shuffled: boolean
  limit?: number
  firstId?: string
}

interface StudyWorkspaceProps {
  state: StudyState
  request: StudyRequest
  onConfigure: (change: Partial<Omit<StudyRequest, 'revision'>>) => void
  onRate: (id: string, rating: Rating) => void
  onBookmark: (id: string) => void
  onLibrary: () => void
  onSettings: () => void
  onHelp: () => void
}

const ratings: { id: Rating; label: string; key: string }[] = [
  { id: 'again', label: 'Again', key: '1' },
  { id: 'hard', label: 'Hard', key: '2' },
  { id: 'good', label: 'Good', key: '3' },
  { id: 'easy', label: 'Easy', key: '4' },
]

function intervalLabel(interval: number): string {
  if (interval < 1) return `${Math.round(interval * 1440)} min`
  return `${Math.round(interval * 10) / 10} ${interval === 1 ? 'day' : 'days'}`
}

export default function StudyWorkspace({
  state, request, onConfigure, onRate, onBookmark, onLibrary, onSettings, onHelp,
}: StudyWorkspaceProps) {
  // A session is a snapshot. Rating a due card must not shrink the array and skip its neighbor.
  const [queue] = useState<Flashcard[]>(() => {
    const matching = filterCards(cards, request, state)
    const ordered = request.shuffled ? shuffleCards(matching) : matching
    return request.limit ? ordered.slice(0, request.limit) : ordered
  })
  const [index, setIndex] = useState(() => Math.max(0, queue.findIndex((card) => card.id === request.firstId)))
  const [revealed, setRevealed] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [rated, setRated] = useState<Set<string>>(() => new Set())
  const ratedRef = useRef(rated)
  const [announcement, setAnnouncement] = useState('')
  const cardRef = useRef<HTMLElement>(null)
  const [keyboardMode, setKeyboardMode] = useState(false)
  const card = queue[index]
  const currentSaved = card ? state.bookmarks.includes(card.id) : false
  const stats = getStudyStats(state, cards)
  const goalPercent = Math.min(100, (stats.todayReviews / state.dailyGoal) * 100)
  const matching = filterCards(cards, { ...request, mode: 'all' }, state)
  const dueCount = filterCards(matching, { mode: 'due' }, state).length
  const savedCount = filterCards(matching, { mode: 'saved' }, state).length

  function activateStudyKeys() {
    setKeyboardMode(true)
    cardRef.current?.focus({ preventScroll: true })
  }

  useEffect(() => {
    // Subject changes and quick/library sessions remount the queue; focus the new card,
    // not the now-detached button or dropdown from the previous session.
    if (request.revision > 0) cardRef.current?.focus({ preventScroll: true })
  }, [request.revision])

  function navigate(direction: number) {
    const next = index + direction
    if (next >= 0 && next < queue.length) {
      setIndex(next)
      setRevealed(false)
      setAnnouncement(`Card ${next + 1} of ${queue.length}. ${queue[next]?.question ?? ''}`)
    } else {
      setAnnouncement(`${direction > 0 ? 'Last' : 'First'} card in this session. Press Escape for normal keyboard navigation.`)
    }
  }

  function rate(rating: Rating) {
    if (!card || !revealed || ratedRef.current.has(card.id) || completed) return
    const nextRated = new Set(ratedRef.current).add(card.id)
    ratedRef.current = nextRated
    setRated(nextRated)
    onRate(card.id, rating)
    const nextIndex = queue.findIndex((candidate, candidateIndex) => candidateIndex > index && !nextRated.has(candidate.id))
    const remainingIndex = nextIndex >= 0 ? nextIndex : queue.findIndex((candidate) => !nextRated.has(candidate.id))
    if (remainingIndex === -1) {
      setCompleted(true)
      setAnnouncement(`Session complete. You reviewed ${nextRated.size} cards.`)
    } else {
      setIndex(remainingIndex)
      setRevealed(false)
      setAnnouncement(`Rated ${rating}. Card ${remainingIndex + 1}: ${queue[remainingIndex]?.question ?? ''}`)
    }
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target instanceof Element ? event.target : null
      if (event.defaultPrevented || event.isComposing || event.repeat || event.ctrlKey || event.metaKey || event.altKey
        || document.querySelector('dialog[open], [role="listbox"], [role="dialog"][aria-modal="true"]')
        || target?.closest('input, textarea, select, [role="combobox"], [role="textbox"], [contenteditable]:not([contenteditable="false"])')) return
      if (completed || !card) return
      const active = keyboardMode && target === cardRef.current
      if (event.key === 'Escape' && active) {
        event.preventDefault()
        setKeyboardMode(false)
        setAnnouncement('Study keys off. Tab moves between controls. Click the card or enable study keys to resume.')
        return
      }
      if (event.key === 'Tab') {
        if (!active) return
        event.preventDefault()
        navigate(event.shiftKey ? -1 : 1)
        return
      }
      // Controls reached with normal Tab retain standard keyboard activation. Mouse
      // study actions explicitly return focus to the card, so Space cannot replay them.
      if (target?.closest('button, a, summary, [role="button"]')) return
      if (event.code === 'Space' || event.key === ' ') {
        event.preventDefault()
        setRevealed(true)
        activateStudyKeys()
      } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault()
        navigate(event.key === 'ArrowRight' ? 1 : -1)
        activateStudyKeys()
      } else if (event.key.toLowerCase() === 'b') {
        event.preventDefault()
        onBookmark(card.id)
        activateStudyKeys()
      } else {
        const rating = ratings.find((item) => item.key === event.key)
        if (rating && revealed) {
          event.preventDefault()
          rate(rating.id)
          activateStudyKeys()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  function chooseMode(mode: StudyMode) {
    onConfigure({ mode, firstId: undefined, limit: undefined })
  }

  return (
    <section className="study-section" id="study-session" aria-labelledby="study-heading">
      <div className="section-heading">
        <div><p className="eyebrow">A MOMENT OF FOCUS</p><h2 id="study-heading">Let’s make it stick.</h2></div>
        <button className="text-button" onClick={() => onConfigure({ shuffled: true, firstId: undefined })}>
          <Shuffle size={15} aria-hidden="true" /> Shuffle cards
        </button>
      </div>

      <div className="study-layout">
        <div className="study-main">
          <div className="study-toolbar">
            <div className="mode-tabs" role="group" aria-label="Study mode">
              <button aria-pressed={request.mode === 'all'} onClick={() => chooseMode('all')}>All cards</button>
              <button aria-pressed={request.mode === 'due'} onClick={() => chooseMode('due')}>Due <span>{dueCount}</span></button>
              <button aria-pressed={request.mode === 'saved'} onClick={() => chooseMode('saved')}>Saved <span>{savedCount}</span></button>
            </div>
            <div className="study-selects">
              <SelectField<SubjectId | 'all'>
                label="Study subject"
                hideLabel
                compact
                value={request.subject}
                onChange={(subject) => onConfigure({ subject, firstId: undefined, limit: undefined })}
                options={[{ value: 'all', label: 'All subjects' }, ...subjects.map((subject) => ({ value: subject.id, label: subject.shortName === 'NLP' ? 'NLP' : subject.name }))]}
              />
              <SelectField<Difficulty | 'all'>
                label="Study difficulty"
                hideLabel
                compact
                value={request.difficulty}
                onChange={(difficulty) => onConfigure({ difficulty, firstId: undefined })}
                options={[{ value: 'all', label: 'All levels' }, ...Object.entries(difficultyNames).map(([value, label]) => ({ value: value as Difficulty, label }))]}
              />
            </div>
          </div>

          {completed ? (
            <div className="session-complete">
              <span className="completion-icon"><CheckCheck size={36} aria-hidden="true" /></span>
              <p className="eyebrow">SMALL STEPS. REAL PROGRESS.</p>
              <h3>A little more connected.</h3>
              <p>You reviewed <strong>{rated.size} {rated.size === 1 ? 'card' : 'cards'}</strong>. Give those ideas a moment to settle in.</p>
              <button className="button button-primary" onClick={() => onConfigure({ mode: 'due', shuffled: true, firstId: undefined })}>Start another session <ArrowRight size={16} aria-hidden="true" /></button>
              <button className="text-button" onClick={onLibrary}>Explore the library</button>
            </div>
          ) : card ? (
            <>
              <div className="study-shortcuts" id="study-shortcuts">
                <p><kbd>Space</kbd> reveal · <kbd>Tab</kbd> next <span>{keyboardMode ? '· Esc for normal navigation' : '· Click the card to begin'}</span></p>
                <button
                  type="button"
                  className="text-button study-keys-toggle"
                  aria-label={keyboardMode ? 'Exit study keys' : 'Enable study keys'}
                  aria-pressed={keyboardMode}
                  onPointerDown={(event) => { if (keyboardMode) event.preventDefault() }}
                  onClick={() => {
                    if (keyboardMode) setKeyboardMode(false)
                    else activateStudyKeys()
                  }}
                >
                  <Keyboard size={16} aria-hidden="true" />{keyboardMode ? 'Study keys on' : 'Enable study keys'}
                </button>
              </div>
              <div className="study-deck" onClick={(event) => {
                if (event.detail > 0) activateStudyKeys()
              }}>
              <article
                ref={cardRef}
                className={`flashcard ${revealed ? 'is-revealed' : ''}`}
                aria-label="Current flashcard"
                aria-describedby="study-shortcuts"
                aria-keyshortcuts={keyboardMode ? 'Space Tab Shift+Tab ArrowLeft ArrowRight B 1 2 3 4 Escape' : 'Space'}
                data-testid="flashcard"
                tabIndex={0}
                onFocus={(event) => { if (event.target === event.currentTarget) setKeyboardMode(true) }}
                onBlur={() => setKeyboardMode(false)}
              >
                <div className="flashcard-topline">
                  <span className={`subject-pill ${card.subject}`}><span className={`subject-dot ${card.subject}`} />{subjectName(card.subject)}</span>
                  <div className="flashcard-meta"><span className={`difficulty-pill ${card.difficulty}`}>{difficultyNames[card.difficulty]}</span>
                    <button className={`icon-button bookmark-button ${currentSaved ? 'is-saved' : ''}`} aria-label={currentSaved ? 'Unsave current card' : 'Save current card'} aria-pressed={currentSaved} onClick={() => onBookmark(card.id)}><Bookmark size={19} fill={currentSaved ? 'currentColor' : 'none'} aria-hidden="true" /></button>
                  </div>
                </div>

                <div className={`flashcard-content ${revealed ? 'answer-content' : ''}`} key={`${card.id}-${revealed}`}>
                  <div className="card-topic"><span>{card.topic}</span><span className="tiny-dot" /><span>{revealed ? 'THE ANSWER' : `QUESTION ${String(index + 1).padStart(2, '0')}`}</span></div>
                  <h3 className="card-question">{card.question}</h3>
                  {revealed ? (
                    <>
                      <p className="card-answer">{card.answer}</p>
                      <div className="card-takeaway"><Lightbulb size={18} aria-hidden="true" /><div><span>MAKE IT STICK</span><p>{card.takeaway}</p></div></div>
                      <button className="text-button flip-back" onClick={() => setRevealed(false)}><RotateCcw size={13} aria-hidden="true" /> Back to question</button>
                    </>
                  ) : (
                    <>
                      <button className="button reveal-button" onClick={() => setRevealed(true)}><ArrowLeftRight size={17} aria-hidden="true" /> Reveal answer</button>
                      <span className="flip-hint">or press <kbd>Space</kbd> to reveal</span>
                    </>
                  )}
                </div>

                <div className="flashcard-bottomline">
                  <span><span className="mini-card-icon" aria-hidden="true" />{rated.has(card.id) ? 'Reviewed this session' : 'Think first. Then flip.'}</span>
                  <span>{String(index + 1).padStart(2, '0')} <span className="muted">/ {queue.length}</span></span>
                </div>
              </article>

              <div className="card-navigation">
                <button className="navigation-button" onClick={() => navigate(-1)} disabled={index === 0} aria-label="Previous card"><ArrowLeft size={17} aria-hidden="true" /><span>Previous</span></button>
                <div className="session-indicator"><div className="session-line"><span style={{ width: `${(rated.size / queue.length) * 100}%` }} /></div><span>{rated.size} of {queue.length} reviewed{request.limit ? ' · Quick session' : ''}</span></div>
                <button className="navigation-button" onClick={() => navigate(1)} disabled={index === queue.length - 1} aria-label="Next card"><span>Next card</span><ArrowRight size={17} aria-hidden="true" /></button>
              </div>

              {revealed && !rated.has(card.id) ? (
                <div className="rating-panel">
                  <p>How well did you know it? <span>Your next review adjusts to your answer.</span></p>
                  <div className="rating-buttons">
                    {ratings.map((rating) => <button className={`rating-button rating-${rating.id}`} key={rating.id} onClick={() => rate(rating.id)} aria-label={`Rate ${rating.label}`}><span><kbd>{rating.key}</kbd>{rating.label}</span><small>{intervalLabel(scheduleReview(state.progress[card.id], rating.id).interval)}</small></button>)}
                  </div>
                </div>
              ) : (
                <p className="study-footer-note"><Sparkles size={14} aria-hidden="true" />{rated.has(card.id) ? 'Already reviewed here. Come back when this card is due.' : 'A little effort now. A stronger memory later.'}</p>
              )}
              </div>
            </>
          ) : (
            <div className="study-empty empty-state">
              <CheckCheck size={36} aria-hidden="true" />
              <h3>{request.mode === 'saved' ? 'Your favorites start here.' : request.mode === 'due' ? 'All caught up. Nicely done.' : 'No cards in this selection.'}</h3>
              <p>{request.mode === 'saved' ? 'Save a card with the bookmark icon, then give it a little extra attention here.' : request.mode === 'due' ? 'Nothing is due in this selection. Explore more cards or take a well-earned break.' : 'Try another subject or difficulty to keep learning.'}</p>
              <button className="button button-primary" onClick={() => onConfigure({ mode: 'all', difficulty: 'all', limit: undefined, firstId: undefined })}>Explore all cards <ArrowRight size={16} aria-hidden="true" /></button>
            </div>
          )}
        </div>

        <aside className="study-aside" aria-label="Daily study companion">
          <div className="daily-goal-panel">
            <div className="panel-label"><Target size={17} aria-hidden="true" /><h3>Your daily focus</h3><button className="icon-button tiny-button" onClick={onSettings} aria-label="Adjust daily goal"><ChevronDown size={15} aria-hidden="true" /></button></div>
            <div className="goal-ring" role="img" aria-label={`${stats.todayReviews} of ${state.dailyGoal} daily reviews complete`}>
              <svg viewBox="0 0 120 120" aria-hidden="true"><circle className="ring-track" cx="60" cy="60" r="49" /><circle className="ring-value" cx="60" cy="60" r="49" strokeDasharray={307.88} strokeDashoffset={307.88 * (1 - goalPercent / 100)} /></svg>
              <div><strong>{stats.todayReviews}<span> / {state.dailyGoal}</span></strong><small>cards reviewed</small></div>
            </div>
            <h4>{goalPercent >= 100 ? 'Look at you, showing up.' : 'Progress over perfection.'}</h4>
            <p>{goalPercent >= 100 ? 'Daily goal, complete. Every little bit adds up.' : 'A few focused minutes can make a world of difference.'}</p>
            <div className="week-dots" role="group" aria-label="Study activity this week">
              {stats.week.map((day, dayIndex) => (
                <div key={day.key} className={`${day.reviews > 0 ? 'has-activity' : ''} ${dayIndex === 6 ? 'is-today' : ''}`} title={`${day.label}: ${day.reviews} reviews`}>
                  <span aria-hidden="true">{day.label.slice(0, 1)}</span>
                  <span className="week-dot" role="img" aria-label={`${day.label}: ${day.reviews} reviews`}>
                    {day.reviews > 0 ? <Check size={12} aria-hidden="true" /> : <span />}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="study-tip"><span className="tip-icon"><Lightbulb size={21} aria-hidden="true" /></span><p className="eyebrow">LEARN A LITTLE SMARTER</p><h3>Don’t just read. Recall.</h3><p>Try saying the answer out loud before you flip. That small effort is where the learning happens.</p><span className="tip-rule" /></div>
          <button className="keyboard-help" onClick={onHelp}><Keyboard size={18} aria-hidden="true" /><span>Made for your keyboard</span><ArrowRight size={14} aria-hidden="true" /></button>
        </aside>
      </div>
      <div className="sr-only" role="status" aria-live="polite">{announcement}</div>
    </section>
  )
}