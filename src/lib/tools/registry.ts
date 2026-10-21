import type { Fidelity } from '#lib/core/types';

export type ToolIcon = 'image' | 'word' | 'excel' | 'pdf';

export interface SelectChoice {
	value: string;
	label: string;
}

export interface ToolOption {
	key: string;
	label: string;
	type: 'select' | 'range';
	choices?: SelectChoice[];
	min?: number;
	max?: number;
	step?: number;
	defaultValue: string;
	hint?: string;
	/** Formats the range readout, e.g. "85%". */
	display?: 'percent' | 'pixels';
}

export interface ToolDef {
	slug: string;
	name: string;
	shortName: string;
	icon: ToolIcon;
	tagline: string;
	description: string;
	fidelity: Fidelity;
	fidelityTitle: string;
	fidelityNote: string;
	accept: string[];
	acceptAttr: string;
	outputExt: string;
	outputLabel: string;
	steps: string[];
	limitations: string[];
	options: ToolOption[];
}

export const TOOLS: ToolDef[] = [
	{
		slug: 'image-converter',
		name: 'Image Converter',
		shortName: 'Images',
		icon: 'image',
		tagline: 'PNG, JPEG and WebP — plus iPhone HEIC.',
		description:
			'Convert images between PNG, JPEG and WebP. Resize them, pick the quality, and know that the pixels never left your device.',
		fidelity: 'good',
		fidelityTitle: 'High fidelity',
		fidelityNote:
			'PNG stays lossless. JPEG and WebP are re-encoded at the quality you choose, so check the preview on photographic images. Animated GIFs keep only the first frame.',
		accept: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif', 'heic', 'heif'],
		acceptAttr:
			'image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif,image/heic,image/heif,.heic,.heif',
		outputExt: 'png',
		outputLabel: 'PNG, JPEG or WebP',
		steps: [
			'Choose an output format, quality and maximum width.',
			'Drop up to 10 images, or click to pick them.',
			'Convert, then download files one by one or all at once as a ZIP.'
		],
		limitations: [
			'Animated GIFs lose their animation — only the first frame is converted.',
			'HEIC and AVIF can be read, but browsers cannot write them, so they are input-only.',
			'EXIF metadata such as camera and GPS data is not carried over.'
		],
		options: [
			{
				key: 'format',
				label: 'Output format',
				type: 'select',
				choices: [
					{ value: 'png', label: 'PNG — lossless, larger' },
					{ value: 'jpeg', label: 'JPEG — small, photographic' },
					{ value: 'webp', label: 'WebP — small, modern' }
				],
				defaultValue: 'png'
			},
			{
				key: 'quality',
				label: 'Quality',
				type: 'range',
				min: 0.5,
				max: 1,
				step: 0.05,
				defaultValue: '0.9',
				display: 'percent',
				hint: 'Applies to JPEG and WebP only.'
			},
			{
				key: 'maxWidth',
				label: 'Maximum width',
				type: 'select',
				choices: [
					{ value: '0', label: 'Original size' },
					{ value: '3840', label: '3840 px (4K)' },
					{ value: '1920', label: '1920 px (Full HD)' },
					{ value: '1280', label: '1280 px (web)' }
				],
				defaultValue: '0',
				hint: 'Images are never enlarged.'
			}
		]
	},
	{
		slug: 'word-to-pdf',
		name: 'Word to PDF',
		shortName: 'Word → PDF',
		icon: 'word',
		tagline: 'DOCX to a clean, text-based PDF.',
		description:
			'Turn .docx documents into PDFs with real, selectable text. Headings, paragraphs, lists and tables are re-laid-out for the page.',
		fidelity: 'fair',
		fidelityTitle: 'Good, not identical',
		fidelityNote:
			'Headings, paragraphs, lists, tables and inline images are kept. Custom fonts, columns, headers and footers, footnotes and exact page breaks are not — the PDF is re-laid-out with a standard font.',
		accept: ['docx'],
		acceptAttr: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		outputExt: 'pdf',
		outputLabel: 'PDF',
		steps: [
			'Drop one or more .docx files — 10 per batch.',
			'Pick A4 or Letter.',
			'Convert, then download each PDF or the whole batch as a ZIP.'
		],
		limitations: [
			'Latin text only. Documents written in Chinese, Japanese, Korean or Arabic script are rejected rather than silently mangled.',
			'Legacy .doc files must be saved as .docx first.',
			'Page breaks and typography will differ from Word’s own PDF export.'
		],
		options: [
			{
				key: 'pageSize',
				label: 'Page size',
				type: 'select',
				choices: [
					{ value: 'a4', label: 'A4 — 210 × 297 mm' },
					{ value: 'letter', label: 'Letter — 8.5 × 11 in' }
				],
				defaultValue: 'a4'
			}
		]
	},
	{
		slug: 'excel-to-pdf',
		name: 'Excel to PDF',
		shortName: 'Excel → PDF',
		icon: 'excel',
		tagline: 'Spreadsheets to printable tables.',
		description:
			'Convert .xlsx, .xls and .csv workbooks into PDFs — one table per sheet, with headers repeated across page breaks.',
		fidelity: 'fair',
		fidelityTitle: 'Good for tables',
		fidelityNote:
			'Cell values and basic grid formatting are kept, and wide sheets are fitted to the page. Charts, images, cell fills and defined print areas are lost — this renders the data, not the workbook.',
		accept: ['xlsx', 'xls', 'csv'],
		acceptAttr: '.xlsx,.xls,.csv',
		outputExt: 'pdf',
		outputLabel: 'PDF',
		steps: [
			'Drop your workbooks — 10 per batch.',
			'Choose an orientation. Auto switches to landscape for wide sheets.',
			'Convert and download each PDF or the ZIP.'
		],
		limitations: [
			'Charts and embedded images are not rendered.',
			'Formulas are exported as their last calculated value.',
			'Sheets with more than 30 columns are scaled down and may be hard to read.'
		],
		options: [
			{
				key: 'orientation',
				label: 'Orientation',
				type: 'select',
				choices: [
					{ value: 'auto', label: 'Auto — landscape for wide sheets' },
					{ value: 'portrait', label: 'Portrait' },
					{ value: 'landscape', label: 'Landscape' }
				],
				defaultValue: 'auto'
			}
		]
	},
	{
		slug: 'pdf-to-word',
		name: 'PDF to Word',
		shortName: 'PDF → Word',
		icon: 'pdf',
		tagline: 'Editable text from a PDF, as .docx.',
		description:
			'Extract the text layer from each page and rebuild it into paragraphs you can edit in Word, Google Docs or LibreOffice.',
		fidelity: 'fair',
		fidelityTitle: 'Text first, layout second',
		fidelityNote:
			'Text, reading order and basic headings are rebuilt. Images, columns, tables, form fields and exact fonts are not preserved. A scanned PDF has no text layer and will be rejected with an explanation.',
		accept: ['pdf'],
		acceptAttr: '.pdf,application/pdf',
		outputExt: 'docx',
		outputLabel: 'DOCX',
		steps: [
			'Drop PDFs that contain a real text layer — not scans.',
			'Convert. Each page becomes a flow of paragraphs with a page break between pages.',
			'Open the .docx in Word, Google Docs or LibreOffice and edit.'
		],
		limitations: [
			'Scanned or image-only PDFs cannot be converted without OCR.',
			'Tables come out as plain paragraphs, not Word tables.',
			'Password-protected PDFs cannot be opened in the browser.'
		],
		options: []
	},
	{
		slug: 'pdf-to-excel',
		name: 'PDF to Excel',
		shortName: 'PDF → Excel',
		icon: 'excel',
		tagline: 'Grid tables into .xlsx — experimental.',
		description:
			'Detect rows and columns from the position of text on each page, then write them into a spreadsheet you can clean up.',
		fidelity: 'experimental',
		fidelityTitle: 'Experimental',
		fidelityNote:
			'This works on simple tables with evenly spaced columns. Merged cells, nested tables, rotated text and scans will come out wrong. Always check the cells before relying on the output.',
		accept: ['pdf'],
		acceptAttr: '.pdf,application/pdf',
		outputExt: 'xlsx',
		outputLabel: 'XLSX',
		steps: [
			'Drop PDFs that contain a clear table grid.',
			'Convert. One worksheet is created per page.',
			'Check the cells, fix what the heuristic missed, then download.'
		],
		limitations: [
			'Only tables with consistent column positions can be recovered.',
			'One sheet per page, so repeating headers are not merged.',
			'Not suitable for scanned tables or multi-column page layouts.'
		],
		options: []
	}
];

export function getTool(slug: string): ToolDef | undefined {
	return TOOLS.find((tool) => tool.slug === slug);
}

export const FIDELITY_LABEL: Record<Fidelity, string> = {
	good: 'High fidelity',
	fair: 'Good, not identical',
	experimental: 'Experimental'
};

export const FIDELITY_BADGE: Record<Fidelity, string> = {
	good: 'badge-success',
	fair: 'badge-info',
	experimental: 'badge-warning'
};
