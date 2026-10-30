import { extensionOf } from '#lib/core/format';
import type { Converter } from '#lib/core/types';

/**
 * Slugs whose pipeline is safe to run inside the conversion worker. Everything
 * else (DOCX/XLSX→PDF via jsPDF, HEIC via heic2any, audio decode via
 * AudioContext) keeps the existing main-thread path.
 */
export const WORKER_SLUGS = new Set([
	'image-converter',
	'jpg-to-pdf',
	'image-to-pdf',
	'pdf-to-jpg',
	'mp4-to-mp3',
	'video-to-mp3'
]);

export async function loadConverter(slug: string): Promise<Converter> {
	switch (slug) {
		case 'image-converter': {
			// HEIC needs the DOM decoder; everything else uses the worker-safe path.
			const [{ convertImage }, { convertHeic }] = await Promise.all([
				import('./image'),
				import('./heic')
			]);
			return (file, ctx) => {
				const ext = extensionOf(file.name);
				return ext === 'heic' || ext === 'heif'
					? convertHeic(file, ctx)
					: convertImage(file, ctx);
			};
		}
		case 'heic-to-jpg':
			return (await import('./heic')).convertHeic;
		case 'jpg-to-pdf':
		case 'image-to-pdf':
			return (await import('./image-pdf')).convertImageToPdf;
		case 'pdf-to-jpg':
			return (await import('./pdf-to-image')).convertPdfToJpg;
		case 'mp4-to-mp3':
		case 'video-to-mp3':
			return (await import('./video-to-audio')).convertVideoToMp3;
		case 'word-to-pdf':
			return (await import('./docx-to-pdf')).convertDocxToPdf;
		case 'excel-to-pdf':
			return (await import('./xlsx-to-pdf')).convertXlsxToPdf;
		case 'pdf-to-word':
			return (await import('./pdf-to-docx')).convertPdfToDocx;
		case 'audio-converter':
		case 'mp3-converter':
			return (await import('./audio')).convertAudio;
		default:
			throw new Error(`Unknown tool: ${slug}`);
	}
}
