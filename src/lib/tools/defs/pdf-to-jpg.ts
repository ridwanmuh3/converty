import { LIMITS, OUTPUT } from '#lib/core/limits';
import { defineTool } from '../define';

export default defineTool({
	slug: 'pdf-to-jpg',
	name: 'PDF to JPG',
	shortName: 'PDF → JPG',
	icon: 'pdf',
	category: 'image',
	input: {
		extensions: ['pdf'],
		kinds: ['pdf'],
		acceptAttr: '.pdf,application/pdf'
	},
	output: {
		ext: 'jpg',
		mime: 'image/jpeg',
		label: 'JPG'
	},
	pipeline: 'pdf-to-image',
	worker: 'pdf-image',
	memoryWeight: 2,
	arity: 'one-to-many',
	copy: {
		tagline: 'Each page as a JPEG image.',
		description: 'Render every page of a PDF to a JPEG. One page returns a JPG; longer documents return a ZIP of numbered pages.',
		fidelity: 'good',
		fidelityTitle: 'Rendered pages',
		fidelityNote: `Pages are rasterised at ${OUTPUT.pdfRenderDpi} dpi (or ${OUTPUT.pdfRenderDpi * 2} dpi), so text becomes pixels. Rendering happens one page at a time, so progress is visible.`,
		limitations: [
			'Text is no longer selectable — this is an image export, not a text extraction.',
			`${LIMITS.maxPdfImagePages} pages maximum. Every page is held in memory as an image, so longer documents are refused rather than silently truncated.`,
			'Password-protected PDFs cannot be opened in the browser.'
		]
	},
	options: [
		{
			key: 'scale',
			label: 'Resolution',
			type: 'select',
			choices: [
				{ value: '1', label: `Standard — ${OUTPUT.pdfRenderDpi} dpi` },
				{ value: '2', label: `High — ${OUTPUT.pdfRenderDpi * 2} dpi` }
			],
			defaultValue: '1'
		}
	]
});
