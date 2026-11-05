# Converty — Client-Side File Conversion Engine

Oct 15, 2026[View project](https://github.com/ridwanmuh3/converty)

Fifteen file conversion tools running 100% inside the browser: zero server uploads, zero accounts, isolated Web Workers, strict Content Security Policy enforcement, and full offline PWA functionality.

**Type**
: Project

**Timeline**
: Sep 2026 – Oct 2026

**Stack**
: SvelteKit 3 · Svelte 5 · TypeScript · Tailwind CSS 4 · Web Workers · WebCodecs · pdf.js · pdf-lib

> Fifteen file conversion tools running 100% inside the browser: zero server uploads, zero accounts, isolated Web Workers, strict Content Security Policy enforcement, and full offline PWA functionality.

|  |  |
| --- | --- |
| **Type** | Portfolio / engineering showcase |
| **Role** | Solo — manifest design, web worker pipelines, memory scheduler, PWA architecture, test tooling |
| **Stack** | SvelteKit 3 · Svelte 5 (runes) · TypeScript · Tailwind CSS 4 · Web Workers · WebCodecs · `pdfjs-dist` · `pdf-lib` · `docx` · `jspdf` |
| **Status** | Production-ready static PWA; fully offline capable, zero server dependencies |
| **Repo** | [`converty`](https://github.com/ridwanmuh3/converty) |

---

## 1. Project Overview

Web-based file converters usually come with a hidden tax: privacy risks, paywalls, file size caps, and uploading confidential documents to third-party servers. The fundamental engineering challenge is not styling a file input — it is **running multi-format document, image, and media transcoding directly inside browser engines** while maintaining UI responsiveness, protecting client memory from crashing, and enforcing verifiable zero-trust privacy.

Converty models a zero-server utility suite: convert PDFs to Word documents, demux video audio via WebCodecs, transcode images, merge/split PDFs, and encode MP3s — all executed client-side inside Web Workers.

The core implementation relies on three structural guarantees:

1. **Worker-Isolated Pipeline Architecture**: All CPU-heavy parsers, decoders, and encoders run off the main thread across seven specialized worker entries (`audio`, `document`, `image`, `image-pdf`, `pdf-edit`, `pdf-image`, `video`).

2. **Network Exfiltration Block (`connect-src 'self'`)**: Content Security Policy hashes guarantee that even if a dependency contains malicious logic, the browser blocks any outbound data transfer during conversions.

3. **Capability-Aware Concurrency & Memory Ceilings**: A client-side scheduler detects CPU cores and RAM to run 2-up concurrency on capable desktops while capping file and memory bounds to protect mobile browsers.

### At a glance

| Dimension | Value |
| --- | --- |
| Integrated tools | 15 file conversion & manipulation tools |
| Web Worker entries | 7 isolated worker bundles (`src/lib/workers/entries/`) |
| Network dependencies | 0 runtime API endpoints; 100% static prerendered assets |
| Security Policy | Strict CSP (`connect-src 'self'`), zero telemetry, zero 3rd-party scripts |
| Memory safety cap | 25 MB file limit, 100 MB batch input ceiling |
| PWA offline budget | Shell precached + 50 MB LRU worker cache cap |
| Verification suite | 115 E2E Playwright checks, 306 design/SEO audits, CPU-calibrated perf baseline |

### What is intentionally out of scope

Converty is a browser-first engineering showcase. Server-side OCR for scanned images is omitted to avoid multi-megabyte binary bloat. PDF document export uses block-layout rendering rather than full browser print engine replication (`window.print()`), restricting document generation to Latin script (WinAnsi). Heavy FFmpeg WASM binaries were intentionally avoided in favor of lightweight native browser APIs (WebCodecs, `AudioContext`, `createImageBitmap`).

---

## 2. Features

### User experience & Intake

- **Universal file intake** — a drag-and-drop landing interface with automatic MIME and extension detection, routing dropped files to valid output format options.

- **Mixed-batch conversion** — convert multiple distinct file types in a single queue without manually jumping between individual tool pages.

- **Instant output previews** — real-time image thumbnails, first-page PDF canvas renderings, and audio waveforms/durations.

- **Option persistence** — per-tool settings (compression levels, PDF orientation, page ranges) saved locally in `localStorage` with a single-click reset.

- **Progressive Web App** — installable desktop/mobile app powered by a Service Worker that precaches the application shell for full offline usage.

### Document & PDF Engineering

- **Word → PDF** — parses OOXML structures directly (`fflate` + custom layout parser) and streams layout positioning into `jsPDF` block structures and `autoTable`.

- **Excel → PDF** — extracts workbook matrix data via SheetJS and constructs structured PDF tables.

- **PDF → Word** — extracts text positions via `pdfjs-dist`, applies line and paragraph spatial heuristics, and constructs structured DOCX elements via `docx`.

- **PDF Manipulation** — reorderable PDF merging (`merge-pdf`) and custom page-range extraction (`split-pdf`) executing via `pdf-lib`.

- **Image → PDF & PDF → JPG** — convert images into single or multi-page PDFs; rasterize PDF pages to JPEG images rendered on `OffscreenCanvas` and delivered via `fflate` streaming ZIP files.

### Media & Audio Processing

- **Video → MP3** — demuxes MP4/MOV audio streams with `mp4box`, decodes raw audio via native `WebCodecs`, and encodes 128 kbps MP3 files off the main thread using `lamejs`.

- **Audio Transcoding** — decodes input audio using browser `AudioContext`, resamples to 16-bit PCM WAV, or encodes to MP3.

- **Image Processing & Compression** — client-side image transcoding (PNG, JPEG, WebP) and quality/dimension compression using `createImageBitmap` and `OffscreenCanvas`.

- **HEIC Conversion** — native HEIC/HEIF decoding via `heic2any`.

### Engineering & Quality Assurance

- **Zero-trust security audit** — automated E2E assertion guaranteeing zero HTTP POST/PUT requests, zero request bodies, and zero third-party domain calls during conversions.

- **CPU-calibrated benchmark gate** — performance test harness scaling long-task timing checks according to hardware CPU benchmarks (`test/perf.mjs`).

- **Design & SEO audit suite** — 306 automated checks asserting WCAG AA contrast, 44 px touch targets, keyboard navigation, dark mode, and Lighthouse metrics.

---

## 3. Tech Stack

| Layer | Technologies | Why it is here |
| --- | --- | --- |
| **Frontend & UI** | SvelteKit 3, Svelte 5 (runes), TypeScript, Tailwind CSS 4, `@sveltejs/adapter-static` | High-performance reactive UI using Svelte 5 runes, fully prerendered as static HTML/JS |
| **State & Declarative Manifest** | Declarative Tool Manifest (`src/lib/tools/`) | Single source of truth for routes, worker routing, file acceptance, SEO, and options |
| **Worker System** | Web Workers (ES Modules), Vite worker bundle integration | Off-main-thread processing isolating heavy document parsing and media encoding |
| **PDF Processing** | `pdfjs-dist`, `pdf-lib`, `jspdf`, `jspdf-autotable` | High-fidelity PDF rendering, binary PDF creation, and page-level byte manipulations |
| **Document Processing** | `docx`, SheetJS (`xlsx`), `fflate` | OOXML parsing, XLSX matrix extraction, DOCX creation, and streaming ZIP compression |
| **Media & Audio** | WebCodecs API, `mp4box`, `@breezystack/lamejs`, `createImageBitmap`, `heic2any` | Native browser demuxing and hardware decoding with lightweight MP3 encoding |
| **PWA & Offline** | Service Worker, `scripts/build-sw.mjs` cache manifest generator | Shell precaching and dynamic worker chunk caching capped at 50 MB LRU |
| **Testing & Audit** | Playwright Chromium, Vitest, Custom Design/SEO Audit, CPU Calibration Harness | Comprehensive E2E, accessibility, CSP validation, and hardware-calibrated perf gates |

---

## 4. Architecture

### Execution Model

The application operates entirely within the browser sandbox. The main UI thread manages user interaction, intake routing, and progress UI, delegating conversion workloads to dedicated Web Workers.

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                              BROWSER MAIN THREAD                               │
│  ┌────────────────────────┐    ┌────────────────────┐    ┌──────────────────┐  │
│  │ Svelte 5 UI (App Shell)│ ── │ Intake & Routing   │ ── │ Progress & Store │  │
│  └────────────────────────┘    └────────────────────┘    └──────────────────┘  │
└───────────────────────────────────────┬────────────────────────────────────────┘
                                        │ PostMessage (ArrayBuffer / Transferable File)
                                        ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│                              WEB WORKERS (ISOLATED)                            │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────┐ │
│ │ document     │ │ pdf-edit     │ │ pdf-image    │ │ video        │ │ audio  │ │
│ │ (DOCX/XLSX)  │ │ (Merge/Split)│ │ (PDF → JPG)  │ │(WebCodecs)   │ │(LameJS)│ │
│ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘ └────────┘ │
└───────────────────────────────────────┬────────────────────────────────────────┘
                                        │
                                        ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│                        SECURITY & CONSTRAINTS BOUNDARY                         │
│  • CSP enforcement: connect-src 'self' (0 outbound network calls)              │
│  • Memory ceilings: 25 MB file limit / 100 MB batch input ceiling              │
│  • Thread Scheduler: 2-up concurrency (desktop) / 1-up sequential (mobile)     │
└────────────────────────────────────────────────────────────────────────────────┘
```

### Worker Ownership & Pipeline Distribution

| Worker Entry | Tools Owned | Underlying Engines | Data Transfer Method |
| --- | --- | --- | --- |
| `document.worker.ts` | Word → PDF, Excel → PDF, PDF → Word | `pdfjs-dist`, `jspdf`, `fflate`, `docx`, SheetJS | `ArrayBuffer` transfer |
| `pdf-edit.worker.ts` | Merge PDF, Split PDF | `pdf-lib` | `ArrayBuffer` transfer |
| `pdf-image.worker.ts` | PDF → JPG | `pdfjs-dist`, `OffscreenCanvas`, `fflate` | `Blob` / Transferable Streams |
| `image-pdf.worker.ts` | Image → PDF, JPG → PDF | `pdf-lib` | `ArrayBuffer` transfer |
| `image.worker.ts` | Image Converter, Compress Image | `createImageBitmap`, `OffscreenCanvas` | Transferable `ImageBitmap` |
| `audio.worker.ts` | Audio Converter, MP3 Converter | `AudioContext` decoder, `lamejs` MP3 encoder | `Float32Array` buffers |
| `video.worker.ts` | MP4 → MP3, Video → MP3 | `mp4box`, WebCodecs `AudioDecoder`, `lamejs` | `AudioData` chunks |
| *Main Thread* | HEIC → JPG | `heic2any` | Local Object Blob URL |

### Privacy Enforcement Strategy

| Protection Area | Enforcement Mechanism | Verification Method |
| --- | --- | --- |
| **Zero Data Exfiltration** | CSP `connect-src 'self'` | Browser blocks non-origin network requests |
| **Payload Interception** | Strict HTTP check during E2E | `test/e2e.mjs` asserts 0 POST/PUT requests and 0 request bodies |
| **Third-Party Tracking** | No analytics, self-hosted fonts | E2E suite verifies 0 third-party domain calls |
| **Memory Leak Prevention** | Explicit Object URL revocation (`URL.revokeObjectURL`) | Checked after download trigger / job disposal |

### Concurrency & Performance Model

- **Capability-Aware Concurrency**: Systems with ≥8 GB RAM and ≥4 CPU cores execute up to 2 concurrent worker tasks; mobile devices and constrained environments enforce sequential 1-up processing.
- **Heavy Pipeline Isolation**: High memory-weight operations (e.g. video decoding or large PDF parsing) acquire exclusive thread locks to prevent main thread frame drops.
- **Memory Streaming**: PDF → JPG page extraction streams generated JPEGs directly into `fflate` ZIP archives to minimize memory spikes.

### Failure Handling

| Scenario | Client Handling | User Impact |
| --- | --- | --- |
| Memory Ceiling Exceeded | File intake validator rejects payload before conversion | Clear error indicating file exceeds size or page count limits |
| Missing Audio Codec | WebCodecs capabilities check fails gracefully | Informative prompt requesting unsupported media codec transcode |
| Scanned PDF Input | Text position check detects zero selectable text | Clear notification that scanned documents require OCR (out of scope) |
| Worker Crash / OOM | Worker `onerror` handler captures exception and terminates pool | Conversion fails isolatedly; main thread app remains stable |

---

## 5. Technical Specifications & Conversion Matrix

### Converter Matrix

| Tool | Pipeline Engine | Fidelity Level | Technical Constraints / Trade-offs |
| --- | --- | --- | --- |
| **Word → PDF** | `fflate` + OOXML parser → `jsPDF` + `autoTable` | High structural match | WinAnsi font encoding (Latin script only); text boxes dropped |
| **Excel → PDF** | SheetJS → sheet matrix → `jspdf-autotable` | High table fidelity | Formula values evaluated; charts and images omitted |
| **PDF → Word** | `pdfjs-dist` spatial heuristics → `docx` builder | Structural text recovery | Tables converted to clean paragraphs; images omitted |
| **PDF → JPG** | `pdfjs-dist` → `OffscreenCanvas` → `fflate` ZIP | High raster fidelity | 50-page maximum cap; text converted to pixels |
| **JPG / Image → PDF** | `pdf-lib` image embedding | Native quality | 1:1 image page dimensions or A4 fit; metadata stripped |
| **Merge PDF** | `pdf-lib` page copying | Lossless byte copy | Form fields copied; complex interactive bookmarks flattened |
| **Split PDF** | `pdf-lib` page extraction | Lossless byte copy | Metadata preserved per extracted subset |
| **Compress Image** | `createImageBitmap` → `OffscreenCanvas` | Adjustable quality | Canvas max dimension limit (16.7 MP auto-scale down) |
| **Image Converter** | Canvas `toBlob` re-encoding | High visual fidelity | Animated GIF converts to first frame; EXIF tags stripped |
| **HEIC → JPG** | `heic2any` main-thread decoder | High color fidelity | Main-thread execution due to browser lib constraints |
| **MP4 / Video → MP3** | `mp4box` demuxer → WebCodecs → `lamejs` | Clean 128 kbps MP3 | Requires browser audio codec support; 30-min clip limit |
| **Audio / MP3 Converter**| `AudioContext` decode → `lamejs` encode | Constant 128 kbps | Audio capped at 10 minutes and 200 MB decoded buffer |

### Architectural Design Decisions

- **jsPDF Block Layout vs. `window.print()`**: While `window.print()` offers superior typography, it requires interactive user dialogs, preventing batch processing, progress tracking, and ZIP delivery. Using `jsPDF` enables programmatic batching and background worker processing.
- **WebCodecs vs. FFmpeg WASM**: FFmpeg WASM binaries add 20–30 MB of bundle overhead. Leveraging native browser `WebCodecs` demuxing and decoding reduces initial download footprint to under 50 KB for media tools.

---

## 6. Trade-offs

| Decision | What it buys | What it costs | How it is contained |
| --- | --- | --- | --- |
| **100% Client-Side Processing** | Absolute privacy, zero server costs, offline capability | Limited by client device CPU and RAM | Conservative memory caps (25 MB file limit, 100 MB batch ceiling) |
| **Web Codecs over FFmpeg WASM** | Minimal JS bundle size, fast startup | Dependent on browser codec support | Graceful error prompts on unsupported media codecs |
| **`jsPDF` Document Engine** | Programmatic PDF creation in workers without UI dialogs | Latin script (WinAnsi) font limit | Explicit user feedback when non-Latin characters are detected |
| **Single Declarative Manifest** | Unified routing, worker dispatch, and SEO metadata | Rigorous compile-time validation required | Build-time invariant checks assert manifest structure |
| **Offline Service Worker Cache** | Instant repeat loads without internet connectivity | Storage quota usage up to 50 MB | Automatic LRU worker cache purging capped at 50 MB |

### What I would do differently at production scale

- Integrate **Tesseract.js WASM** for client-side OCR image text extraction.
- Implement **WebAssembly font subsetting** (HarfBuzz / FreeType) to expand PDF generation support for CJK and non-Latin scripts.
- Leverage **WebGPU / WebCodecs hardware encoding** for client-side video transcoding beyond audio extraction.

---

## 7. Conclusion

Converty is built around one non-negotiable invariant: **zero bytes of user data ever leave the browser, and no server processes user files.**

The architecture achieves this through layered technical guarantees:

- **Web Workers** keep CPU-intensive tasks off the main thread to ensure smooth UI performance.
- **Strict Content Security Policy** mathematically guarantees zero outbound data transfer.
- **Declarative Manifest Spine** guarantees type-safe routing, worker loading, and options management.
- **Native Browser Engines (WebCodecs, `AudioContext`, Canvas)** replace heavy WASM binaries to maintain low network footprint.
- **Service Worker Precaching** converts the application into a resilient offline tool.

Converty demonstrates that web applications can deliver high-performance document and media processing without sacrificing user privacy or incurring backend operational costs.

### Further reading

- [`README.md`](https://github.com/ridwanmuh3/converty/blob/main/README.md) — Quick start and project overview
- [`ROADMAP.md`](https://github.com/ridwanmuh3/converty/blob/main/ROADMAP.md) — Architecture, manifest spine, and design phases
- [`src/lib/tools/`](https://github.com/ridwanmuh3/converty/tree/main/src/lib/tools) — Declarative tool manifest implementation

[Back to Projects](/projects/)

© 2026 Ridwan M. Raihan. All rights reserved.
---