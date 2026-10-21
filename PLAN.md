# Plan: Browser-Only File Converter (Free Tier)

Status: v1 built (see §10). Round 2 planned, awaiting go-ahead (see §11). Scope after Round 2: PDF↔Word, Word→PDF, Excel→PDF, image↔image, audio↔audio, batch ≤10 files, slim tool pages.

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
