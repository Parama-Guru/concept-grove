import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, PropsWithChildren } from 'react'
import { ArrowRight, Download, Heart, Keyboard, ShieldCheck, Sparkles, Trash2, Upload, X } from 'lucide-react'
import { cardIds, cards } from '../data'
import { decodeBackup, defaultState, localDateKey } from '../lib/study'
import type { StudyState } from '../types'
import type { ThemePreference } from '../lib/theme'

function Dialog({ title, id, onClose, children }: PropsWithChildren<{ title: string; id: string; onClose: () => void }>) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog?.showModal()
    return () => {
      dialog?.close()
      opener?.focus()
    }
  }, [])

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.defaultPrevented || event.nativeEvent.isComposing) return
    // Embedded browsers can deliver Escape without the native dialog cancel event.
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== 'Tab') return
    // Native dialogs make the page inert, but some browsers still tab into browser chrome.
    // Recompute endpoints so import/reset confirmation controls are included when present.
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
      'button, a[href], input, select, textarea, [tabindex]',
    )).filter((element) => element.tabIndex >= 0 && !element.matches(':disabled')
      && !element.closest('[hidden], [inert]') && element.getClientRects().length > 0
      && getComputedStyle(element).visibility !== 'hidden')
    const first = controls[0]
    const last = controls.at(-1)
    if (!first || !last) return
    const active = document.activeElement
    if (event.shiftKey && (active === first || active === event.currentTarget)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && (active === last || active === event.currentTarget)) {
      event.preventDefault()
      first.focus()
    }
  }

  return <dialog ref={ref} className="app-dialog" aria-labelledby={id} onKeyDown={handleDialogKeyDown} onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div className="dialog-content"><div className="dialog-heading"><h2 id={id}>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={20} aria-hidden="true" /></button></div>{children}</div>
  </dialog>
}

export function HelpDialog({ onClose }: { onClose: () => void }) {
  return <Dialog title="A little guide to better recall." id="help-title" onClose={onClose}>
    <p className="dialog-intro">No cramming. Just small, intentional moments of learning.</p>
    <ol className="help-steps"><li><span>01</span><div><h3>Choose your curiosity</h3><p>Pick a subject, or start a mixed 20-card quick session. Explore {cards.length} original questions across machine learning, deep learning, and NLP.</p></div></li><li><span>02</span><div><h3>Pause before you flip</h3><p>Try to recall the answer in your own words. Reveal it, check your understanding, and save anything worth revisiting.</p></div></li><li><span>03</span><div><h3>Tell us how it went</h3><p>Again, Hard, Good, or Easy schedules the next review. “Due” includes new cards and reviews whose scheduled time has arrived.</p></div></li></ol>
    <div className="help-shortcuts"><h3><Keyboard size={17} aria-hidden="true" /> A few handy shortcuts</h3><dl><div><dt>Reveal the current answer</dt><dd><kbd>Space</kbd></dd></div><div><dt>Next card in study mode</dt><dd><kbd>Tab</kbd></dd></div><div><dt>Previous card in study mode</dt><dd><kbd>Shift</kbd> + <kbd>Tab</kbd></dd></div><div><dt>Leave study keyboard mode</dt><dd><kbd>Esc</kbd></dd></div><div><dt>Previous / next card</dt><dd><kbd>←</kbd> <kbd>→</kbd></dd></div><div><dt>Rate a revealed answer</dt><dd><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd></dd></div><div><dt>Save the current card</dt><dd><kbd>B</kbd></dd></div><div><dt>Find a card</dt><dd><kbd>/</kbd></dd></div></dl><p>Click the card or a study action to use Space to reveal and Tab to advance. Advancing never rates a card. Space keeps an already-revealed answer visible. Press Escape to restore normal Tab navigation; typing, dropdowns, and dialogs always keep their own keys.</p></div>
    <p className="privacy-note"><ShieldCheck size={17} aria-hidden="true" />Your learning stays in this browser. No account, trackers, or external AI services.</p>
    <button className="button button-primary dialog-primary" onClick={onClose}>Let’s learn something <ArrowRight size={16} aria-hidden="true" /></button>
  </Dialog>
}

export function SettingsDialog({ state, themePreference, onThemeChange, onChange, onClose, onNotice }: {
  state: StudyState
  themePreference: ThemePreference
  onThemeChange: (theme: ThemePreference) => void
  onChange: (state: StudyState) => void
  onClose: () => void
  onNotice: (message: string) => void
}) {
  const [goal, setGoal] = useState(String(state.dailyGoal))
  const [animation, setAnimation] = useState(state.animation)
  const [theme, setTheme] = useState(themePreference)
  const [error, setError] = useState('')
  const [pending, setPending] = useState<StudyState | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function exportProgress() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `concept-grove-${localDateKey()}.json`
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    onNotice('Your progress backup is ready to keep somewhere safe.')
  }

  async function importProgress(file?: File) {
    if (!file) return
    setError('')
    setPending(null)
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('Choose a Concept Grove backup smaller than 2 MB.')
      const imported = decodeBackup(await file.text(), cardIds)
      setPending(imported)
      setConfirmReset(false)
    } catch {
      setError('This backup could not be read. Choose a valid Concept Grove or Recall Studio version 1 JSON backup, smaller than 2 MB.')
    } finally {
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return <Dialog title="Make this space yours." id="settings-title" onClose={onClose}>
    <p className="dialog-intro">A few small preferences for your daily learning ritual.</p>
    <form onSubmit={(event) => {
      event.preventDefault()
      const value = Number(goal)
      if (!Number.isInteger(value) || value < 10 || value > 100) { setError('Choose a daily goal between 10 and 100 cards.'); return }
      onChange({ ...state, dailyGoal: value, animation })
      onThemeChange(theme)
      onNotice('Your study preferences are saved.')
      onClose()
    }}>
      <div className="setting-row"><label htmlFor="daily-goal"><strong>Your daily goal</strong><span>A realistic rhythm beats a perfect plan.</span></label><div className="goal-input"><input id="daily-goal" aria-label="Daily goal" type="number" min="10" max="100" step="1" required value={goal} onChange={(event) => setGoal(event.target.value)} /><span>cards</span></div></div>
      <div className="setting-row"><label htmlFor="ambient-animation"><strong>Ambient animation</strong><span>Lightweight 3D, with a little room to breathe.<br />Your device’s reduced-motion setting comes first.</span></label><input className="switch-input" id="ambient-animation" type="checkbox" role="switch" checked={animation} onChange={(event) => setAnimation(event.target.checked)} /></div>
      <fieldset className="theme-options">
        <legend>Appearance</legend>
        <p>Follow your device, or choose a calmer light or dark palette. Saved separately from study backups.</p>
        <div>
          {(['system', 'light', 'dark'] as const).map((value) => (
            <label key={value}>
              <input type="radio" name="appearance" value={value} checked={theme === value} onChange={() => setTheme(value)} />
              {value === 'system' ? 'System' : value === 'light' ? 'Light' : 'Dark'}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="backup-panel"><div className="backup-title"><ShieldCheck size={19} aria-hidden="true" /><h3>Your progress belongs to you.</h3></div><p>Everything is stored on this device, in this browser. Export a backup before clearing browser data or moving to another device.</p><div className="backup-actions"><button type="button" className="button button-secondary" onClick={exportProgress}><Download size={15} aria-hidden="true" />Export backup</button><button type="button" className="button button-secondary" onClick={() => inputRef.current?.click()}><Upload size={15} aria-hidden="true" />Import backup</button><input ref={inputRef} className="sr-only" type="file" accept=".json,application/json" aria-label="Import progress backup" tabIndex={-1} onChange={(event) => { void importProgress(event.target.files?.[0]) }} /></div></div>
      {pending && <div className="confirm-panel" role="status"><h3>Replace current progress?</h3><p>This backup contains {Object.keys(pending.progress).length} reviewed cards and {pending.bookmarks.length} saved cards. Importing replaces this browser’s existing progress and preferences.</p><div><button type="button" className="button button-primary" onClick={() => { onChange(pending); onNotice('Your progress has been restored.'); onClose() }}>Confirm import</button><button type="button" className="button button-secondary" onClick={() => setPending(null)}>Cancel import</button></div></div>}
      <button type="button" className="text-button reset-button" onClick={() => { setConfirmReset(true); setPending(null) }}><Trash2 size={14} aria-hidden="true" />Reset all study data</button>
      {confirmReset && <div className="confirm-panel danger-panel"><h3>A fresh start?</h3><p>This removes reviews, saved cards, activity, and preferences from this browser. Export a backup first if you want to keep them.</p><div><button type="button" className="button button-danger" onClick={() => { onChange(defaultState()); onNotice('Study data cleared. Here’s to a fresh start.'); onClose() }}>Yes, clear study data</button><button type="button" className="button button-secondary" onClick={() => setConfirmReset(false)}>Keep my progress</button></div></div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button button-primary dialog-primary" type="submit"><Sparkles size={16} aria-hidden="true" />Save preferences</button>
      <p className="settings-footnote"><Heart size={12} aria-hidden="true" />Made for a calmer kind of studying.</p>
    </form>
  </Dialog>
}