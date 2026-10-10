import { extensionFor } from '@/registry/formats'

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = bytes / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)} ${units[i]}`
}

/** Signed percentage change from `before` to `after`, e.g. -42 means 42% smaller. */
export function sizeChangePercent(before: number, after: number): number | null {
  if (before <= 0) return null
  return ((after - before) / before) * 100
}

export function describeSizeChange(before: number, after: number): string {
  const pct = sizeChangePercent(before, after)
  if (pct === null) return ''
  if (Math.abs(pct) < 0.5) return 'about the same size'
  return pct < 0 ? `${Math.abs(pct).toFixed(pct > -10 ? 1 : 0)}% smaller` : `${pct.toFixed(pct < 10 ? 1 : 0)}% larger`
}

export function formatDuration(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds)) return '—'
  const s = Math.round(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

/** Strips characters that are invalid in filenames on common platforms. */
export function safeFilename(name: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = name.replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '_').replace(/^\.+/, '').trim()
  return (cleaned || 'file').slice(0, 180)
}

export function baseName(filename: string): string {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.tar.gz')) return filename.slice(0, -7)
  const dot = filename.lastIndexOf('.')
  return dot > 0 ? filename.slice(0, dot) : filename
}

export function outputName(sourceName: string, formatId: string, suffix = ''): string {
  return `${safeFilename(baseName(sourceName))}${suffix}.${extensionFor(formatId)}`
}

/**
 * Returns a unique name by appending " (2)", " (3)"… before the extension.
 * `taken` is mutated so successive calls stay unique.
 */
export function uniqueName(name: string, taken: Set<string>): string {
  const key = (n: string) => n.toLowerCase()
  if (!taken.has(key(name))) {
    taken.add(key(name))
    return name
  }
  const lower = name.toLowerCase()
  const extLen = lower.endsWith('.tar.gz') ? 7 : name.lastIndexOf('.') > 0 ? name.length - name.lastIndexOf('.') : 0
  const stem = name.slice(0, name.length - extLen)
  const ext = name.slice(name.length - extLen)
  for (let i = 2; ; i++) {
    const candidate = `${stem} (${i})${ext}`
    if (!taken.has(key(candidate))) {
      taken.add(key(candidate))
      return candidate
    }
  }
}

export function pad(n: number, width: number) {
  return String(n).padStart(width, '0')
}
