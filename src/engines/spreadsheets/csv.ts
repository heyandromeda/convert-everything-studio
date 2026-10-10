/** Pure helpers shared by the spreadsheet engine and its tests. */

const NUMERIC = /^-?(?:0|[1-9]\d{0,14})(?:\.\d+)?(?:[eE][+-]?\d+)?$/

/**
 * Converts a CSV cell to a number only when that is lossless: values with leading zeros
 * (postcodes, IDs), very long digit strings and thousands separators stay as text.
 */
export function typedCell(v: string): string | number | boolean {
  const t = v.trim()
  if (t === '') return v
  if (NUMERIC.test(t)) {
    const n = Number(t)
    if (Number.isFinite(n) && String(n) === t.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')) return n
    if (Number.isFinite(n) && /e/i.test(t)) return n
  }
  if (t === 'TRUE' || t === 'true') return true
  if (t === 'FALSE' || t === 'false') return false
  return v
}

/** Cells that spreadsheet apps would execute as formulas when a CSV is opened. */
export function isFormulaLike(v: string): boolean {
  return /^[=+\-@\t\r\uFF1D\uFF0B\uFF0D\uFF20]/.test(v)
}

/** Neutralises formula injection by prefixing an apostrophe, per OWASP guidance. */
export function neutralizeFormula(v: string): string {
  return isFormulaLike(v) && !/^-?\d+(\.\d+)?$/.test(v) ? `'${v}` : v
}

export function quoteCsv(value: string, delimiter: string): string {
  return value.includes(delimiter) || /["\r\n]/.test(value) || /^\s|\s$/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function rowsToCsv(rows: unknown[][], delimiter: string, protect: boolean): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          if (cell === null || cell === undefined) return ''
          let s = cell instanceof Date ? cell.toISOString().replace('T00:00:00.000Z', '') : String(cell)
          if (protect && typeof cell === 'string') s = neutralizeFormula(s)
          return quoteCsv(s, delimiter)
        })
        .join(delimiter),
    )
    .join('\r\n')
}

/** Unique, non-empty header names for JSON object keys. */
export function headerKeys(row: unknown[]): string[] {
  const seen = new Map<string, number>()
  return row.map((h, i) => {
    let key = h === null || h === undefined || String(h).trim() === '' ? `column_${i + 1}` : String(h).trim()
    const n = seen.get(key) ?? 0
    seen.set(key, n + 1)
    if (n) key = `${key}_${n + 1}`
    return key
  })
}

/** Tabular shape of arbitrary JSON, or null when it is not a table. */
export function jsonToRows(data: unknown): { sheets: { name: string; rows: unknown[][] }[] } | null {
  const fromArray = (arr: unknown[]): unknown[][] | null => {
    if (!arr.length) return [[]]
    if (arr.every((r) => Array.isArray(r))) return arr as unknown[][]
    if (arr.every((r) => r !== null && typeof r === 'object' && !Array.isArray(r))) {
      const keys: string[] = []
      const seen = new Set<string>()
      for (const r of arr as Record<string, unknown>[]) {
        for (const k of Object.keys(r)) {
          if (seen.has(k)) continue
          seen.add(k)
          keys.push(k)
        }
      }
      return [keys, ...(arr as Record<string, unknown>[]).map((r) => keys.map((k) => flattenValue(r[k])))]
    }
    if (arr.every((r) => r === null || typeof r !== 'object')) return [['value'], ...arr.map((v) => [v])]
    return null
  }
  if (Array.isArray(data)) {
    const rows = fromArray(data)
    return rows ? { sheets: [{ name: 'Sheet1', rows }] } : null
  }
  if (data && typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>)
    if (entries.length && entries.every(([, v]) => Array.isArray(v))) {
      const sheets = entries.map(([name, v]) => ({ name, rows: fromArray(v as unknown[]) }))
      if (sheets.every((s) => s.rows)) return { sheets: sheets as { name: string; rows: unknown[][] }[] }
    }
    // A single object becomes a one-row table.
    if (entries.every(([, v]) => v === null || typeof v !== 'object')) {
      return { sheets: [{ name: 'Sheet1', rows: [entries.map(([k]) => k), entries.map(([, v]) => v)] }] }
    }
  }
  return null
}

function flattenValue(v: unknown): unknown {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return v
}
