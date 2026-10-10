// Copies large engine assets from node_modules into public/vendor so they are
// served from this origin (no CDN) and loaded only when a conversion needs them.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const vendor = join(root, 'public', 'vendor')

const copies = [
  ['node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js', 'ffmpeg/ffmpeg-core.js'],
  ['node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm', 'ffmpeg/ffmpeg-core.wasm'],
  ['node_modules/pdfjs-dist/cmaps', 'pdfjs/cmaps'],
  ['node_modules/pdfjs-dist/standard_fonts', 'pdfjs/standard_fonts'],
  ['node_modules/pdfjs-dist/wasm', 'pdfjs/wasm'],
  ['node_modules/libarchive.js/dist/worker-bundle.js', 'libarchive/worker-bundle.js'],
  ['node_modules/tesseract.js/dist/worker.min.js', 'tesseract/worker.min.js'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract/core/tesseract-core-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract/core/tesseract-core-simd-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js', 'tesseract/core/tesseract-core-relaxedsimd-lstm.wasm.js'],
  ['node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'tesseract/lang/eng.traineddata.gz'],
  ['node_modules/libarchive.js/dist/libarchive.wasm', 'libarchive/libarchive.wasm'],
]

rmSync(vendor, { recursive: true, force: true })
for (const [from, to] of copies) {
  const src = join(root, from)
  if (!existsSync(src)) {
    console.error(`missing engine asset: ${from}`)
    process.exit(1)
  }
  const dest = join(vendor, to)
  mkdirSync(dirname(dest), { recursive: true })
  cpSync(src, dest, { recursive: true })
}
console.log('engine assets copied to public/vendor')
