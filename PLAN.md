# Plan: Browser-Only File Converter (Free Tier)

Status: shipped. PDF → Excel was dropped and an audio converter was added; `README.md` is the source of truth for the five current tools, limits and measured test counts.

**Locked decisions (2026-10-21)**

- **100% client-side, permanently.** No server fallback, no third-party conversion API. Privacy is the product, not a feature.
- **Svelte 5 + SvelteKit + TypeScript + Tailwind**, static adapter, prerendered.
- **No ads, no affiliate links.** Cookie-free analytics only.
- **No domain purchase yet.** Ship on a `*.pages.dev` URL.

---

## 0. Verdict up front

**The product is buildable for $0 now (~$10/year after a domain), but only 3 of your 5 conversions are genuinely good client-side.**

| Claim | Verdict |
|---|---|
| Zero server cost, free "upload" (nothing is uploaded) | ✅ True. Static files + browser CPU. |
| Cheap domain | ✅ ~$9–11/yr at-cost, renews at same price. |
| Batch of 10 files | ✅ Fine, if processed sequentially and size-capped. |
| Image ↔ image | ✅ High fidelity, easy win. |
| Word → PDF, Excel → PDF | 🟡 80–90% fidelity, via the browser's own print-to-PDF. |
| PDF → Word | 🟠 50–70%. Text and reading order recoverable; layout/images/tables degrade. |
| PDF → Excel | 🔴 30–60%. Only clean grid tables. This is a server-side ML problem in every commercial product. |

**Business value, honest read:**

- Search demand for "pdf to word" is enormous, but the head terms are owned by Adobe / Smallpdf / iLovePDF / CloudConvert. You will not outrank them on generic keywords in year one.
- Why ads were rejected: utility-tool traffic monetizes at roughly $1–5 RPM globally, so 10k pageviews/month ≈ $10–50/month — not worth the page weight and the trust cost on a page whose entire pitch is "no third-party code."
- **The defensible wedge is a provable claim, not a feature set:** "Your file never leaves this device. Works offline. No upload, no account, no watermark, no file-size paywall." Every competitor uploads. You can prove it in DevTools, and that matters to legal, medical, HR, finance, and EU/GDPR audiences — the same people who will not touch a random upload site.
- Realistic value ranking: (1) portfolio/credibility asset, (2) SEO long-tail + privacy niche, (3) referrals and reputation in privacy-sensitive niches. **No revenue path is being built** — ads and affiliate links are both out, and a paid API tier would require a server.

**Revised expectation:** treat this as a $0–10/yr asset with a narrow, honest differentiator. Not a startup.

Because client-only is now locked, PDF→Word stays at 50–70% and PDF→Excel at 30–60% **by design**. That ceiling is the price of the privacy guarantee — no amount of polish removes it. Spend the effort on honesty (badges, limits, error copy) rather than chasing Adobe-grade fidelity that cannot exist in a browser.

**Kill criteria:** if after ~3 months there are no organic impressions and no referrals, stop investing and keep it as a portfolio piece. Do not add a server to rescue it.

---

## 1. Constraint: what the browser actually can and cannot do

This is the load-bearing section. Everything else follows from it.

| # | Conversion | Client-side method | Fidelity | Real limitations |
|---|---|---|---|---|
| 1 | DOCX → PDF | `mammoth` → HTML → `window.print()` "Save as PDF" | 80–90% | User must confirm the print dialog. Headers/footers, section breaks, columns, exotic fonts drift. Not one-click. |
| 2 | XLSX → PDF | SheetJS → HTML table → print | 70–85% | Charts, images, defined print areas, page breaks lost. Wide sheets need fit-to-width scaling. |
| 3 | PDF → DOCX | pdf.js text + coordinates → rebuild paragraphs → `docx` | 50–70% | No font/colour fidelity, images skipped, multi-column reading order is heuristic. Scanned PDFs need OCR (`tesseract.js`, ~15 MB download, slow). |
| 4 | PDF → XLSX | pdf.js text items → row/column clustering → SheetJS | 30–60% | Works on ruled/grid tables with clean spacing. Fails on merged cells, nested tables, rotated text, scans. **Ship as "Experimental".** |
| 5 | Image ↔ Image | Canvas/`createImageBitmap` + `heic2any` + `utif` | High | Solid: PNG, JPG, WEBP. HEIC input (iPhone) via WASM. AVIF/HEIC **encode** unreliable — output only PNG/JPG/WEBP. GIF → first frame only. |

**Hard truths to design around:**

1. Browser print is the only free high-fidelity way to make a real PDF. It is interactive by design; no library silently produces the same result without rasterizing (which kills selectable text). Accept the extra click, or accept rasterized output.
2. PDF has no concept of "paragraph" or "table" — only positioned glyphs. Any PDF→Office conversion is reconstruction, never recovery. Say so on the page.
3. Memory is the binding constraint, not CPU. 10 × 20 MB PDFs rendered at high scale will crash mobile Safari. Batch must be a queue, not `Promise.all`.
4. PDFs with non-embedded fonts need pdf.js `cMapUrl` + `standardFontDataUrl` assets or text extracts as garbage.

---

## 2. Scope

**MVP (ship this):** one converter page, 5 tools (the rows above), batch ≤10, per-file status, ZIP download, per-tool "How to use" + fidelity badge.

**Permanently out of scope** (would break the privacy guarantee):
- Server fallback, cloud conversion APIs, cloud storage, accounts.

**Explicitly cut for v1:**
- OCR auto-detection (offer as opt-in beta later; it is the single largest download).
- PPT/PPTX, EPUB, OCR'd scans in v1, PDF editing/merging/signing.
- i18n.

**Later, only if traction:** PWA offline install, presets (image resize/quality), "exact look" rasterized PDF mode, more image formats (BMP/ICO).

---

## 3. Cost model

| Item | Choice | Cost |
|---|---|---|
| Hosting + CDN + SSL | Cloudflare Pages free (unlimited static requests, 500 builds/mo, 20k files/site, 25 MiB max asset) | $0 |
| Domain | Deferred — ship on `*.pages.dev`, buy at launch (at-cost ~$9–11/yr `.com`) | $0 now |
| Analytics | Cloudflare Web Analytics (cookie-free, no banner needed) | $0 |
| Repo / CI | GitHub free + Pages or Actions | $0 |
| Backend | none | $0 |
| **Total** | | **$0 now / ~$10/yr after launch** |

Alternatives if you dislike Cloudflare DNS lock-in: GitHub Pages (100 GB/mo soft, free public repo) or Netlify free (100 GB/mo). Both fine; Cloudflare wins on bandwidth headroom, which matters because WASM assets are several MB.

**Cost risk: none.** With no backend, cost cannot scale with usage — there is no per-file, per-page, or per-GB meter anywhere. The only future cost is the domain, and even that is optional.

---

## 4. Architecture

Static SPA, no backend, no uploads.

```
src/
  routes/+page.svelte          tool picker + how-to
  routes/[tool]/+page.svelte   converter shell, prerendered per tool
  lib/tools/registry.ts        descriptor per tool: id, accept, badge, limits, copy
  lib/components/              DropZone, FileList, FileRow, HowTo, FidelityNote, ZipBar
  lib/core/
    queue.svelte.ts            concurrency-limited job runner (2 desktop / 1 mobile), $state
    validate.ts                extension + magic-byte sniffing
    limits.ts                  per-file / total / page caps
    download.ts                object URLs, revoke, ZIP via fflate
  lib/pipelines/
    docx-to-pdf.ts             mammoth -> print
    xlsx-to-pdf.ts             sheetjs -> html -> print
    pdf-to-docx.ts             pdfjs -> layout heuristics -> docx
    pdf-to-xlsx.ts             pdfjs -> table clustering -> sheetjs
    image.ts                   canvas decode/encode
  lib/workers/                 heavy extraction off the main thread
static/_headers                per-route CSP
```

Stack: **SvelteKit 2 + Svelte 5 (runes) + TypeScript + Tailwind**, `@sveltejs/adapter-static` with prerendering. Heavy libs are dynamically imported inside each pipeline module so the image tool never downloads pdf.js or the WASM bundles.

Svelte-specific gotchas:
- Prerendering executes your modules in Node: browser-only libs must load inside `onMount` or a dynamic `import()`, never at module top level.
- Keep the queue in plain TS (`queue.svelte.ts` using `$state`) so it is unit-testable in Vitest without mounting components.
- `export const prerender = true` on landing/tool routes; `export const ssr = false` on converter routes where a lib touches `window` before hydration.
- Use `$effect` for painting progress only, never for state transitions — effects that mutate the queue are how batch apps deadlock.

| Need | Library | License | Gotcha |
|---|---|---|---|
| PDF read | `pdfjs-dist` | Apache-2.0 | Worker via `?url`; ship `cmaps/` + `standard_fonts/` |
| PDF write | `pdf-lib` | MIT | Only for assembling; not for rendering |
| DOCX read | `mammoth` | BSD-2 | HTML output only; style mapping is manual |
| DOCX write | `docx` | MIT | Paragraph reconstruction is ours |
| XLSX | SheetJS | Apache-2.0 | **Install from `cdn.sheetjs.com`, not npm** — npm `xlsx` is stuck at 0.18.5 with known prototype-pollution/ReDoS CVEs |
| ZIP | `fflate` | MIT | Streaming; avoid loading 10 outputs twice |
| HEIC input | `heic2any` | MIT | ~1.5 MB WASM, lazy-load only when a .heic lands |
| TIFF input | `utif` | MIT | Optional |
| OCR (later) | `tesseract.js` | Apache-2.0 | ~15 MB; never bundle by default |

### Privacy guarantee, enforced (not just asserted)

The promise is only worth something if the browser enforces it:

- **CSP on converter routes** via `static/_headers`:
  `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; img-src 'self' blob: data:; worker-src 'self' blob:; form-action 'none'; base-uri 'self'`
  With `connect-src 'self'`, a stray `fetch()` of a user file fails in the browser — not in code review.
- **Analytics and absolute purity cannot share a document.** Allowlist the Cloudflare Web Analytics beacon on the landing page only; load zero analytics on routes that touch files.
- Self-host every font and icon. No Google Fonts, no CDN scripts, no iframes.
- No `navigator.sendBeacon`, no service-worker upload path, no `<form>` submission on converter routes.
- Playwright e2e: convert every tool, fail on any request with a non-empty body or any third-party origin.
- Show the claim where it is checkable: "Open DevTools → Network and convert a file. You will see no upload."

**Batch engine spec (the part that usually ships broken):**
- Max 10 files, enforced at drop time with a visible "7 / 10" counter and a plain-language rejection, not a silent drop.
- Caps: 25 MB/file, 100 MB total, 200 pages/PDF, canvas area ≤ 16.7 MP (iOS Safari limit). Over-cap → reject with the reason and the fix.
- Concurrency 2 on desktop, 1 when `navigator.deviceMemory <= 4` or mobile.
- Per-file state: `queued → reading → converting (n%) → done | error`, with cancel, retry, remove.
- Free memory aggressively: `URL.revokeObjectURL`, drop canvases and page buffers per file, terminate workers at end of job.
- Partial failure is normal: finish the batch, report "7 of 10 succeeded", still offer a ZIP of the successes.
- Duplicate filenames get `-1` suffixes inside the ZIP.

---

## 5. UX

Single page, no wizard.

1. **Tool picker** — 5 cards, each with an honest badge: `Good` / `Fair` / `Experimental`.
2. **Instructions, above the fold, per tool** — "1. Drop your files. 2. Pick options. 3. Convert. 4. Download." Plus one line on what this tool does *not* preserve. This is both the instruction the user asked for and a trust signal.
3. **Drop zone** — click, drag, paste; keyboard accessible; `aria-live` status.
4. **File list** — name, size, state, progress, error reason, per-file download.
5. **Result bar** — "Download all (.zip)".
6. **Footer** — "No upload. No account. Files never leave your device." + privacy note + limits.

Copy rules: state limits before the drop (`Max 10 files · 25 MB each · PDF up to 200 pages`), and make error messages say what to do next ("This PDF is a scan — text can't be extracted without OCR").

Edge cases to design, not discover: renamed files (magic-byte check), password-protected PDFs (clear error, no crash), 0-byte files, 400-page PDF, HEIC on desktop, print dialog cancelled, ZIP of mixed formats, tab closed mid-job.

---

## 6. Acceptance criteria

- `npm run build` and typecheck clean; Lighthouse perf ≥ 90 on the first-load page (heavy libs lazy).
- Adding an 11th file is blocked with an explanation; counter is correct.
- Batch of 10 mixed files completes on desktop with no UI freeze; main thread stays responsive (work in workers where heavy).
- **Provable privacy test:** Playwright run that converts every tool and fails if any request carries a file body or hits a third-party origin. This is the marketing claim — test it.
- PDF→Word output opens in Word/LibreOffice with editable text and no repair prompt.
- PDF→Excel output opens in Excel with values in the right cells for 3 fixture tables (simple, merged-header, ruled).
- Mobile Safari: 1-file conversion of a 10-page PDF succeeds; over-cap files show a reason, not a crash.
- Every tool page states its limitation in one sentence a non-technical person understands.

**Fixtures needed:** 1 text PDF, 1 scanned PDF, 1 two-column PDF, 3 table PDFs, 1 DOCX with headings/table/image, 1 XLSX with 3 sheets, 1 HEIC, 1 20 MB image.

---

## 7. Milestones

| Phase | Work | Done when |
|---|---|---|
| 0. Shell | SvelteKit/Svelte 5/TS/Tailwind, tool registry, drop zone, queue, limits, ZIP | 10 dummy jobs run end-to-end with fake converters |
| 1. Easy wins | Image converter, DOCX→PDF, XLSX→PDF | 3 tools usable; direct PDFs from print flow are correct |
| 2. Hard tools | PDF→DOCX (text + paragraph rebuild), then PDF→XLSX (table clustering) | Fixtures pass; badges/copy match measured fidelity |
| 3. Harden | Memory caps, mobile, a11y, privacy e2e test, error copy | Acceptance list green |
| 4. Ship | Cloudflare Pages preview URL, analytics on landing only, sitemap | Live on `*.pages.dev`, $0/mo; buy domain later, no code change |

Effort: ~3–5 focused days for phases 0–1; phase 2 is the unpredictable part (PDF layout heuristics always take longer than estimated). Suggest timeboxing each hard tool to 1 day, then shipping it as `Experimental` rather than polishing forever.

---

## 8. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Users expect Adobe-grade PDF→Word | Trust damage, support burden | Honest badges + pre-conversion note + "Experimental" label; never market it as lossless |
| Mobile OOM | Crash, bad reviews | Sequential queue, page/area caps, explicit mobile limits |
| No revenue by design | Upkeep motivation | Measure success as organic traffic + referrals, not RPM; keep it a portfolio/privacy asset |
| Strict CSP breaks a lazy-loaded lib | Blank converter, hard to debug | Test CSP in the privacy e2e run, not only in production; allowlist worker/blob sources explicitly |
| Incumbent copies "no upload" | Wedge weakens | It is cheap for them; your advantage is cost structure and niche trust, not the feature |
| Print dialog UX friction | Drop-off | Inline 1-2-3 with a screenshot of the "Save as PDF" step; keep the tab open |
| SheetJS supply chain | Vulnerability | Install from official CDN tarball, pin version, run `npm audit` in CI |

---

## 9. Decisions

Locked 2026-10-21: client-only forever · SvelteKit · no ads · domain deferred.

Still open (needed at Phase 0):

1. Tool URL scheme — one `/[tool]` route per pair (`/pdf-to-word`) for SEO, vs a single `/convert` with a picker. Recommend per-tool routes, prerendered.
2. Whether PDF→Excel appears in v1 as `Experimental` or waits for v1.1. Recommend shipping it labeled — the instruction copy and badge are what protect trust.
3. Whether OCR is offered as an explicit opt-in "scanned PDF" path in v1.1 (adds ~15 MB download). Recommend deferring.
4. Pages project name (becomes the preview URL).

---

## 10. Implementation notes (built 2026-10-21)

Deviations from this plan, and why:

- **DOCX/XLSX → PDF uses jsPDF, not the print dialog.** Print gives slightly better typography but is interactive: it cannot batch, cannot ZIP, and cannot show per-file progress. Batching was a hard requirement, so the pipelines lay the document out with jsPDF. Cost: standard fonts are WinAnsi-only, so non-Latin documents are rejected explicitly.
- **SvelteKit 3 moved configuration** from `svelte.config.js` into the `sveltekit()` Vite plugin, and replaced the `$lib` alias with package subpath imports (`#lib/*`).
- **Queue runs one file at a time**, not two. The pipelines use the main thread, so serial execution with a paint yield between files keeps the UI responsive and memory predictable.
- **No analytics at all.** Cloudflare Web Analytics is a third-party beacon; adding it would weaken the no-third-party-code claim on the exact pages that handle files.
- **Verified, not assumed:** 33 end-to-end checks (real conversions inspected at the byte level) and 58 design-token checks pass. The image tool downloads 44 KB; the 1.26 MB PDF worker loads only on PDF routes.

Still true from the plan: PDF→Word is 50–70% fidelity, and no OCR exists.

---

## 11. Round 2 plan (2026-10-21, awaiting approval)

Four changes, driven by user feedback on v1: Word→PDF formatting drifts from the original, tool pages read like manuals, the "experimental" labelling goes away (with the PDF→Excel tool, per user decision), and an audio converter joins the set.

### R1. Word→PDF: full XML re-layout

Root cause of "not formatted exactly": v1 routes everything through `mammoth` → generic HTML → jsPDF with hardcoded typography (Helvetica 11pt, fixed 18 mm margins, fixed heading sizes), and injects a page-number footer the document never had. Content survives; layout does not.

Fix: parse the DOCX OOXML directly (new `src/lib/pipelines/docx/` module, unzip via `fflate` — already a dependency) instead of mammoth.

| DOCX source | What gets honored |
|---|---|
| `sectPr` | Page size, margins, orientation → PDF geometry matches the document, not a hardcoded A4 |
| `styles.xml` + `docDefaults` | Real heading/body sizes, bold/italic, spacing from the document's own style chain (no more hardcoded H1=20pt) |
| `pPr` | Alignment (left/center/right/justify), indents (left/right/firstLine/hanging), before/after spacing, line-spacing rule |
| `rPr` | Bold, italic, underline, strikethrough, sub/superscript, size, color, font family |
| `numbering.xml` | Real list levels with hanging indents and bullet/number markers |
| `tblGrid` + borders + shading | Table column widths and grid that match the document |
| `header*.xml` / `footer*.xml` | Rendered top/bottom, including PAGE fields → real page numbers only where the document has them |
| `word/media/*` + rels | Inline images sized from `wp:extent` |
| Embedded fonts (`fontTable` + .fntdata) | De-obfuscated (GUID XOR) and embedded via jsPDF when parseable; falls back to core-font mapping (Times→times, Courier New→courier, rest→helvetica) |

Page-size option becomes "Match document (default) / A4 / Letter". `mammoth` leaves the pipeline and the dependency list — which also clears the 3 moderate `npm audit` advisories it dragged in.

Honest ceiling, stated in the tool copy: columns, text boxes, tracked changes, exact pagination and un-embedded exotic fonts still will not match Word's own export.

Verification: richer DOCX fixture (heading styles, indents, justify, underline, colored runs, list levels, table with tblGrid, header/footer with PAGE field, non-default margins) → e2e asserts output PDF MediaBox equals the fixture's `sectPr`, heading font size > body font size at the extracted-text level, header text present, and **no** injected page number when the source has none.

### R2. Delete PDF→Excel + remove "experimental" everywhere

- Remove: registry entry, `pipelines/pdf-to-xlsx.ts`, `loadConverter` case, its e2e/audit checks, table-PDF fixture, README/PLAN references. Footer and "other tools" lists derive from `TOOLS`, so they update themselves.
- `Fidelity` type loses the `experimental` variant (and `badge-warning` mapping); vocabulary is `good` / `fair` only.
- Tool count stays 5 after R4: image, word→pdf, excel→pdf, pdf→word, audio.

### R3. Tool pages: cut the reading load

Per-tool page currently stacks a 3-card how-to, a 4-card sidebar ("What you get" / "Known limits" / "Batch limits" / "Proof, not a promise"), an "Other converters" section, and landing-page-length prose. Becomes:

- Header: icon + badge + title + **one** description line.
- How-to collapses from 3 cards to a single compact strip: `1 Drop → 2 Convert → 3 Download` (kept because "instructions on page" was an original requirement — reduced, not removed).
- Sidebar: 4 cards → **1** compact card ("Limits & notes"): the fidelity note in one sentence, limitations as small bullets, batch caps folded into one line. "Proof, not a promise" is deleted — the one-line privacy caption under the file list stays.
- "Other converters" section removed (footer already links every tool).
- `HowTo.svelte` deleted; registry `steps` replaced by a compact one-line hint per tool.

### R4. Audio converter (new tool)

Slug `audio-converter`, new waveform icon. Decode via Web Audio `decodeAudioData`; encode WAV natively and MP3 via `@breezystack/lamejs`.

| Direction | Formats | Notes |
|---|---|---|
| Input | MP3, WAV, M4A/AAC, OGG/Vorbis, FLAC, Opus, WebM audio | Whatever the browser can decode; undecodable input gets a clear per-browser error, not a crash |
| Output | WAV (PCM 16-bit) or MP3 (128/192/256/320 kbps) | Options: format, bitrate (MP3 only), sample rate (keep/44.1 kHz/48 kHz), channels (keep/mono/stereo) |

- Limits: same 10-file batch; audio-specific **60-minute duration cap** after decode (decoded PCM is ~10× compressed size; the cap protects memory), with the reason stated.
- Validation: magic bytes for RIFF/WAVE, ID3 or frame sync, fLaC, OggS, ftyp-M4A, EBML/WebM added to `validate.ts`.
- Honest copy: MP3 output is a re-encode (generation loss); WAV output is lossless. No OGG/AAC/FLac *encoding* — browsers can't do it reliably, and claiming it would be the kind of overpromise this product exists to avoid.
- License note: lamejs line is LGPL-3.0 — bundled unmodified and dynamically imported; add its notice to the footer credits. No MIT-licensed browser MP3 encoder exists today; this is the standard choice.
- e2e: generate a stereo sine WAV fixture in Node → convert WAV→MP3 (assert frame-sync header, then decode the MP3 back in-page and check ≈2 s duration) → MP3→WAV (assert RIFF/WAVE header and preserved sample rate). Round-trip through the browser proves the encoder, not just the byte prefix.

### R5. Verification gate (same bar as v1)

`npm run check` clean · `npm run build` static, all 6 routes prerendered · `npm run test:e2e` (updated expectations, byte-level assertions incl. the new DOCX geometry and audio round-trip) · `npm run test:design` (updated for the slimmer tool page and removed badge) · privacy invariants unchanged: no body-carrying requests, no third-party origins, CSP intact.

Effort: R1 is the bulk (~a day); R2 + R3 are half a day together; R4 is ~a day including tests.

---

## 12. Round 3 plan — worker-based conversion + media/image family (2026-10-30)

Status: implemented 2026-10-30. Shipped: worker entries per family, the image/PDF routes, and MP4/video→MP3 with a WebCodecs capability gate. Not shipped: image→PDF combine (one PDF per image), drag-to-reorder, WebM/OGG video, DOCX/XLSX→PDF in a worker (jsPDF is DOM-bound).

### 12.1 Goal and non-goals

**Goal.** Add audio and image sub-tools, each with its own URL and honest copy, and move CPU-heavy work off the main thread so the page never freezes — including on a low-end phone.

New routes:

| Family | Routes |
|---|---|
| Audio | `/audio-converter` (existing), `/mp3-converter`, `/mp4-to-mp3`, `/video-to-mp3` |
| Image | `/image-converter` (existing), `/jpg-to-pdf`, `/image-to-pdf`, `/pdf-to-jpg`, `/heic-to-jpg` |
| Documents | unchanged: `/word-to-pdf`, `/excel-to-pdf`, `/pdf-to-word` |

**Non-goals.** Video *encoding* (no MP4 output), editing/merging PDFs, OCR, any server or upload endpoint. Nothing may add a request that carries file bytes.

### 12.2 Verified constraints (checked in this repo, not assumed)

| Fact | Evidence | Consequence |
|---|---|---|
| jsPDF is DOM-bound | `jspdf@4.2.1` dist references `document.createElement` ×8 and `document.body` ×8 | jsPDF cannot be assumed to run in a worker. New PDF-writing routes use a worker-safe writer; DOCX/XLSX→PDF stays on the main thread until proven otherwise. |
| pdf.js can render off-thread | `pdfjs-dist@6.4.299` exposes `canvasFactory` (75 refs) and `OffscreenCanvas` (21 refs) | PDF→JPG can render in a worker with a custom `OffscreenCanvas` factory. pdf.js already runs parsing in its own worker. |
| heic2any is DOM-bound | `heic2any@0.0.4` creates `<canvas>` ×3 and `<video>` ×2 | HEIC cannot move to a plain worker. `libheif-js` would work but is **LGPL-3.0** (9 MB unpacked) — avoid in a static bundle. Keep heic2any as the fallback path. |
| MP3 encoding is not in WebCodecs | WebCodecs covers decode; encode support is codec/platform dependent | Keep `lamejs` for MP3 output; move it into the worker. |
| WebCodecs audio decode is broad but not universal | `AudioDecoder` in Chrome/Edge, Safari 26+, Firefox 130+ desktop; AAC has platform gaps (Firefox/Linux), MP3 decode is effectively universal | MP4/video→MP3 must be capability-gated with an explicit message, never a silent failure. |
| Worker-safe candidates | `pdf-lib@1.17.1` MIT; `mp4box@2.5.0` BSD-3-Clause | Both are acceptable. `@ffmpeg/ffmpeg`'s core is ~30 MB — reject by default. |
| Async ZIP already available | `fflate` async `zip` is now used by `queue.zipAll()` | Multi-page PDF→JPG can be zipped inside the worker without blocking. |

### 12.3 Worker architecture

```
src/lib/workers/
  convert.worker.ts     single entry; switch on slug; dynamic import per tool
  client.ts             WorkerClient implements Converter (queue contract unchanged)
  protocol.ts           message types shared by both sides
```

**Contract.** `WorkerClient.run(file, ctx)` deliberately implements the existing `Converter` type, so `BatchQueue`, progress UI, retry, cancel and ZIP need no changes.

| Direction | Message | Payload |
|---|---|---|
| main → worker | `run` | `{ id, slug, options, name, mime, bytes: ArrayBuffer }`, `bytes` **transferred** |
| worker → main | `progress` | `{ id, value }`, throttled to ~10/s |
| worker → main | `done` | `{ id, bytes: ArrayBuffer, mime, ext }`, **transferred** |
| worker → main | `error` | `{ id, message }` (already user-readable) |

**Rules.**

- **One worker per page**, created lazily on the first Convert click, reused for every file in the batch and destroyed on navigation. Loading a page must not start a worker or pull a pipeline library.
- **Transferables only.** `File → ArrayBuffer` on the main thread, transfer in, transfer out, build the `Blob` on the main thread. No structured-clone copies of multi-MB buffers.
- **Cancel = `terminate()` + respawn.** Synchronous encoders (lamejs, jsPDF, pdf-lib) cannot observe an `AbortSignal` mid-loop, so cooperative cancellation would lie. Terminating is immediate, bounded, and the queue already models a cancelled job.
- **Progress yields.** Long loops post progress every N units and `await` a macrotask so messages flush; the UI updates at ~10 Hz, never per pixel or per audio frame.
- **Bounded memory.** One input and one output in flight. PDF→JPG renders one page at a time and appends it to an in-worker ZIP instead of holding all pages.
- **Fallback.** If worker construction fails (old browser, CSP misconfiguration), fall back to the existing main-thread converter for tools that have one, and show a clear "not supported in this browser" state for tools that do not. Never fail silently.
- **Prerender safety.** No `new Worker(...)` at module scope; only inside a browser-only code path. `worker-src 'self' blob:` already permits module workers.

**Concurrency stays 1.** Serial conversion is what keeps peak memory predictable on phones. If image batches later feel slow, raise the pool to `min(2, hardwareConcurrency - 1)` for image tools only — measured, not guessed.

### 12.4 Tool matrix

| Route | In → out | Engine | Worker | Limits | Browser gate |
|---|---|---|---|---|---|
| `/mp3-converter` | mp3, wav, m4a, aac → mp3 | decode + lamejs | yes (encode), WebCodecs decode where available | 25 MB, 10 min | m4a/aac hidden when no `AudioDecoder` |
| `/mp4-to-mp3` | mp4, m4v, mov → mp3 | mp4box demux + `AudioDecoder` + lamejs | yes | 100 MB, 30 min | requires AAC decode; otherwise explained refusal |
| `/video-to-mp3` | mp4, mov, webm, ogg → mp3 | same as above | yes | 100 MB, 30 min | same gate |
| `/audio-converter` | mp3, wav, mpeg → mp3/wav | existing, moved | encode + WAV in worker | 25 MB, 10 min | none |
| `/jpg-to-pdf` | jpg/jpeg → PDF | `pdf-lib` (MIT) | yes | 25 MB, 50 images | none |
| `/image-to-pdf` | png/jpg/webp → PDF, one page per image | `pdf-lib` | yes | 25 MB, 50 images | none |
| `/pdf-to-jpg` | PDF → JPG per page (+ZIP) | pdf.js + `OffscreenCanvas` + fflate | yes | 50 pages, 16.7 MP/page | none; falls back to main thread |
| `/heic-to-jpg` | heic/heif → jpg | `createImageBitmap` (Safari) or heic2any fallback | Safari: yes; others: no | 25 MB | explains the main-thread fallback |
| `/image-converter` | existing | existing, moved | yes | unchanged | unchanged |

Existing document tools keep their current engines. PDF→DOCX moves to the worker (pure `docx` + `fflate`). DOCX/XLSX→PDF stays on the main thread with added yield points in Phase 1; porting the 588-line jsPDF renderer is a separate decision, tracked in §12.9.

Fidelity copy is mandatory per route: what is re-encoded, what is lost, and what the user should check. No "Experimental" badge returns.

### 12.5 UX and information architecture

- Home groups tools the way the brief does: **Audio** and **Image** columns, documents below. Each card keeps the format line and the fidelity badge.
- One prerendered page per intent, distinct `<title>`/description, internal links between siblings (JPG→PDF ↔ Image→PDF ↔ PDF→JPG). No canonical tricks; the pages are genuinely different tasks.
- Image→PDF uses list order as page order, with a visible `Page 1…N` label per row. Drag-to-reorder is out of scope for v1.
- PDF→JPG exposes scale (1×/2×), quality and page range, then returns individual files or one ZIP; the existing batch UI is reused as-is.
- While a worker runs, the page stays interactive: Stop works immediately, adding files stays disabled, progress is announced by the existing `role="status"` region.
- Every new route must pass the existing accessibility audit (contrast, drop-zone label, 44 px targets, dark mode).

### 12.6 Performance budgets (acceptance criteria)

| Metric | Budget | How it is measured |
|---|---|---|
| Main-thread long task during conversion | p95 < 50 ms, **none > 200 ms** | `PerformanceObserver({ entryTypes: ['longtask'] })` around a batch |
| First progress after click | < 300 ms | timestamp in the Playwright run |
| Stop → responsive | < 100 ms | click Stop, then assert an immediate DOM update |
| Image route initial JS | ≤ 220 KB transferred | existing per-route resource check in `test/e2e.mjs` |
| PDF→JPG peak memory | one page canvas in flight | page-by-page render + ZIP append |
| Bundle isolation | audio routes load no PDF libs; image→PDF routes load no pdf.js | per-route largest-resource assertion |

These numbers are asserted in CI-like local runs, not just observed once. A conversion that freezes the UI is a failing test, not a tuning opportunity.

### 12.7 Phases

| Phase | Work | Exit criteria | Est. |
|---|---|---|---|
| 0. Spikes | Worker skeleton + protocol; prove (a) pdf.js render to `OffscreenCanvas`, (b) `pdf-lib` image→PDF in a worker, (c) whether jsPDF can run in a worker at all, (d) AAC decode via `AudioDecoder` in Chromium | Four short findings appended here; go/no-go per tool | 1 d |
| 1. Runtime | `WorkerClient`, cancellation, fallback, progress; migrate image, audio, PDF→DOCX; yields in DOCX/XLSX→PDF | e2e 45/45 green, long-task budget met, Stop kills the worker | 2 d |
| 2. Image family | `/jpg-to-pdf`, `/image-to-pdf`, `/pdf-to-jpg`, `/heic-to-jpg`; registry categories; grouped home | Each route converts its fixture and passes the a11y audit | 2 d |
| 3. Audio family | `/mp3-converter`, `/mp4-to-mp3`, `/video-to-mp3`; capability gates; streaming decode | MP4 fixture → valid MP3; unsupported browser shows the explanation | 2.5 d |
| 4. Polish | SEO copy, README/PLAN updates, fixtures, perf assertions, bundle budgets | Full suite + Lighthouse a11y 100 on every new route | 1.5 d |

Total ≈ 9 focused days. Phase 0 is a hard gate: if pdf.js cannot render in a worker with this version, PDF→JPG ships main-thread with yields instead of blocking the team.

### 12.8 Risks

| Risk | Impact | Mitigation |
|---|---|---|
| AAC decode missing (Firefox/Linux) | MP4→MP3 unusable there | `AudioDecoder.isConfigSupported` check before queueing; explicit copy; no 30 MB WASM fallback by default |
| jsPDF cannot run in a worker | Document tools stay janky | Keep them main-thread with yields; new PDF routes use `pdf-lib`; revisit only with a measured port plan |
| `pdf-lib` + `mp4box` bundle weight | Slower first conversion | Lazy import per tool; per-route JS budget; no new lib on document pages |
| Worker cancellation semantics | Half-written output | Terminate, discard the message, mark the job cancelled exactly as today |
| Memory blow-up on 50-page PDF→JPG | Mobile OOM | One page at a time, 16.7 MP cap, ZIP appended in-worker |
| LGPL contamination | Licence risk | Do not adopt `libheif-js`; keep MIT heic2any as fallback |
| Duplicate-intent SEO pages | Cannibalised rankings | Distinct copy per route, cross-links, one intent per page |

### 12.9 Open decisions (defaults recommended)

1. **Unsupported video browsers:** refuse with a precise explanation (default) vs. an opt-in ~30 MB ffmpeg.wasm download. Recommendation: refuse; revisit only if real demand appears.
2. **HEIC worker path:** Safari-native worker + heic2any main-thread fallback (default) vs. adopting LGPL `libheif-js`. Recommendation: fallback.
3. **MP3 Converter input scope:** mp3/wav/m4a/aac with a capability gate (default) vs. mp3/wav only. Recommendation: gated m4a/aac.
4. **DOCX/XLSX→PDF:** keep jsPDF main-thread (default) vs. port the renderer to `pdf-lib` for worker parity. Recommendation: defer until Phase 0 measures the actual long-task cost.
5. **Image→PDF ordering:** list order only (default) vs. drag-to-reorder. Recommendation: list order in v1.
