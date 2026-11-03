import { extensionOf } from '#lib/core/format';
import type { Converter } from '#lib/core/types';
import { getTool, TOOLS } from '#lib/tools';

/**
 * Slugs whose pipeline is safe to run inside the conversion worker,
 * derived dynamically from the tool manifests.
 */
export const WORKER_SLUGS = new Set(
	TOOLS.filter((tool) => tool.worker !== null).map((tool) => tool.slug)
);

export async function loadConverter(slug: string): Promise<Converter> {
	const tool = getTool(slug);
	if (!tool) throw new Error(`Unknown tool: ${slug}`);

	switch (tool.pipeline) {
		case 'image': {
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
		case 'heic':
			return (await import('./heic')).convertHeic;
		case 'image-pdf':
			return (await import('./image-pdf')).convertImageToPdf;
		case 'pdf-to-image':
			return (await import('./pdf-to-image')).convertPdfToJpg;
		case 'video-to-audio':
			return (await import('./video-to-audio')).convertVideoToMp3;
		case 'docx-to-pdf':
			return (await import('./docx-to-pdf')).convertDocxToPdf;
		case 'xlsx-to-pdf':
			return (await import('./xlsx-to-pdf')).convertXlsxToPdf;
		case 'pdf-to-docx':
			return (await import('./pdf-to-docx')).convertPdfToDocx;
		case 'audio':
			return (await import('./audio')).convertAudio;
		case 'compress-image':
			return (await import('./compress-image')).convertCompressedImage;
		case 'merge-pdf':
			return (await import('./merge-pdf')).convertInspectPdf;
		case 'split-pdf':
			return (await import('./split-pdf')).convertSplitPdf;
		default:
			throw new Error(`Unknown pipeline for tool: ${slug}`);
	}
}
