# Convert Everything: independent final audit

| Item | Value |
| --- | --- |
| Repository | `heyandromeda/convert-everything-studio` |
| Baseline | `main` at `34e1963399a9c713176c7e95fca64f384568c866` (2026-10-11 08:34 UTC) |
| Live preview | https://convert-everything-preview.vercel.app |
| Audit date | 2026-10-11 |
| Audit branch | `claude/convert-everything-audit-qswhwl` |
| Scope | Audit only. No application code, dependency, configuration or deployment was changed. Additions are this report and audit-only tests and tools under `tests/audit/`. |

## 1. Verdict: NOT READY

Most conversions work. I generated 94 conversion cases from my own fixtures, ran them through the real UI, and decoded every output with external tools. Images, PDFs, Office files, spreadsheets, data formats, archives, audio and video all came out structurally valid and with the expected content.

The app is not ready to ship under its own privacy promise. I found three defects:

1. **GPS location is kept when a JPEG becomes a PDF.** For a JPEG with GPS, the UI says *"Contains GPS location. Converting removes it"*. JPEG → PDF and the batch *N images → one PDF* tool then embed the original JPEG byte for byte. The GPS coordinates, camera make and artist go into the PDF with it (§4.1).
2. **Markdown → HTML output still loads remote content.** `<video src/poster>`, `<audio src>`, `<table background>` and SVG `<image href>` survive sanitising. Opening the downloaded HTML file made 5 requests to the tracker host (§4.2). The README says remote images in user HTML and Markdown are removed.
3. **A truncated TAR extracts "successfully" with missing data.** The header declares 4096 bytes but only 100 are present. The app returns a 100-byte file with no warning, even though the card says "4.00 KB unpacked" (§4.3).

All three are small, local fixes (§7). Once they are fixed and covered by tests, the Chromium evidence would support PARTIALLY VERIFIED. I could not run WebKit, Firefox, real Safari or the live site from this environment (§6). That stops it from reaching VERIFIED WORKING.

## 2. Environment and blockers

| Constraint | Effect | What I did |
| --- | --- | --- |
| The egress proxy denies `cdn.sheetjs.com` (403). The `xlsx` dependency is pinned to a tarball there. | `npm ci` fails in the repo. | I installed in a scratch copy with only `xlsx` aliased to `npm:@e965/xlsx@0.20.3`, an npm republish of SheetJS 0.20.3. Every other package matched the lockfile exactly (diff of name→version for all lockfile entries was empty). Section 3.1 shows the build is byte-identical to the deployed one for every precached asset. The `xlsx` chunk is not precached, so I could not prove the mirror's code identical to the CDN tarball. Spreadsheet results carry that small caveat. |
| The egress proxy denies `convert-everything-preview.vercel.app` and `cdn.jsdelivr.net`. | No browser session against the live site, and the live-smoke spec cannot run. | I read the deployment through the Vercel connector (read-only `get_deployment` and `web_fetch_vercel_url`): metadata, the HTML, response headers and `sw.js`. I did not convert any file on the live site. |
| Only Chromium 141 (`/opt/pw-browsers/chromium-1194`) is installed. The task said not to download browsers. | No WebKit or Firefox runs. | I ran every suite on desktop Chromium and on Chromium with the iPhone 15 device profile (UA, viewport, touch). **That profile is not WebKit or Safari.** It only exercises the app's iOS code paths (`isIOS`, 16.7 MP canvas cap, concurrency 1, phone limits). |
| The container has no `LANG` set. | Chromium on Linux turns non-ASCII download names into `download` (§3.3). | I re-ran with `LANG=C.UTF-8`. Both results are reported. |
| Missing verification tools | | I installed `exiftool`, `7z` and `qpdf` as system packages for verification only. They are not app dependencies. |

## 3. Tests executed and results

### 3.1 Build and deployment correspondence

| Command | Result |
| --- | --- |
| `npm test` (Vitest 5.0.3) | **114 passed**, 3 files, exit 0 |
| `npm run lint` (oxlint) | exit 0, **5 warnings**: `react(only-export-components)` in `badge.tsx`, `toggle.tsx`, `tabs.tsx`, `button.tsx`, and `react(set-state-in-effect)` in `SourcePreview.tsx` |
| `npm run build` (`tsc -b && vite build`) | exit 0. Main chunk `index-DPdbbAzP.js` is 542.48 kB, 170.68 kB gzip. The README says about 160 KB. Warns that chunks exceed 1500 kB (`libheif-bundle` 2.04 MB). There is also an `INEFFECTIVE_DYNAMIC_IMPORT` notice for `ZipPreview.tsx`. PWA precaches 66 entries (1674 KiB). |
| `npm audit` | 10 vulnerabilities (3 moderate, 7 high). The high ones are `braces → micromatch → fast-glob → shadcn/@shadcn/registry/ts-morph`. The moderate ones are `sprintf-js → argparse → mammoth`. All sit in CLI code paths (the `shadcn` CLI is wrongly listed under `dependencies`; mammoth's `argparse` is used only by its CLI). I did not trace any of them into the shipped browser bundle. |
| Vercel `get_deployment` for the alias | `dpl_JCQRPR5q7S4E2BZygYuyMTAMZ1Ah`, state READY, target preview, `source: cli`, created 2026-10-11 08:06:27 UTC, empty `meta`, so no git SHA is recorded. |
| Live `index.html` vs local build | Live ETag and precache revision `023ae6b3bd6a328a5fb2096461c1acb9` equals the md5 of my local `dist/index.html`. |
| Live `sw.js` precache manifest vs local `dist/sw.js` | **Identical, all 66 entries** (URLs with content hashes, plus revisions). |
| Live response headers | CSP (with `frame-ancestors 'none'`), `nosniff`, `no-referrer`, `X-Frame-Options: DENY`, COOP `same-origin` and a restrictive `Permissions-Policy` are all present, matching `vercel.json`. |

**Deployment conclusion:** the live preview serves the same build as baseline `34e1963`. That commit differs from `8d114b0` only in `README.md` and `docs/grok-audit.md`, so both produce the same bundle. This is established by content hashes, not by Vercel metadata, which has no commit SHA. There is one residual uncertainty: chunks outside the precache (`xlsx`, `pdfmake`, `vendor/*`) were not individually compared.

### 3.2 Existing Playwright suite (`tests/e2e`, 56 tests per project)

| Run | Result |
| --- | --- |
| Desktop Chromium, container default locale | 54 passed, **1 failed**, 1 skipped. The failure is `abuse.spec.ts:167` "unusual file names": the suggested filename was `download`. See §3.3. |
| Desktop Chromium, `LANG=C.UTF-8` | **55 passed, 0 failed, 1 skipped** (live-smoke, `LIVE_URL` unset) |
| Chromium + iPhone 15 profile, `LANG=C.UTF-8` | 54 passed, 1 failed, 1 skipped. The failure is `abuse.spec.ts:148` (24 MP image). The app correctly took the iOS path and scaled to 5016×3344 (16.77 MP). The test chooses its expectation by `browserName === 'webkit'`, so under Chromium it expected 6000×4000. This is an artifact of my emulation, not an app bug. |

**The seven skipped tests in Grok's run.** I read every `test.skip` in `tests/e2e`. There are exactly five calls:

| Skip | Condition | Why it is skipped | Covered elsewhere? |
| --- | --- | --- | --- |
| live-smoke × 3 projects | `!LIVE_URL` | Needs network access to the live site | No. Not run by Grok or by me (blocked). |
| service-worker offline, webkit | `browserName === 'webkit'` | Playwright WebKit on Linux cannot emulate offline for service workers | Passed on Chromium in my run. Untested on any WebKit. |
| FFmpeg sweep, firefox | `browserName === 'firefox'` | Runtime budget | Firefox not run by me. The sweep passed on Chromium. |
| stop video mid-conversion, firefox | `browserName === 'firefox'` | Same | Passed on Chromium. |
| engine download failure, webkit | `browserName === 'webkit'` | Playwright WebKit does not route worker requests | Passed on Chromium. |

3 + 1 + 1 + 1 + 1 = 7. That matches Grok's summary. The conditions are legitimate tool limitations, not tests hidden to get a green run. Even so, four of the seven are gaps on browsers the README calls primary (iOS Safari) or "fully tested" (Firefox).

### 3.3 Download-name failure: environment, not app

A bare page with no app code, `<a download="résumé.txt" href=blob:…>`, gave the suggested name `download` in this container. That happened on both `chrome` and `headless_shell`. With `LANG=C.UTF-8` it gave `résumé.txt`. The app's `download` attribute was correct in every case (`📷 Fotoğraf — ünïcødé 日本語.webp`). The existing test depends on the CI locale. A non-UTF-8 runner will fail it.

### 3.4 Independent conversion matrix (`tests/audit/matrix.audit.spec.ts` + `tools/validate.py`)

`tools/gen_fixtures.py` generates fixtures with known content: a 400×300 quadrant image (red, green, blue, transparent), a 3-frame GIF, a JPEG with EXIF orientation 6 plus GPS, Make and Artist, a 3-page PDF with author metadata and per-page markers, DOCX, PPTX and XLSX (python-docx, python-pptx, openpyxl), CSV with formula-injection payloads and leading zeros, JSON, YAML, XML, SRT, ZIP, TAR, TGZ, GZ, 7z and FFmpeg-made media. Three repo fixtures are reused (`photo.heic`, `sign.png`, `scanned.pdf`). The spec drives each case through the UI and saves the Blob bytes, the `download` name and the Blob MIME. The validator then checks:

- **Images:** Pillow decodes the file and pixels are sampled in each quadrant. Alpha is checked where it should survive. Orientation is checked by pixel position, metadata with ExifTool.
- **PDF:** `qpdf --check`, `pdfinfo`, `pdftotext` for expected strings, and `pdftoppm` renders.
- **Office/data:** openpyxl, zip `mimetype` and content checks, `json`/`yaml` round-trip equality, and an XML well-formedness parse.
- **Archives:** byte-exact comparison with the originals.
- **Media:** `ffprobe` for codecs, duration and channels, plus a full `ffmpeg -f null` decode that must print no errors.

First run: 91 cases on desktop Chromium, 86 completed, 5 refused or failed (by design or by bug). I decoded every output. The iPhone-profile run produced the same statuses. Three cases were added later for cached formulas (`book-cached.xlsx` → ODS, XLSX, CSV), which brings the matrix to 94. After I corrected three checks that were my own mistakes (pdfinfo spacing, ICO aspect, ADTS duration estimate), the final counts are in §3.7.

**Verified working, with output content checked:**

- **Images:** PNG → WebP, PNG, JPEG, AVIF, GIF, BMP, TIFF, ICO (16–256 px) and SVG wrapper all keep correct pixels. Alpha survives where the format allows it and is flattened to white for JPEG, BMP and PDF. BMP, TIFF, WebP and ICO → PNG, and HEIC → JPEG (libheif in Chromium) also work. Animated GIF becomes the first frame, with a warning. EXIF orientation 6 is applied (200×400, red on top) and GPS, Make and Artist are absent from PNG and WebP. *Remove metadata* strips GPS, Make and Artist, keeps orientation, and leaves pixels byte-identical. SVG → PNG removes the `<script>` and the external `<image>`. OCR read `sign.png` and the scanned PDF ("Total amount due: 42 dollars").
- **Documents:** MD → TXT, HTML → MD/PDF/TXT, TXT → PDF/HTML (HTML-looking text is escaped), Windows-1252 → UTF-8, and gzip round-trip all work. PDF → TXT gets all 3 page markers. PDF → PNG and JPEG produce 3 pages at 1240×1753, which is 150 DPI on A4. Page extraction gives 3 pages. *PDF without metadata* removes the author from the Info dict and the raw bytes. DOCX → HTML, MD, TXT and PDF keep the heading, table, Unicode and inline image. DOCX and PPTX media extraction returns the original 40×30 PNG. PPTX → TXT keeps slide order and speaker notes.
- **Spreadsheets/data:** CSV → CSV/TSV prefixes `=`, `+`, `-` and `@` cells with `'` and keeps `02134` and the multi-line cell. CSV and JSON → XLSX store `=1+2` and `=HYPERLINK(…)` as **text** (`data_type 's'`), not formulas. XLSX → CSV and JSON report the 2 uncomputed formulas instead of inventing values. Multi-sheet XLSX gets a warning. Formulas that have cached results survive XLSX → ODS (`of:=`) and XLSX → XLSX (`=C2*D2`, both sheets), and CSV gets the cached values (7.5, 20). Formulas with no cached result are left empty in ODS, and the card says so ("2 formulas without a saved result could not be written to ODS and were left empty"). JSON ↔ YAML and YAML → JSON round-trip exactly, XML output is well formed, and SRT → VTT is correct.
- **Archives:** ZIP, TAR, TGZ, GZ and 7z extract byte-exact. `../evil.txt` and `/abs.txt` are flattened to safe names. A TAR symlink to `/etc/passwd` is skipped. TGZ → ZIP passes `unzip -t`.
- **Media:** WAV → MP3, M4A, AAC, OGG, Opus, FLAC and AIFF; MP3 → WAV; FLAC → MP3; MP4 → WebM (VP8 and Vorbis), MOV and MKV (H.264 and AAC), GIF, JPEG frame and M4A; and WebM → MP4. All decode cleanly in FFmpeg, durations are within 0.05 s (ADTS within 0.11 s), and stereo stays stereo.
- **Misleading extensions:** a PNG named `.pdf` was detected as PNG with a mismatch warning and converted correctly. A text file named `.png` was detected as plain text.

**Failed or refused** (details in §4): `doc.md → PDF` (inline SVG), `lol.yaml` (alias bomb, refused as intended), `xxe.xml` (external entity, refused as intended), `truncated.tar.gz` (refused, correct) and `nested.zip → ZIP` (not offered, which matches the README).

### 3.5 Stress, privacy, concurrency, layout (`stress`, `repro`, `layout` audit specs)

| Case | Desktop Chromium | iPhone profile (Chromium) |
| --- | --- | --- |
| 16000×16000 PNG (243 KB, 256 MP) → WebP / JPEG | Completed, scaled to 10000×10000 with a warning, 13.0 s / 5.4 s | Completed, scaled to 4096×4096 with a warning |
| 40000×40000 PNG (1.6 GP) → JPEG | Failed: "could not be decoded" (generic message, no crash) | Same |
| SVG declaring 100000×100000 | Scaled to 10000×10000 with a warning | Scaled to 4096×4096 |
| ZIP, one honest 1.2 GB entry | Refused before extraction (per-entry limit) | Same |
| ZIP, 60 MB of zeros (about 1000:1) | Refused (ratio rule) | Same |
| ZIP, 25,000 entries | Refused (20,000 limit) | Refused (5,000 limit) |
| ZIP containing a ZIP | Outer extracted, inner not opened (correct) | Same |
| GZIP → 300 MB of zeros (299 KB) | Completed, 300 MB output (within the 1 GB desktop limit) | Refused, "expands too much" |
| GZIP → 1.2 GB of zeros (1.2 MB) | Refused, **mislabelled** "compressed data is damaged" | Same mislabel |
| Encrypted: data-only 7z, AES-256 ZIP (new), plus the repo's header-encrypted 7z, ZipCrypto ZIP and AES PDF | All refused with password messages | Same |
| 12 mixed conversions at once, then all 12 again | 11 of 12 completed in both rounds (3.2 s, 1.5 s). The 12th failed both times from the inline-SVG Markdown bug. A second run with HTML → PDF in its place: 12 of 12 twice. | Same |
| Privacy: secret-named PNG, PDF and WAV converted, with a context-wide listener (pages and workers) | 94 requests, **all same-origin GET with no body**. `localStorage` holds only `ce:theme:v2`. sessionStorage and cookies are empty. IndexedDB holds only `workbox-expiration`. Caches hold only app and engine assets. The file name and contents appear nowhere. | Same |
| In-card **Stop** on a 375×560 viewport during a 30 s video | Clickable, card went to `canceled` | Same |
| Horizontal overflow at 320, 375, 390, 768 and 1280 px (home, files, picker, options, settings, results) | 0 everywhere except **3 px at 320 px** once files are listed (the "Photos & videos" button reaches x=323) | 0 (the mobile layout viewport absorbs it) |
| Settings sheet at 390 px | x=0, width 390, heading x=21 width 349 (full width) | Same |

No page crashed in any stress case.

### 3.6 Fixture authenticity

I checked the repo's hostile fixtures with independent tools. `encrypted.zip` is encrypted (zipinfo). `encrypted.7z` has encrypted headers (7z cannot list it). `encrypted.pdf` is R=6 AES (qpdf). `bad-crc.zip` fails `unzip -t`. `bomb.zip` declares 80 MB from 81 KB. `corrupt.pdf` has no trailer (qpdf). These tests exercise what their names say.

### 3.7 Reproducibility run of the committed audit suite

The committed suite was re-run from `tests/audit/` against freshly regenerated fixtures (see §8). I ran it from the repo copy against freshly regenerated fixtures (`gen_fixtures.py`, `gen_stress.py`): `npx playwright test -c tests/audit/playwright.audit.config.ts` gave **236 passed** (6.2 min) across both projects. The 3 cached-formula cases added afterwards gave 6 passed. `validate.py` gave **98 checks: 91 pass, 7 fail**, identical on desktop Chromium and the iPhone profile. All 7 failures are findings in §4: Markdown → HTML remote references (4.2), the `-pages-.pdf` name (4.6), the XML leading zero (4.6), truncated TAR (4.3), and GPS in three PDFs: JPEG → PDF for the oriented and upright files, and the 2-image combined PDF (4.1). `open-html.mjs` again recorded the 5 remote requests.

## 4. Confirmed bugs, with reproduction

Severity reflects user impact in a product whose headline promise is privacy.

### 4.1 HIGH: JPEG → PDF and "images → one PDF" keep GPS and camera EXIF while the UI says it is removed

- **Where:** `src/engines/images/convert.ts:145-147` (`embedJpg(original bytes)` when the input is JPEG and not resized) and `src/engines/combine.ts:26-27` (same for upright JPEGs). The card note comes from the metadata inspector ("Contains GPS location. Converting removes it…"). `README.md` says "Re-encoding never copies EXIF/GPS".
- **Repro:** run `python3 tests/audit/tools/gen_fixtures.py /tmp/fx` and open `gps-upright.jpg` (or `oriented-gps.jpg`). Choose **To → PDF** and Convert. Then extract the JPEG stream from the PDF (`tools/validate.py` does this) and run `exiftool`. Output: `GPSPosition 51 deg 30' 0.00" N, 0 deg 7' 0.00" W`, `Make AuditCam`, and `Artist` for the oriented file. With two GPS JPEGs, **2 images → one PDF** embeds both with GPS. `pdfimages -j` hides this because it rewrites the stream, so check the raw stream.
- **Not covered by existing tests:** `abuse.spec.ts` checks only *Remove metadata* and WebP for `gps.jpg`.

### 4.2 MEDIUM: Markdown → HTML output fetches remote content when opened

- **Where:** `sanitizeHtml` in `src/engines/documents/html.ts`. It removes remote `<img>` only. DOMPurify still allows `video[src|poster]`, `audio[src]`, `source[src]`, `[background]` and SVG `image[href]`.
- **Repro:** convert `doc.md` (from `gen_fixtures.py`) to HTML, then run `node tests/audit/tools/open-html.mjs /abs/path/doc.html`. Requests attempted: `poster.png`, `svgimg.png`, `bg.png` (images) and `v.mp4`, `a.mp3` (media), all on `tracker.example`. Inside the app the CSP blocks these, but the downloaded file has no CSP. HTML → MD/TXT/PDF are not affected, because their outputs do not reference remote media.

### 4.3 MEDIUM: Truncated TAR is extracted silently with missing data

- **Where:** `extractTar` in `src/engines/archives/archives.ts` slices `bytes.slice(offset, offset + size)` without checking that the range exists. TAR header checksums are not verified either.
- **Repro:** extract `truncated.tar` (header size 4096, 100 data bytes present). The result is `completed` with `big.bin` at 100 bytes and no warning, while the card shows "4.00 KB unpacked". `archive-to-zip` uses the same `extractTar` path; I did not run it separately. Truncated **TGZ** is correctly refused, because gunzip fails first.

### 4.4 LOW-MEDIUM: The GZIP/TGZ size limit is checked only after the memory is spent

- **Where:** `gunzipWithLimit` in `archives.ts` pushes 1 MB slices of compressed input. fflate returns all output for a slice in one callback. Node test: one 1 MB slice of `bomb1200m.gz` produced a single **1028.8 MB** chunk, and the 299 KB `bomb300m.gz` produced a single 300 MB chunk.
- **Effect:** on phones the 250 MB limit still allows about a 1 GB allocation before it is checked. In Chromium the 1.2 GB bomb was refused with the wrong message ("compressed data is damaged") after 5.4 s. That is consistent with an allocation failure being caught as corruption. I did not test whether this kills a real iOS Safari tab.

### 4.5 LOW: Markdown → PDF fails entirely on an inline SVG without width and height

- **Repro:** `svg-only.md` (`<svg><rect …/></svg>`) gives "The PDF could not be laid out: SVG is missing defined width and height." `svg-sized.md` with width and height works. The failure is clean, with no fake file.

### 4.6 LOW: Data and naming issues

| Issue | Repro | Note |
| --- | --- | --- |
| XML → JSON turns `<zip>02134</zip>` into `2134` | `data.xml` → JSON | Default `parseValues` is on. A toggle exists. The CSV path protects leading zeros; XML does not. |
| YAML alias bomb reported as "contains a syntax error" | `lol.yaml` → JSON | Safe, but the message is wrong (`maxAliasCount` exceeded). |
| Page extraction with the default range produces `three-pages-.pdf` | `three.pdf` → PDF (selected pages) | Empty range suffix. |
| `many.zip`: metadata shows "5000 files", the picker says "All 2000 files selected", the refusal says "20,001 files" | `gen_stress.py` → `many.zip` | Inconsistent counts. Safe outcome. |
| 40000×40000 PNG says "could not be decoded… may be damaged" | `px40k.png` | The file is valid. The message should say it is too large. |
| 3 px horizontal scroll at 320 px with files listed | layout spec | "Photos & videos" button. |

## 5. Grok claim verification

| # | Claim in `docs/grok-audit.md` | Classification | Evidence |
| --- | --- | --- | --- |
| 1 | Unit tests: 114 passed | **VERIFIED** | My `npm test`: 114 passed, exit 0. |
| 2 | Full Playwright: 161 passed, 7 skipped across Chromium, WebKit (iPhone 15) and Firefox | **PARTIALLY VERIFIED** | Chromium: 55 passed, 1 skipped (UTF-8 locale), 54 + 1 fail with the default locale. WebKit and Firefox are **UNVERIFIED** (not installed). I could not reproduce the 161 figure. |
| 3 | The names of the 7 skips | **VERIFIED** | From the `test.skip` conditions (§3.2). Grok's inference was correct. |
| 4 | Every e2e test fails on cross-origin or bodied requests | **VERIFIED (code) / PARTIALLY as a privacy proof** | The `helpers.ts` auto fixture is a page-level listener. My context-wide listener (including workers) also found 0 off-origin and 0 bodied requests. Neither covers what a downloaded output does when opened (§4.2). |
| 5 | The deployed preview is the `8d114b0` build (`index-DPdbbAzP.js`, `dpl_JCQRPR5q…`, created 08:06:27) | **VERIFIED** | Same deployment id and time from the Vercel connector, and an identical 66-entry precache manifest against my build of `34e1963`. |
| 6 | Empty file is declined | **VERIFIED** | The abuse test passed on Chromium. The code rejects `size === 0` (`runner.ts`). |
| 7 | Lying-size, bad-CRC, truncated, bomb and encrypted ZIPs are refused | **VERIFIED** | Abuse tests passed, the fixtures are genuine (§3.6), and my AES-256 ZIP and honest 1.2 GB ZIP were also refused. |
| 8 | Encrypted 7z and PDF are refused | **VERIFIED**, extended | A data-only encrypted 7z was also refused. |
| 9 | Parser errors do not leak file contents | **VERIFIED** | The abuse tests (`sk-LEAK`, `jane`) passed on Chromium. |
| 10 | `gps.jpg` metadata is dropped by Remove metadata and WebP | **VERIFIED**, but **incomplete** | It is true for those paths. PDF output keeps GPS (§4.1), and Grok did not test it. |
| 11 | The 24 MP image is scaled on iPhone and full size on desktop | **VERIFIED (logic)** | Desktop 6000×4000. The iOS path gave 5016×3344 under emulation. Not on real WebKit. |
| 12 | Double-tap / Stop all / rapid taps behave | **VERIFIED (Chromium)** | Abuse tests passed. |
| 13 | In-card Stop may sit under the fixed bar; padding fix not re-proven | **PARTIALLY VERIFIED** | My test clicked the in-card Stop at 375×560 in Chromium and it canceled. Not tested in WebKit. |
| 14 | WebKit rewrites spaces to `_` in download names | **UNVERIFIED** | No WebKit. Separately, Chromium in a non-UTF-8 locale replaces the whole name with `download` (§3.3). |
| 15 | Chromium drops about the 11th rapid download | **UNVERIFIED** | Not tested. |
| 16 | Aborting the WebP encoder still produced a file via canvas | **UNVERIFIED** | Not reproduced or investigated. |
| 17 | Settings sheet is full width at 390 px (heading x≈21, w≈349) | **VERIFIED** | Measured x=21, w=349 (Chromium and iPhone profile). |
| 18 | 320 px has no horizontal overflow | **CONTRADICTED (minor)** | 3 px overflow on desktop Chromium at 320 px once files are listed. Home alone is 0. |
| 19 | Build warns of chunks over 1500 kB | **VERIFIED** | `libheif-bundle` 2,039.85 kB. |
| 20 | 10 vulnerabilities (3 moderate, 7 high), deprecated `glob@11.1.0` | **VERIFIED** | `npm audit` and the install warning. |
| 21 | Lint clean except one `button.tsx` warning | **CONTRADICTED** | 5 warnings across 5 files (exit 0). |
| 22 | RAR has no automated test | **VERIFIED** | No RAR fixture. Not tested by me either. |
| 23 | Live site conversion not verified | **VERIFIED (still true)** | I also could not convert on the live site (network block). |
| 24 | Physical iPhone not tested | **VERIFIED (still true)** | No physical device used in this audit. |

README claims that bear on readiness:

| README claim | Classification | Evidence |
| --- | --- | --- |
| "Remote images in user HTML/Markdown are removed rather than fetched" | **PARTIALLY VERIFIED** | `<img>` is removed. Video, audio, poster, background and SVG image are not (§4.2). |
| "Re-encoding never copies EXIF/GPS" and the on-screen note "Converting removes it" | **CONTRADICTED for PDF output** | §4.1 |
| "size, file-count and ratio limits stop decompression bombs" | **PARTIALLY VERIFIED** | ZIP limits work. The GZIP limit is applied after allocation (§4.4). |
| "Numbers are detected without breaking leading zeros" | **VERIFIED for CSV**, not true for XML (§4.6) | |
| "XML entities never expanded from DOCTYPE" | **PARTIALLY** | External entities are rejected. Internal DOCTYPE entities *are* expanded (`&co;` → `Acme`), which is harmless at this size. |
| "Main JS bundle ~160 KB gzipped" | **Slightly off** | 170.68 kB. |

## 6. Untested functionality and limitations

- **WebKit, iOS Safari, macOS Safari, Firefox:** not run. The README names iOS Safari as the primary target. HEIC native decode, iOS share sheet, Photos and Files pickers, Add to Home Screen, background tab suspension and real memory ceilings are all unverified.
- **Live website:** only metadata, headers, HTML and `sw.js` were read. No upload, conversion, download or layout check on the live site.
- **RAR extraction:** no fixture or test.
- **Very large media (400 MB to 2 GB limits):** code reading only. The largest media file tested was 30 s at 640×480.
- **Chromium's 11th-download drop and the WebP-encoder canvas fallback:** not re-tested.
- **Long-session memory and object-URL leaks:** only two consecutive rounds of 12 conversions were run.
- **`xlsx` engine:** built from an npm mirror of 0.20.3 (§2).
- **Accessibility:** no screen-reader or contrast audit.

## 7. Prioritised recommendations

I have not changed any application code. Each item below needs your approval before I implement it.

1. **(High) Stop embedding original JPEG bytes in PDFs when they carry metadata.** In `images/convert.ts` and `combine.ts`, run the bytes through the existing lossless `stripMetadata` JPEG path (keep orientation and ICC) before `embedJpg`, or fall back to the canvas path. Add `gps.jpg → PDF` and `2 GPS images → one PDF` assertions to `abuse.spec.ts` that extract the stream and run ExifTool.
2. **(Medium) Make `sanitizeHtml` strip every remote resource, not only `<img>`.** Add `video`, `audio`, `source` and `track` to `FORBID_TAGS` or drop non-`data:` `src`/`poster`, add `background` to `FORBID_ATTR`, and remove non-fragment `href`/`xlink:href` on SVG `image`/`use`. Add an e2e test that opens the HTML output with request interception, as `tools/open-html.mjs` does.
3. **(Medium) Validate TAR entries.** Fail as `corrupt` when `offset + size > bytes.length` and verify the header checksum. Add `truncated.tar` to the abuse fixtures.
4. **(Low-medium) Bound gzip memory for real.** Feed smaller input slices (for example 16 KB) so one callback cannot exceed the limit by much, and stop as soon as the limit is crossed. Report "expands too much" rather than "damaged".
5. **(Low) Markdown → PDF:** give inline SVGs without dimensions a default size, or drop them with a warning.
6. **(Low) Wording and names:** treat YAML alias overflow and oversize images as their real causes, not as syntax errors or corrupt files. Fix the `-pages-.pdf` name. Unify archive entry counts. Consider keeping leading-zero values as strings in XML → JSON by default.
7. **(Test hygiene)** Set `LANG`/`LC_ALL` to a UTF-8 locale in CI, or have the filename test read the `download` attribute. Move `shadcn` to `devDependencies`. Fix the 320 px overflow. Run WebKit and Firefox in CI, and run `LIVE_URL` smoke after each deploy.
8. **(Process)** Before calling the app ready, run the audit matrix (`tests/audit`) on WebKit and Firefox and do one session on a physical iPhone covering HEIC → JPEG, a photo → PDF with location, Share → Save Image, and a 1-minute video → MP4.

## 8. Reproducing this audit

```bash
# Fixtures (Python 3 with Pillow, python-docx, python-pptx, openpyxl, reportlab; ffmpeg; 7z)
python3 -I tests/audit/tools/gen_fixtures.py /tmp/audit-fx
python3 -I tests/audit/tools/gen_stress.py  /tmp/audit-stress     # writes ~6 MB of bombs; they expand to >2 GB if extracted

npm run build
cd tests/audit
LANG=C.UTF-8 AUDIT_FX=/tmp/audit-fx AUDIT_STRESS=/tmp/audit-stress AUDIT_OUT=/tmp/audit-out \
  [AUDIT_CHROMIUM=/path/to/chromium] npx playwright test -c playwright.audit.config.ts
cd ../..
python3 -I tests/audit/tools/validate.py /tmp/audit-out/chromium /tmp/audit-fx
node tests/audit/tools/open-html.mjs /tmp/audit-out/chromium/doc.md__md-to-html/00_doc.html
```

The audit specs record outcomes and save outputs. Apart from the privacy and concurrency checks, they mostly do not assert, and the verdicts come from `validate.py`. They are kept out of `npm test` and `npm run test:e2e`: Vitest includes only `tests/unit`, and the main Playwright config only `tests/e2e`.
