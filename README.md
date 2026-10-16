# Convert Everything

**Website:** https://convert-everything-preview.vercel.app

Same app, production Vercel hostname: https://convert-everything-one.vercel.app  
Source: https://github.com/heyandromeda/convert-everything-studio  
GitHub Pages (after this workflow runs on `main`): https://heyandromeda.github.io/convert-everything-studio/

This is a website. Open that address in Safari, Chrome, or Firefox. There is no app to install and no App Store listing. On an iPhone, use Safari. Share → Add to Home Screen only saves a shortcut to this same website.

It converts files in the browser tab. Images, documents, spreadsheets, data files, subtitles, archives, audio and video stay on the device and are converted with JavaScript and WebAssembly. Nothing is uploaded.

The site is a static web app (React + TypeScript + Vite) with no backend. The layout is meant to be usable on a phone and on a desktop. The address above is a Vercel preview, not a production domain.

---

## Privacy model

- **Where processing happens:** in the browser tab. Files you select are read into memory on your device and handed to local engines: Canvas, libwebp/libavif (WASM), pdf.js, pdf-lib, pdfmake, mammoth, SheetJS, fflate and FFmpeg (WASM).
- **No upload path exists.** There are no server endpoints, serverless functions, analytics, telemetry, error reporting, accounts or ads.
- **Enforced by the browser.** The page ships a Content Security Policy with `connect-src 'self' blob: data:`. Even if a dependency misbehaved, the browser would refuse to send data to any other origin. Remote images in user HTML/Markdown are removed rather than fetched. `img-src` is limited to `self`, `blob:` and `data:`.
- **Self-hosted engines.** Every engine, worker, font and WASM binary is served from the same origin as the app; there are no CDN calls. Heavy engines (FFmpeg ~32 MB, AVIF ~3.5 MB, pdf.js worker) download only when a conversion needs them.
- **What is stored locally:** only conversion settings (quality, size and similar) in `localStorage`, and only if "Remember conversion settings" is on. File names, contents and results are never persisted. The service worker caches app code and engines (not your files). Settings → *Clear saved settings and cached engines* removes both.
- **What the host sees:** the static file requests any website receives (IP address, user agent, which app assets were loaded). It never sees your files or their names.

The tests check this: every end-to-end test fails if the page makes a request to another origin, and the PNG→WebP test also asserts that no POST/PUT requests occur.

---

## Using it

1. Open the app and tap **Browse files** (Files app) or **Photos & videos** (photo library).
2. Each file is identified from its **content** (magic bytes), not just its name. If they disagree, a warning appears.
3. Tap **To …** to choose an output. Only conversions that are implemented and available in your browser are listed, with a status badge (*Supported*, *With limits*, *Experimental*, *Unavailable here*).
4. Optional: tap the sliders button for settings (quality, resize, page range, bitrate, trim…).
5. Tap **Convert**. Progress is shown as a percentage only when the engine reports real progress; otherwise the bar is indeterminate.
6. **Download** each result, use **Share** (iOS share sheet: Save Image, Save to Files, AirDrop…), or use **Download all (ZIP)**.

Batch tools appear below the file list when there are two or more files: *Convert all images to WebP/JPEG/PNG/AVIF/PDF*, *N images → one PDF*, *Merge N PDFs*, *ZIP N originals*.

---

## Compatibility matrix

Status meanings:

- **Supported:** implemented and covered by automated tests that validate the real output.
- **With limits:** works and is tested, but has a documented, inherent limitation.
- **Experimental:** works in tests, but fidelity or performance is not good enough to call it supported.

"Verified" names the end-to-end test (run against the production build in Chromium, WebKit with iPhone 15 emulation, and Firefox) that checks the output with an independent tool: ffprobe, pdftotext/pdfinfo, unzip, gzip, SheetJS, or byte signatures.

### Images

| From | To | Engine | Status | Verified |
| --- | --- | --- | --- | --- |
| PNG, APNG, JPEG, WebP, AVIF¹, GIF, BMP, TIFF, ICO, HEIC², SVG | **WebP** | libwebp (WASM) | Supported | PNG→WebP (ffprobe), JPEG→WebP resize, large PNG→WebP |
| same | **PNG** | Canvas | Supported | JPEG→PNG, SVG→PNG (scripts stripped) |
| same | **JPEG** (background colour for transparency) | Canvas | Supported | PNG→JPEG |
| same | **AVIF** | libavif (WASM) | Experimental (slow on phones) | PNG→AVIF signature |
| same | **GIF** (static, 256 colours) | gifenc | With limits | PNG→GIF |
| same | **BMP** (24-bit) | built-in writer | Supported | PNG→BMP |
| same | **TIFF** (uncompressed RGBA) | UTIF.js | Supported | PNG→TIFF |
| same | **ICO** (16–256 px, PNG-compressed) | built-in writer | Supported | PNG→ICO |
| same | **PDF** (one page; JPEG embedded without re-compression) | pdf-lib | Supported | PNG→PDF |
| same | **SVG (embedded bitmap)**: not vector tracing | Canvas | With limits | PNG→SVG wrapper |
| JPEG, PNG | **Remove metadata (lossless)**: strips EXIF/GPS/XMP/IPTC/comments, keeps ICC profile and orientation | built-in byte editor | Supported | JPEG comment removed, pixels byte-identical (unit + e2e) |
| several images | **One PDF** (a page per image) | pdf-lib | Supported | 2 images → 2-page PDF |
| PNG, JPEG, WebP, AVIF, GIF, BMP, TIFF, HEIC | **Text via OCR** (English) | Tesseract (WASM, self-hosted) | With limits: approximate, confidence reported | sign.png text recognised |

All image conversions support resize (fit within, percentage, exact with aspect lock), compression presets or a quality slider, and lossless WebP. Re-encoding never copies EXIF/GPS. Orientation is applied.
¹ AVIF input needs a browser that decodes AVIF (Safari 16+, Chrome, Firefox). ² HEIC is decoded natively by Safari; other browsers use a bundled [libheif](https://github.com/strukturag/libheif) WebAssembly build (LGPL-3.0, ~2 MB, loaded only for HEIC files). Verified HEIC→JPEG in Chromium, WebKit and Firefox.

### Documents

| From | To | Engine | Status | Verified |
| --- | --- | --- | --- | --- |
| Markdown | HTML (sanitised, styled page) | marked + DOMPurify | Supported | structure kept, `<script>` removed |
| Markdown | PDF (real, selectable text) | pdfmake | With limits (re-flowed layout) | pdftotext |
| Markdown | Plain text | marked | Supported | ✓ |
| HTML | Markdown (GFM tables) | Turndown | Supported | `javascript:` links and tracker images removed |
| HTML | PDF | pdfmake | With limits (no CSS) | pdftotext |
| HTML | Plain text | DOM | Supported | ✓ |
| TXT | PDF / HTML | pdfmake / DOM | Supported | pdftotext |
| TXT, CSV, TSV, MD, SRT, VTT | Same format re-encoded as UTF-8 (from Windows-1252, Latin-1, Shift_JIS, GB18030, …) | TextDecoder | Supported | Windows-1252 → UTF-8 |
| PDF | Plain text (extraction only) | pdf.js | Supported | page markers, page ranges |
| PDF (scanned) | Text via OCR (English) | Tesseract (WASM, self-hosted, ~7 MB on first use) | With limits: approximate, confidence reported | "Total amount due" recognised in all three browsers |
| PDF | PNG / JPEG page images (72/150/300 DPI) | pdf.js | Supported | ✓ |
| PDF | PDF with selected pages (text stays selectable) | pdf-lib | Supported | pdfinfo page count |
| PDF | PDF without metadata | pdf-lib | Supported | author removed (pdfinfo) |
| several PDFs | Merged PDF | pdf-lib | Supported | 2 + 2 → 4 pages |
| DOCX | HTML / Markdown / TXT | mammoth | With limits (structure, not layout) | headings, table, inline image |
| DOCX | PDF | mammoth → pdfmake | **Experimental**: re-flowed, not a Word print | pdftotext |
| DOCX | Embedded images (original files) | OOXML reader | Supported | ✓ |

### Presentations

| From | To | Status |
| --- | --- | --- |
| PPTX | Slide text in order, with speaker notes | Supported (verified order and notes) |
| PPTX | Embedded images & media (original files) | Supported |

### Spreadsheets & data

| From | To | Engine | Status | Notes |
| --- | --- | --- | --- | --- |
| CSV, TSV, XLSX, XLS, ODS, JSON | XLSX, ODS | SheetJS | Supported | values, formulas and all sheets; no charts/images/macros/most styling |
| same | CSV, TSV | SheetJS | Supported | choose a worksheet or "All sheets" (one file each); formula-injection protection on by default; optional BOM for Excel |
| same | JSON | SheetJS | Supported | header row → array of objects |
| JSON | YAML, XML | yaml / fast-xml-parser | Supported / With limits | |
| YAML, XML | JSON | yaml / fast-xml-parser | Supported | YAML alias expansion capped; XML entities never expanded from DOCTYPE |
| SRT ↔ VTT | | built-in | Supported | optional timing shift |

CSV input: auto delimiter detection, quoted fields and embedded newlines, selectable text encoding. Numbers are detected without breaking leading zeros (`02134` stays text). If a workbook contains formulas with no saved result (e.g. files written by scripts and never opened in Excel), the app says so instead of inventing values.

### Archives

| From | To | Status | Notes |
| --- | --- | --- | --- |
| ZIP, TAR, TAR.GZ, GZIP | Extract files (all or selected) | Supported | path traversal (`../`), absolute paths and reserved names are neutralised; symlinks skipped; size, file-count and ratio limits stop decompression bombs; extracted files are never opened |
| 7Z | Extract files (all or selected) | Supported | libarchive (WebAssembly, MIT, ~1 MB on first use); same safety limits; verified in all three browsers |
| RAR | Extract files | Experimental | libarchive; RAR 4 fully, RAR 5 partially; no automated test because no free RAR encoder exists to create fixtures |
| TAR, TAR.GZ | ZIP (repacked) | Supported | |
| Text, PDF, TAR, WAV, BMP, TIFF… | GZIP | Supported | |
| any files | ZIP of originals | Supported | |

### Audio & video (FFmpeg 6 in WebAssembly, single-threaded, ~32 MB, downloaded on first use)

| From | To | Status | Verified (ffprobe) |
| --- | --- | --- | --- |
| MP3, WAV, AAC, M4A, OGG, Opus, FLAC, AIFF, and audio from MP4/MOV/WebM/MKV/AVI/3GP | MP3, M4A (AAC), AAC (ADTS), OGG (Vorbis), FLAC, WAV, AIFF | Supported | WAV→MP3 (stereo, 2.0 s), MP4→M4A, MP4→WAV, WAV→OGG/AAC/AIFF/M4A, WAV→FLAC trimmed to 1.0 s |
| same | Opus | With limits: FFmpeg's native Opus encoder | WAV→Opus |
| MP4, MOV, WebM, MKV, AVI, 3GP | MP4 / MOV / MKV (H.264 + AAC) | **Experimental** (slow on phones) | MOV→MP4 H.264, MOV→MKV |
| same | WebM (VP8 + Vorbis) | **Experimental** | stereo MP4→WebM |
| same | Animated GIF (palette-optimised) | Supported | MP4→GIF |
| same | JPEG frame (thumbnail) | Supported | ✓ |

Options: bitrate, sample rate, mono/stereo, trim (start/end), remove tags; for video also quality, resolution (fit within), frame rate, remove audio, and **copy streams** (container change without re-encoding, e.g. iPhone MOV → MP4). Progress is real, computed from FFmpeg timestamps. Stop terminates the FFmpeg worker.

### Not supported (and why)

| Conversion | Reason |
| --- | --- |
| Bitmap → editable vector SVG (tracing) | Not implemented. "SVG (embedded bitmap)" is clearly labelled as a wrapper. |
| Anything → HEIC | No browser exposes a HEIC encoder; HEVC patent licensing makes shipping one impractical. |
| PDF → DOCX | Rebuilding editable Word layout from PDF needs a desktop-class engine. Text extraction is offered instead. |
| PPTX → PDF / slide images | No in-browser renderer reproduces PowerPoint layout faithfully. Text and media extraction are offered instead. |
| DOC, XLS*, PPT (97–2003 binary) | Need a full Office engine. *XLS is supported through SheetJS. |
| RTF, ODT, EPUB, ODP rendering | No reliable bundled renderer yet. |
| Keynote, Numbers | Proprietary format. |
| OCR in languages other than English | Only the English model is bundled (each language adds 2–4 MB). |
| H.265/VP9/AV1 encoding | Too slow single-threaded in WebAssembly to be useful. |

---

## Browser compatibility

| Browser | Status |
| --- | --- |
| **iPhone / iPad Safari (iOS 16.4+)** | Primary target. Automated tests run in Playwright WebKit with iPhone 15 emulation; real-device testing is still needed (see below). HEIC decodes natively. |
| Safari (macOS) | Same engine as iOS. |
| Chrome / Edge (desktop and Android) | Fully tested (Chromium). HEIC via libheif. |
| Firefox | Fully tested. HEIC via libheif. |

Notes for iPhone:
- Safari cannot allocate canvases above about 16.7 megapixels. Larger images (for example 48 MP ProRAW-derived JPEGs) are scaled to fit, and the result says so.
- Downloads go to *Files → Downloads*. To save an image to Photos, use **Share → Save Image** (the native share sheet; the app does not write to Photos directly).
- Video encoding is CPU-bound and single-threaded. Keep Safari in the foreground (iOS suspends background tabs). Inputs above 400 MB are refused on phones before any work starts.
- Phones run one conversion at a time to save memory; desktops run up to three.
- The app is installable (Share → *Add to Home Screen*). The app shell and image conversions (~1.7 MB) are cached on the first visit; every other engine is cached the first time you use it, after which it also works offline. iOS may evict cached data after a period of non-use, so offline availability is not permanent.

---

## Architecture

```
src/
  registry/            ← source of truth for the UI
    formats.ts           format ids, extensions, MIME types
    types.ts             ConversionDef, OptionField, Capabilities, …
    options.ts           shared option schemas, validation, (de)serialisation
    conversions/*.ts     one file per category; each entry declares engine, status,
                         lossy/editable/formatting, cost, limits, options, and a lazy loader
    unsupported.ts       conversions deliberately not offered, with reasons
  engines/             ← real converters, each loaded on demand
    images/  documents/  spreadsheets/  data/  archives/  presentations/  media/  combine.ts
  workers/image-encoder.worker.ts   libwebp / libavif / gifenc / UTIF off the main thread
  features/queue/      ← job engine
    job-state.ts         status machine (queued → preparing → loading-engine → processing → finalizing → completed/failed/canceled)
    store.ts             zustand store
    runner.ts            detection, device-aware concurrency, cancellation, run tokens against stale updates, output validation
  lib/                 ← detection (magic bytes), metadata, EXIF, archive safety, errors, downloads, validation
  components/          ← UI (shadcn/ui + Tailwind)
tests/
  unit/                Vitest: detection, registry, state machine, filenames, options, CSV safety, EXIF, archives, parsers
  e2e/                 Playwright against the production build in Chromium, WebKit (iPhone 15), Firefox
  fixtures/            real sample files (regenerable with scripts/generate-*.{py,sh})
```

**Adding a converter:** write a `ConverterFn` in `src/engines/<category>/`, add a `ConversionDef` to `src/registry/conversions/<category>.ts` with a lazy `load()`, and add an e2e case. The picker, options UI, compatibility sheet and batch tools pick it up automatically.

**Export safety net:** every output passes `validateOutput()`, which checks it is non-empty, that its magic bytes match the requested format (this catches browsers that silently write PNG when asked for WebP), and that PDFs have an end-of-file marker. Anything that fails is discarded and reported as an error.

---

## Development

Requires Node 20+.

```bash
npm install
npm run dev          # http://localhost:4791 (copies engine assets into public/vendor first)
npm run build        # type-check + production build into dist/
npm run preview      # serve dist/ on http://localhost:4792
npm run lint
npm test             # unit tests (Vitest)
npx playwright install --with-deps chromium webkit firefox
npm run test:e2e     # end-to-end tests against the production build (run `npm run build` first)
```

The e2e tests validate outputs with system tools: `ffprobe` (FFmpeg), `pdftotext`/`pdfinfo` (poppler-utils), `unzip` and `gzip`. On Ubuntu: `sudo apt install ffmpeg poppler-utils unzip`.

Fixtures: `scripts/generate-fixtures.py` (python-docx, python-pptx, openpyxl, reportlab, pillow) and `scripts/generate-media-fixtures.sh` (ffmpeg).

Smoke-test a deployed preview:

```bash
LIVE_URL=https://convert-everything-preview.vercel.app npx playwright test live-smoke --project=webkit-iphone
```

---

## Deployment

`dist/` is a fully static site: HTML, JS, CSS, fonts, WASM. Any static host works. The build also emits:

- `dist/_headers` (Netlify / Cloudflare Pages): CSP with `frame-ancestors 'none'`, `nosniff`, `no-referrer`, a restrictive `Permissions-Policy`, and immutable caching for hashed assets.
- `dist/vercel.json`: the same headers, for `vercel deploy dist`.
- Root `vercel.json` (generated from `security-headers.mjs` by `node scripts/write-vercel-config.mjs`; a unit test keeps them in sync) for Git-based Vercel builds.
- The CSP is also embedded as a `<meta>` tag, so it applies even on hosts that ignore header files.

**Vercel:** `npm run deploy:preview` builds locally, uploads a preview deployment with the Vercel CLI (after `vercel login` and `vercel link`), and points the stable preview address at that deployment: https://convert-everything-preview.vercel.app. Production on this Vercel team is https://convert-everything-one.vercel.app (the shorter `convert-everything.vercel.app` name is already taken). The project has Vercel Authentication and the preview feedback toolbar turned off: the toolbar injects a third-party script, which the e2e cross-origin guard flags.

**GitHub Pages:** `.github/workflows/pages.yml` builds with `VITE_BASE=/convert-everything-studio/` and publishes to https://heyandromeda.github.io/convert-everything-studio/ on pushes to `main`. GitHub does not send `dist/_headers`; the CSP meta tag still applies.

**GitHub CI:** `.github/workflows/ci.yml` runs typecheck, lint, and unit tests on pull requests and on `main`.

`netlify.toml` configures Git-based Netlify builds (`npm run build`, publish `dist`). No server-side code or functions exist in this project.

---

## Known limitations

- Document → PDF conversions re-flow content from structure (headings, paragraphs, lists, tables, images). They do not reproduce CSS or Word page layout. The embedded font (Roboto) covers Latin, Greek and Cyrillic; CJK, Arabic, Hebrew, Indic scripts and emoji are flagged with a warning because they will be missing.
- GIF output from images is static (first frame). Animated inputs are reduced to their first frame, with a warning.
- Single-threaded FFmpeg is slow for long or high-resolution video, especially on phones. Copy-streams mode avoids re-encoding when the codecs fit the container.
- AVIF encoding is slow on phones.
- XLSX → CSV writes the last saved results of formulas; SheetJS does not recalculate.
- Non-English OCR, PPTX rendering, RTF/ODT/EPUB rendering and HEIC encoding are not available (see the table above).
- libheif is LGPL-3.0. It is shipped as a separate, unmodified, dynamically loaded module (`libheif-js`), so it can be replaced independently of the app.
- The main JS bundle is ~160 KB gzipped (React + UI). All engines are code-split and loaded on demand.
