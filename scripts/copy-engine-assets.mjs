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
