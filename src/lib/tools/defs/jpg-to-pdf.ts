import { OUTPUT } from '#lib/core/limits';
import { defineTool } from '../define';

export default defineTool({
	slug: 'jpg-to-pdf',
	name: 'JPG to PDF',
	shortName: 'JPG → PDF',
	icon: 'image',
	category: 'image',
	input: {
		extensions: ['jpg', 'jpeg'],
		kinds: ['jpeg'],
		acceptAttr: '.jpg,.jpeg,image/jpeg'
	},
	output: {
		ext: 'pdf',
		mime: 'application/pdf',
		label: 'PDF'
	},
	pipeline: 'image-pdf',
	worker: 'image-pdf',
	memoryWeight: 1,
	arity: 'single',
	copy: {
		tagline: 'One JPEG, one clean PDF page.',
		description: 'Wrap a JPEG in a PDF page sized to A4 or Letter, or matched to the image. The picture is embedded, not re-compressed.',
		fidelity: 'good',
		fidelityTitle: 'Image embedded as-is',
		fidelityNote: 'The original JPEG bytes are embedded, so image quality is unchanged. Each file becomes its own PDF; a batch downloads as a ZIP.',
		limitations: [
			'Each image becomes a separate PDF — use Image to PDF for multi-page output per file.',
			`PDF page size is fixed at conversion time; margins are ${OUTPUT.pdfMarginPt} pt on A4 and Letter.`,
			'EXIF orientation stored by cameras is not applied.'
		]
	},
	options: [
		{
			key: 'pageSize',
			label: 'Page size',
			type: 'select',
			choices: [
				{ value: 'a4', label: 'A4 — 210 × 297 mm' },
				{ value: 'letter', label: 'Letter — 8.5 × 11 in' },
				{ value: 'fit', label: 'Fit the image' }
			],
			defaultValue: 'a4'
		}
	]
});
