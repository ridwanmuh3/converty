import { LIMITS, OUTPUT } from '#lib/core/limits';
import { defineTool } from '../define';

export default defineTool({
	slug: 'image-to-pdf',
	name: 'Image to PDF',
	shortName: 'Image → PDF',
	icon: 'image',
	category: 'image',
	input: {
		extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'],
		kinds: ['png', 'jpeg', 'webp', 'gif', 'bmp'],
		acceptAttr: '.png,.jpg,.jpeg,.webp,.gif,.bmp,image/png,image/jpeg,image/webp,image/gif,image/bmp'
	},
	output: {
		ext: 'pdf',
		mime: 'application/pdf',
		label: 'PDF'
	},
	pipeline: 'image-pdf',
	worker: 'image-pdf',
	memoryWeight: 1,
	arity: 'many-to-one',
	finalizer: 'combine-images',
	copy: {
		tagline: 'Images into one PDF, in the order you list them.',
		description:
			'Combine PNG, JPEG, WebP, GIF or BMP images into a single PDF, or get one PDF per image. Page order follows the list.',
		fidelity: 'good',
		fidelityTitle: 'Images embedded',
		fidelityNote: `JPEG and PNG are embedded directly; WebP, GIF and BMP are converted to PNG first. Pages use ${OUTPUT.pdfMarginPt} pt margins and turn landscape when the image is wider than it is tall.`,
		limitations: [
			'GIF is embedded as its first frame only.',
			'Very large images keep their pixel size, so the PDF can be large.',
			'Drag rows (or use the arrows) to set page order before converting.'
		]
	},
	options: [
		{
			key: 'mode',
			label: 'Output',
			type: 'select',
			choices: [
				{ value: 'combined', label: 'One combined PDF' },
				{ value: 'single', label: 'One PDF per image' }
			],
			defaultValue: 'combined',
			hint: 'In combined mode the list order is the page order.'
		},
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
