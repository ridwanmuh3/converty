import { baseName } from '#lib/core/format';
import type { Converter } from '#lib/core/types';
import { assertHasText, readPdfText, type PdfPageText, type PdfTextItem } from './pdf-text';

interface Line {
	y: number;
	text: string;
	size: number;
	cells: { x: number; text: string }[];
}

function median(values: number[]): number {
	if (!values.length) return 11;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)];
}

function pageLines(page: PdfPageText): Line[] {
	const items = page.items.filter((item) => item.text.trim()).sort((a, b) => a.y - b.y || a.x - b.x);
	const groups: PdfTextItem[][] = [];
	for (const item of items) {
		const last = groups.at(-1);
		if (last && Math.abs(item.y - last[0].y) <= Math.max(2, item.fontHeight * 0.4)) last.push(item);
		else groups.push([item]);
	}

	return groups.map((group) => {
		const ordered = group.sort((a, b) => a.x - b.x);
		const cells: Line['cells'] = [];
		let text = '';
		for (let index = 0; index < ordered.length; index++) {
			const item = ordered[index];
			const previous = ordered[index - 1];
			const gap = previous ? item.x - previous.x - previous.width : 0;
			const space = gap > Math.max(1, item.fontHeight * 0.16);
			if (!cells.length || gap > Math.max(12, item.fontHeight * 2)) cells.push({ x: item.x, text: item.text });
			else cells[cells.length - 1].text += (space ? ' ' : '') + item.text;
			text += (space ? ' ' : '') + item.text;
		}
		return {
			y: group[0].y,
			text: text.replace(/\s+/g, ' ').trim(),
			size: Math.max(...group.map((item) => item.fontHeight)),
			cells: cells.map((cell) => ({ ...cell, text: cell.text.trim() }))
		};
	}).filter((line) => line.text && !(/^\d{1,3}$/.test(line.text) && line.y > page.height - 40));
}

export const convertPdfToDocx: Converter = async (file, ctx) => {
	const pdf = await readPdfText(file, (fraction) => ctx.onProgress(fraction * 0.7), ctx.signal);
	assertHasText(pdf, file);
	const pages = pdf.pages.map(pageLines);
	if (!pages.some((lines) => lines.length)) throw new Error(`“${file.name}” contains no extractable text.`);

	const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, WidthType } = await import('docx');
	const sections = pdf.pages.map((page, index) => {
		const lines = pages[index];
		const bodySize = median(lines.map((line) => line.size));
		const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [];
		const paragraph = (text: string, size: number, heading = false) => new Paragraph({
			heading: heading ? HeadingLevel.HEADING_2 : undefined,
			spacing: { after: heading ? 160 : 120, line: 276 },
			children: [new TextRun({ text, bold: heading, size: Math.round(size * 2) })]
		});

		let buffer = '';
		let previous: Line | undefined;
		const flush = () => {
			if (buffer) children.push(paragraph(buffer, bodySize));
			buffer = '';
		};
		for (let i = 0; i < lines.length;) {
			const line = lines[i];
			// ponytail: only repeated, aligned text columns become tables; ruled or merged cells need PDF drawing analysis.
			if (line.cells.length >= 2) {
				let end = i + 1;
				while (end < lines.length && lines[end].cells.length === line.cells.length &&
					lines[end].cells.every((cell, column) => Math.abs(cell.x - line.cells[column].x) < 8) &&
					lines[end].y - lines[end - 1].y < bodySize * 3.5) end++;
				if (end - i >= 3) {
					flush();
					children.push(new Table({
						width: { size: 100, type: WidthType.PERCENTAGE },
						rows: lines.slice(i, end).map((row) => new TableRow({
							children: row.cells.map((cell) => new TableCell({ children: [paragraph(cell.text, row.size)] }))
						}))
					}));
					i = end;
					previous = undefined;
					continue;
				}
			}
			const heading = line.size > bodySize * 1.22 && line.text.length <= 80 &&
				!/[.,;:]$/.test(line.text) && line.text.split(' ').length <= 12;
			if (heading) {
				flush();
				children.push(paragraph(line.text, line.size, true));
			} else if (!buffer) buffer = line.text;
			else if (previous && line.y - previous.y > bodySize * 1.9) {
				flush();
				buffer = line.text;
			} else if (buffer.endsWith('-') && /^[a-z]/.test(line.text)) buffer = `${buffer.slice(0, -1)}${line.text}`;
			else buffer += ` ${line.text}`;
			previous = line;
			i++;
		}
		flush();
		const left = Math.min(...page.items.map((item) => item.x), 72);
		return {
			properties: {
				page: {
					size: { width: Math.round(page.width * 20), height: Math.round(page.height * 20) },
					margin: { left: Math.round(Math.max(0, left) * 20), right: 720, top: 720, bottom: 720 }
				}
			},
			children: children.length ? children : [new Paragraph('')]
		};
	});

	const document = new Document({ creator: 'Browser file converter (local)', title: baseName(file.name), sections });
	ctx.onProgress(0.9);
	const blob = await Packer.toBlob(document);
	ctx.onProgress(1);
	return { blob };
};
