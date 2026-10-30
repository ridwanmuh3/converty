export const LIMITS = {
	maxFileBytes: 25 * 1024 * 1024,
	maxTotalBytes: 100 * 1024 * 1024,
	maxPdfPages: 200,
	/** iOS Safari refuses canvases above ~16.7M pixels. */
	maxCanvasPixels: 16_777_216
} as const;

export const LIMIT_LINE = `${LIMITS.maxFileBytes / 1024 / 1024} MB per file · ${LIMITS.maxTotalBytes / 1024 / 1024} MB of input per batch`;
