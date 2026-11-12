import { LIMITS } from '#lib/core/limits';
import type { Converter } from '#lib/core/types';

/**
 * Open-and-count one PDF in the worker. The queue merges the returned originals
 * once every input is known, so the main thread never parses a document.
 */
export const convertInspectPdf: Converter = async (file, ctx) => {
	if (ctx.signal.aborted) throw new DOMException('Aborted', 'AbortError');
	ctx.onPhase?.('Reading pages');
	const { PDFDocument } = await import('pdf-lib');
	let pages: number;
	try {
		const doc = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()));
		pages = doc.getPageCount();
	} catch (error) {
		const message = error instanceof Error ? error.message : '';
		if (/encrypt|password/i.test(message)) {
			throw new Error(`“${file.name}” is password-protected. Remove the password, then try again.`);
		}
		throw new Error(
			`“${file.name}” could not be opened as a PDF. It may be damaged or use an unsupported feature.`
		);
	}
	if (pages === 0) throw new Error(`“${file.name}” has no pages.`);
	if (pages > LIMITS.maxPdfPages) {
		throw new Error(
			`“${file.name}” has ${pages} pages. The limit is ${LIMITS.maxPdfPages} pages per PDF.`
		);
	}
	ctx.onProgress(1);
	return { blob: file, ext: 'pdf', meta: { pages } };
};
