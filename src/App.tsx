import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight, ArrowUpRight, BookOpen, Bookmark, Brain, CalendarDays,
  ChartNoAxesCombined, Check, ChevronRight, CircleHelp, Cpu, Flame, Layers,
  LayoutGrid, Leaf, MessagesSquare, Search, Settings2, ShieldCheck, Sparkles,
  Sprout, Target, X, Moon, Sun,
} from 'lucide-react'
import CardLibrary from './components/CardLibrary'
import AmbientArtwork from './components/AmbientArtwork'
import CommunityFooter from './components/CommunityFooter'
import { HelpDialog, SettingsDialog } from './components/Dialogs'
import StudyWorkspace from './components/StudyWorkspace'
import type { StudyRequest } from './components/StudyWorkspace'
import { cards, cardIds, subjects, subjectCounts } from './data'
import { applyReview, decodeBackup, defaultState, getStudyStats, STORAGE_KEY, toggleBookmark } from './lib/study'
import type { Flashcard, Rating, StudyState, SubjectId, View } from './types'
import useTheme from './hooks/useTheme'
import './App.css'
import './theme.css'

const ProgressView = lazy(() => import('./components/ProgressView'))

const navItems = [
  { view: 'study', label: 'Study space', icon: LayoutGrid },
  { view: 'library', label: 'Card library', icon: Layers },
  { view: 'saved', label: 'Saved cards', icon: Bookmark },
  { view: 'progress', label: 'My progress', icon: ChartNoAxesCombined },
] as const

const pageCopy: Record<View, { eyebrow: string; title: string; description: string }> = {
  study: { eyebrow: 'ROOM FOR A LITTLE GROWTH', title: 'A little focus. A lot of progress.', description: 'Build real understanding, one flashcard at a time.' },
  library: { eyebrow: 'THE KNOWLEDGE COLLECTION', title: 'Big ideas, neatly organized.', description: `${cards.length} original questions. Find the connection you’re looking for.` },
  saved: { eyebrow: 'YOUR PERSONAL COLLECTION', title: 'Keep the ideas that click.', description: 'A little extra attention for the concepts you want to remember.' },
  progress: { eyebrow: 'EVERY SMALL STEP COUNTS', title: 'Look how far you’re growing.', description: 'Your learning journey, one intentional day at a time.' },
}

function readStoredState(): { state: StudyState; issue: string } {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return { state: raw ? decodeBackup(raw, cardIds) : defaultState(), issue: '' }
  } catch {
    return { state: defaultState(), issue: 'Saved progress could not be read. Any original data is kept until you make a change. You can restore a backup in Preferences.' }
  }
}

function SubjectIcon({ subject, size = 20 }: { subject: SubjectId; size?: number }) {
  const Icon = subject === 'ml' ? Brain : subject === 'dl' ? Cpu : MessagesSquare
  return <Icon size={size} strokeWidth={1.7} aria-hidden="true" />
}

function HeroArtwork() {
  return <div className="hero-visual" aria-hidden="true">
    <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
    <span className="art-spark spark-one">+</span><span className="art-spark spark-two">✦</span><span className="art-dot dot-one" /><span className="art-dot dot-two" />
    <div className="art-card card-back"><span>THE POSSIBILITIES</span><div className="math-art">f(x)</div><i /></div>
    <div className="art-card card-middle"><span>THE CONNECTIONS</span><svg viewBox="0 0 180 96"><g fill="none" stroke="#a4b8a2" strokeWidth="1.3"><path d="M24 20 78 10 137 24M24 20 78 47 137 24M24 20 78 82 137 24M24 70 78 10 137 72M24 70 78 47 137 72M24 70 78 82 137 72" /></g>{[[24, 20], [24, 70], [78, 10], [78, 47], [78, 82], [137, 24], [137, 72]].map(([x, y], index) => <circle key={index} cx={x} cy={y} r="6.5" fill={index % 2 ? '#91a87b' : '#4a7057'} />)}</svg><div className="art-card-lines"><i /><i /></div></div>
    <div className="art-card card-front"><span>A LITTLE EVERY DAY</span><div className="art-leaf"><Sprout size={43} strokeWidth={1.25} /></div><strong>Ideas take root.</strong><div className="art-card-lines"><i /><i /></div><span className="art-card-number">01 <span>/ {cards.length}</span></span></div>
    <div className="art-float-badge"><Sparkles size={13} /><span>Made to stick.</span></div>
  </div>
}

export default function App() {
  const appearance = useTheme()
  const [initial] = useState(readStoredState)
  const [state, setState] = useState<StudyState>(initial.state)
  const [storageIssue, setStorageIssue] = useState(initial.issue)
  const [view, setView] = useState<View>('study')
  const [dialog, setDialog] = useState<'help' | 'settings' | null>(null)
  const [notice, setNotice] = useState('')
  const [now, setNow] = useState(Date.now)
  const [request, setRequest] = useState<StudyRequest>({ revision: 0, subject: 'ml', difficulty: 'all', mode: 'all', shuffled: false })
  const searchRequested = useRef(false)
  const stateRef = useRef(state)
  const stats = useMemo(() => getStudyStats(state, cards, now), [state, now])
  const page = pageCopy[view]

  function updateStudy(update: StudyState | ((current: StudyState) => StudyState)) {
    const next = typeof update === 'function' ? update(stateRef.current) : update
    stateRef.current = next
    setState(next)
    // Persist only intentional changes, never an unreadable backup during initial render.
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      setStorageIssue('')
    } catch {
      setStorageIssue('Browser storage is unavailable or full. Your progress works for this visit; export a backup in Preferences to keep it.')
    }
  }

  useEffect(() => {
    const refresh = () => { if (!document.hidden) setNow(Date.now()) }
    const interval = window.setInterval(refresh, 60_000)
    document.addEventListener('visibilitychange', refresh)
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', refresh) }
  }, [])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 4500)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    document.title = `${navItems.find((item) => item.view === view)?.label ?? 'Study'} · Concept Grove`
    if (view === 'library' && searchRequested.current) {
      document.getElementById('library-search')?.focus()
      searchRequested.current = false
    }
  }, [view])

  function findCard() {
    searchRequested.current = true
    setView('library')
    if (view === 'library') document.getElementById('library-search')?.focus()
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target instanceof Element ? event.target : null
      if (event.key !== '/' || event.defaultPrevented || event.isComposing || event.repeat
        || event.metaKey || event.ctrlKey || event.altKey || dialog
        || target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="combobox"], [role="textbox"], [role="searchbox"], [role="spinbutton"], [role="listbox"], [role="option"]')) return
      // Portalled dropdowns own typing even before focus moves into their popup.
      if (document.querySelector('dialog[open], [role="dialog"][aria-modal="true"], [role="listbox"]:not([hidden]):not([aria-hidden="true"])')) return
      event.preventDefault()
      findCard()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  function goToView(next: View) {
    setView(next)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  function configureSession(change: Partial<Omit<StudyRequest, 'revision'>>) {
    setRequest((current) => ({ ...current, ...change, revision: current.revision + 1 }))
  }

  function chooseSubject(subject: SubjectId) {
    configureSession({ subject, mode: 'all', difficulty: 'all', shuffled: false, limit: undefined, firstId: undefined })
    setView('study')
  }

  function quickSession() {
    configureSession({ subject: 'all', mode: 'due', difficulty: 'all', shuffled: true, limit: 20, firstId: undefined })
    setView('study')
    window.requestAnimationFrame(() => document.getElementById('study-session')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }))
  }

  function studyFromLibrary(card: Flashcard) {
    configureSession({ subject: card.subject, mode: 'all', difficulty: 'all', shuffled: false, firstId: card.id, limit: undefined })
    setView('study')
    window.requestAnimationFrame(() => document.getElementById('study-session')?.scrollIntoView({ behavior: 'instant', block: 'start' }))
  }

  function bookmark(id: string) {
    const wasSaved = state.bookmarks.includes(id)
    updateStudy((current) => toggleBookmark(current, id))
    setNotice(wasSaved ? 'Card removed from your saved collection.' : 'A good idea, saved. Find it in Saved cards.')
  }

  function review(id: string, rating: Rating) {
    updateStudy((current) => applyReview(current, id, rating))
  }

  function replaceState(next: StudyState) {
    updateStudy(next)
    configureSession({ firstId: undefined })
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className="sidebar" aria-label="Workspace navigation">
        <button className="brand" onClick={() => goToView('study')} aria-label="Concept Grove home"><img className="brand-mark" src={`${import.meta.env.BASE_URL}grove.svg`} width={36} height={36} alt="" /><span>grove<span className="brand-period">.</span><small>IDEAS TAKE ROOT</small></span></button>
        <div className="nav-section-label">YOUR WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">{navItems.map(({ view: itemView, label, icon: Icon }) => <button key={itemView} className={`nav-item ${view === itemView ? 'active' : ''}`} aria-label={label} aria-current={view === itemView ? 'page' : undefined} onClick={() => goToView(itemView)}><Icon size={19} strokeWidth={1.65} aria-hidden="true" /><span>{label}</span>{itemView === 'saved' && state.bookmarks.length > 0 ? <span className="nav-count">{state.bookmarks.length}</span> : null}{itemView === 'study' && <span className="nav-active-dot" />}</button>)}</nav>
        <div className="sidebar-subjects"><div className="nav-section-label">YOUR SUBJECTS <span>03</span></div>{subjects.map((subject) => <button key={subject.id} className="subject-nav" onClick={() => chooseSubject(subject.id)}><span className={`subject-dot ${subject.id}`} /><span>{subject.id === 'nlp' ? 'Natural Language' : subject.name}</span><span>{subjectCounts[subject.id].cards}</span></button>)}</div>
        <div className="sidebar-bottom"><div className="sidebar-nudge"><div className="nudge-illustration"><Sprout size={31} strokeWidth={1.3} aria-hidden="true" /><span /><span /></div><h3>Small steps.<br />Stronger connections.</h3><p>Your future self will thank you.</p><button onClick={quickSession}>Make a little progress <ArrowUpRight size={15} aria-hidden="true" /></button></div><button className="sidebar-utility" onClick={() => setDialog('help')}><CircleHelp size={18} aria-hidden="true" />How to study</button><button className="sidebar-utility" onClick={() => setDialog('settings')}><Settings2 size={18} aria-hidden="true" />Preferences</button><div className="local-profile"><span className="profile-icon"><Leaf size={18} strokeWidth={1.5} aria-hidden="true" /></span><div><strong>Your study space</strong><span><i />Saved on this device</span></div><ShieldCheck size={15} aria-hidden="true" /></div></div>
      </aside>

      <div className="main-shell">
        <header className="topbar"><div className="breadcrumbs"><BookOpen size={16} strokeWidth={1.6} aria-hidden="true" /><span>Workspace</span><ChevronRight size={13} aria-hidden="true" /><strong>{navItems.find((item) => item.view === view)?.label}</strong></div><div className="topbar-actions"><button className="header-search" onClick={findCard} aria-label="Find a card"><Search size={16} aria-hidden="true" /><span>Find a card</span><kbd>/</kbd></button><span className="header-divider" /><span className={`streak-badge ${stats.streak > 0 ? 'has-streak' : ''}`}><Flame size={17} aria-hidden="true" /><strong>{stats.streak}</strong><span>day streak</span></span><button type="button" className="header-theme" onClick={() => appearance.chooseTheme(appearance.theme === 'dark' ? 'light' : 'dark')} aria-label={appearance.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} title={appearance.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>{appearance.theme === 'dark' ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}</button><button className="icon-button header-settings" onClick={() => setDialog('settings')} aria-label="Open preferences"><Settings2 size={18} aria-hidden="true" /></button></div></header>

        <main id="main-content" className="page-content" tabIndex={-1}>
          {appearance.storageIssue && <p className="storage-warning" role="status">{appearance.storageIssue}</p>}
          {storageIssue && <div className="storage-warning" role="status"><ShieldCheck size={19} aria-hidden="true" /><p>{storageIssue}</p><button className="text-button" onClick={() => setDialog('settings')}>Preferences</button></div>}
          <div className="page-heading"><div><p className="eyebrow">{page.eyebrow}</p><h1>{page.title}</h1><p>{page.description}</p></div><span className="date-label"><CalendarDays size={15} aria-hidden="true" />{new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', weekday: 'short' }).format(now)}</span></div>

          {view === 'study' ? (
            <>
              <section className="welcome-hero" aria-labelledby="hero-title"><div className="hero-copy"><span className="hero-eyebrow"><span />A FRESH PERSPECTIVE, EVERY DAY</span><h2 id="hero-title">Big ideas.<br /><span>Small cards.</span></h2><p>From your first algorithm to your next breakthrough.<br className="desktop-break" />Let’s connect the dots, one concept at a time.</p><div className="hero-actions"><button className="button button-primary" onClick={quickSession}>Start a quick session <ArrowRight size={16} aria-hidden="true" /></button><span>20 cards. A clearer mind.</span></div></div><AmbientArtwork key={String(state.animation)} enabled={state.animation}><HeroArtwork /></AmbientArtwork><span className="hero-caption" aria-hidden="true"><span />A SPACE TO LEARN, NOT TO RUSH</span></section>

              <section className="overview-grid" aria-label="Your study overview">
                <div className="overview-card"><span className="overview-icon icon-sage"><Layers size={20} strokeWidth={1.65} aria-hidden="true" /></span><div><p>Ideas to explore</p><strong>{cards.length} <span>original cards</span></strong></div></div>
                <div className="overview-card"><span className="overview-icon icon-blue"><Target size={20} strokeWidth={1.65} aria-hidden="true" /></span><div><p>Today’s focus</p><strong>{stats.todayReviews}<span> / {state.dailyGoal} cards</span></strong></div></div>
                <div className="overview-card"><span className="overview-icon icon-peach"><Sparkles size={20} strokeWidth={1.65} aria-hidden="true" /></span><div><p>Ideas mastered</p><strong>{stats.mastered}<span> and growing</span></strong></div></div>
                <div className="overview-card"><span className="overview-icon icon-lilac"><ChartNoAxesCombined size={20} strokeWidth={1.65} aria-hidden="true" /></span><div><p>Self-rated recall</p><strong>{stats.totalReviews ? `${stats.recallRate}%` : '—'}<span>{stats.totalReviews ? ' good or easy' : ' your next chapter'}</span></strong></div></div>
              </section>

              <section className="subjects-section" aria-labelledby="subjects-heading"><div className="section-heading"><div><h2 id="subjects-heading">Find your focus.</h2><p>Three subjects. A world of connections.</p></div><button className="text-button" onClick={() => goToView('library')}>Explore the library <ArrowUpRight size={16} aria-hidden="true" /></button></div><div className="subject-grid">{subjects.map((subject) => {
                const count = cards.filter((card) => card.subject === subject.id && state.progress[card.id]).length
                const total = subjectCounts[subject.id]
                const selected = request.subject === subject.id
                return <button key={subject.id} className={`subject-card subject-${subject.id} ${selected ? 'selected' : ''}`} aria-pressed={selected} onClick={() => chooseSubject(subject.id)}><div className="subject-card-top"><span className={`subject-icon ${subject.id}`}><SubjectIcon subject={subject.id} size={23} /></span><span className="subject-card-arrow">{selected ? <Check size={16} aria-hidden="true" /> : <ArrowUpRight size={17} aria-hidden="true" />}</span></div><h3>{subject.id === 'nlp' ? 'Natural Language Processing' : subject.name}</h3><p>{subject.description}</p><div className="subject-card-details"><span>{total.cards} cards</span><span className="tiny-dot" /><span>{total.topics} topics</span><span className="subject-studied">{count}<span> / {total.cards} studied</span></span></div><div className="subject-progress"><span style={{ width: `${total.cards ? count / total.cards * 100 : 0}%` }} /></div></button>
              })}</div></section>

              <StudyWorkspace key={request.revision} state={state} request={request} onConfigure={configureSession} onRate={review} onBookmark={bookmark} onLibrary={() => goToView('library')} onSettings={() => setDialog('settings')} onHelp={() => setDialog('help')} />
            </>
          ) : view === 'library' || view === 'saved' ? (
            <CardLibrary key={view} state={state} savedOnly={view === 'saved'} onBookmark={bookmark} onStudy={studyFromLibrary} />
          ) : (
            <Suspense fallback={<div className="view-loading" role="status"><Sprout size={28} aria-hidden="true" /><span>Gathering your small wins…</span></div>}><ProgressView state={state} onStudy={quickSession} onSettings={() => setDialog('settings')} /></Suspense>
          )}

        </main>
        <div className="page-content footer-container"><CommunityFooter /></div>
      </div>

      {notice && <div className="toast" role="status"><Check size={17} aria-hidden="true" /><span>{notice}</span><button className="icon-button" onClick={() => setNotice('')} aria-label="Dismiss notification"><X size={15} aria-hidden="true" /></button></div>}
      {dialog === 'help' && <HelpDialog onClose={() => setDialog(null)} />}
      {dialog === 'settings' && <SettingsDialog state={state} themePreference={appearance.preference} onThemeChange={appearance.chooseTheme} onChange={replaceState} onClose={() => setDialog(null)} onNotice={setNotice} />}
    </div>
  )
}
