import { LIMITS } from '#lib/core/limits';
import type { Converter } from '#lib/core/types';

export function assertMergeable(count: number): void {
	if (count < 2) throw new Error('Add at least two PDFs to merge.');
}

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

/** Concatenates PDF parts in list order. */
export async function mergePdfParts(parts: Blob[], title: string): Promise<Blob> {
	assertMergeable(parts.length);
	const { PDFDocument } = await import('pdf-lib');
	const merged = await PDFDocument.create();

	for (const part of parts) {
		const source = await PDFDocument.load(new Uint8Array(await part.arrayBuffer()));
		const pages = await merged.copyPages(source, source.getPageIndices());
		for (const page of pages) merged.addPage(page);
		// Yield between documents so a 50-image batch never blocks the UI in one task.
		await new Promise((resolve) => setTimeout(resolve, 0));
	}

	merged.setCreator('Converty (local, in-browser)');
	merged.setTitle(title);
	const saved = await merged.save();
	const bytes = new Uint8Array(saved.length);
	bytes.set(saved);
	return new Blob([bytes], { type: 'application/pdf' });
}
