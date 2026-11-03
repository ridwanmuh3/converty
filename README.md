# Converty

Fifteen file converters that run entirely in the browser. No upload endpoint, no accounts, no ads. Installable, and the tools you open keep working offline.

| Tool | Route | Fidelity |
|---|---|---|
| Audio converter (MP3/WAV in, MP3/WAV out) | `/audio-converter` | Re-encoded |
| MP3 converter (MP3/WAV/M4A in) | `/mp3-converter` | Re-encoded |
| MP4 → MP3 | `/mp4-to-mp3` | Audio only, re-encoded |
| Video → MP3 (MP4/MOV) | `/video-to-mp3` | Audio only, re-encoded |
| Image converter (PNG/JPEG/WebP, HEIC in) | `/image-converter` | High |
| JPG → PDF | `/jpg-to-pdf` | High — image embedded |
| Image → PDF (PNG/JPEG/WebP/GIF/BMP) | `/image-to-pdf` | High — one PDF or one per image |
| Merge PDF | `/merge-pdf` | Pages copied, bookmarks dropped |
| Split PDF | `/split-pdf` | Pages extracted, metadata copied |
| Compress image | `/compress-image` | Re-encoded, dimensions optional |
| PDF → JPG | `/pdf-to-jpg` | Rendered pages |
| HEIC → JPG | `/heic-to-jpg` | Re-encoded JPEG |
| Word → PDF | `/word-to-pdf` | Good, not identical |
| Excel → PDF | `/excel-to-pdf` | Good for tables |
| PDF → Word | `/pdf-to-word` | Text first, layout second |

No file-count cap. The caps are client-side, sized to browser memory rather than a server quota: 25 MB per file, 100 MB of input per batch, 200 pages per PDF, 50 pages for PDF → JPG, 10 minutes for audio and 30 minutes for video-to-MP3. Decoded data can need several times the input size, which is why the ceilings are conservative.

## Stack

SvelteKit 3 · Svelte 5 (runes) · TypeScript · Tailwind 4 · `@sveltejs/adapter-static` (fully prerendered).
Client libraries: `pdfjs-dist` (PDF read + render), `jspdf` + `jspdf-autotable` (DOCX/XLSX → PDF), `pdf-lib` (image → PDF, worker-safe), `fflate` (ZIP), `docx` (DOCX write), SheetJS (XLSX), `heic2any` (HEIC input), `mp4box` + WebCodecs (video demux/decode), `lamejs` (MP3 encode).

Heavy libraries are imported inside each pipeline, and conversion runs in module workers with one entry per family (`src/lib/workers/entries/`). The image tool loads a 3.3 KB worker and never downloads the PDF engine, pdf-lib or the video demuxer; the end-to-end test asserts this and that the worker was actually used.

## Commands

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in ./build
npm run preview    # serve ./build with clean URLs (test/serve.mjs)
npm run check      # svelte-check + TypeScript
npm run fixtures   # generate test/fixtures
npm run test:e2e    # Chromium end-to-end conversions, workers and offline (115 checks)
npm run test:perf   # long-task and timing gate against test/perf-baseline.json (scaled by a CPU calibration, so slower machines are not false failures)
npm run test:design # tokens, contrast, touch targets, overflow, dark mode + Lighthouse-style page perf & SEO audit (306 checks)
```

`test:e2e` needs Chromium. Set `CHROME_PATH` if it is not at `/usr/bin/chromium-browser`.

The design audit's Lighthouse-style section scans all 16 pages for SEO head hygiene (title and description length, canonical, Open Graph, indexability, viewport, lang, a single h1, favicon, image alt text) and runs Core Web Vitals on the two page shapes with 'good'-band thresholds: paint metrics under 2.5 s, CLS under 0.1, and budgets of 40 requests, 500 KB transferred and 350 KB of script per page.

## How the conversions actually work

| Conversion | Method | What is lost |
|---|---|---|
| Images | `createImageBitmap` → canvas → `toBlob` | Animation, EXIF, HEIC/AVIF output |
| DOCX → PDF | Parse OOXML directly (`fflate` + custom layout) → jsPDF block layout + autoTable | Text boxes, tracked changes, exact pagination, un-embedded exotic fonts |
| XLSX → PDF | SheetJS → matrix → autoTable | Charts, images, fills, print areas |
| PDF → DOCX | pdf.js text positions → line/paragraph heuristics → `docx` | Images, tables (become paragraphs), fonts, columns |
| Audio | `AudioContext` decode → 16-bit PCM WAV, or lamejs MP3 at 128 kbps | Metadata, clips over 10 minutes, more than two channels |
| JPG/PNG/WebP → PDF | `pdf-lib` embeds the image; page is A4, Letter or matched to the image | EXIF orientation; one PDF per image |
| PDF → JPG | pdf.js renders each page to an `OffscreenCanvas`, then JPEG (ZIP when more than one page) | Text becomes pixels; 50 pages maximum |
| MP4/MOV → MP3 | mp4box demuxes the audio track, WebCodecs decodes it, lamejs encodes 128 kbps | Video stream, metadata, browsers without the audio codec |

**Why jsPDF instead of the browser print dialog.** The plan originally used `window.print()` for DOCX/XLSX → PDF. Print produces slightly nicer typography but is interactive: it cannot batch, cannot ZIP, and cannot report per-file progress. Since batching was a hard requirement, the pipeline re-lays-out the document with jsPDF and returns a real Blob. The trade-off is that jsPDF's built-in fonts are WinAnsi-only, so non-Latin text is **rejected with an explanation** instead of being silently corrupted.

## Privacy, enforced not promised

- `connect-src 'self'` in the CSP (generated by SvelteKit with hashes) — a stray `fetch()` of a file fails in the browser.
- No analytics, no third-party scripts, fonts bundled locally.
- `test/e2e.mjs` asserts zero non-GET requests, zero requests with a body, and zero third-party resources.
- Files are only held in memory for the duration of the batch; object URLs are revoked.

## Deploy

**GitHub Pages (primary).** Every push to `main` builds in `.github/workflows/deploy.yml` and deploys via the `github-pages` environment. One-time setup: repo Settings → Pages → Source **GitHub Actions**. The site lives at `/converty/` on the free `*.github.io` domain; to serve at a custom root instead, override `BASE_PATH` (empty string for apex) in the workflow's build step. `static/.nojekyll` keeps the `_app/` asset directory public, and the build copies `404/index.html` to `404.html` so unknown routes serve the prerendered not-found page.

Cloudflare Pages also works: build command `npm run build`, output directory `build`. The `static/_headers` file adds HSTS-friendly security headers and immutable asset caching there; GitHub Pages ignores it. No server-side headers are required for the service worker: its scope comes from its own path, so `/converty/service-worker.js` only controls `/converty/`.

## Offline and install

`static/service-worker.js` is a template; `scripts/build-sw.mjs` fills in a build hash and the shell list after `vite build`, and the app registers it from `src/lib/core/pwa.svelte.ts` (SvelteKit 3 no longer registers workers itself). The shell — every prerendered page, the entry scripts, CSS, icons and manifest — is precached, so all routes load offline after the first visit. Everything else, including each tool family's worker chunks, is cached on first use and capped at 50 MB, oldest first. User files are never cached: they never make a request. An update is offered as a small card instead of a forced reload, and install is only suggested after a conversion succeeds.

## Known limitations

- No OCR. Scanned PDFs are detected and rejected rather than producing empty output.
- PDF output (DOCX/XLSX → PDF) is Latin-script only.
- Audio is capped at 10 minutes and 200 MB decoded; video audio is capped at 30 minutes. MP3 output is re-encoded at 128 kbps, so MP3 → MP3 loses quality.
- Video audio extraction needs WebCodecs decode support for the clip's codec; unsupported browsers are told, not silently given a broken file.
- PDF → JPG rasterises text and stops at 50 pages.
- HEIC is decoded with heic2any on the main thread, so the HEIC route is not covered by the worker path.
- Image → PDF can combine images into one PDF or keep one PDF per image; combined pages are sized individually and reordering is manual.
- Images above 16.7 megapixels are scaled down to fit the browser canvas limit, and the page says so.
- GIF → first frame only; HEIC/AVIF are input-only.
- The queue runs one job at a time on phones and two on capable desktops; heavy pipelines still run alone.
- Analog analytics were deliberately dropped: the Cloudflare beacon is a third-party request, which would weaken the "no third-party code" claim on the pages that handle files.
