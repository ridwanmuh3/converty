import type { Converter } from '#lib/core/types';
import { convertImage } from './image';

/** Presets are the only quality control, so the slider interface stays small. */
const QUALITY: Record<string, number> = {
	high: 0.9,
	balanced: 0.8,
	small: 0.65,
	smallest: 0.5
};

/**
 * Compression is the image pipeline with a preset mapped onto quality, so there
 * is one encoder to test and no second implementation to drift.
 */
export const convertCompressedImage: Converter = (file, ctx) => {
	const preset = ctx.options.preset ?? 'balanced';
	return convertImage(file, {
		...ctx,
		options: {
			...ctx.options,
			format: ctx.options.format ?? 'jpeg',
			quality: String(QUALITY[preset] ?? QUALITY.balanced)
		}
	});
};
