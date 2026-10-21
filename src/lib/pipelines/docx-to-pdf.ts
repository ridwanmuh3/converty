import { baseName } from '#lib/core/format';
import type { Converter } from '#lib/core/types';
import { assertLatin } from './pdf-text';

const PT_TO_MM = 0.352778;

interface ParagraphStyle {
	size?: number;
	style?: 'normal' | 'bold' | 'italic' | 'bolditalic';
	indent?: number;
	gapBefore?: number;
	gapAfter?: number;
	lineHeight?: number;
}

const HEADING_SIZE: Record<string, number> = {
	H1: 20,
	H2: 16,
	H3: 13.5,
	H4: 12,
	H5: 11,
	H6: 11
};

export const convertDocxToPdf: Converter = async (file, ctx) => {
	const mammoth = await import('mammoth');
	ctx.onProgress(0.05);

	const { value: html } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
	if (!html.trim()) {
		throw new Error(`“${file.name}” appears to be empty — no text or images were found.`);
	}
	ctx.onProgress(0.25);

	const { jsPDF } = await import('jspdf');
	const { default: autoTable } = await import('jspdf-autotable');

	const pageFormat = ctx.options.pageSize === 'letter' ? 'letter' : 'a4';
	const doc = new jsPDF({ unit: 'mm', format: pageFormat, compress: true });
	doc.setProperties({
		title: baseName(file.name),
		creator: 'Browser file converter (local)'
	});

	const pageWidth = doc.internal.pageSize.getWidth();
	const pageHeight = doc.internal.pageSize.getHeight();
	const margin = 18;
	const contentWidth = pageWidth - margin * 2;
	const bottomLimit = pageHeight - margin - 8;
	let y = margin;

	const newPage = () => {
		doc.addPage(pageFormat, 'portrait');
		y = margin;
	};

	const ensureSpace = (height: number) => {
		if (y + height > bottomLimit) newPage();
	};

	const writeParagraph = (raw: string, style: ParagraphStyle = {}) => {
		const text = raw.replace(/\s+/g, ' ').trim();
		if (!text) {
			y += 2;
			return;
		}
		assertLatin(text, file.name);

		const size = style.size ?? 11;
		const indent = style.indent ?? 0;
		const lineHeightMm = size * PT_TO_MM * (style.lineHeight ?? 1.45);
		y += style.gapBefore ?? 0;

		doc.setFont('helvetica', style.style ?? 'normal');
		doc.setFontSize(size);
		doc.setTextColor(25, 31, 40);

		const lines = doc.splitTextToSize(text, contentWidth - indent) as string[];
		for (const line of lines) {
			ensureSpace(lineHeightMm);
			doc.text(line, margin + indent, y + size * PT_TO_MM);
			y += lineHeightMm;
		}
		y += style.gapAfter ?? 3.5;
	};

	const naturalSize = (src: string): Promise<{ width: number; height: number } | null> =>
		new Promise((resolve) => {
			const image = new Image();
			image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
			image.onerror = () => resolve(null);
			image.src = src;
		});

	const renderImage = async (src: string) => {
		if (!src.startsWith('data:image/')) return;
		const format = src.slice(11, src.indexOf(';')).toUpperCase();
		if (!['PNG', 'JPEG', 'JPG', 'WEBP'].includes(format)) return;

		const size = await naturalSize(src);
		if (!size || !size.width || !size.height) return;

		let width = Math.min(contentWidth * 0.85, 150);
		let height = (size.height / size.width) * width;
		if (height > 110) {
			height = 110;
			width = (size.width / size.height) * height;
		}

		ensureSpace(height + 4);
		try {
			doc.addImage(src, format === 'JPG' ? 'JPEG' : format, margin, y, width, height, undefined, 'FAST');
			y += height + 5;
		} catch {
			// Unsupported image encodings are skipped rather than failing the whole document.
		}
	};

	const renderTable = (table: Element) => {
		const rows = Array.from(table.querySelectorAll('tr'))
			.map((row) =>
				Array.from(row.querySelectorAll('th,td')).map((cell) =>
					(cell.textContent ?? '').replace(/\s+/g, ' ').trim()
				)
			)
			.filter((row) => row.some((cell) => cell.length > 0));

		if (rows.length === 0) return;
		for (const row of rows) for (const cell of row) assertLatin(cell, file.name);

		const hasHead = Boolean(table.querySelector('thead')) || table.querySelector('th') !== null;
		const head = hasHead ? [rows[0]] : undefined;
		const body = hasHead ? rows.slice(1) : rows;

		ensureSpace(24);
		autoTable(doc, {
			startY: y,
			head,
			body,
			theme: 'grid',
			margin: { top: margin, bottom: margin + 8, left: margin, right: margin },
			styles: {
				font: 'helvetica',
				fontSize: 8.5,
				cellPadding: 1.8,
				overflow: 'linebreak',
				textColor: [25, 31, 40],
				lineColor: [209, 214, 219],
				lineWidth: 0.1
			},
			headStyles: {
				fillColor: [242, 244, 246],
				textColor: [25, 31, 40],
				fontStyle: 'bold'
			}
		});

		const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
		y = (finalY ?? y) + 6;
	};

	const renderBlock = async (element: Element, indent: number): Promise<void> => {
		const tag = element.tagName.toUpperCase();

		if (['DIV', 'SECTION', 'ARTICLE', 'MAIN', 'HEADER', 'FOOTER', 'BLOCKQUOTE'].includes(tag)) {
			for (const child of Array.from(element.children)) await renderBlock(child, indent);
			if (tag === 'BLOCKQUOTE') y += 2;
			return;
		}

		if (tag === 'TABLE') {
			renderTable(element);
			return;
		}

		if (tag === 'UL' || tag === 'OL') {
			const items = Array.from(element.children).filter((child) => child.tagName === 'LI');
			for (let index = 0; index < items.length; index += 1) {
				const marker = tag === 'OL' ? `${index + 1}. ` : '• ';
				writeParagraph(marker + (items[index].textContent ?? ''), {
					indent: indent + 3,
					gapAfter: 1.5
				});
			}
			y += 2;
			return;
		}

		if (tag === 'HR') {
			ensureSpace(6);
			doc.setDrawColor(209, 214, 219);
			doc.line(margin, y, pageWidth - margin, y);
			y += 6;
			return;
		}

		if (tag === 'IMG') {
			await renderImage(element.getAttribute('src') ?? '');
			return;
		}

		if (HEADING_SIZE[tag]) {
			writeParagraph(element.textContent ?? '', {
				size: HEADING_SIZE[tag],
				style: 'bold',
				gapBefore: 5,
				gapAfter: 2.5,
				lineHeight: 1.3
			});
			return;
		}

		if (tag === 'PRE') {
			writeParagraph(element.textContent ?? '', {
				size: 9,
				style: 'normal',
				indent: 3,
				gapAfter: 3
			});
			return;
		}

		const text = element.textContent ?? '';
		if (text.trim()) {
			writeParagraph(text, { size: 11, indent });
		}

		for (const image of Array.from(element.querySelectorAll('img'))) {
			await renderImage(image.getAttribute('src') ?? '');
		}
	};

	const body = new DOMParser().parseFromString(html, 'text/html').body;
	const blocks = Array.from(body.children);

	for (let index = 0; index < blocks.length; index += 1) {
		if (ctx.signal.aborted) throw new DOMException('Aborted', 'AbortError');
		await renderBlock(blocks[index], 0);
		ctx.onProgress(0.25 + (0.65 * (index + 1)) / blocks.length);
	}

	const pageCount = doc.getNumberOfPages();
	for (let page = 1; page <= pageCount; page += 1) {
		doc.setPage(page);
		doc.setFont('helvetica', 'normal');
		doc.setFontSize(8);
		doc.setTextColor(120, 128, 140);
		doc.text(`${page} / ${pageCount}`, pageWidth - margin, pageHeight - 9, { align: 'right' });
	}

	ctx.onProgress(1);
	return { blob: doc.output('blob') };
};
