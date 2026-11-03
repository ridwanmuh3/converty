import { convertPdfToDocx } from '#lib/pipelines/pdf-to-docx';
import { convertXlsxToPdf } from '#lib/pipelines/xlsx-to-pdf';
import { serve } from '../serve';

serve({
	'pdf-to-word': convertPdfToDocx,
	'excel-to-pdf': convertXlsxToPdf
});
