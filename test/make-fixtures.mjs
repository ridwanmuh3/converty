import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { jsPDF } from 'jspdf';
import {
	Document,
	Packer,
	Paragraph,
	TextRun,
	HeadingLevel,
	Table,
	TableRow,
	TableCell,
	WidthType
} from 'docx';
import * as XLSX from 'xlsx';

const out = join(process.cwd(), 'test', 'fixtures');
await mkdir(out, { recursive: true });

/* ---------- PDF with a text layer and a simple table ---------- */
{
	const doc = new jsPDF({ unit: 'mm', format: 'a4' });
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(18);
	doc.text('Quarterly report', 20, 22);

	doc.setFont('helvetica', 'normal');
	doc.setFontSize(11);
	doc.text('This document exists to verify the PDF text extraction pipeline.', 20, 34);
	doc.text('It has two pages, a heading, and a four-column table of figures.', 20, 40);

	const columns = [20, 70, 110, 150];
	const rows = [
		['Region', 'Q1', 'Q2', 'Q3'],
		['North', '1200', '1350', '1410'],
		['South', '980', '1010', '1180'],
		['East', '1540', '1600', '1720'],
		['West', '760', '820', '905']
	];

	let y = 56;
	for (const row of rows) {
		row.forEach((cell, index) => doc.text(cell, columns[index], y));
		y += 9;
	}

	doc.addPage();
	doc.setFont('helvetica', 'bold');
	doc.setFontSize(14);
	doc.text('Method notes', 20, 24);
	doc.setFont('helvetica', 'normal');
	doc.setFontSize(11);
	doc.text('Figures are rounded and reconciled at the end of each quarter.', 20, 34);
	doc.text('Second page text is used to verify page breaks in the Word output.', 20, 40);

	await writeFile(join(out, 'report.pdf'), Buffer.from(doc.output('arraybuffer')));
}

/* ---------- PDF with no text layer (simulated scan) ---------- */
{
	const doc = new jsPDF({ unit: 'mm', format: 'a4' });
	doc.setFillColor(210, 214, 219);
	doc.rect(20, 20, 170, 240, 'F');
	await writeFile(join(out, 'scan.pdf'), Buffer.from(doc.output('arraybuffer')));
}

/* ---------- DOCX ---------- */
{
	const document = new Document({
		sections: [
			{
				children: [
					new Paragraph({ heading: HeadingLevel.HEADING_1, text: 'Project update' }),
					new Paragraph({
						children: [
							new TextRun('This is a paragraph with '),
							new TextRun({ text: 'bold text', bold: true }),
							new TextRun(' to check inline handling.')
						]
					}),
					new Paragraph({ text: 'A short list follows.', spacing: { after: 120 } }),
					new Paragraph({ text: 'First action item', bullet: { level: 0 } }),
					new Paragraph({ text: 'Second action item', bullet: { level: 0 } }),
					new Table({
						width: { size: 100, type: WidthType.PERCENTAGE },
						rows: [
							new TableRow({
								tableHeader: true,
								children: [
									new TableCell({ children: [new Paragraph('Owner')] }),
									new TableCell({ children: [new Paragraph('Status')] })
								]
							}),
							new TableRow({
								children: [
									new TableCell({ children: [new Paragraph('Design')] }),
									new TableCell({ children: [new Paragraph('Done')] })
								]
							}),
							new TableRow({
								children: [
									new TableCell({ children: [new Paragraph('Build')] }),
									new TableCell({ children: [new Paragraph('In progress')] })
								]
							})
						]
					})
				]
			}
		]
	});

	await writeFile(join(out, 'letter.docx'), await Packer.toBuffer(document));
}

/* ---------- XLSX ---------- */
{
	const workbook = XLSX.utils.book_new();
	const sheet = XLSX.utils.aoa_to_sheet([
		['Product', 'Units', 'Revenue'],
		['Notebook', 42, 1260],
		['Pen', 310, 620],
		['Lamp', 18, 900],
		['Chair', 7, 1400]
	]);
	XLSX.utils.book_append_sheet(workbook, sheet, 'Sales');
	await writeFile(
		join(out, 'data.xlsx'),
		XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
	);
}

/* ---------- PNG ---------- */
{
	const png = Buffer.from(
		'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFklEQVQoz2NkYPjPwMDAwMDAwMDAwAAAJgAB0yq1WQAAAABJRU5ErkJggg==',
		'base64'
	);
	await writeFile(join(out, 'pixel.png'), png);
}

console.log('fixtures written to', out);
