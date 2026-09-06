import { useId } from 'react'
import { ArrowRight, Award, BookOpen, CalendarDays, Download, Gauge, Info, Repeat2, Sprout, Target } from 'lucide-react'
import { cards, subjects } from '../data'
import { getStudyStats, isMastered, localDateKey } from '../lib/study'
import type { StudyState } from '../types'
import './ProgressView.css'

type ProgressViewProps = {
  state: StudyState
  onStudy: () => void
  onSettings: () => void
}

const numbers = new Intl.NumberFormat()
const percentages = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 0 })
const chartNumbers = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 0 })
const fullDates = new Intl.DateTimeFormat(undefined, { dateStyle: 'full' })
const shortDates = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
const dateNumbers = new Intl.DateTimeFormat(undefined, { day: 'numeric' })

function percentage(value: number, total: number): number {
  return total > 0 ? Math.min(100, Math.max(0, (value / total) * 100)) : 0
}

function reviewCount(value: number): string {
  return `${numbers.format(value)} ${value === 1 ? 'review' : 'reviews'}`
}

export default function ProgressView({ state, onStudy, onSettings }: ProgressViewProps) {
  const id = useId()
  const now = new Date().getTime()
  const stats = getStudyStats(state, cards, now)
  const todayKey = localDateKey(now)
  const hasActivity = stats.totalReviews > 0 || stats.reviewed > 0
  const remaining = Math.max(0, state.dailyGoal - stats.todayReviews)
  const weeklyReviews = stats.week.reduce((total, day) => total + day.reviews, 0)
  const chartMaximum = Math.max(1, ...stats.week.map((day) => day.reviews))
  // Date-only strings otherwise parse as UTC. Keep the stats' local dates at local noon.
  const week = stats.week.map((day) => ({ ...day, date: new Date(`${day.key}T12:00:00`) }))
  const firstDay = week.at(0)
  const lastDay = week.at(-1)

  const subjectStats = subjects.map((subject) => {
    const deck = cards.filter((card) => card.subject === subject.id)
    const reviewed = deck.filter((card) => {
      const progress = Object.hasOwn(state.progress, card.id) ? state.progress[card.id] : undefined
      return progress !== undefined && Number.isSafeInteger(progress.reviews) && progress.reviews > 0
    })
    return {
      ...subject,
      total: deck.length,
      reviewed: reviewed.length,
      mastered: reviewed.filter((card) => isMastered(state.progress[card.id])).length,
    }
  })

  const metrics = [
    {
      label: 'Unique cards reviewed',
      icon: BookOpen,
      value: <>{numbers.format(stats.reviewed)}<span className="progress-stat-unit"> / {numbers.format(cards.length)}</span></>,
      detail: 'Different cards, not repeat reviews.',
    },
    {
      label: 'Total reviews',
      icon: Repeat2,
      value: numbers.format(stats.totalReviews),
      detail: 'Every rating, including repeats.',
    },
    {
      label: 'Mastered',
      icon: Award,
      value: numbers.format(stats.mastered),
      detail: 'Cards meeting the mastery heuristic.',
    },
    {
      label: 'Self-rated recall',
      icon: Gauge,
      value: stats.totalReviews > 0 ? percentages.format(stats.recallRate / 100) : (
        <>
          <span aria-hidden="true">—</span>
          <span className="sr-only progress-visually-hidden">No review ratings yet</span>
        </>
      ),
      detail: 'Good / Easy ratings, not test accuracy.',
    },
  ]

  return (
    <div className="progress-view">
      <dl className="progress-stats" aria-label="All-time study statistics">
        {metrics.map(({ label, icon: Icon, value, detail }) => (
          <div className="progress-panel progress-stat" key={label}>
            <dt className="progress-stat-label">
              <span className="progress-stat-icon"><Icon size={18} aria-hidden="true" focusable="false" /></span>
              {label}
            </dt>
            <dd className="progress-stat-value">{value}</dd>
            <dd className="progress-stat-detail">{detail}</dd>
          </div>
        ))}
      </dl>

      {!hasActivity && (
        <section className="progress-panel progress-welcome" aria-labelledby={`${id}-welcome`}>
          <span className="progress-welcome-icon"><Sprout size={25} aria-hidden="true" focusable="false" /></span>
          <div className="progress-welcome-copy">
            <h2 className="progress-panel-title" id={`${id}-welcome`}>Your first review starts your story.</h2>
            <p className="progress-description">Start with one card. Your practice will take shape here, one review at a time.</p>
          </div>
          <button type="button" className="button button-primary progress-action progress-action--primary" onClick={onStudy}>
            Start studying <ArrowRight size={17} aria-hidden="true" focusable="false" />
          </button>
        </section>
      )}

      <div className="progress-main-grid">
        <section className="progress-panel progress-activity" aria-labelledby={`${id}-activity`}>
          <header className="progress-panel-header">
            <div>
              <p className="eyebrow progress-eyebrow">YOUR RHYTHM</p>
              <h2 className="progress-panel-title" id={`${id}-activity`}>Daily activity</h2>
            </div>
            <span className="progress-period"><CalendarDays size={15} aria-hidden="true" focusable="false" /> Last 7 days</span>
          </header>

          <p className="progress-week-summary"><strong>{reviewCount(weeklyReviews)}</strong> over the last 7 days</p>

          <figure className="progress-chart">
            <div className="progress-chart-plot" aria-hidden="true">
              {week.map((day) => {
                const height = percentage(day.reviews, chartMaximum)
                const isToday = day.key === todayKey
                return (
                  <div className={`progress-chart-column${isToday ? ' progress-chart-column--today' : ''}`} key={day.key}>
                    <div className="progress-chart-track">
                      <span className="progress-chart-count" style={{ bottom: `${height}%` }}>{chartNumbers.format(day.reviews)}</span>
                      <span className="progress-chart-bar" style={{ height: `${height}%` }} />
                    </div>
                    <span className="progress-chart-label">{isToday ? 'Today' : day.label}</span>
                    <time className="progress-chart-date" dateTime={day.key}>{dateNumbers.format(day.date)}</time>
                  </div>
                )
              })}
            </div>
            <div className="sr-only progress-visually-hidden">
              <table>
                <caption>Review activity for the last seven local calendar days</caption>
                <thead><tr><th scope="col">Date</th><th scope="col">Reviews</th></tr></thead>
                <tbody>
                  {week.map((day) => (
                    <tr key={day.key}>
                      <th scope="row"><time dateTime={day.key}>{fullDates.format(day.date)}</time>{day.key === todayKey ? ' (today)' : ''}</th>
                      <td>{numbers.format(day.reviews)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <figcaption className="progress-chart-caption">
              {firstDay && lastDay && <span>{shortDates.formatRange(firstDay.date, lastDay.date)} · </span>}
              Local dates. Repeat reviews count, too.
            </figcaption>
          </figure>

          <div className="progress-goal">
            <div className="progress-goal-heading">
              <h3 className="progress-goal-title"><Target size={18} aria-hidden="true" focusable="false" /> Daily goal</h3>
              <span className="progress-goal-count"><strong>{numbers.format(stats.todayReviews)}</strong> / {numbers.format(state.dailyGoal)} reviews</span>
            </div>
            <div
              className="progress-meter progress-goal-meter"
              role="progressbar"
              aria-label="Today's review goal"
              aria-valuemin={0}
              aria-valuemax={state.dailyGoal}
              aria-valuenow={Math.min(stats.todayReviews, state.dailyGoal)}
              aria-valuetext={`${reviewCount(stats.todayReviews)} completed toward a goal of ${numbers.format(state.dailyGoal)} today`}
            >
              <span className="progress-meter-fill" style={{ width: `${percentage(stats.todayReviews, state.dailyGoal)}%` }} />
            </div>
            <p className="progress-goal-note">
              {remaining > 0 ? `${reviewCount(remaining)} left to reach today’s goal.` : 'Daily goal reached. A little consistency goes a long way.'}
            </p>
          </div>
        </section>

        <section className="progress-panel progress-subjects" aria-labelledby={`${id}-subjects`}>
          <header className="progress-panel-header">
            <div>
              <p className="eyebrow progress-eyebrow">THE BIGGER PICTURE</p>
              <h2 className="progress-panel-title" id={`${id}-subjects`}>Subject progress</h2>
            </div>
          </header>
          <ul className="progress-subject-list" role="list">
            {subjectStats.map((subject) => (
              <li className={`progress-subject progress-subject--${subject.id}`} key={subject.id}>
                <div className="progress-subject-heading">
                  <h3 className="progress-subject-name"><span className={`subject-dot ${subject.id} progress-subject-dot`} aria-hidden="true" />{subject.name}</h3>
                  <span className="progress-subject-total">{numbers.format(subject.total)} cards</span>
                </div>
                {([{ label: 'Reviewed', value: subject.reviewed }, { label: 'Mastered', value: subject.mastered }]).map(({ label, value }) => (
                  <div className="progress-subject-row" key={label}>
                    <div className="progress-subject-count">
                      <span>{label}</span>
                      <span><strong>{numbers.format(value)}</strong><span className="progress-count-total"> / {numbers.format(subject.total)}</span></span>
                    </div>
                    <div
                      className="progress-meter"
                      role="progressbar"
                      aria-label={`${subject.name}: cards ${label.toLowerCase()}`}
                      aria-valuemin={0}
                      aria-valuemax={subject.total}
                      aria-valuenow={value}
                      aria-valuetext={`${numbers.format(value)} of ${numbers.format(subject.total)} cards ${label.toLowerCase()}`}
                    >
                      <span className="progress-meter-fill" style={{ width: `${percentage(value, subject.total)}%` }} />
                    </div>
                  </div>
                ))}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="progress-footer-grid">
        <section className="progress-panel progress-method" aria-labelledby={`${id}-method`}>
          <Info className="progress-footer-icon" size={21} aria-hidden="true" focusable="false" />
          <div>
            <h2 className="progress-panel-title" id={`${id}-method`}>A guide, not a grade</h2>
            <p className="progress-description">Spaced repetition here is SM-2-inspired, not an exact SM-2 implementation. A card is marked mastered after at least <strong>3 consecutive Good or Easy ratings</strong> and an interval of <strong>at least 7 days</strong>.</p>
            <p className="progress-description">Self-rated recall is the share of all review ratings marked Good or Easy. These are self-assessments, not measured test accuracy or a guarantee of exam readiness.</p>
          </div>
        </section>

        <section className="progress-panel progress-backup" aria-labelledby={`${id}-backup`}>
          <h2 className="progress-panel-title" id={`${id}-backup`}>Take your progress with you</h2>
          <p className="progress-description">Your study history stays in this browser. Open Settings to manage your backups.</p>
          <button type="button" className="button button-secondary progress-action progress-action--secondary" onClick={onSettings}>
            <Download size={17} aria-hidden="true" focusable="false" /> Back up your progress
          </button>
        </section>
      </div>
    </div>
  )
}