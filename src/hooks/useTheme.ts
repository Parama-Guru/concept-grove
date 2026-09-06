import { useEffect, useState } from 'react'
import { parseThemePreference, resolveTheme, THEME_STORAGE_KEY } from '../lib/theme'
import type { ThemePreference } from '../lib/theme'

function readPreference(): ThemePreference {
  try {
    return parseThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    return 'system'
  }
}

export default function useTheme() {
  const [preference, setPreference] = useState(readPreference)
  const [prefersDark, setPrefersDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  const [storageIssue, setStorageIssue] = useState('')
  const theme = resolveTheme(preference, prefersDark)

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (event: MediaQueryListEvent) => setPrefersDark(event.matches)
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null) setPreference(parseThemePreference(event.newValue))
    }
    media.addEventListener('change', onChange)
    window.addEventListener('storage', onStorage)
    return () => {
      media.removeEventListener('change', onChange)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#111c16' : '#f9faf7')
  }, [theme])

  function chooseTheme(next: ThemePreference) {
    setPreference(next)
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next)
      setStorageIssue('')
    } catch {
      setStorageIssue('Appearance could not be saved in this browser. Your choice still works for this visit.')
    }
  }

  return { preference, theme, chooseTheme, storageIssue }
}