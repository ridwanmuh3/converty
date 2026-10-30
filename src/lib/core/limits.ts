export const LIMITS = {
	maxFileBytes: 25 * 1024 * 1024,
	maxTotalBytes: 100 * 1024 * 1024,
	maxPdfPages: 200,
	/** PDF → JPG holds every rendered page in memory as a bitmap. */
	maxPdfImagePages: 50,
	/** iOS Safari refuses canvases above ~16.7M pixels. */
	maxCanvasPixels: 16_777_216,
	maxAudioSeconds: 10 * 60,
	/** A 25 MB MP3 can decode into hundreds of MB of PCM. */
	maxDecodedAudioBytes: 200 * 1024 * 1024,
	maxVideoSeconds: 30 * 60,
	maxSpreadsheetRows: 5000
} as const;

/** Fixed output settings that user-facing copy quotes. Changing one here changes both. */
export const OUTPUT = {
	mp3BitrateKbps: 128,
	jpegQuality: 0.9,
	/** Base render scale of 1 renders PDF pages at this resolution. */
	pdfRenderDpi: 72,
	pdfMarginPt: 24
} as const;

export const MAX_CANVAS_MEGAPIXELS = Math.floor((LIMITS.maxCanvasPixels / 1_000_000) * 10) / 10;

export const LIMIT_LINE = `${LIMITS.maxFileBytes / 1024 / 1024} MB per file · ${LIMITS.maxTotalBytes / 1024 / 1024} MB of input per batch`;
