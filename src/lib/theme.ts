export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

// Appearance is separate from the version-1 study backup for compatibility.
export const THEME_STORAGE_KEY = 'concept-grove:theme:v1'

export function parseThemePreference(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system'
}

export function resolveTheme(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
  return preference === 'system' ? prefersDark ? 'dark' : 'light' : preference
}