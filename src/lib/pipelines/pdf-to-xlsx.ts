import { baseName } from '#lib/core/format';
import type { Converter } from '#lib/core/types';
import { assertHasText, readPdfText, type PdfPageText } from './pdf-text';

interface PositionedText {
	text: string;
	x: number;
	y: number;
	width: number;
	height: number;
}

const MAX_COLUMNS = 60;

function groupRows(items: PositionedText[]): PositionedText[][] {
	const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
	const rows: PositionedText[][] = [];
	let current: PositionedText[] = [];
	let currentY = Number.NaN;

	for (const item of sorted) {
		const tolerance = Math.max(2.5, item.height * 0.45);
		if (current.length === 0 || Math.abs(item.y - currentY) <= tolerance) {
			current.push(item);
			currentY = current.length === 1 ? item.y : (currentY + item.y) / 2;
		} else {
			rows.push(current);
			current = [item];
			currentY = item.y;
		}
	}
	if (current.length > 0) rows.push(current);
	return rows;
}

function columnStarts(items: PositionedText[]): number[] {
	const xs = items.map((item) => item.x).sort((a, b) => a - b);
	const starts: number[] = [];
	for (const x of xs) {
		if (starts.length === 0 || x - starts[starts.length - 1] > 14) starts.push(x);
	}
	return starts;
}

function pageToMatrix(page: PdfPageText): string[][] {
	const rows = groupRows(page.items);
	if (rows.length === 0) return [];

	const starts = columnStarts(page.items).slice(0, MAX_COLUMNS);
	if (starts.length === 0) return [];

	const matrix = rows.map((row) => {
		const cells = new Array<string>(starts.length).fill('');
		for (const item of [...row].sort((a, b) => a.x - b.x)) {
			let bestIndex = 0;
			let bestDistance = Number.POSITIVE_INFINITY;
			for (let index = 0; index < starts.length; index += 1) {
				const distance = Math.abs(starts[index] - item.x);
				if (distance < bestDistance) {
					bestDistance = distance;
					bestIndex = index;
				}
			}
			const existing = cells[bestIndex];
			cells[bestIndex] = existing ? `${existing} ${item.text}` : item.text;
		}
		return cells.map((cell) => cell.replace(/\s+/g, ' ').trim());
	});

	const nonEmpty = matrix.filter((row) => row.some((cell) => cell !== ''));
	for (const row of nonEmpty) {
		while (row.length > 0 && row[row.length - 1] === '') row.pop();
	}
	return nonEmpty;
}

export const convertPdfToXlsx: Converter = async (file, ctx) => {
	const pdf = await readPdfText(file, (fraction) => ctx.onProgress(fraction * 0.7), ctx.signal);
	assertHasText(pdf, file);

	const XLSX = await import('xlsx');
	const workbook = XLSX.utils.book_new();
	let worksheetCount = 0;

	for (const page of pdf.pages) {
		if (ctx.signal.aborted) throw new DOMException('Aborted', 'AbortError');
		const matrix = pageToMatrix(page);
		if (matrix.length === 0) continue;

		const sheet = XLSX.utils.aoa_to_sheet(matrix);
		const widths = matrix[0].map((_, columnIndex) => {
			const longest = Math.max(
				...matrix.map((row) => (row[columnIndex] ?? '').length),
				6
			);
			return { wch: Math.min(48, longest + 2) };
		});
		sheet['!cols'] = widths;

		XLSX.utils.book_append_sheet(workbook, sheet, `Page ${page.pageNumber}`);
		worksheetCount += 1;
	}

	if (worksheetCount === 0) {
		throw new Error(`“${file.name}” has no text that could be arranged into rows and columns.`);
	}

	ctx.onProgress(0.92);
	const data = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
	ctx.onProgress(1);

	return {
		blob: new Blob([data], {
			type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
		})
	};
};
