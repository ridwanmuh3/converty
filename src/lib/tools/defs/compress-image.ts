import { MAX_CANVAS_MEGAPIXELS } from '#lib/core/limits';
import { defineTool } from '../define';

export default defineTool({
	slug: 'compress-image',
	name: 'Compress Image',
	shortName: 'Compress',
	icon: 'image',
	category: 'image',
	input: {
		extensions: ['png', 'jpg', 'jpeg', 'webp'],
		kinds: ['png', 'jpeg', 'webp'],
		acceptAttr: '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp'
	},
	output: {
		ext: 'jpg',
		mime: 'image/jpeg',
		label: 'JPEG or WebP'
	},
	pipeline: 'compress-image',
	worker: 'image',
	memoryWeight: 1,
	arity: 'single',
	copy: {
		tagline: 'Smaller files, same picture.',
		description:
			'Re-encode an image at a lower quality or a smaller width. Dimensions stay the same unless you ask for a smaller width.',
		fidelity: 'good',
		fidelityTitle: 'Re-encoded image',
		fidelityNote:
			'Compression is lossy: pixels change slightly, and only the chosen quality and width are kept. The picture is never enlarged.',
		limitations: [
			'There is no exact target-size mode — pick a preset and check the result.',
			'PNG input becomes JPEG or WebP; transparency is lost with JPEG.',
			'EXIF metadata such as camera and GPS data is not carried over.'
		]
	},
	options: [
		{
			key: 'preset',
			label: 'Compression',
			type: 'select',
			choices: [
				{ value: 'high', label: 'High quality — 90%' },
				{ value: 'balanced', label: 'Balanced — 80%' },
				{ value: 'small', label: 'Smaller — 65%' },
				{ value: 'smallest', label: 'Smallest — 50%' }
			],
			defaultValue: 'balanced'
		},
		{
			key: 'format',
			label: 'Output format',
			type: 'select',
			choices: [
				{ value: 'jpeg', label: 'JPEG — widest support' },
				{ value: 'webp', label: 'WebP — smaller, modern' }
			],
			defaultValue: 'jpeg'
		},
		{
			key: 'maxWidth',
			label: 'Maximum width',
			type: 'select',
			choices: [
				{ value: '0', label: 'Keep dimensions' },
				{ value: '1920', label: '1920 px (Full HD)' },
				{ value: '1280', label: '1280 px (web)' },
				{ value: '800', label: '800 px (thumbnail)' }
			],
			defaultValue: '0',
			hint: `Images are never enlarged, and stay under ${MAX_CANVAS_MEGAPIXELS} megapixels.`
		}
	]
});
