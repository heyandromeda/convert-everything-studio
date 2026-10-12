export type Category =
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'presentation'
  | 'spreadsheet'
  | 'archive'
  | 'data'
  | 'other'

export interface FormatDef {
  id: string
  label: string
  category: Category
  extensions: string[]
  mimeTypes: string[]
  /** MIME type used when writing this format. */
  outputMime: string
  description?: string
}

export type SupportStatus = 'stable' | 'limited' | 'experimental'

export type EngineId =
  | 'canvas'
  | 'libwebp-wasm'
  | 'libavif-wasm'
  | 'gifenc'
  | 'utif'
  | 'bitmap-writer'
  | 'jpeg-png-metadata'
  | 'pdf-lib'
  | 'pdfjs'
  | 'pdfmake'
  | 'marked'
  | 'turndown'
  | 'mammoth'
  | 'sheetjs'
  | 'yaml'
  | 'fast-xml-parser'
  | 'subtitles'
  | 'fflate'
  | 'tar-reader'
  | 'ffmpeg-wasm'
  | 'libarchive-wasm'
  | 'tesseract-wasm'
  | 'ooxml-reader'

export type Cost = 'light' | 'medium' | 'heavy'

export type OptionValue = string | number | boolean | string[]
export type OptionValues = Record<string, OptionValue>

interface BaseField {
  key: string
  label: string
  help?: string
  /** Only shown (and applied) when this returns true. */
  visible?: (values: OptionValues) => boolean
  /** Restricts the field to these input format ids. */
  appliesTo?: string[]
  advanced?: boolean
}

export interface SliderField extends BaseField {
  kind: 'slider'
  min: number
  max: number
  step: number
  default: number
  unit?: string
}
export interface NumberField extends BaseField {
  kind: 'number'
  min?: number
  max?: number
  step?: number
  default: number | ''
  unit?: string
  placeholder?: string
}
export interface SelectField extends BaseField {
  kind: 'select'
  default: string
  choices: { value: string; label: string }[] | ((ctx: OptionContext) => { value: string; label: string }[])
}
export interface ToggleField extends BaseField {
  kind: 'toggle'
  default: boolean
}
export interface ColorField extends BaseField {
  kind: 'color'
  default: string
}
export interface TextField extends BaseField {
  kind: 'text'
  default: string
  placeholder?: string
  pattern?: RegExp
  patternMessage?: string
}

export type OptionField = SliderField | NumberField | SelectField | ToggleField | ColorField | TextField

export interface OptionContext {
  input: DetectedFile
}

export interface Availability {
  available: boolean
  reason?: string
}

export interface Capabilities {
  isIOS: boolean
  isMobile: boolean
  webAssembly: boolean
  offscreenCanvas: boolean
  workers: boolean
  webShareFiles: boolean
  nativeHeicDecode: boolean | null
  nativeAvifDecode: boolean | null
  maxCanvasPixels: number
  deviceMemoryGB: number | null
}

export interface ImageMeta {
  width?: number
  height?: number
  hasAlpha?: boolean
  animated?: boolean
  frameCount?: number
  orientation?: number
  hasExif?: boolean
  hasGps?: boolean
  hasXmp?: boolean
  hasIcc?: boolean
  cameraModel?: string
}

export interface MediaMeta {
  duration?: number
  width?: number
  height?: number
  playableNatively?: boolean
}

export interface DocumentMeta {
  pageCount?: number
  slideCount?: number
  wordCount?: number
  hasText?: boolean
  title?: string
}

export interface SheetMeta {
  sheetNames?: string[]
  rowCount?: number
  delimiter?: string
}

export interface ArchiveEntry {
  path: string
  size: number
  compressedSize?: number
  isDirectory: boolean
  unsafe?: string
}

export interface ArchiveMeta {
  entryCount?: number
  /** The listing stopped at a cap, so entryCount and totalSize are lower bounds. */
  entryCountIsMinimum?: boolean
  totalSize?: number
  entries?: ArchiveEntry[]
  truncated?: boolean
}

export interface FileMetadata {
  image?: ImageMeta
  media?: MediaMeta
  document?: DocumentMeta
  sheet?: SheetMeta
  archive?: ArchiveMeta
  notes?: string[]
}

export interface DetectedFile {
  formatId: string | null
  /** How the format was determined. */
  source: 'signature' | 'extension' | 'mime' | 'content' | 'none'
  extension: string
  mime: string
  /** Set when the filename extension disagrees with the detected content. */
  mismatch?: { claimed: string; actual: string }
  metadata: FileMetadata
}

export interface ProgressUpdate {
  stage?: 'preparing' | 'loading-engine' | 'processing' | 'finalizing'
  /** 0..1 when genuinely measurable, otherwise null/undefined. */
  ratio?: number | null
  message?: string
}

export interface OutputFile {
  blob: Blob
  name: string
  formatId: string
  /** Folder path inside a source archive, used when re-zipping results. */
  path?: string
  /** For generic extracted files: the format to use for previews only (never validated). */
  previewAs?: string
  meta?: { width?: number; height?: number; pages?: number; duration?: number }
}

export interface ConvertResult {
  outputs: OutputFile[]
  warnings?: string[]
}

export interface SourceFile {
  file: File
  input: DetectedFile
}

export interface ConvertContext {
  /** For multi-file operations: every input, in queue order. */
  sources?: SourceFile[]
  file: File
  baseName: string
  input: DetectedFile
  options: OptionValues
  caps: Capabilities
  signal: AbortSignal
  onProgress: (update: ProgressUpdate) => void
}

export type ConverterFn = (ctx: ConvertContext) => Promise<ConvertResult>

export interface ConversionDef {
  id: string
  from: string[]
  to: string
  /** The output keeps the input's format (e.g. metadata removal, re-encoding). `to` is then only nominal. */
  keepsInputFormat?: boolean
  /** Overrides the target format label in the picker, e.g. "PNG pages". */
  label?: string
  description?: string
  engine: EngineId
  status: SupportStatus
  lossy: boolean | 'configurable'
  editable: boolean
  formatting: 'full' | 'partial' | 'none' | 'n/a'
  cost: Cost
  limitations: string[]
  /** Hard size ceiling in MB on mobile/desktop; larger inputs are refused before processing. */
  maxInputMB?: { mobile: number; desktop: number }
  options?: OptionField[]
  outputs: 'single' | 'multiple'
  requires?: (caps: Capabilities, input?: DetectedFile) => Availability
  warnings?: (input: DetectedFile, options: OptionValues, caps: Capabilities) => string[]
  load: () => Promise<ConverterFn>
}
