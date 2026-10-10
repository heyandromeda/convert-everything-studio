/** Conversions people commonly expect that this app deliberately does not offer, with the reason. */
export interface UnsupportedNote {
  from: string[]
  to: string
  reason: string
}

export const UNSUPPORTED: UnsupportedNote[] = [
  {
    from: ['png', 'jpeg', 'webp', 'gif', 'bmp', 'tiff', 'heic', 'avif'],
    to: 'SVG (vector tracing)',
    reason: 'Automatic tracing of photos into editable vector paths is not implemented. "SVG (embedded bitmap)" wraps the pixels instead.',
  },
  {
    from: ['png', 'jpeg', 'webp', 'gif', 'bmp', 'tiff', 'avif'],
    to: 'HEIC',
    reason: 'No browser exposes a HEIC encoder, and the HEVC patents make shipping one in a web app impractical.',
  },
  {
    from: ['pdf'],
    to: 'DOCX',
    reason: 'Rebuilding an editable Word document from PDF layout needs a desktop-class engine. Text extraction to TXT is offered instead.',
  },
  {
    from: ['doc', 'ppt'],
    to: 'Any format',
    reason: 'Legacy binary Word and PowerPoint files (97–2003) need a full Office engine. Re-save as DOCX/PPTX first.',
  },
  {
    from: ['pptx', 'odp'],
    to: 'PDF / slide images',
    reason: 'No in-browser renderer reproduces PowerPoint layout faithfully, so rendered output is not offered. Slide text and embedded media can be extracted.',
  },
  {
    from: ['odt', 'odp'],
    to: 'Any format',
    reason: 'OpenDocument text and presentation rendering is not implemented yet. Save as DOCX or PPTX first.',
  },
  {
    from: ['rtf'],
    to: 'HTML / PDF',
    reason: 'No reliable in-browser RTF renderer is bundled yet.',
  },
  {
    from: ['epub'],
    to: 'PDF',
    reason: 'EPUB rendering and pagination are not implemented yet.',
  },
  {
    from: ['key', 'numbers'],
    to: 'Any format',
    reason: 'Apple iWork files use a proprietary format. Export to PPTX/XLSX from Keynote or Numbers first.',
  },
  {
    from: ['7z', 'rar'],
    to: 'Extract',
    reason: '7-Zip and RAR extraction need a separate WebAssembly engine that is not bundled yet.',
  },
]
