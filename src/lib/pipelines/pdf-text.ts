import { LIMITS } from '#lib/core/limits';

export interface PdfTextItem {
	text: string;
	x: number;
	y: number;
	width: number;
	height: number;
	fontHeight: number;
}

export interface PdfPageText {
	pageNumber: number;
	width: number;
	height: number;
	items: PdfTextItem[];
}

export interface PdfText {
	pages: PdfPageText[];
	numPages: number;
	charCount: number;
}

async function loadPdfjs() {
	const pdfjs = await import('pdfjs-dist');
	const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
	pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
	return pdfjs;
}

export async function readPdfText(
	file: File,
	onProgress: (fraction: number) => void,
	signal: AbortSignal
): Promise<PdfText> {
	const pdfjs = await loadPdfjs();
	const data = new Uint8Array(await file.arrayBuffer());

	const loadingTask = pdfjs.getDocument({ data, useSystemFonts: true });

	let pdf;
	try {
		pdf = await loadingTask.promise;
	} catch (error) {
		const name = error instanceof Error ? error.name : '';
		if (name === 'PasswordException') {
			throw new Error(
				`“${file.name}” is password-protected. Remove the password, then try again.`
			);
		}
		throw new Error(
			`“${file.name}” could not be opened as a PDF. It may be damaged or use an unsupported feature.`
		);
	}

	if (pdf.numPages > LIMITS.maxPdfPages) {
		await loadingTask.destroy();
		throw new Error(
			`“${file.name}” has ${pdf.numPages} pages. The limit is ${LIMITS.maxPdfPages} pages per file.`
		);
	}

	const pages: PdfPageText[] = [];
	let charCount = 0;

	try {
		for (let index = 1; index <= pdf.numPages; index += 1) {
			if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

			const page = await pdf.getPage(index);
			const viewport = page.getViewport({ scale: 1 });
			const content = await page.getTextContent();
			const items: PdfTextItem[] = [];

			for (const item of content.items) {
				if (!('str' in item) || !item.str) continue;
				const [, , c, d, x, y] = item.transform;
				const fontHeight = Math.hypot(c, d) || item.height || 10;
				items.push({
					text: item.str,
					x,
					y: viewport.height - y,
					width: item.width,
					height: item.height,
					fontHeight
				});
				charCount += item.str.length;
			}

			pages.push({
				pageNumber: index,
				width: viewport.width,
				height: viewport.height,
				items
			});

			page.cleanup();
			onProgress((index / pdf.numPages) * 0.85);
		}
	} finally {
		await loadingTask.destroy();
	}

	return { pages, numPages: pdf.numPages, charCount };
}

/** jsPDF's built-in fonts are WinAnsi-only; refuse text we would silently corrupt. */
export function assertLatin(text: string, sourceName: string): void {
	const unsupported = text.match(
		/[^\u0000-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026\u20AC\u2122\u00A0]/
	);
	if (unsupported) {
		const sample = unsupported[0];
		throw new Error(
			`“${sourceName}” contains characters outside Latin script (for example “${sample}”). The in-browser PDF writer cannot render CJK or Arabic yet, so no PDF was produced.`
		);
	}
}

/** Guards against a page that only holds an image, which has no text layer to convert. */
export function assertHasText(pdf: PdfText, file: File): void {
	if (pdf.charCount < 30) {
		throw new Error(
			`“${file.name}” has almost no text layer — it looks like a scan or an image-only PDF. Text extraction cannot work without OCR, which this tool does not do.`
		);
	}
}
