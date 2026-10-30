import { zipSync } from 'fflate';
import { LIMITS, OUTPUT } from '#lib/core/limits';
import type { Converter } from '#lib/core/types';

const MAX_PAGES = LIMITS.maxPdfImagePages;

async function loadPdfjs() {
	const pdfjs = await import('pdfjs-dist');
	const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
	pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
	return pdfjs;
}

/** Renders each page to JPEG. One page returns a JPG; more return a ZIP. */
export const convertPdfToJpg: Converter = async (file, ctx) => {
	const pdfjs = await loadPdfjs();
	const data = new Uint8Array(await file.arrayBuffer());
	const loadingTask = pdfjs.getDocument({ data, useSystemFonts: true });

	let pdf;
	try {
		pdf = await loadingTask.promise;
	} catch (error) {
		const name = error instanceof Error ? error.name : '';
		if (name === 'PasswordException') {
			throw new Error(`“${file.name}” is password-protected. Remove the password, then try again.`);
		}
		throw new Error(`“${file.name}” could not be opened as a PDF. It may be damaged or use an unsupported feature.`);
	}

	try {
		if (pdf.numPages > MAX_PAGES) {
			throw new Error(`“${file.name}” has ${pdf.numPages} pages. The limit is ${MAX_PAGES} pages for image export.`);
		}

		const requested = Number(ctx.options.scale ?? 1) === 2 ? 2 : 1;
		const rendered: Record<string, Uint8Array> = {};

		for (let index = 1; index <= pdf.numPages; index += 1) {
			if (ctx.signal.aborted) throw new DOMException('Aborted', 'AbortError');

			const page = await pdf.getPage(index);
			const base = page.getViewport({ scale: 1 });
			let scale = requested;
			if (base.width * base.height * scale * scale > LIMITS.maxCanvasPixels) {
				scale = Math.sqrt(LIMITS.maxCanvasPixels / (base.width * base.height));
			}
			const viewport = page.getViewport({ scale });
			const canvas = new OffscreenCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
			const context = canvas.getContext('2d');
			if (!context) throw new Error('This browser blocked canvas rendering, so pages cannot be exported.');

			await page.render({
				canvas: canvas as unknown as HTMLCanvasElement,
				canvasContext: context as unknown as CanvasRenderingContext2D,
				viewport
			}).promise;

			const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: OUTPUT.jpegQuality });
			rendered[`page-${String(index).padStart(3, '0')}.jpg`] = new Uint8Array(await blob.arrayBuffer());
			page.cleanup();
			ctx.onProgress((index / pdf.numPages) * 0.95);
			// Let the worker flush progress between pages.
			await new Promise((resolve) => setTimeout(resolve, 0));
		}

		const names = Object.keys(rendered);
		if (names.length === 1) {
			const single = new Uint8Array(rendered[names[0]].length);
			single.set(rendered[names[0]]);
			return { blob: new Blob([single], { type: 'image/jpeg' }), ext: 'jpg' };
		}

		const zipped = zipSync(rendered, { level: 0 });
		const bytes = new Uint8Array(zipped.length);
		bytes.set(zipped);
		ctx.onProgress(1);
		return { blob: new Blob([bytes], { type: 'application/zip' }), ext: 'zip' };
	} finally {
		await loadingTask.destroy();
	}
};
