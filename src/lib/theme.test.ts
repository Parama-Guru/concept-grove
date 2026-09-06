import { describe, expect, it } from 'vitest'
import { parseThemePreference, resolveTheme, THEME_STORAGE_KEY } from './theme'

describe('appearance preferences', () => {
  it.each([null, undefined, '', '{}', 'Dark', true, 1])('uses system mode for invalid saved value %s', (value) => {
    expect(parseThemePreference(value)).toBe('system')
  })
  it.each(['light', 'dark', 'system'] as const)('accepts %s', (value) => {
    expect(parseThemePreference(value)).toBe(value)
  })
  it('follows the operating system only in system mode', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })
  it('keeps appearance separate from study backups', () => {
    expect(THEME_STORAGE_KEY).toBe('concept-grove:theme:v1')
    expect(THEME_STORAGE_KEY).not.toBe('recall-studio:v1')
  })
})