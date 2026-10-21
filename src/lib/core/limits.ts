export const LIMITS = {
	/** Hard cap on files per batch, per the product spec. */
	maxFiles: 10,
	maxFileBytes: 25 * 1024 * 1024,
	maxTotalBytes: 100 * 1024 * 1024,
	maxPdfPages: 200,
	/** iOS Safari refuses canvases above ~16.7M pixels. */
	maxCanvasPixels: 16_777_216
} as const;

export const LIMIT_LINE = `Max ${LIMITS.maxFiles} files · ${Math.round(
	LIMITS.maxFileBytes / 1024 / 1024
)} MB each · ${Math.round(LIMITS.maxTotalBytes / 1024 / 1024)} MB per batch`;
