import { convertImageToPdf } from '#lib/pipelines/image-pdf';
import { serve } from '../serve';

serve({
	'jpg-to-pdf': convertImageToPdf,
	'image-to-pdf': convertImageToPdf
});
