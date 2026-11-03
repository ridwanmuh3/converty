import { defineTool } from '../define';

export default defineTool({
	slug: 'pdf-to-word',
	name: 'PDF to Word',
	shortName: 'PDF → Word',
	icon: 'pdf',
	category: 'document',
	input: {
		extensions: ['pdf'],
		kinds: ['pdf'],
		acceptAttr: '.pdf,application/pdf'
	},
	output: {
		ext: 'docx',
		mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		label: 'DOCX'
	},
	pipeline: 'pdf-to-docx',
	worker: 'document',
	memoryWeight: 1,
	arity: 'single',
	copy: {
		tagline: 'Editable text from a PDF, as .docx.',
		description:
			'Extract the text layer from each page and rebuild it into paragraphs you can edit in Word, Google Docs or LibreOffice.',
		fidelity: 'fair',
		fidelityTitle: 'Text first, layout second',
		fidelityNote:
			'Text, headings and some aligned tables are rebuilt from the text layer. Reading order and layout may differ. Images, form fields and exact fonts are not preserved; scans need OCR.',
		limitations: [
			'Scanned or image-only PDFs cannot be converted without OCR.',
			'Only repeated, aligned text columns can become editable Word tables; other layouts may become paragraphs.',
			'Password-protected PDFs cannot be opened in the browser.'
		]
	},
	options: []
});
