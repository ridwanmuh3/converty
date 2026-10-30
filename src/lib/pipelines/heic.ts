import { LIMITS } from '#lib/core/limits';
import type { Converter } from '#lib/core/types';

/**
 * HEIC is decoded with heic2any, which needs a DOM canvas. The client keeps
 * HEIC on the main thread, so this module is never bundled into the worker.
 */
export const convertHeic: Converter = async (file, ctx) => {
	const format = ctx.options.format === 'png' ? 'png' : 'jpeg';
	const mime = format === 'png' ? 'image/png' : 'image/jpeg';

	ctx.onProgress(0.1);
	const heic2any = (await import('heic2any')).default;
	let source: Blob;
	try {
		const converted = await heic2any({ blob: file, toType: 'image/png' });
		source = (Array.isArray(converted) ? converted[0] : converted) as Blob;
	} catch {
		throw new Error(
			`“${file.name}” could not be decoded as HEIC. The file may be damaged, or it is not a HEIC photo.`
		);
	}

	ctx.onProgress(0.55);
	const bitmap = await createImageBitmap(source);
	let width = bitmap.width;
	let height = bitmap.height;
	if (width * height > LIMITS.maxCanvasPixels) {
		const scale = Math.sqrt(LIMITS.maxCanvasPixels / (width * height));
		width = Math.max(1, Math.floor(width * scale));
		height = Math.max(1, Math.floor(height * scale));
	}

	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext('2d');
	if (!context) throw new Error('This browser blocked canvas rendering, so HEIC photos cannot be converted.');

	if (format === 'jpeg') {
		context.fillStyle = '#ffffff';
		context.fillRect(0, 0, width, height);
	}
	context.imageSmoothingEnabled = true;
	context.imageSmoothingQuality = 'high';
	context.drawImage(bitmap, 0, 0, width, height);
	bitmap.close();

	const quality = Math.min(1, Math.max(0.4, Number(ctx.options.quality ?? 0.9)));
	const blob = await new Promise<Blob>((resolve, reject) => {
		canvas.toBlob(
			(result) => (result ? resolve(result) : reject(new Error('The browser could not encode the photo.'))),
			mime,
			format === 'jpeg' ? quality : undefined
		);
	});

	ctx.onProgress(1);
	return { blob, ext: format === 'png' ? 'png' : 'jpg' };
};
