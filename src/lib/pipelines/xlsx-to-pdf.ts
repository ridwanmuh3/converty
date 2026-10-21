import { baseName } from '#lib/core/format';
import type { Converter } from '#lib/core/types';
import { assertLatin } from './pdf-text';

const MAX_ROWS_PER_SHEET = 5000;

export const convertXlsxToPdf: Converter = async (file, ctx) => {
	const XLSX = await import('xlsx');
	ctx.onProgress(0.05);

	let workbook;
	try {
		workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
	} catch {
		throw new Error(`“${file.name}” could not be read as a spreadsheet.`);
	}

	const sheets = workbook.SheetNames.map((name) => {
		const sheet = workbook.Sheets[name];
		const rows = sheet
			? (XLSX.utils.sheet_to_json(sheet, {
					header: 1,
					raw: false,
					defval: '',
					blankrows: false
				}) as unknown[][])
			: [];

		const cleaned = rows.map((row) => {
			const cells = row.map((cell) => (cell == null ? '' : String(cell)));
			while (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();
			return cells;
		});

		return { name, rows: cleaned.filter((row) => row.length > 0) };
	});

	const usable = sheets.filter((sheet) => sheet.rows.length > 0);
	if (usable.length === 0) {
		throw new Error(`“${file.name}” has no filled cells to convert.`);
	}

	for (const sheet of usable) {
		if (sheet.rows.length > MAX_ROWS_PER_SHEET) {
			throw new Error(
				`Sheet “${sheet.name}” has ${sheet.rows.length} rows. The browser limit is ${MAX_ROWS_PER_SHEET} rows per sheet.`
			);
		}
		for (const row of sheet.rows) for (const cell of row) assertLatin(cell, file.name);
	}

	const widest = Math.max(...usable.map((sheet) => Math.max(...sheet.rows.map((row) => row.length))));
	const orientation =
		ctx.options.orientation === 'portrait' || ctx.options.orientation === 'landscape'
			? ctx.options.orientation
			: widest > 7
				? 'landscape'
				: 'portrait';

	const { jsPDF } = await import('jspdf');
	const { default: autoTable } = await import('jspdf-autotable');

	const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation, compress: true });
	doc.setProperties({ title: baseName(file.name), creator: 'Browser file converter (local)' });

	const pageWidth = doc.internal.pageSize.getWidth();
	const pageHeight = doc.internal.pageSize.getHeight();
	const margin = 14;
	const fontSize = widest > 12 ? 6.5 : widest > 8 ? 7.5 : 8.5;

	usable.forEach((sheet, sheetIndex) => {
		if (ctx.signal.aborted) throw new DOMException('Aborted', 'AbortError');
		if (sheetIndex > 0) doc.addPage('a4', orientation);

		doc.setFont('helvetica', 'bold');
		doc.setFontSize(11);
		doc.setTextColor(25, 31, 40);
		doc.text(sheet.name, margin, margin + 4);

		const header = sheet.rows[0];
		const body = sheet.rows.slice(1);

		autoTable(doc, {
			startY: margin + 8,
			head: header.length > 0 ? [header] : undefined,
			body,
			theme: 'grid',
			showHead: 'everyPage',
			margin: { top: margin + 4, bottom: margin + 10, left: margin, right: margin },
			styles: {
				font: 'helvetica',
				fontSize,
				cellPadding: 1.6,
				overflow: 'linebreak',
				textColor: [25, 31, 40],
				lineColor: [209, 214, 219],
				lineWidth: 0.1,
				minCellHeight: 5
			},
			headStyles: {
				fillColor: [242, 244, 246],
				textColor: [25, 31, 40],
				fontStyle: 'bold'
			},
			alternateRowStyles: { fillColor: [252, 252, 253] }
		});

		ctx.onProgress(0.1 + (0.75 * (sheetIndex + 1)) / usable.length);
	});

	const pageCount = doc.getNumberOfPages();
	for (let page = 1; page <= pageCount; page += 1) {
		doc.setPage(page);
		doc.setFont('helvetica', 'normal');
		doc.setFontSize(8);
		doc.setTextColor(120, 128, 140);
		doc.text(String(page), pageWidth / 2, pageHeight - 6, { align: 'center' });
	}

	ctx.onProgress(1);
	return { blob: doc.output('blob') };
};
