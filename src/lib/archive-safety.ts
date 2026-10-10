export interface SafePath {
  path: string
  problem?: string
}

const RESERVED_WIN = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i

/**
 * Normalises an archive entry path so it can never escape the extraction root.
 * Absolute paths, drive letters, ".." segments and control characters are removed.
 */
export function sanitizeArchivePath(raw: string): SafePath {
  let problem: string | undefined
  let p = raw.replace(/\\/g, '/')
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(p)) {
    problem = 'Contains control characters'
    // eslint-disable-next-line no-control-regex
    p = p.replace(/[\u0000-\u001f\u007f]/g, '_')
  }
  if (/^[a-zA-Z]:/.test(p)) {
    problem = 'Absolute Windows path'
    p = p.slice(2)
  }
  if (p.startsWith('/')) {
    problem = problem ?? 'Absolute path'
    p = p.replace(/^\/+/, '')
  }
  const parts: string[] = []
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      problem = 'Path traversal ("..") removed'
      continue
    }
    parts.push(RESERVED_WIN.test(seg) ? '_' + seg : seg)
  }
  return { path: parts.join('/'), problem }
}

export interface ArchiveLimits {
  maxEntries: number
  maxTotalBytes: number
  maxEntryBytes: number
  maxRatio: number
}

export function archiveLimits(isMobile: boolean): ArchiveLimits {
  return isMobile
    ? { maxEntries: 5000, maxTotalBytes: 400 * 1024 * 1024, maxEntryBytes: 250 * 1024 * 1024, maxRatio: 200 }
    : { maxEntries: 20000, maxTotalBytes: 1.5 * 1024 * 1024 * 1024, maxEntryBytes: 1024 * 1024 * 1024, maxRatio: 400 }
}

/** Returns a human-readable reason if declared sizes indicate a decompression bomb. */
export function checkArchiveBudget(
  entries: { size: number; compressedSize?: number; isDirectory: boolean }[],
  archiveBytes: number,
  limits: ArchiveLimits,
): string | null {
  const files = entries.filter((e) => !e.isDirectory)
  if (files.length > limits.maxEntries) {
    return `This archive has ${files.length.toLocaleString()} files, above the ${limits.maxEntries.toLocaleString()}-file safety limit for this device.`
  }
  let total = 0
  for (const e of files) {
    if (e.size > limits.maxEntryBytes) return 'One file in this archive expands beyond the safe size for in-browser extraction.'
    total += e.size
  }
  if (total > limits.maxTotalBytes) return 'This archive expands beyond the safe size for in-browser extraction on this device.'
  if (archiveBytes > 0 && total / archiveBytes > limits.maxRatio && total > 50 * 1024 * 1024) {
    return 'This archive has an unusually high compression ratio and may be a decompression bomb, so it was not extracted.'
  }
  return null
}
