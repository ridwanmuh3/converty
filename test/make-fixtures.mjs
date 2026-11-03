import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';
import { jsPDF } from 'jspdf';
import {
	AlignmentType,
	Document,
	Footer,
	Header,
	HeadingLevel,
	PageNumber,
	Packer,
	Paragraph,
	TextRun,
	Table,
	TableRow,
	TableCell,
	WidthType
} from 'docx';
import * as XLSX from 'xlsx';

const out = join(process.cwd(), 'test', 'fixtures');
await mkdir(out, { recursive: true });

/* ---------- JPEG and MP4 fixtures (need ffmpeg; skipped when absent) ---------- */
{
	try {
		const run = (args) =>
			execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'ignore' });
		run(['-f', 'lavfi', '-i', 'color=c=orange:s=1200x800', '-frames:v', '1', join(out, 'photo.jpg')]);
		// A noisy image has real detail, so compression has something to remove.
		run([
			'-f',
			'lavfi',
			'-i',
			'color=c=orange:s=1200x800,noise=alls=32:allf=t',
			'-frames:v',
			'1',
			'-q:v',
			'2',
			join(out, 'noisy.jpg')
		]);
		// MP3-in-MP4 keeps the fixture decodable in browsers without AAC support.
		run([
			'-f',
			'lavfi',
			'-i',
			'sine=frequency=440:duration=2',
			'-c:a',
			'libmp3lame',
			'-b:a',
			'64k',
			join(out, 'clip.mp4')
		]);
	} catch {
		console.warn('ffmpeg unavailable — photo.jpg and clip.mp4 were not generated');
	}
}

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

/* ---------- DOCX: geometry, styles, lists, header/footer fields ---------- */
{
	const document = new Document({
		sections: [
			{
				properties: {
					page: {
						size: { width: 11906, height: 16838 }, // A4 in twips
						margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
					}
				},
				headers: {
					default: new Header({
						children: [
							new Paragraph({
								alignment: AlignmentType.RIGHT,
								children: [new TextRun({ text: 'Confidential draft', italics: true, size: 18 })]
							})
						]
					})
				},
				footers: {
					default: new Footer({
						children: [
							new Paragraph({
								alignment: AlignmentType.CENTER,
								children: [
									new TextRun({ text: 'Page ', size: 16 }),
									new TextRun({ children: [PageNumber.CURRENT], size: 16 }),
									new TextRun({ text: ' of ', size: 16 }),
									new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16 })
								]
							})
						]
					})
				},
				children: [
					new Paragraph({ heading: HeadingLevel.HEADING_1, text: 'Project update' }),
					new Paragraph({
						alignment: AlignmentType.JUSTIFIED,
						children: [
							new TextRun('This is a paragraph with '),
							new TextRun({ text: 'bold text', bold: true }),
							new TextRun(', '),
							new TextRun({ text: 'red text', color: 'C00000' }),
							new TextRun(', '),
							new TextRun({ text: 'underlined text', underline: {} }),
							new TextRun(' and normal text to check inline handling against the source styling.')
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
		'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAACXBIWXMAAAABAAAAAQBPJcTWAAAAYUlEQVR4nO3PQQkAIADAQAVza3VD+DiEXYJtjn3Gz5YOeNWA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaA1oDWgNaAdgHQ8AH7Ze++yQAAAABJRU5ErkJggg==',
		'base64'
	);
	await writeFile(join(out, 'pixel.png'), png);
}

/* ---------- Landscape + portrait PNGs, to prove page order ---------- */
function crc32(buffer) {
	let crc = 0xffffffff;
	for (const byte of buffer) {
		crc ^= byte;
		for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function solidPng(width, height, [red, green, blue]) {
	const stride = width * 4 + 1;
	const raw = Buffer.alloc(stride * height);
	for (let y = 0; y < height; y += 1) {
		const row = y * stride;
		for (let x = 0; x < width; x += 1) {
			const offset = row + 1 + x * 4;
			raw[offset] = red;
			raw[offset + 1] = green;
			raw[offset + 2] = blue;
			raw[offset + 3] = 255;
		}
	}
	const chunk = (type, data) => {
		const length = Buffer.alloc(4);
		length.writeUInt32BE(data.length);
		const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
		const crc = Buffer.alloc(4);
		crc.writeUInt32BE(crc32(body));
		return Buffer.concat([length, body, crc]);
	};
	const header = Buffer.alloc(13);
	header.writeUInt32BE(width, 0);
	header.writeUInt32BE(height, 4);
	header[8] = 8;
	header[9] = 6;
	return Buffer.concat([
		Buffer.from('89504e470d0a1a0a', 'hex'),
		chunk('IHDR', header),
		chunk('IDAT', deflateSync(raw)),
		chunk('IEND', Buffer.alloc(0))
	]);
}

{
	await writeFile(join(out, 'wide.png'), solidPng(300, 120, [200, 80, 60]));
	await writeFile(join(out, 'tall.png'), solidPng(120, 300, [60, 100, 200]));
}

/* ---------- Short PCM WAV tone ---------- */
{
	const rate = 44_100;
	const length = rate / 4;
	const wav = Buffer.alloc(44 + length * 2);
	wav.write('RIFF', 0);
	wav.writeUInt32LE(wav.length - 8, 4);
	wav.write('WAVEfmt ', 8);
	wav.writeUInt32LE(16, 16);
	wav.writeUInt16LE(1, 20);
	wav.writeUInt16LE(1, 22);
	wav.writeUInt32LE(rate, 24);
	wav.writeUInt32LE(rate * 2, 28);
	wav.writeUInt16LE(2, 32);
	wav.writeUInt16LE(16, 34);
	wav.write('data', 36);
	wav.writeUInt32LE(length * 2, 40);
	for (let i = 0; i < length; i++) wav.writeInt16LE(Math.round(Math.sin(i * 440 * 2 * Math.PI / rate) * 8000), 44 + i * 2);
	await writeFile(join(out, 'tone.wav'), wav);
}

console.log('fixtures written to', out);
