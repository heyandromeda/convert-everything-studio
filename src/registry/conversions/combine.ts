import type { ConversionDef, OptionField } from '../types'

const combine = () => import('@/engines/combine')

const orderField: OptionField = {
  key: 'order', kind: 'select', label: 'Order', default: 'queue',
  choices: [{ value: 'queue', label: 'As added' }, { value: 'name', label: 'By file name' }],
}

export const combineConversions: ConversionDef[] = [
  {
    id: 'combine-images-pdf', from: ['image-set'], to: 'pdf', label: 'One PDF (a page per image)', engine: 'pdf-lib', status: 'stable', lossy: false, editable: false, formatting: 'n/a', cost: 'medium',
    limitations: ['JPEGs are embedded without re-compression; other formats are embedded as PNG or high-quality JPEG.'],
    options: [
      { key: 'pageSize', kind: 'select', label: 'Page size', default: 'a4', choices: [{ value: 'a4', label: 'A4 (fit with margins)' }, { value: 'letter', label: 'US Letter (fit with margins)' }, { value: 'image', label: 'Match each image' }] },
      orderField,
    ],
    outputs: 'single', load: async () => (await combine()).imagesToOnePdf,
  },
  {
    id: 'combine-pdfs', from: ['pdf-set'], to: 'pdf', label: 'Merged PDF', engine: 'pdf-lib', status: 'stable', lossy: false, editable: false, formatting: 'full', cost: 'medium',
    limitations: ['Encrypted PDFs cannot be merged.', 'Bookmarks and form fields may not carry over.'],
    options: [orderField], outputs: 'single', load: async () => (await combine()).mergePdfs,
  },
  {
    id: 'combine-zip', from: ['file-set', 'image-set', 'pdf-set'], to: 'zip', label: 'ZIP of the original files', engine: 'fflate', status: 'stable', lossy: false, editable: true, formatting: 'n/a', cost: 'medium',
    limitations: ['Duplicate names get a numbered suffix.'], options: [orderField], outputs: 'single', load: async () => (await combine()).packZip,
  },
]
