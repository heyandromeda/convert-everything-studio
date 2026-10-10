import type { ConversionDef, OptionField } from '../types'

const text = () => import('@/engines/documents/text')
const toPdf = () => import('@/engines/documents/to-pdf')
const pdfRead = () => import('@/engines/documents/pdf-read')
const pdfPages = () => import('@/engines/documents/pdf-pages')
const docx = () => import('@/engines/documents/docx')

const pdfLayout: OptionField[] = [
  { key: 'pageSize', kind: 'select', label: 'Page size', default: 'A4', choices: [{ value: 'A4', label: 'A4' }, { value: 'LETTER', label: 'US Letter' }] },
  { key: 'fontSize', kind: 'select', label: 'Text size', default: '11', choices: ['9', '10', '11', '12', '14'].map((v) => ({ value: v, label: `${v} pt` })) },
  { key: 'pageNumbers', kind: 'toggle', label: 'Page numbers', default: true },
]

export const encodingField: OptionField = {
  key: 'encoding',
  kind: 'select',
  label: 'Text encoding',
  help: 'Auto-detect handles UTF-8 and UTF-16; choose another if accented letters look wrong.',
  default: 'auto',
  choices: [
    { value: 'auto', label: 'Auto-detect' },
    { value: 'utf-8', label: 'UTF-8' },
    { value: 'windows-1252', label: 'Windows-1252 (Western)' },
    { value: 'iso-8859-1', label: 'ISO-8859-1 (Latin-1)' },
    { value: 'iso-8859-2', label: 'ISO-8859-2 (Central European)' },
    { value: 'windows-1251', label: 'Windows-1251 (Cyrillic)' },
    { value: 'shift_jis', label: 'Shift_JIS (Japanese)' },
    { value: 'gb18030', label: 'GB18030 (Chinese)' },
    { value: 'euc-kr', label: 'EUC-KR (Korean)' },
    { value: 'utf-16le', label: 'UTF-16 LE' },
  ],
}

const pagesField: OptionField = {
  key: 'pages',
  kind: 'text',
  label: 'Pages',
  default: '',
  placeholder: 'All pages (e.g. 1-3, 5)',
  pattern: /^(all|[\d\s,-]+)$/i,
  patternMessage: 'Use page numbers and ranges like 1-3, 5.',
}

const reflowLimitation = 'Re-laid out from document structure: headings, paragraphs, lists, tables and inline images. CSS and exact layout are not reproduced.'

export const documentConversions: ConversionDef[] = [
  {
    id: 'md-to-html', from: ['md'], to: 'html', engine: 'marked', status: 'stable', lossy: false, editable: true, formatting: 'full', cost: 'light',
    limitations: ['GitHub-flavoured Markdown. Raw HTML is sanitised (scripts removed).'],
    options: [{ key: 'standalone', kind: 'toggle', label: 'Full HTML page with styling', default: true }],
    outputs: 'single', load: async () => (await text()).mdToHtml,
  },
  {
    id: 'md-to-pdf', from: ['md'], to: 'pdf', engine: 'pdfmake', status: 'limited', lossy: false, editable: false, formatting: 'partial', cost: 'medium',
    limitations: [reflowLimitation, 'Embedded font covers Latin, Greek and Cyrillic only.'],
    options: pdfLayout, outputs: 'single', load: async () => (await toPdf()).mdToPdf,
  },
  {
    id: 'md-to-txt', from: ['md'], to: 'txt', engine: 'marked', status: 'stable', lossy: true, editable: true, formatting: 'none', cost: 'light',
    limitations: ['Formatting markers are removed.'], outputs: 'single', load: async () => (await text()).mdToTxt,
  },
  {
    id: 'html-to-md', from: ['html'], to: 'md', engine: 'turndown', status: 'stable', lossy: true, editable: true, formatting: 'partial', cost: 'light',
    limitations: ['Styling and layout are dropped; structure (headings, lists, links, tables) is kept.'], outputs: 'single', load: async () => (await text()).htmlToMd,
  },
  {
    id: 'html-to-pdf', from: ['html'], to: 'pdf', engine: 'pdfmake', status: 'limited', lossy: false, editable: false, formatting: 'partial', cost: 'medium',
    limitations: [reflowLimitation, 'Remote images are never fetched (privacy).', 'Embedded font covers Latin, Greek and Cyrillic only.'],
    options: pdfLayout, outputs: 'single', load: async () => (await toPdf()).htmlToPdf,
  },
  {
    id: 'html-to-txt', from: ['html'], to: 'txt', engine: 'marked', status: 'stable', lossy: true, editable: true, formatting: 'none', cost: 'light',
    limitations: ['Text only.'], outputs: 'single', load: async () => (await text()).htmlToTxt,
  },
  {
    id: 'txt-to-pdf', from: ['txt'], to: 'pdf', engine: 'pdfmake', status: 'stable', lossy: false, editable: false, formatting: 'n/a', cost: 'medium',
    limitations: ['Line breaks are preserved; text is set in a proportional font.', 'Embedded font covers Latin, Greek and Cyrillic only.'],
    options: [...pdfLayout, encodingField], outputs: 'single', load: async () => (await toPdf()).txtToPdf,
  },
  {
    id: 'txt-to-html', from: ['txt'], to: 'html', engine: 'marked', status: 'stable', lossy: false, editable: true, formatting: 'n/a', cost: 'light',
    limitations: ['Blank lines become paragraphs.'], options: [encodingField], outputs: 'single', load: async () => (await text()).txtToHtml,
  },
  {
    id: 'txt-reencode', from: ['txt', 'csv', 'tsv', 'md', 'srt', 'vtt'], to: 'txt', keepsInputFormat: true, label: 'Text re-encoded as UTF-8', description: 'Fixes garbled accents by converting from a legacy encoding to UTF-8.',
    engine: 'marked', status: 'stable', lossy: false, editable: true, formatting: 'n/a', cost: 'light',
    limitations: ['The source encoding must be chosen correctly; auto-detect falls back to Windows-1252.'],
    options: [
      encodingField,
      { key: 'lineEndings', kind: 'select', label: 'Line endings', default: 'keep', choices: [{ value: 'keep', label: 'Keep' }, { value: 'lf', label: 'LF (macOS, Linux)' }, { value: 'crlf', label: 'CRLF (Windows)' }] },
      { key: 'bom', kind: 'toggle', label: 'Add byte-order mark', help: 'Helps older Windows apps detect UTF-8.', default: false },
    ],
    outputs: 'single', load: async () => (await text()).txtReencode,
  },
  {
    id: 'pdf-to-txt', from: ['pdf'], to: 'txt', label: 'Plain text (extract)', engine: 'pdfjs', status: 'stable', lossy: true, editable: true, formatting: 'none', cost: 'medium',
    limitations: ['Extracts selectable text only — not a layout-preserving conversion.', 'Scanned pages need OCR, which is not included.'],
    options: [pagesField, { key: 'pageMarkers', kind: 'toggle', label: 'Mark page breaks', default: true }],
    outputs: 'single', load: async () => (await pdfRead()).pdfToText,
  },
  {
    id: 'pdf-to-png', from: ['pdf'], to: 'png', label: 'PNG images (one per page)', engine: 'pdfjs', status: 'stable', lossy: false, editable: false, formatting: 'full', cost: 'medium',
    limitations: ['Pages become pictures: text is not selectable.', 'Very large pages are rendered at reduced DPI on iPhone.'],
    options: [pagesField, { key: 'dpi', kind: 'select', label: 'Resolution', default: '150', choices: [{ value: '72', label: '72 DPI (screen)' }, { value: '150', label: '150 DPI' }, { value: '300', label: '300 DPI (print)' }] }],
    outputs: 'multiple', maxInputMB: { mobile: 150, desktop: 600 }, load: async () => (await pdfRead()).pdfToImages('png'),
  },
  {
    id: 'pdf-to-jpeg', from: ['pdf'], to: 'jpeg', label: 'JPEG images (one per page)', engine: 'pdfjs', status: 'stable', lossy: true, editable: false, formatting: 'full', cost: 'medium',
    limitations: ['Pages become pictures: text is not selectable.'],
    options: [pagesField, { key: 'dpi', kind: 'select', label: 'Resolution', default: '150', choices: [{ value: '72', label: '72 DPI (screen)' }, { value: '150', label: '150 DPI' }, { value: '300', label: '300 DPI (print)' }] }],
    outputs: 'multiple', maxInputMB: { mobile: 150, desktop: 600 }, load: async () => (await pdfRead()).pdfToImages('jpeg'),
  },
  {
    id: 'pdf-extract-pages', from: ['pdf'], to: 'pdf', label: 'PDF (selected pages)', description: 'Copies the pages you choose into a new PDF. Text stays selectable.',
    engine: 'pdf-lib', status: 'stable', lossy: false, editable: false, formatting: 'full', cost: 'light',
    limitations: ['Encrypted PDFs are not supported.', 'Bookmarks may not carry over.'],
    options: [{ ...pagesField, placeholder: 'e.g. 1-3, 5' }], outputs: 'single', load: async () => (await pdfPages()).pdfExtractPages,
  },
  {
    id: 'pdf-strip-metadata', from: ['pdf'], to: 'pdf', label: 'PDF without metadata', description: 'Removes author, title, software and XMP metadata without re-rendering.',
    engine: 'pdf-lib', status: 'stable', lossy: false, editable: false, formatting: 'full', cost: 'light',
    limitations: ['Metadata inside embedded images or attachments is not changed.'], outputs: 'single', load: async () => (await pdfPages()).pdfStripMetadata,
  },
  {
    id: 'docx-to-html', from: ['docx'], to: 'html', engine: 'mammoth', status: 'limited', lossy: true, editable: true, formatting: 'partial', cost: 'light',
    limitations: ['Keeps headings, paragraphs, lists, tables, bold/italic, links and images.', 'Fonts, colours, page layout, headers/footers and text boxes are not kept.'],
    outputs: 'single', load: async () => (await docx()).docxToHtml,
  },
  {
    id: 'docx-to-md', from: ['docx'], to: 'md', engine: 'mammoth', status: 'limited', lossy: true, editable: true, formatting: 'partial', cost: 'light',
    limitations: ['Structure only; images become placeholders.'], outputs: 'single', load: async () => (await docx()).docxToMd,
  },
  {
    id: 'docx-to-txt', from: ['docx'], to: 'txt', engine: 'mammoth', status: 'stable', lossy: true, editable: true, formatting: 'none', cost: 'light',
    limitations: ['Text only.'], options: [{ key: 'keepStructure', kind: 'toggle', label: 'Keep list bullets and paragraph spacing', default: true }],
    outputs: 'single', load: async () => (await docx()).docxToTxt,
  },
  {
    id: 'docx-to-pdf', from: ['docx'], to: 'pdf', engine: 'pdfmake', status: 'experimental', lossy: true, editable: false, formatting: 'partial', cost: 'medium',
    limitations: ['Not a print of the Word layout: content is re-flowed onto new pages.', 'Fonts, columns, headers/footers and floating images are not reproduced.'],
    options: pdfLayout, outputs: 'single', load: async () => (await docx()).docxToPdf,
  },
  {
    id: 'docx-extract-media', from: ['docx'], to: 'files', label: 'Embedded images (original files)', engine: 'ooxml-reader', status: 'stable', lossy: false, editable: true, formatting: 'n/a', cost: 'light',
    limitations: ['Exports images exactly as stored inside the document.'], outputs: 'multiple', load: async () => (await import('@/engines/presentations/pptx')).pptxMedia,
  },
]
