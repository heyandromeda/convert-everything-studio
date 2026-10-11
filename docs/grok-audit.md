# Convert Everything — auditor handoff

Evidence for an independent review of the privacy-first browser converter as of commit `8d114b01824ed1acd54e396ba8c9c59769837e79` (2026-10-11 08:06:02 +0000, message: “Reject empty, forged, and leaking conversions found in QA”).

This file was added after that commit. It does not change application behavior. Claims below are limited to commands and files that were actually run or read. Where a result exists only as a working-session note and no log file was kept, it is marked **session note, log not retained**.

## How to read this

- Playwright’s line reporter prints a line when a test is scheduled. A line in `/tmp/e2e-final.log` does not by itself mean that test passed. The only pass/fail counts for that run are the summary at the end of the log.
- “Passed” is used only when a command’s stdout or a retained log states that result.
- No physical iPhone or iPad was used.

## Repository state

| Item | Value |
| --- | --- |
| Branch | `main`, clean before this report, tracking `origin/main` |
| QA code commit | `8d114b01824ed1acd54e396ba8c9c59769837e79` |
| Prior UI commit | `3160f33de0c2b7fa748bc27b3987ff7b3d46d3bf` (2026-10-11 07:12:26 +0000, URL Cleaner restyle) |
| Preview alias script | `f32fa64dd99dc309922d027970a972cf1311410d` |
| iPhone settings note + stable alias | `d42574993e93b205483505a4f67dc7853f88dc05` |
| Deploy script | `37d06fe07d18d18dab44bd2ec0fbb7089521862e` |
| App | Vite + React + TypeScript. Dev port 4791. Playwright preview port 4792 (`playwright.config.ts`). |
| Unit tests | `npm test` → `vitest run`. Files: `tests/unit/`. |
| Browser tests | `npx playwright test`. Projects: `chromium` (Desktop Chrome), `webkit-iphone` (Playwright device iPhone 15), `firefox` (Desktop Firefox). Specs: `tests/e2e/*.spec.ts`. |

`8d114b0` touches 37 files, +657 / −40. Product changes in that commit:

- `src/features/queue/runner.ts` — 0-byte files become `unsupported` with the note “This file is empty (0 bytes), so there is nothing to convert.”
- `src/lib/crc32.ts`, `src/lib/zip-directory.ts`, `src/engines/archives/archives.ts` — extracted ZIP bytes must match the central-directory size and CRC-32.
- `src/lib/parse-error.ts`, `src/engines/data/structured.ts`, `src/engines/spreadsheets/sheets.ts`, `src/engines/data/subtitles.ts`, `src/lib/errors.ts` (`redactQuoted`), `src/engines/documents/pdf-write.ts` — parser failures do not quote source text in the UI.
- `src/hooks/use-armed.ts`, `src/components/FileCard.tsx`, `src/components/BatchBar.tsx` — Stop controls stay disabled for 700ms after they appear. While work is running, the bar shows a disabled “Converting…” control plus “Stop all”.
- `src/App.tsx` — extra bottom padding so the fixed bar is less likely to cover in-card controls.
- `src/components/SettingsSheet.tsx` — one class change so the right-hand sheet is full width below the `sm` breakpoint: `w-full max-w-none gap-0 p-0 data-[side=right]:w-full sm:max-w-md sm:data-[side=right]:max-w-md`.
- `tests/e2e/abuse.spec.ts`, `tests/e2e/helpers.ts`, `tests/unit/helpers.test.ts`, `scripts/generate-abuse-fixtures.py`, `tests/fixtures/abuse/*`.

## Deployment checked in this report session

Commands run on 2026-10-11 while writing this report, against the already-deployed preview (no new deploy):

```text
curl -sS -D - -o /tmp/preview-index.html --max-time 30 https://convert-everything-preview.vercel.app/
vercel inspect convert-everything-preview.vercel.app --scope heyandromeda
```

`curl` result: HTTP/2 200, `content-type: text/html`, `last-modified: Sun, 11 Oct 2026 08:06:46 GMT`, `x-vercel-cache: HIT`. HTML contains `<meta name="theme-color" content="#ffffff" />` and `<script type="module" crossorigin src="/assets/index-DPdbbAzP.js">`.

`vercel inspect` (Vercel CLI 63.1.2):

| Field | Value |
| --- | --- |
| id | `dpl_JCQRPR5q7S4E2BZygYuyMTAMZ1Ah` |
| target | preview |
| status | Ready |
| url | https://convert-everything-ijm4u0lmm-heyandromeda.vercel.app |
| alias checked | https://convert-everything-preview.vercel.app |
| created | Sun Oct 11 2026 08:06:27 GMT+0000 |

That creation time is after commit `8d114b0` (08:06:02). Local `dist/index.html` references the same `index-DPdbbAzP.js` and `theme-color` `#ffffff`. `/tmp/build4.log` (mtime 08:05) is a completed `tsc -b && vite build` that lists `dist/assets/index-DPdbbAzP.js` (542.48 kB) and ends with the PWA precache. The log has no `EXIT:` trailer. A string search of that local bundle found `data-[side=right]:w-full`, so the settings-sheet width class is in the built JS that the preview HTML names.

This session did not re-run `npm run deploy:preview` and did not convert a file in the live site. The live smoke spec stays skipped unless `LIVE_URL` is set (see below).

Production was not published. `README.md` states that `npm run deploy:preview` assigns the stable preview alias and does not publish a production release.

## Tests executed

### 1. Unit tests on current HEAD (this report session)

Command, working directory `/workspace`, 2026-10-11 08:13:37 UTC:

```text
npm test
```

Stdout:

```text
> convert-everything@0.0.0 test
> vitest run

 RUN  v5.0.3 /workspace

 Test Files  3 passed (3)
      Tests  114 passed (114)
   Start at  08:13:37
   Duration  347ms
```

Exit code 0. This run includes `tests/unit/helpers.test.ts` cases “strips quoted file contents from unexpected engine messages” (`sk-LEAK-0123456789` must not appear; detail contains `“…”`) and “matches the CRC-32 stored in a real archive” (`crc32("hello") === 0x3610a686`).

**Session note, log not retained:** an earlier `npm test` during QA, before the redaction and CRC cases, was recorded as 112 passed. No vitest log file from that run is on disk. Do not treat 112 as something this report re-executed.

### 2. Full Playwright suite after the QA product fixes

Retained log: `/tmp/e2e-final.log` (24740 bytes, mtime 2026-10-11 08:03). The log does not echo argv. **Session note:** the command that produced it was `npx playwright test --reporter=line`, after stopping an existing `vite preview` so Playwright would start `npx vite preview --port 4792 --strictPort` (`playwright.config.ts`, `reuseExistingServer: true`).

Log header: `Running 168 tests using 2 workers`.

Log footer:

```text
  7 skipped
  161 passed (4.7m)
EXIT:0
```

Line counts in that log: 56 chromium, 56 webkit-iphone, 56 firefox (168). Zero `failed` lines. The line reporter does not mark which of the 168 lines were the 7 skips.

Those 7 names are **inferred**, not printed by `/tmp/e2e-final.log`. The inference uses the current `test.skip` calls plus `/tmp/e2e-all.log`, which used the list reporter and marked skips with `-`:

| Inferred skip | Source |
| --- | --- |
| `live preview: PNG → WebP end to end` on chromium, webkit-iphone, and firefox | `tests/e2e/live-smoke.spec.ts` `test.skip(!LIVE_URL, 'LIVE_URL not set')`. Marked `-` for all three projects in `/tmp/e2e-all.log`. |
| `works offline after the first visit (service worker)` on webkit-iphone | `tests/e2e/resilience.spec.ts` skips when `browserName === 'webkit'`. Marked `-` in `/tmp/e2e-all.log`. |
| `sweep: remaining audio/video targets` on firefox | `tests/e2e/sweep.spec.ts` skips firefox. Marked `-` in `/tmp/e2e-all.log`. |
| `stopping a video conversion midway…` on firefox | `tests/e2e/abuse.spec.ts` `test.skip(browserName === 'firefox', …)`. This spec did not exist when `/tmp/e2e-all.log` was written. |
| `engine download failures are explained and recoverable` on webkit-iphone | `tests/e2e/abuse.spec.ts` `test.skip(browserName === 'webkit', 'Playwright WebKit does not route requests made from inside workers')`. |

3 + 1 + 1 + 1 + 1 = 7, which matches the summary. An auditor who needs the names from a reporter should re-run with the list reporter. This report does not claim that re-run happened.

`/tmp/e2e-final.log` mtime (08:03) is before commit `8d114b0` (08:06:02) and before `/tmp/build4.log` (08:05). **Session note:** the Settings sheet `data-[side=right]:w-full` class was edited after this Playwright run and was not part of the 161 passed tests. The class is in the later bundle (see Deployment). No Playwright assertion covers sheet width.

What the 168 scheduled tests cover (titles from the log and the spec files):

- `tests/e2e/images.spec.ts` — PNG→WebP, JPEG/PNG/resize, GIF/BMP/TIFF/ICO/AVIF, JPEG comment removal, HEIC→JPEG.
- `tests/e2e/documents.spec.ts` — Markdown/HTML/PDF, DOCX, spreadsheets, JSON/YAML/XML/subtitles, ZIP and TAR.GZ, PPTX, extension mismatch, batch combine, selective archive extract, 7z, OCR.
- `tests/e2e/media.spec.ts` — WAV→MP3, video→M4A, video→GIF, MOV→MP4, audio trim.
- `tests/e2e/resilience.spec.ts` — unknown binary, damaged image, stop/retry, service worker offline (webkit skipped), SVG script sanitising.
- `tests/e2e/sweep.spec.ts` — remaining document/data/archive/image targets, and remaining audio/video targets (firefox skipped).
- `tests/e2e/live-smoke.spec.ts` — skipped, `LIVE_URL` unset.
- `tests/e2e/abuse.spec.ts` — cases listed in section 4.

Every e2e test uses the auto fixture in `tests/e2e/helpers.ts`: any request whose origin is not the page origin, and any request that is not GET/HEAD or that has a body, fails the test. That is a Playwright request listener, not a packet capture.

Downloads go through `download()` in that helper, which waits 150ms since the previous download, waits for Playwright’s download event, then reads the blob MIME. Outputs are checked with byte signatures (`WEBP`, `PNG`, `%PDF-`, gzip `1f 8b`, and similar), and metadata cases call system `exiftool -j`.

### 3. Abuse suite before the WebKit assertion fixes

Retained log: `/tmp/abuse2.log` (mtime 2026-10-11 07:53). **Session note:** command was `npx playwright test abuse --reporter=line` (all three projects).

Footer:

```text
  2 failed
  2 skipped
  68 passed (3.1m)
EXIT:1
```

Header: `Running 72 tests`. The two failures are named in the log:

1. `[webkit-iphone] tests/e2e/abuse.spec.ts:167` “unusual file names…”. `expect(received).toBe(expected)`. Expected `📷 Fotoğraf — ünïcødé 日本語.webp`. Received `📷_Fotoğraf_—_ünïcødé_日本語.webp`.
2. `[webkit-iphone] tests/e2e/abuse.spec.ts:226` “double-tapping…”. Timeout 120000ms. The in-card Stop button was `disabled`, then a fixed bottom bar (`fixed inset-x-0 bottom-0`) intercepted the pointer, then the button detached.

The two skips are not named in this line-reporter log. They match the two `test.skip` calls in `abuse.spec.ts` (firefox video cancel, webkit engine-route).

### 4. Abuse cases that the final suite then ran

After the assertion and UI changes, the same file was included in the 161 passed / 7 skipped run. Current expectations (read from `tests/e2e/abuse.spec.ts` at `8d114b0`):

| Test | Check |
| --- | --- |
| Empty file | Declined; a second file can still convert. |
| `corrupt.pdf` | Damage message, no download. |
| `not-really.docx` | Not treated as Word. |
| `legacy.doc` | Declined with an explanation. |
| `truncated.zip`, `lying-size.zip`, `bad-crc.zip`, `bomb.zip`, `encrypted.zip` | Refused. |
| `encrypted.7z` | Refused. |
| `encrypted.pdf` | Refused for text and image output. |
| `secret-broken.json`, `.yaml`, `.xml` | Error text must not contain `sk-LEAK` or `jane`. |
| `gps.jpg` | “Remove metadata” and WebP conversion drop GPS, camera, author, comments (ExifTool). |
| `gps.png` | Remove metadata drops eXIf/text and keeps transparency. |
| `huge-24mp.png` → JPEG | Desktop expects 6000×4000. `webkit-iphone` expects pixel count ≤ 16,777,216 and warning text matching `/scaled\|reduced\|megapixel/i`. |
| Unusual names | WebP bytes, no dialogs, `download` attribute keeps spaces, suggested filename with `_` replaced by space equals the expected name. |
| Rapid taps on Convert | Three files each complete once. |
| Double-tap after stop | Uses **Stop all** in the bar, then two taps on `convert-all`. Card must reach `completed`, not stay `canceled`. |
| Twelve mixed conversions | WebP, PNG, JPEG, AVIF, GIF, PDF, HTML, XLSX, YAML, VTT, gzip, PDF text. Each output checked. |
| `long.mp4` video→WebM | Stop leaves no download; Clear all; a later PNG→WebP completes. Firefox skipped. |
| Aborted AVIF encoder and FFmpeg routes | Error, no download, Retry then completes. WebKit skipped. `serviceWorkers: 'block'`. |
| Reload mid-conversion | Empty page, then a new PNG conversion completes. |

**Session note, log not retained:** one `webkit-iphone`-only rerun after the filename assertion change and before the double-tap target was switched to Stop all. The filename test passed. The double-tap test still failed because the in-card Stop sat under the bar. A later rerun of only the double-tap test on `webkit-iphone`, after it clicked Stop all, was recorded as 1 passed in 5.6s. Those two commands’ stdout was not saved under `/tmp`. The all-project result that includes the fixed tests is `/tmp/e2e-final.log`.

### 5. Earlier full suite, before `abuse.spec.ts`

| Log | mtime | Summary |
| --- | --- | --- |
| `/tmp/e2e-1.log` | 2026-10-11 07:23 | `Running 96 tests`. `5 skipped`, `91 passed (2.8m)`, `EXIT: 0`. Line reporter, so skip names are not printed. **Session note:** this was the pre-QA baseline (`npx playwright test --reporter=line`). |
| `/tmp/e2e-all.log` | 2026-10-10 23:39 | List reporter. `5 skipped`, `91 passed (3.0m)`. The five `-` lines are the three live-smoke skips, webkit offline, and firefox FFmpeg sweep. No `EXIT:` trailer in the file. |

### 6. First Chromium abuse run, before the product fixes

**Session note, log not retained.** `npx playwright test abuse --project=chromium --reporter=line` was recorded as 5 failed, 18 passed, about 6.1 minutes. The five failures, as noted at the time:

1. `empty.png` was detected as plain text and offered PDF.
2. `lying-size.zip` was accepted. fflate returned the declared size, so a size-only check did not see the lie.
3. Rapid repeated Convert taps left a card canceled (the second tap hit Stop).
4. The twelve-file test timed out on the 11th download (`plain.txt.gz`). An isolated check of gzip alone succeeded. A separate burst of 15 rapid text→HTML downloads timed out on index 10 and then succeeded for 11–14. That was attributed to Chromium dropping the 11th download started within about a second.
5. Aborting the image encoder worker did not fail WebP, because a canvas fallback still produced a file.

There is no `/tmp` log for this run. The later retained logs are `/tmp/abuse2.log` (after the product fixes, two WebKit failures left) and `/tmp/e2e-final.log` (after the test/UI follow-ups, 0 failed).

### 7. Screenshots on disk

These files exist. This report session did not re-open them or re-run the overflow scripts that produced them.

| File | mtime |
| --- | --- |
| `/opt/cursor/artifacts/screenshots/iphone-restyle.png` | 2026-10-11 07:12 |
| `/opt/cursor/artifacts/screenshots/qa-iphone-home.png` | 2026-10-11 08:04 |
| `/opt/cursor/artifacts/screenshots/qa-narrow.png` | 2026-10-11 08:04 |
| `/opt/cursor/artifacts/screenshots/qa-iphone-formats.png` | 2026-10-11 08:05 |
| `/opt/cursor/artifacts/screenshots/qa-iphone-settings.png` | 2026-10-11 08:05 |

**Session note, log not retained:** a WebKit 390×844 measurement after the sheet class change reported the settings heading box at about x=21, width=349. An earlier measurement, before `data-[side=right]:w-full`, was about x=118.5, width=251.5, because `sheet.tsx`’s `data-[side=right]:w-3/4` beat `w-full`. Home and 320px overflow were recorded as false. Those numbers are not in a retained script log.

## Bugs found and what changed

| Bug | Evidence | Change |
| --- | --- | --- |
| Empty file offered a text→PDF conversion | Session note of the first Chromium abuse run. Empty detection was `looksLikeText` on length 0. | `src/features/queue/runner.ts` rejects `file.size === 0` before `detectFile`. |
| ZIP with a lying uncompressed size was extracted | Same session note. fflate trusted the declared size. | `src/engines/archives/archives.ts` compares extracted length and `crc32` to the central directory (`src/lib/crc32.ts`, `src/lib/zip-directory.ts`). Unit test checks CRC-32 of `hello`. |
| Parser errors echoed file text (`sk-LEAK`, `jane`) | Abuse spec asserts the UI text. Unit test asserts `classifyError` redaction. | `syntaxError` / `parseJsonText` in `src/lib/parse-error.ts`. `redactQuoted` in `src/lib/errors.ts`. Subtitle timestamp errors no longer include the cue slice. |
| Double-tap on Convert hit the Stop control that replaced it | First Chromium failure (session note) and `/tmp/abuse2.log` WebKit timeout. | `useArmed` (700ms). Bar shows disabled “Converting…” plus “Stop all”. Double-tap test uses Stop all. |
| WebKit download filenames replace spaces with underscores | `/tmp/abuse2.log` expected/received strings. | Test asserts the `download` attribute still has spaces, and compares the suggested name after replacing `_` with space. The app was not changed to fight WebKit’s save name. |
| In-card Stop is covered by the fixed bar on a short viewport | `/tmp/abuse2.log` “subtree intercepts pointer events”. | `src/App.tsx` bottom padding and `scroll-mb-60` on cards. The reliable control in the test is Stop all. A click on the in-card Stop was not re-proven after the padding change. |
| Eleventh rapid Chromium download dropped | Session note only. | Test helper waits 150ms and reads the blob only after the download event. The app does not throttle downloads. |
| Aborting the WebP encoder still produced a file via canvas | Session note only. | Engine-failure test now aborts AVIF (`avif_enc`) and `vendor/ffmpeg`, with service workers blocked. |
| Settings sheet ~3/4 width on a 390px viewport | Session note of a bounding-box measurement. Not in the 161-pass run. | `src/components/SettingsSheet.tsx` class string. Present in `dist/assets/index-DPdbbAzP.js`. |

## Remaining issues

- Chromium can still drop a download if more than about ten are started within a second. Only the test helper waits. A person is unlikely to tap that fast; the app does not prevent it.
- On a short phone layout, the in-card Stop can sit under the fixed bar. Stop all in the bar is the control the double-tap test uses. Padding and scroll-margin were not given their own click test after the change.
- WebKit rewrites spaces in the suggested download filename. The `download` attribute keeps the spaces.
- `fflate` unzip still does not replace a full ZIP parser. The app now checks size and CRC after extract. Encrypted ZIPs are refused before extract.
- RAR extraction is experimental (`9c958bf827697c9d7c41c284c51550c2c8253a82` added a 7z e2e test). This QA pass did not add a RAR certification case.
- DOCX→PDF is labeled experimental in `tests/e2e/documents.spec.ts` and can reflow. Animated images become the first frame. Video encode is single-threaded. These are product limits, not new failures from the logs above.
- `npm run build` warns that some chunks exceed 1500 kB (`/tmp/build4.log`, including `libheif` and `pdfmake`).
- Git auto-deploy was not available in the earlier session (`originConnections` empty). This report did not re-check Git connections. Do not assume a push redeploys the preview.
- The public alias is a Vercel **preview** deployment, not a production domain.

## Not verified

- Physical iPhone or iPad Safari: Photos picker, Files picker, share sheet, Add to Home Screen, background tab eviction, and device memory.
- Playwright WebKit is not Safari. It does not emulate service-worker offline on Linux, and it does not route worker-internal requests (both are explicit skips).
- Live site conversion. `LIVE_URL` was unset, so `tests/e2e/live-smoke.spec.ts` did not open the preview. `curl` and `vercel inspect` only prove the HTML and deployment metadata.
- The 161-pass Playwright run does not cover the settings-sheet width class.
- Per-test skip annotations inside `/tmp/e2e-final.log` and `/tmp/abuse2.log` (line reporter).
- The first Chromium 5-failure run and the two follow-up WebKit reruns (no retained logs).
- Packet capture, or a browser network panel outside Playwright’s request listener.
- ExifTool tag coverage beyond the tags the abuse spec reads. A vendor tag outside that check would not fail the test.
- Password recovery. Encrypted fixtures are expected to be refused. The fixture password is `Hunter2` (`scripts/generate-abuse-fixtures.py`). Tests look for password/encrypt/damaged messaging and zero download links.
- `npm run lint` (`oxlint`) was not re-run for this report. **Session note:** an earlier lint was clean aside from a pre-existing `react/only-export-components` warning on `src/components/ui/button.tsx`. That warning was not re-confirmed here.
- Dependency audit. **Session note:** `npm ci` during an earlier deploy printed 10 vulnerabilities (3 moderate, 7 high) and a deprecated `glob@11.1.0`. Not re-run, not fixed.
- GitHub or Origin repository linking, and any custom production domain.

## Re-run

```text
npm test
npm run build
npx playwright test --reporter=list
LIVE_URL=https://convert-everything-preview.vercel.app npx playwright test live-smoke --project=chromium
```

Playwright starts `vite preview` on port 4792. A stale preview process is reused (`reuseExistingServer: true`); stop it first if `dist/` changed.
