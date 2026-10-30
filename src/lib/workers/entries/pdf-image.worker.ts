import { convertPdfToJpg } from '#lib/pipelines/pdf-to-image';
import { serve } from '../serve';

serve({
	'pdf-to-jpg': convertPdfToJpg
});
