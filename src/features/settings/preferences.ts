import { deserializeOptions, serializeOptions } from '@/registry/options'
import type { OptionValues } from '@/registry/types'

/**
 * Only conversion settings are stored (in localStorage, on this device).
 * File names, contents and results are never persisted.
 */
const KEY = 'ce:prefs:v1'
const THEME_KEY = 'ce:theme'
const REMEMBER_KEY = 'ce:remember'

/** Settings that are specific to one file and should not carry over to the next. */
const VOLATILE = new Set(['width', 'height', 'sheet', 'pages', 'entries', 'trimStart', 'trimEnd'])

function readAll(): Record<string, string> {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function rememberSettingsEnabled(): boolean {
  try {
    return localStorage.getItem(REMEMBER_KEY) !== 'off'
  } catch {
    return false
  }
}

export function setRememberSettings(on: boolean) {
  try {
    localStorage.setItem(REMEMBER_KEY, on ? 'on' : 'off')
    if (!on) localStorage.removeItem(KEY)
  } catch {
    /* storage unavailable (private mode) */
  }
}

export function loadPreferredOptions(conversionId: string): OptionValues {
  if (!rememberSettingsEnabled()) return {}
  return deserializeOptions(readAll()[conversionId] ?? null)
}

export function rememberOptions(conversionId: string, values: OptionValues) {
  if (!rememberSettingsEnabled()) return
  const keep: OptionValues = {}
  for (const [k, v] of Object.entries(values)) if (!VOLATILE.has(k)) keep[k] = v
  try {
    const all = readAll()
    all[conversionId] = serializeOptions(keep)
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearStoredData() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

export type ThemePref = 'dark' | 'light' | 'system'

export function loadTheme(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY)
    return v === 'light' || v === 'system' ? v : 'dark'
  } catch {
    return 'dark'
  }
}

export function saveTheme(t: ThemePref) {
  try {
    localStorage.setItem(THEME_KEY, t)
  } catch {
    /* ignore */
  }
}
