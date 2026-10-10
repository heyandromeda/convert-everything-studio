import { sniffSignature, isAlias } from './detect'
import { ConversionError } from './errors'
import type { OutputFile } from '@/registry/types'

/** Output formats with a verifiable binary signature. */
const SIGNED = new Set([
  'png', 'apng', 'jpeg', 'gif', 'webp', 'bmp', 'tiff', 'ico', 'avif', 'pdf', 'zip', 'docx', 'xlsx', 'pptx', 'ods', 'odt',
  'mp3', 'wav', 'flac', 'ogg', 'opus', 'aiff', 'mp4', 'mov', 'm4a', 'webm', 'mkv', 'avi', 'gz', 'tar',
])

const OFFICE_ZIP = new Set(['docx', 'xlsx', 'pptx', 'ods', 'odt'])

/**
 * Checks that an output is non-empty and that its signature matches the format it claims to be.
 * This is the last line of defence against, e.g., a browser silently encoding PNG when asked for WebP.
 */
export async function validateOutput(out: OutputFile): Promise<void> {
  if (out.blob.size === 0) {
    throw new ConversionError('empty-output', 'The converter produced an empty file', 'No data was written for this output.', 'Try a different output format.')
  }
  if (out.formatId === 'files' || !SIGNED.has(out.formatId)) return
  const head = new Uint8Array(await out.blob.slice(0, 4100).arrayBuffer())
  const actual = sniffSignature(head)
  const expected = OFFICE_ZIP.has(out.formatId) ? 'zip' : out.formatId
  const ok = actual !== null && (isAlias(expected, actual) || (expected === 'aac' && actual === 'aac'))
  if (!ok) {
    throw new ConversionError(
      'invalid-output',
      'The output failed verification',
      `The engine was asked for ${out.formatId.toUpperCase()} but produced ${actual ? actual.toUpperCase() : 'unrecognisable'} data, so it was discarded.`,
      'This browser may not support encoding this format. Try another output format.',
    )
  }
  if (out.formatId === 'pdf') {
    const tail = new TextDecoder().decode(await out.blob.slice(Math.max(0, out.blob.size - 2048)).arrayBuffer())
    if (!tail.includes('%%EOF')) {
      throw new ConversionError('invalid-output', 'The PDF is incomplete', 'The generated PDF is missing its end-of-file marker.')
    }
  }
}
