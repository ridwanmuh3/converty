import { defineTool } from '../define';

export default defineTool({
	slug: 'word-to-pdf',
	name: 'Word to PDF',
	shortName: 'Word → PDF',
	icon: 'word',
	category: 'document',
	input: {
		extensions: ['docx'],
		kinds: ['zip'],
		acceptAttr: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
	},
	output: {
		ext: 'pdf',
		mime: 'application/pdf',
		label: 'PDF'
	},
	pipeline: 'docx-to-pdf',
	worker: null,
	memoryWeight: 1,
	arity: 'single',
	copy: {
		tagline: 'DOCX to a clean, text-based PDF.',
		description:
			'Turn .docx documents into PDFs with real, selectable text. Headings, paragraphs, lists and tables are re-laid-out for the page.',
		fidelity: 'fair',
		fidelityTitle: 'Faithful, not identical',
		fidelityNote:
			'Page size and common text formatting are reconstructed from the document. Complex layouts, fonts, headers and footers may differ; check the PDF before sharing.',
		limitations: [
			'Latin text only. Documents written in Chinese, Japanese, Korean or Arabic script are rejected rather than silently mangled.',
			'Legacy .doc files must be saved as .docx first.',
			'Columns, text boxes, footnotes and tracked changes are not laid out.'
		]
	},
	options: [
		{
			key: 'pageSize',
			label: 'Page size',
			type: 'select',
			choices: [
				{ value: 'match', label: 'Match the document' },
				{ value: 'a4', label: 'Force A4 — 210 × 297 mm' },
				{ value: 'letter', label: 'Force Letter — 8.5 × 11 in' }
			],
			defaultValue: 'match',
			hint: 'Uses the page size and margins stored in the file.'
		}
	]
});
