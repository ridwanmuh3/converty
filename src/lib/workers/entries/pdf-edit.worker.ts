import { convertSplitPdf } from '#lib/pipelines/split-pdf';
import { convertInspectPdf } from '#lib/pipelines/merge-pdf';
import { serve } from '../serve';

serve({
	'merge-pdf': convertInspectPdf,
	'split-pdf': convertSplitPdf
});
