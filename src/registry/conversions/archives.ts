import type { ConversionDef } from '../types'

const archives = () => import('@/engines/archives/archives')
const pptx = () => import('@/engines/presentations/pptx')

export const archiveConversions: ConversionDef[] = [
  {
    id: 'archive-extract', from: ['zip', 'tar', 'tgz', 'gz'], to: 'files', label: 'Extract files', description: 'Unpacks the archive. Use “Download all (ZIP)” to keep the folder structure.',
    engine: 'fflate', status: 'stable', lossy: false, editable: true, formatting: 'n/a', cost: 'medium',
    limitations: ['Password-protected ZIPs are not supported.', 'Symbolic links are skipped.', 'Size and file-count limits guard against decompression bombs.'],
    maxInputMB: { mobile: 300, desktop: 1500 }, outputs: 'multiple', load: async () => (await archives()).extractArchive,
  },
  {
    id: 'archive-to-zip', from: ['tar', 'tgz'], to: 'zip', label: 'ZIP (repacked)', engine: 'fflate', status: 'stable', lossy: false, editable: true, formatting: 'n/a', cost: 'medium',
    limitations: ['File permissions and links are not carried over.'], maxInputMB: { mobile: 300, desktop: 1500 }, outputs: 'single', load: async () => (await archives()).repackAsZip,
  },
  {
    id: 'file-to-gzip', from: ['txt', 'csv', 'tsv', 'json', 'xml', 'yaml', 'md', 'html', 'svg', 'tar', 'pdf', 'wav', 'bmp', 'tiff'], to: 'gz', label: 'GZIP (compressed copy)',
    engine: 'fflate', status: 'stable', lossy: false, editable: true, formatting: 'n/a', cost: 'light',
    limitations: ['Compresses a single file.'], maxInputMB: { mobile: 300, desktop: 1500 }, outputs: 'single', load: async () => (await archives()).compressGzip,
  },
]

export const presentationConversions: ConversionDef[] = [
  {
    id: 'pptx-to-txt', from: ['pptx'], to: 'txt', label: 'Slide text (extract)', engine: 'ooxml-reader', status: 'stable', lossy: true, editable: true, formatting: 'none', cost: 'light',
    limitations: ['Text extraction only, in slide order; not a rendering of the slides.'],
    options: [{ key: 'notes', kind: 'toggle', label: 'Include speaker notes', default: true }],
    outputs: 'single', load: async () => (await pptx()).pptxToText,
  },
  {
    id: 'pptx-extract-media', from: ['pptx', 'xlsx'], to: 'files', label: 'Embedded images & media (original files)', engine: 'ooxml-reader', status: 'stable', lossy: false, editable: true, formatting: 'n/a', cost: 'light',
    limitations: ['Exports the original image/audio/video files stored in the presentation.'], outputs: 'multiple', load: async () => (await pptx()).pptxMedia,
  },
]
