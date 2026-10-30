import { extensionOf } from '#lib/core/format';
import { OUTPUT } from '#lib/core/limits';
import type { Converter } from '#lib/core/types';

const PAGE: Record<string, [number, number]> = {
	a4: [595.28, 841.89],
	letter: [612, 792]
};

/** pdf-lib can embed JPEG and PNG directly; everything else is re-encoded to PNG. */
async function embeddable(file: File): Promise<{ bytes: Uint8Array; type: 'jpg' | 'png' }> {
	const raw = new Uint8Array(await file.arrayBuffer());
	const ext = extensionOf(file.name);
	if (ext === 'jpg' || ext === 'jpeg') return { bytes: raw, type: 'jpg' };
	if (ext === 'png') return { bytes: raw, type: 'png' };

	const bitmap = await createImageBitmap(file);
	const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
	const context = canvas.getContext('2d');
	if (!context) throw new Error('This browser blocked canvas rendering, so the image cannot be embedded.');
	context.drawImage(bitmap, 0, 0);
	bitmap.close();
	const blob = await canvas.convertToBlob({ type: 'image/png' });
	return { bytes: new Uint8Array(await blob.arrayBuffer()), type: 'png' };
}

export const convertImageToPdf: Converter = async (file, ctx) => {
	const { PDFDocument } = await import('pdf-lib');
	ctx.onProgress(0.15);

	const source = await embeddable(file);
	const pdf = await PDFDocument.create();
	pdf.setTitle(file.name.replace(/\.[^.]+$/, ''));
	pdf.setCreator('Converty (local, in-browser)');
	const embedded = source.type === 'jpg' ? await pdf.embedJpg(source.bytes) : await pdf.embedPng(source.bytes);

	const mode = ctx.options.pageSize ?? 'a4';
	let pageWidth: number;
	let pageHeight: number;
	let margin: number = OUTPUT.pdfMarginPt;

	if (mode === 'fit') {
		// A page that matches the image, capped to a printable size at 72 dpi.
		const cap = 842;
		const scale = Math.min(1, cap / Math.max(embedded.width, embedded.height));
		pageWidth = embedded.width * scale;
		pageHeight = embedded.height * scale;
		margin = 0;
	} else {
		const [width, height] = PAGE[mode] ?? PAGE.a4;
		const landscape = embedded.width > embedded.height;
		pageWidth = landscape ? height : width;
		pageHeight = landscape ? width : height;
	}

	const page = pdf.addPage([pageWidth, pageHeight]);
	const scale = Math.min(
		(pageWidth - margin * 2) / embedded.width,
		(pageHeight - margin * 2) / embedded.height
	);
	const drawWidth = embedded.width * scale;
	const drawHeight = embedded.height * scale;
	page.drawImage(embedded, {
		x: (pageWidth - drawWidth) / 2,
		y: (pageHeight - drawHeight) / 2,
		width: drawWidth,
		height: drawHeight
	});

	ctx.onProgress(0.9);
	const saved = await pdf.save();
	// Copy into an ArrayBuffer-backed view so it is a valid BlobPart.
	const bytes = new Uint8Array(saved.length);
	bytes.set(saved);
	ctx.onProgress(1);
	return { blob: new Blob([bytes], { type: 'application/pdf' }), ext: 'pdf' };
};
