import { convertCompressedImage } from '#lib/pipelines/compress-image';
import { convertImage } from '#lib/pipelines/image';
import { serve } from '../serve';

serve({
	'image-converter': convertImage,
	'compress-image': convertCompressedImage
});
