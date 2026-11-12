/**
 * Assembles several PDFs into one. Kept apart from the per-file pipelines so the
 * tool page can statically import it without also pulling in the Merge PDF
 * inspector (which `pipelines/index.ts` imports dynamically).
 */

/**
 * Concatenates PDF parts in list order.
 *
 * One part is valid: Image → PDF uses this same helper to build its combined
 * output, and a single image is a complete batch. The "at least two files"
 * rule belongs to the Merge PDF tool (`minFiles`), not to this assembler.
 */
export async function mergePdfParts(parts: Blob[], title: string): Promise<Blob> {
	if (parts.length === 0) throw new Error('There is nothing to combine.');
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
