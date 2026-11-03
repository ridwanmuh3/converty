# Converty — Architecture & Roadmap

## Shared Understanding

| Area | Decision |
|---|---|
| **Priority** | UX → Processing → Capabilities. Maintainability is the enabler. |
| **Scope** | 12 existing tools + Combine Images, Merge PDF, Split PDF, Compress Image. |
| **Entry** | Universal drop on the home page, smart routing, mixed-batch grouping, no auto-start. Tool pages preserved for SEO and direct access. |
| **Constraints** | 100% client-side, no backend, no analytics, zero external network requests during conversion. Chrome/Edge/Safari 17+ primary; Firefox best-effort. Lazy WASM ≤1.5 MB gzip. |
| **Spine** | Single declarative tool manifest + conversion graph, landed behavior-neutral before UX changes. |
| **Device** | Mobile and desktop equal; mobile is the design constraint. |
| **Result** | Preview, before→after size, overall progress with phase and ETA. |
| **Processing** | Staged worker migration, automatic 2-up concurrency on capable desktops, streaming ZIP for PDF→JPG. |
| **PWA** | Shell precache + lazy per-tool cache, ~50 MB cap, install prompt after first conversion. |
| **Visual System** | Toss-inspired design system, AA contrast, 44 px touch targets, dark/light themes. |
| **Mobile** | Sticky bottom action bar, options in a disclosure sheet. |
| **Options** | Remember per-tool choices in localStorage with “Reset options”. Never persist files. |
| **Copy** | Keep “Converty”, clean hero headline, no “AI”/“smart” hype language. |
| **Accessibility** | AA contrast, full keyboard navigation, polite aria-live throttled to 1 Hz, reduced motion support. |
| **Deploy** | GitHub Actions first, base-path aware (`/converty`). |

---

## Target Architecture

### Manifest Spine (`src/lib/tools/`)

Every tool is declared via a standard definition:
```ts
interface ToolDef {
  slug: string;
  name: string;
  shortName: string;
  icon: ToolIcon;
  category: ToolCategory;
  input: {
    extensions: string[];
    kinds: FileKind[];
    acceptAttr: string;
  };
  output: {
    ext: string;
    mime: string;
    label: string;
  };
  pipeline: PipelineId;
  worker: WorkerFamily | null;
  memoryWeight: 1 | 2 | 3;
  arity: 'single' | 'many-to-one' | 'one-to-many';
  finalizer?: 'merge-pdf' | 'combine-images';
  options: ToolOption[];
  fixedOptions?: Record<string, string>;
  copy: {
    tagline: string;
    description: string;
    fidelity: Fidelity;
    fidelityTitle: string;
    fidelityNote: string;
    limitations: string[];
  };
}
```

Derived from this single definition:
- `accept` / `acceptAttr` for file pickers and drag-and-drop.
- Prerender routes and SEO metadata.
- Worker factory routing and pipeline loaders.
- Home categories, catalog, and popular strip.
- Universal entry graph query: `outputsFor(fileKind)` returning valid conversions grouped by category.
- Related tools and internal navigation links.
- Manifest invariants validated at build/prerender time.

### Job & Execution Model
- **Arity**:
  - `single`: 1 input file → 1 output file (default).
  - `many-to-one`: N input files processed independently → 1 merged output (Combine Images, Merge PDF).
  - `one-to-many`: 1 input file → N outputs zipped (Split PDF, PDF to JPG).
- **Worker Model**: Dedicated Web Workers for CPU-heavy tasks (video demuxing, image encoding, PDF rendering).
- **Concurrency Scheduler**: 1 job on mobile / low-memory; 2 concurrent jobs on desktop with ≥8 GB RAM and ≥4 cores; heavy pipelines (`memoryWeight: 2+`) run alone.

---

## Phases

### Phase 0 — Baseline and Spine (No Visible Change)
- [x] Baseline test verification (`npm run check`, `npm run test:e2e`, `npm run test:design`).
- [x] Baseline performance harness (`test/perf.mjs` & `test/perf-baseline.json`).
- [x] Manifest decomposition (`types.ts`, `define.ts`, `graph.ts`, `defs/*.ts`, `index.ts`).
- [x] Derive routes, loaders, and worker mappings from manifests.
- [x] Build-time invariant validation.

### Phase 1 — Universal Entry and Result Experience
- [x] Universal drop zone on home with smart `detectKind` routing and mixed-batch chips.
- [x] Output format selector modal/sheet (`outputsFor(fileKind)`).
- [x] Result previews (image thumbnails, PDF page 1 canvas, audio waveform/duration).
- [x] Before → after file size display and compression delta.
- [x] Overall progress bar with ETA and current processing phase.
- [x] Mobile sticky bottom action bar and options disclosure.
- [x] Local storage option persistence with "Reset to defaults".

### Phase 2 — Processing & Concurrency
- [x] Move XLSX→PDF and PDF→DOCX to Web Workers.
- [x] Transfer `File` directly to workers without main-thread `arrayBuffer()`.
- [x] 2-up concurrency scheduler for desktop with capability detection.
- [x] Streaming ZIP for PDF→JPG pages to minimize peak memory.
- [x] Optimized audio yield interval (80 frames → 8 frames) with fine progress reporting.
- [x] Image processing optimizations (`createImageBitmap` resizing, explicit memory disposal).

### Phase 3 — Capabilities & New Tools
- [x] `image-to-pdf`: Combine multiple images into one PDF or output individual PDFs.
- [x] `/merge-pdf`: Reorderable PDF combiner.
- [x] `/split-pdf`: Page ranges and individual page extractor.
- [x] `/compress-image`: Quality and dimension presets.
- [x] Catalog updates, SEO metadata, and tests for all 15 routes.

### Phase 4 — PWA & Offline Experience
- [x] Web app manifest and high-res maskable icons.
- [x] Service worker with shell precache and lazy cache for tool bundles (~50 MB cap).
- [x] Non-intrusive install prompt after first successful conversion.
- [x] Zero telemetry, zero external network requests verified.
