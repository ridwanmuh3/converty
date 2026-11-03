import { extensionOf } from '#lib/core/format';
import { LIMITS, OUTPUT } from '#lib/core/limits';
import type { Converter } from '#lib/core/types';

const MIME: Record<string, string> = {
	png: 'image/png',
	jpeg: 'image/jpeg',
	webp: 'image/webp'
};

const EXT: Record<string, string> = { png: 'png', jpeg: 'jpg', webp: 'webp' };

const LABEL: Record<string, string> = { png: 'PNG', jpeg: 'JPEG', webp: 'WebP', heic: 'HEIC' };

export function throwIfAborted(signal: AbortSignal): void {
	if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
}

type Canvas = HTMLCanvasElement | OffscreenCanvas;

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
	try {
		// Honour EXIF orientation up front so a phone photo is not sideways.
		return await createImageBitmap(file, { imageOrientation: 'from-image' });
	} catch {
		const ext = extensionOf(file.name);
		if (ext === 'heic' || ext === 'heif') {
			// Kept out of this module on purpose: importing heic2any here would pull
			// its whole decoder into the worker bundle even though HEIC never runs there.
			throw new Error(`“${file.name}” needs the main-thread HEIC decoder.`);
		}
		if (typeof Image === 'undefined') {
			throw new Error(
				`“${file.name}” could not be decoded. The file may be damaged, or the format is not supported by this browser.`
			);
		}
		// Safari occasionally misses a format createImageBitmap supports elsewhere.
		const url = URL.createObjectURL(file);
		try {
			const image = new Image();
			image.decoding = 'async';
			image.src = url;
			await image.decode();
			return image;
		} catch {
			throw new Error(
				`“${file.name}” could not be decoded. The file may be damaged, or the format is not supported by this browser.`
			);
		} finally {
			setTimeout(() => URL.revokeObjectURL(url), 10_000);
		}
	}
}

function createCanvas(width: number, height: number): Canvas {
	if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	return canvas;
}

function toBlob(canvas: Canvas, mime: string, quality: number): Promise<Blob> {
	const options = mime === 'image/png' ? undefined : quality;
	if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: mime, quality: options });

	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => {
				if (!blob) {
					reject(new Error('The browser could not encode the image at this size. Try a smaller width.'));
					return;
				}
				if (blob.type !== mime) {
					reject(
						new Error(
							`This browser cannot write ${LABEL[mime.split('/')[1]] ?? mime} images. Choose PNG or JPEG instead.`
						)
					);
					return;
				}
				resolve(blob);
			},
			mime,
			options
		);
	});
}

export const convertImage: Converter = async (file, ctx) => {
	const format = ctx.options.format ?? 'png';
	const mime = MIME[format] ?? 'image/png';
	const quality = Math.min(1, Math.max(0.4, Number(ctx.options.quality ?? OUTPUT.jpegQuality)));
	const maxWidth = Number(ctx.options.maxWidth ?? 0);

	ctx.onProgress(0.08);
	throwIfAborted(ctx.signal);

	const source = await decode(file);
	ctx.onProgress(0.4);
	throwIfAborted(ctx.signal);

	let width = source.width;
	let height = source.height;
	if (maxWidth > 0 && width > maxWidth) {
		height = Math.round((height * maxWidth) / width);
		width = maxWidth;
	}

	if (width * height > LIMITS.maxCanvasPixels) {
		const scale = Math.sqrt(LIMITS.maxCanvasPixels / (width * height));
		width = Math.max(1, Math.floor(width * scale));
		height = Math.max(1, Math.floor(height * scale));
	}

	// Let the decoder do the downscale: createImageBitmap's resize is both
	// sharper and cheaper than stretching pixels through a canvas.
	let renderSource: ImageBitmap | HTMLImageElement = source;
	if (width !== source.width || height !== source.height) {
		try {
			renderSource = await createImageBitmap(source as CanvasImageSource, {
				resizeWidth: width,
				resizeHeight: height,
				resizeQuality: 'high'
			});
			if ('close' in source) source.close();
		} catch {
			renderSource = source;
		}
	}

	const canvas = createCanvas(width, height);
	const context = canvas.getContext('2d') as CanvasRenderingContext2D | null;
	if (!context) throw new Error('This browser blocked canvas rendering, so images cannot be converted.');

	if (mime === 'image/jpeg') {
		context.fillStyle = '#ffffff';
		context.fillRect(0, 0, width, height);
	}
	context.imageSmoothingEnabled = true;
	context.imageSmoothingQuality = 'high';
	context.drawImage(renderSource as CanvasImageSource, 0, 0, width, height);

	if ('close' in renderSource) renderSource.close();
	if ('close' in source) source.close();
	ctx.onProgress(0.75);

	const blob = await toBlob(canvas, mime, quality);
	ctx.onProgress(1);

	return { blob, ext: EXT[format] ?? 'png', meta: { width, height } };
};
