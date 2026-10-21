import type { Converter } from '#lib/core/types';

export async function loadConverter(slug: string): Promise<Converter> {
	switch (slug) {
		case 'image-converter':
			return (await import('./image')).convertImage;
		case 'word-to-pdf':
			return (await import('./docx-to-pdf')).convertDocxToPdf;
		case 'excel-to-pdf':
			return (await import('./xlsx-to-pdf')).convertXlsxToPdf;
		case 'pdf-to-word':
			return (await import('./pdf-to-docx')).convertPdfToDocx;
		case 'pdf-to-excel':
			return (await import('./pdf-to-xlsx')).convertPdfToXlsx;
		default:
			throw new Error(`Unknown tool: ${slug}`);
	}
}
