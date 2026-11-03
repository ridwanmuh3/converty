import { LIMITS } from '#lib/core/limits';
import { defineTool } from '../define';

export default defineTool({
	slug: 'split-pdf',
	name: 'Split PDF',
	shortName: 'Split PDF',
	icon: 'pdf',
	category: 'document',
	input: {
		extensions: ['pdf'],
		kinds: ['pdf'],
		acceptAttr: '.pdf,application/pdf'
	},
	output: {
		ext: 'pdf',
		mime: 'application/pdf',
		label: 'PDF or ZIP of pages'
	},
	pipeline: 'split-pdf',
	worker: 'pdf-edit',
	memoryWeight: 2,
	arity: 'one-to-many',
	// Splitting needs page numbers, so it stays a deliberate destination rather
	// than a button in the drop chooser.
	excludeFromChooser: true,
	copy: {
		tagline: 'Pull out pages or split every page into its own file.',
		description:
			'Extract page ranges such as 1-3, 5 into one PDF, or save every page separately. Several outputs arrive as a ZIP.',
		fidelity: 'good',
		fidelityTitle: 'Pages copied',
		fidelityNote:
			'Pages are copied into new documents without re-rendering, so text and images are exactly as they were.',
		limitations: [
			'Page numbers are 1-based and refer to the PDF as it is, not to printed page labels.',
			'A single range produces one PDF; several ranges produce a ZIP.',
			'Password-protected PDFs cannot be opened in the browser.'
		]
	},
	options: [
		{
			key: 'mode',
			label: 'Split',
			type: 'select',
			choices: [
				{ value: 'range', label: 'Selected ranges' },
				{ value: 'every', label: 'Every page separately' }
			],
			defaultValue: 'range'
		},
		{
			key: 'ranges',
			label: 'Page ranges',
			type: 'text',
			placeholder: '1-3, 5',
			defaultValue: '1',
			hint: `Commas separate ranges. Up to ${LIMITS.maxPdfPages} pages per PDF.`
		}
	]
});
