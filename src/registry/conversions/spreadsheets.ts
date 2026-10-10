import type { ConversionDef, DetectedFile, OptionField } from '../types'
import { encodingField } from './documents'

const sheets = () => import('@/engines/spreadsheets/sheets')

const WORKBOOKS = ['xlsx', 'xls', 'ods']
const DELIMITED = ['csv', 'tsv']
const ALL_IN = [...DELIMITED, ...WORKBOOKS, 'json']

const sheetField = (allowAll: boolean): OptionField => ({
  key: 'sheet',
  kind: 'select',
  label: 'Worksheet',
  default: '',
  appliesTo: WORKBOOKS,
  choices: ({ input }) => {
    const names = input.metadata.sheet?.sheetNames ?? []
    const opts = names.map((n, i) => ({ value: i === 0 ? '' : n, label: n }))
    if (!opts.length) opts.push({ value: '', label: 'First sheet' })
    if (allowAll && names.length > 1) opts.push({ value: '__all__', label: 'All sheets (one file each)' })
    return opts
  },
})

const csvInputFields: OptionField[] = [
  { ...encodingField, appliesTo: DELIMITED },
  {
    key: 'delimiter', kind: 'select', label: 'Input delimiter', default: 'auto', appliesTo: ['csv'],
    choices: [{ value: 'auto', label: 'Auto-detect' }, { value: ',', label: 'Comma' }, { value: ';', label: 'Semicolon' }, { value: 'tab', label: 'Tab' }, { value: '|', label: 'Pipe' }],
  },
  { key: 'detectNumbers', kind: 'toggle', label: 'Detect numbers', help: 'Values with leading zeros (postcodes, IDs) always stay as text.', default: true, appliesTo: DELIMITED },
]

const delimitedOut: OptionField[] = [
  { key: 'protectFormulas', kind: 'toggle', label: 'Protect against formula injection', help: 'Prefixes text cells that start with = + - @ so spreadsheet apps show them as text instead of running them.', default: true },
  { key: 'bom', kind: 'toggle', label: 'Add UTF-8 BOM (for Excel)', help: 'Makes Excel open accented characters correctly.', default: false },
]

const multiSheetWarning = (target: string) => (input: DetectedFile): string[] => {
  const n = input.metadata.sheet?.sheetNames?.length ?? 0
  return n > 1 ? [`This workbook has ${n} sheets. ${target} holds a single table, so only the selected sheet is exported (or choose “All sheets” for one file each).`] : []
}

function def(partial: Omit<ConversionDef, 'engine' | 'cost' | 'outputs'> & Partial<ConversionDef>): ConversionDef {
  return { engine: 'sheetjs', cost: 'light', outputs: 'single', ...partial }
}

export const spreadsheetConversions: ConversionDef[] = [
  def({
    id: 'sheet-to-xlsx', from: ALL_IN, to: 'xlsx', status: 'stable', lossy: false, editable: true, formatting: 'partial',
    limitations: ['Values, formulas and all sheets are kept.', 'Charts, images, pivot tables, macros and most cell styling are not.'],
    options: csvInputFields,
    load: async () => (await sheets()).toWorkbook('xlsx'),
  }),
  def({
    id: 'sheet-to-ods', from: ALL_IN, to: 'ods', status: 'stable', lossy: false, editable: true, formatting: 'partial',
    limitations: ['Values, formulas and all sheets are kept; styling, charts and images are not.'],
    options: csvInputFields,
    load: async () => (await sheets()).toWorkbook('ods'),
  }),
  def({
    id: 'sheet-to-csv', from: ALL_IN, to: 'csv', status: 'stable', lossy: true, editable: true, formatting: 'none',
    limitations: ['CSV stores one table of values: no formatting, formulas, charts or multiple sheets.'],
    options: [
      sheetField(true),
      ...csvInputFields,
      { key: 'outDelimiter', kind: 'select', label: 'Output delimiter', default: ',', choices: [{ value: ',', label: 'Comma (,)' }, { value: ';', label: 'Semicolon (;) — European Excel' }, { value: '|', label: 'Pipe (|)' }] },
      ...delimitedOut,
    ],
    warnings: multiSheetWarning('CSV'),
    load: async () => (await sheets()).toDelimited('csv'),
  }),
  def({
    id: 'sheet-to-tsv', from: ALL_IN.filter((f) => f !== 'tsv'), to: 'tsv', status: 'stable', lossy: true, editable: true, formatting: 'none',
    limitations: ['TSV stores one table of values.'],
    options: [sheetField(true), ...csvInputFields, ...delimitedOut],
    warnings: multiSheetWarning('TSV'),
    load: async () => (await sheets()).toDelimited('tsv'),
  }),
  def({
    id: 'sheet-to-json', from: ALL_IN.filter((f) => f !== 'json'), to: 'json', status: 'stable', lossy: true, editable: true, formatting: 'none',
    limitations: ['Values only (formulas become their results). Dates are ISO strings.'],
    options: [
      sheetField(true),
      ...csvInputFields,
      { key: 'headerRow', kind: 'toggle', label: 'First row is a header', help: 'On: an array of objects keyed by column name. Off: an array of rows.', default: true },
    ],
    load: async () => (await sheets()).toJson,
  }),
]
