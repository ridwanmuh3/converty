import { defineTool } from '../define';

export default defineTool({
	slug: 'excel-to-pdf',
	name: 'Excel to PDF',
	shortName: 'Excel → PDF',
	icon: 'excel',
	category: 'document',
	input: {
		extensions: ['xlsx', 'xls', 'csv'],
		kinds: ['zip', 'ole', 'csv'],
		acceptAttr: '.xlsx,.xls,.csv'
	},
	output: {
		ext: 'pdf',
		mime: 'application/pdf',
		label: 'PDF'
	},
	pipeline: 'xlsx-to-pdf',
	worker: 'document',
	memoryWeight: 1,
	arity: 'single',
	copy: {
		tagline: 'Spreadsheets to printable tables.',
		description:
			'Convert .xlsx, .xls and .csv workbooks into PDFs — one table per sheet, with headers repeated across page breaks.',
		fidelity: 'fair',
		fidelityTitle: 'Good for tables',
		fidelityNote:
			'Cell values and basic grid formatting are kept, and wide sheets are fitted to the page. Charts, images, cell fills and defined print areas are lost — this renders the data, not the workbook.',
		limitations: [
			'Charts and embedded images are not rendered.',
			'Formulas are exported as their last calculated value.',
			'Wide sheets are scaled down to fit the page width, so they may be hard to read.'
		]
	},
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
});
