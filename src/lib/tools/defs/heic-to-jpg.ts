import { OUTPUT } from '#lib/core/limits';
import { defineTool } from '../define';

export default defineTool({
	slug: 'heic-to-jpg',
	name: 'HEIC to JPG',
	shortName: 'HEIC → JPG',
	icon: 'image',
	category: 'image',
	input: {
		extensions: ['heic', 'heif'],
		kinds: ['heic'],
		acceptAttr: '.heic,.heif,image/heic,image/heif'
	},
	output: {
		ext: 'jpg',
		mime: 'image/jpeg',
		label: 'JPG'
	},
	pipeline: 'heic',
	worker: 'image',
	memoryWeight: 1,
	arity: 'single',
	fixedOptions: { format: 'jpeg', quality: String(OUTPUT.jpegQuality) },
	copy: {
		tagline: 'iPhone photos into a format everything opens.',
		description: 'Convert HEIC and HEIF photos from an iPhone or iPad into JPEG, without uploading them.',
		fidelity: 'fair',
		fidelityTitle: 'Re-encoded JPEG',
		fidelityNote: `The HEIC image is decoded and re-encoded as JPEG at ${Math.round(OUTPUT.jpegQuality * 100)}% quality. Metadata such as camera, location and depth data is not carried over.`,
		limitations: [
			'Large HEIC photos can take a moment to decode, and the tab may feel busy until it finishes.',
			'Live Photos and multi-image HEIC files convert the primary image only.',
			'EXIF orientation and location data are dropped.'
		]
	},
	options: []
});
