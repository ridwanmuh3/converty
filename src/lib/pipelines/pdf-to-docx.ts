import { baseName } from '#lib/core/format';
import type { Converter } from '#lib/core/types';
import { assertHasText, readPdfText, type PdfPageText } from './pdf-text';

interface Line {
	y: number;
	text: string;
	height: number;
}

interface Block {
	text: string;
	heading: boolean;
}

function median(values: number[]): number {
	if (values.length === 0) return 12;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)];
}

function pageLines(page: PdfPageText): Line[] {
	const items = [...page.items].sort((a, b) => a.y - b.y || a.x - b.x);
	const lines: Line[] = [];

	let current: typeof items = [];
	let currentY = Number.NaN;

	const flush = () => {
		if (current.length === 0) return;
		const ordered = [...current].sort((a, b) => a.x - b.x);
		let text = ordered[0].text;
		for (let index = 1; index < ordered.length; index += 1) {
			const previous = ordered[index - 1];
			const gap = ordered[index].x - (previous.x + previous.width);
			const needsSpace = gap > Math.max(1, ordered[index].fontHeight * 0.16);
			text += (needsSpace ? ' ' : '') + ordered[index].text;
		}
		lines.push({
			y: currentY,
			text: text.replace(/\s+/g, ' ').trim(),
			height: Math.max(...ordered.map((item) => item.fontHeight))
		});
	};

	for (const item of items) {
		const tolerance = Math.max(2, item.fontHeight * 0.45);
		if (current.length === 0 || Math.abs(item.y - currentY) <= tolerance) {
			current.push(item);
			currentY = current.length === 1 ? item.y : (currentY + item.y) / 2;
		} else {
			flush();
			current = [item];
			currentY = item.y;
		}
	}
	flush();

	return lines.filter((line) => {
		if (!line.text) return false;
		// Drop bare page numbers sitting in the footer band.
		if (/^\d{1,3}$/.test(line.text) && line.y > page.height - 40) return false;
		return true;
	});
}

function pageBlocks(page: PdfPageText): Block[] {
	const lines = pageLines(page);
	if (lines.length === 0) return [];

	const bodyHeight = median(lines.map((line) => line.height));
	const blocks: Block[] = [];
	let buffer = '';
	let last: Line | null = null;

	const flush = () => {
		if (buffer.trim()) blocks.push({ text: buffer.trim(), heading: false });
		buffer = '';
	};

	for (const line of lines) {
		const looksLikeHeading =
			line.height > bodyHeight * 1.22 &&
			line.text.length <= 80 &&
			!/[.,;:]$/.test(line.text) &&
			line.text.split(' ').length <= 12;

		if (looksLikeHeading) {
			flush();
			blocks.push({ text: line.text, heading: true });
			last = line;
			continue;
		}

		if (!buffer) {
			buffer = line.text;
		} else if (last && line.y - last.y > bodyHeight * 1.9) {
			flush();
			buffer = line.text;
		} else if (buffer.endsWith('-') && /^[a-z]/.test(line.text)) {
			buffer = `${buffer.slice(0, -1)}${line.text}`;
		} else {
			buffer = `${buffer} ${line.text}`;
		}
		last = line;
	}
	flush();

	return blocks;
}

export const convertPdfToDocx: Converter = async (file, ctx) => {
	const pdf = await readPdfText(file, (fraction) => ctx.onProgress(fraction * 0.7), ctx.signal);
	assertHasText(pdf, file);

	const perPage = pdf.pages.map((page) => pageBlocks(page));
	const blockCount = perPage.reduce((sum, blocks) => sum + blocks.length, 0);
	if (blockCount === 0) {
		throw new Error(`“${file.name}” contains no extractable text.`);
	}

	const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx');

	const children: InstanceType<typeof Paragraph>[] = [];
	perPage.forEach((blocks, pageIndex) => {
		blocks.forEach((block, blockIndex) => {
			children.push(
				new Paragraph({
					pageBreakBefore: pageIndex > 0 && blockIndex === 0,
					heading: block.heading ? HeadingLevel.HEADING_2 : undefined,
					spacing: { after: block.heading ? 160 : 120, line: 276 },
					children: [
						new TextRun({
							text: block.text,
							bold: block.heading,
							size: block.heading ? 28 : 22
						})
					]
				})
			);
		});
	});

	const document = new Document({
		creator: 'Browser file converter (local)',
		title: baseName(file.name),
		styles: {
			default: {
				document: {
					run: { font: 'Calibri', size: 22 },
					paragraph: { spacing: { line: 276 } }
				}
			}
		},
		sections: [
			{
				properties: { page: { size: { width: 11906, height: 16838 } } },
				children
			}
		]
	});

	ctx.onProgress(0.9);
	const blob = await Packer.toBlob(document);
	ctx.onProgress(1);

	return { blob };
};
