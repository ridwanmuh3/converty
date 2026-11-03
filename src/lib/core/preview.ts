/**
 * First-page preview for a PDF result.
 *
 * Loaded from the click handler only: the PDF engine is never part of the
 * initial bundle, and no tool page downloads it unless the visitor asks to see
 * a page.
 */
export async function pdfFirstPagePreview(blob: Blob, maxWidth = 360): Promise<string> {
	const pdfjs = await import('pdfjs-dist');
	const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
	pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

	const loadingTask = pdfjs.getDocument({
		data: new Uint8Array(await blob.arrayBuffer()),
		useSystemFonts: true
	});

	try {
		const doc = await loadingTask.promise;
		const page = await doc.getPage(1);
		const base = page.getViewport({ scale: 1 });
		const viewport = page.getViewport({ scale: Math.min(2, Math.max(0.2, maxWidth / base.width)) });

		const canvas = document.createElement('canvas');
		canvas.width = Math.ceil(viewport.width);
		canvas.height = Math.ceil(viewport.height);
		const context = canvas.getContext('2d');
		if (!context) throw new Error('Canvas is unavailable');

		await page.render({
			canvas: canvas as unknown as HTMLCanvasElement,
			canvasContext: context as unknown as CanvasRenderingContext2D,
			viewport
		}).promise;
		page.cleanup();
		return canvas.toDataURL('image/jpeg', 0.82);
	} finally {
		await loadingTask.destroy();
	}
}
