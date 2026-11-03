import { MAX_CANVAS_MEGAPIXELS, OUTPUT } from '#lib/core/limits';
import { defineTool } from '../define';

export default defineTool({
	slug: 'image-converter',
	name: 'Image Converter',
	shortName: 'Images',
	icon: 'image',
	category: 'image',
	input: {
		extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif', 'heic', 'heif'],
		kinds: ['png', 'jpeg', 'webp', 'gif', 'bmp', 'avif', 'heic'],
		acceptAttr:
			'image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif,image/heic,image/heif,.heic,.heif'
	},
	output: {
		ext: 'png',
		mime: 'image/png',
		label: 'PNG, JPEG or WebP'
	},
	pipeline: 'image',
	worker: 'image',
	memoryWeight: 1,
	arity: 'single',
	copy: {
		tagline: 'PNG, JPEG and WebP — plus iPhone HEIC.',
		description:
			'Convert images between PNG, JPEG and WebP. Resize them, pick the quality, and know that the pixels never left your device.',
		fidelity: 'good',
		fidelityTitle: 'Re-encoded images',
		fidelityNote:
			'PNG output uses lossless encoding but cannot restore detail lost in a source file. JPEG and WebP are re-encoded; animated GIFs keep only their first frame.',
		limitations: [
			'Animated GIFs lose their animation — only the first frame is converted.',
			'HEIC and AVIF can be read, but browsers cannot write them, so they are input-only.',
			`Images above ${MAX_CANVAS_MEGAPIXELS} megapixels are scaled down, because that is the largest size a browser can decode in one piece.`,
			'EXIF metadata such as camera and GPS data is not carried over.'
		]
	},
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
			defaultValue: String(OUTPUT.jpegQuality),
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
});
