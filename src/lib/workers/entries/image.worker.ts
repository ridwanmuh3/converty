import { convertImage } from '#lib/pipelines/image';
import { serve } from '../serve';

serve({
	'image-converter': convertImage
});
