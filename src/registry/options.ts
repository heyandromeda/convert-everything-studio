import type { OptionField, OptionValues } from './types'

const isResize = (mode: string) => (v: OptionValues) => v.resizeMode === mode

export const qualityFields: OptionField[] = [
  {
    key: 'qualityPreset',
    kind: 'select',
    label: 'Compression',
    default: 'balanced',
    choices: [
      { value: 'best', label: 'Best quality' },
      { value: 'balanced', label: 'Balanced' },
      { value: 'small', label: 'Smallest file' },
      { value: 'custom', label: 'Custom quality' },
    ],
    visible: (v) => v.lossless !== true,
  },
  {
    key: 'quality',
    kind: 'slider',
    label: 'Quality',
    min: 1,
    max: 100,
    step: 1,
    default: 80,
    unit: '%',
    visible: (v) => v.qualityPreset === 'custom' && v.lossless !== true,
  },
]

export const losslessField: OptionField = {
  key: 'lossless',
  kind: 'toggle',
  label: 'Lossless',
  help: 'Keeps every pixel exactly. Files are larger.',
  default: false,
}

export const resizeFields: OptionField[] = [
  {
    key: 'resizeMode',
    kind: 'select',
    label: 'Size',
    default: 'none',
    choices: [
      { value: 'none', label: 'Keep original size' },
      { value: 'fit', label: 'Fit within…' },
      { value: 'percent', label: 'Scale by percentage' },
      { value: 'exact', label: 'Set width / height' },
    ],
  },
  {
    key: 'fitPreset',
    kind: 'select',
    label: 'Maximum dimension',
    default: '1920',
    choices: [
      { value: '640', label: '640 px' },
      { value: '1080', label: '1080 px' },
      { value: '1280', label: '1280 px' },
      { value: '1920', label: '1920 px' },
      { value: '2560', label: '2560 px' },
      { value: '3840', label: '3840 px' },
      { value: 'custom', label: 'Custom box…' },
    ],
    visible: isResize('fit'),
  },
  {
    key: 'percent',
    kind: 'slider',
    label: 'Scale',
    min: 5,
    max: 200,
    step: 5,
    default: 50,
    unit: '%',
    visible: isResize('percent'),
  },
  {
    key: 'width',
    kind: 'number',
    label: 'Width',
    min: 1,
    max: 16384,
    default: '',
    unit: 'px',
    placeholder: 'auto',
    visible: (v) => v.resizeMode === 'exact' || (v.resizeMode === 'fit' && v.fitPreset === 'custom'),
  },
  {
    key: 'height',
    kind: 'number',
    label: 'Height',
    min: 1,
    max: 16384,
    default: '',
    unit: 'px',
    placeholder: 'auto',
    visible: (v) => v.resizeMode === 'exact' || (v.resizeMode === 'fit' && v.fitPreset === 'custom'),
  },
  {
    key: 'lockAspect',
    kind: 'toggle',
    label: 'Keep aspect ratio',
    help: 'When off, the image is stretched to exactly the width and height you enter.',
    default: true,
    visible: isResize('exact'),
  },
  {
    key: 'allowUpscale',
    kind: 'toggle',
    label: 'Allow enlarging',
    default: false,
    visible: isResize('fit'),
  },
]

export const backgroundField: OptionField = {
  key: 'background',
  kind: 'color',
  label: 'Background for transparent areas',
  help: 'This format has no transparency, so transparent pixels are filled with this colour.',
  default: '#ffffff',
}

export const pageSizeField: OptionField = {
  key: 'pageSize',
  kind: 'select',
  label: 'Page size',
  default: 'image',
  choices: [
    { value: 'image', label: 'Match image size' },
    { value: 'a4', label: 'A4 (fit with margins)' },
    { value: 'letter', label: 'US Letter (fit with margins)' },
  ],
}

export function defaultOptions(fields: OptionField[] | undefined): OptionValues {
  const values: OptionValues = {}
  for (const f of fields ?? []) values[f.key] = f.default
  return values
}

/** Returns a list of problems; empty when the values are acceptable. */
export function validateOptions(fields: OptionField[] | undefined, values: OptionValues): string[] {
  const problems: string[] = []
  for (const f of fields ?? []) {
    if (f.visible && !f.visible(values)) continue
    const v = values[f.key]
    if (f.kind === 'number' && v !== '' && v !== undefined) {
      const n = Number(v)
      if (!Number.isFinite(n)) problems.push(`${f.label} must be a number.`)
      else if (f.min !== undefined && n < f.min) problems.push(`${f.label} must be at least ${f.min}.`)
      else if (f.max !== undefined && n > f.max) problems.push(`${f.label} must be at most ${f.max}.`)
    }
    if (f.kind === 'text' && f.pattern && typeof v === 'string' && v.trim() !== '' && !f.pattern.test(v.trim())) {
      problems.push(f.patternMessage ?? `${f.label} is not valid.`)
    }
  }
  return problems
}

export function serializeOptions(values: OptionValues): string {
  return JSON.stringify(values, Object.keys(values).sort())
}

export function deserializeOptions(raw: string | null): OptionValues {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: OptionValues = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (['string', 'number', 'boolean'].includes(typeof v) || (Array.isArray(v) && v.every((x) => typeof x === 'string'))) out[k] = v as OptionValues[string]
    }
    return out
  } catch {
    return {}
  }
}
