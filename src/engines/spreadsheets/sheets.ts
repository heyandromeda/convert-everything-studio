import { ConversionError } from '@/lib/errors'
import { outputName, safeFilename } from '@/lib/files'
import { mimeFor } from '@/registry/formats'
import type { ConvertContext, ConverterFn, OutputFile } from '@/registry/types'
import { decodeText } from '../documents/html'
import { headerKeys, jsonToRows, rowsToCsv, typedCell } from './csv'

type XLSXModule = typeof import('xlsx')
type WorkBook = import('xlsx').WorkBook

let xlsxPromise: Promise<XLSXModule> | null = null
const loadXlsx = () => (xlsxPromise ??= import('xlsx'))

async function parseDelimited(ctx: ConvertContext, X: XLSXModule): Promise<{ wb: WorkBook; warnings: string[] }> {
  const { text, encoding } = decodeText(new Uint8Array(await ctx.file.arrayBuffer()), String(ctx.options.encoding ?? 'auto'))
  const Papa = (await import('papaparse')).default
  const chosen = String(ctx.options.delimiter ?? 'auto')
  const delimiter = ctx.input.formatId === 'tsv' && chosen === 'auto' ? '\t' : chosen === 'auto' ? '' : chosen === 'tab' ? '\t' : chosen
  const res = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), { delimiter, skipEmptyLines: 'greedy' })
  const warnings: string[] = []
  if (encoding !== 'utf-8') warnings.push(`Text was read as ${encoding}.`)
  const fatal = res.errors.filter((e) => e.type === 'Quotes')
  if (fatal.length) warnings.push(`${fatal.length} row${fatal.length === 1 ? ' has' : 's have'} unbalanced quotes and may be split incorrectly.`)
  const detect = ctx.options.detectNumbers !== false
  const rows = res.data.map((r) => (detect ? r.map(typedCell) : r))
  const ws = X.utils.aoa_to_sheet(rows)
  const wb = X.utils.book_new()
  X.utils.book_append_sheet(wb, ws, 'Sheet1')
  return { wb, warnings }
}

async function parseJson(ctx: ConvertContext, X: XLSXModule): Promise<{ wb: WorkBook; warnings: string[] }> {
  let data: unknown
  try {
    data = JSON.parse((await ctx.file.text()).replace(/^\uFEFF/, ''))
  } catch (e) {
    throw new ConversionError('corrupt', 'This JSON is not valid', e instanceof Error ? e.message.slice(0, 160) : 'Parse error.')
  }
  const shaped = jsonToRows(data)
  if (!shaped) {
    throw new ConversionError('not-tabular', 'This JSON is not a table', 'Spreadsheet export needs an array of objects, an array of arrays, or an object whose values are such arrays.', 'Nested JSON can be converted to YAML or XML instead.')
  }
  const wb = X.utils.book_new()
  for (const s of shaped.sheets) X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(s.rows), s.name.slice(0, 31) || 'Sheet')
  const nested = shaped.sheets.some((s) => s.rows.some((r) => r.some((c) => typeof c === 'string' && /^[[{]/.test(c))))
  return { wb, warnings: nested ? ['Nested objects and arrays were stored as JSON text in their cells.'] : [] }
}

export async function readWorkbook(ctx: ConvertContext): Promise<{ wb: WorkBook; X: XLSXModule; warnings: string[] }> {
  ctx.onProgress({ stage: 'loading-engine', message: 'Loading spreadsheet engine' })
  const X = await loadXlsx()
  ctx.onProgress({ stage: 'processing', message: 'Reading data' })
  const fmt = ctx.input.formatId
  if (fmt === 'csv' || fmt === 'tsv' || fmt === 'txt') return { X, ...(await parseDelimited(ctx, X)) }
  if (fmt === 'json') return { X, ...(await parseJson(ctx, X)) }
  try {
    const wb = X.read(await ctx.file.arrayBuffer(), { type: 'array', cellFormula: true, cellDates: true, cellStyles: false, sheetStubs: true, WTF: false })
    return { X, wb, warnings: [] }
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (/password|encrypt/i.test(msg)) throw new ConversionError('encrypted', 'This workbook is password-protected', 'Encrypted workbooks cannot be opened without the password.')
    throw new ConversionError('corrupt', 'This spreadsheet could not be read', 'The workbook structure could not be parsed.')
  }
}

function pickSheets(wb: WorkBook, choice: string): string[] {
  if (choice === '__all__') return wb.SheetNames
  if (choice && wb.SheetNames.includes(choice)) return [choice]
  return [wb.SheetNames[0]]
}

function sheetRows(X: XLSXModule, wb: WorkBook, name: string): unknown[][] {
  // raw values (not display-formatted) so numbers and dates round-trip
  return X.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: false })
}

function formulaStats(wb: WorkBook, names: string[]): { formulas: number; uncached: number } {
  let formulas = 0
  let uncached = 0
  for (const n of names) {
    for (const [addr, c] of Object.entries(wb.Sheets[n] ?? {})) {
      if (addr.startsWith('!') || !c || typeof c !== 'object' || !('f' in c)) continue
      formulas++
      // Stub cells ("z") carry a formula but no saved result.
      if ((c as { t?: string }).t === 'z') uncached++
    }
  }
  return { formulas, uncached }
}

function formulaWarnings(wb: WorkBook, names: string[]): string[] {
  const { formulas, uncached } = formulaStats(wb, names)
  const w: string[] = []
  if (formulas) w.push('Formulas were exported as their last calculated values.')
  if (uncached) w.push(`${uncached} formula cell${uncached === 1 ? ' has' : 's have'} no saved result (the file was never recalculated by a spreadsheet app), so ${uncached === 1 ? 'it is' : 'they are'} empty. Open and re-save the file in Excel, Numbers or LibreOffice to fix this.`)
  return w
}

export const toDelimited = (formatId: 'csv' | 'tsv'): ConverterFn => async (ctx) => {
  const { X, wb, warnings } = await readWorkbook(ctx)
  const names = pickSheets(wb, String(ctx.options.sheet ?? ''))
  const delimiter = formatId === 'tsv' ? '\t' : String(ctx.options.outDelimiter ?? ',')
  const protect = ctx.options.protectFormulas !== false
  const bom = ctx.options.bom === true ? '\uFEFF' : ''
  if (wb.SheetNames.length > 1 && names.length === 1) warnings.push(`This workbook has ${wb.SheetNames.length} sheets; ${formatId.toUpperCase()} holds one, so only “${names[0]}” was exported. Choose “All sheets” to get one file per sheet.`)
  warnings.push(...formulaWarnings(wb, names))
  if (!['csv', 'tsv', 'json'].includes(ctx.input.formatId ?? '')) warnings.push(`${formatId.toUpperCase()} cannot store formatting, charts, merged cells or images.`)
  if (protect) warnings.push('Text cells starting with =, +, - or @ were prefixed with an apostrophe to prevent formula injection.')
  const outputs: OutputFile[] = names.map((n) => {
    const text = bom + rowsToCsv(sheetRows(X, wb, n), delimiter, protect) + '\r\n'
    const suffix = names.length > 1 ? `-${safeFilename(n)}` : ''
    return { blob: new Blob([text], { type: `${mimeFor(formatId)};charset=utf-8` }), name: outputName(ctx.file.name, formatId, suffix), formatId }
  })
  return { outputs, warnings }
}

export const toJson: ConverterFn = async (ctx) => {
  const { X, wb, warnings } = await readWorkbook(ctx)
  const names = pickSheets(wb, String(ctx.options.sheet ?? ''))
  const header = ctx.options.headerRow !== false
  const shape = (n: string) => {
    const rows = sheetRows(X, wb, n)
    if (!header) return rows
    const [head = [], ...body] = rows
    const keys = headerKeys(head)
    return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? null])))
  }
  const data = names.length > 1 ? Object.fromEntries(names.map((n) => [n, shape(n)])) : shape(names[0])
  warnings.push(...formulaWarnings(wb, names))
  const text = JSON.stringify(data, null, 2) + '\n'
  return { outputs: [{ blob: new Blob([text], { type: 'application/json;charset=utf-8' }), name: outputName(ctx.file.name, 'json'), formatId: 'json' }], warnings }
}

export const toWorkbook = (formatId: 'xlsx' | 'ods'): ConverterFn => async (ctx) => {
  const { X, wb, warnings } = await readWorkbook(ctx)
  ctx.onProgress({ stage: 'processing', message: 'Writing workbook' })
  const { uncached } = formulaStats(wb, wb.SheetNames)
  if (uncached && formatId === 'xlsx') {
    // Keep the formula itself; there is no saved result to copy.
    for (const ws of Object.values(wb.Sheets)) {
      for (const [addr, c] of Object.entries(ws)) {
        if (!addr.startsWith('!') && c && typeof c === 'object' && (c as { t?: string }).t === 'z' && 'f' in c) {
          ;(c as { t: string }).t = 'n'
          delete (c as { v?: unknown }).v
        }
      }
    }
    warnings.push(`${uncached} formula${uncached === 1 ? ' has' : 's have'} no saved result in the source file. ${uncached === 1 ? 'It is' : 'They are'} kept as formula${uncached === 1 ? '' : 's'}; spreadsheet apps calculate them when the file is opened, but some previewers show them blank.`)
  } else if (uncached) {
    warnings.push(`${uncached} formula${uncached === 1 ? '' : 's'} without a saved result could not be written to ODS and ${uncached === 1 ? 'was' : 'were'} left empty.`)
  }
  const data = X.write(wb, { bookType: formatId, type: 'array', compression: true }) as ArrayBuffer
  if (['xlsx', 'xls', 'ods'].includes(ctx.input.formatId ?? '')) warnings.push('Cell values, formulas and sheets are kept. Charts, images, pivot tables, macros and most styling are not.')
  return {
    outputs: [{ blob: new Blob([data], { type: mimeFor(formatId) }), name: outputName(ctx.file.name, formatId, formatId === ctx.input.formatId ? '-converted' : ''), formatId }],
    warnings,
  }
}

/** Sheet names and a row estimate, read without loading styles or formulas. */
export async function workbookInfo(file: Blob): Promise<{ sheetNames: string[] }> {
  const X = await loadXlsx()
  const wb = X.read(await file.arrayBuffer(), { type: 'array', bookSheets: true })
  return { sheetNames: wb.SheetNames }
}
