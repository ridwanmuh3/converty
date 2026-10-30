import type { Fidelity } from '#lib/core/types';

export type ToolIcon = 'image' | 'word' | 'excel' | 'pdf' | 'audio';
export type ToolCategory = 'audio' | 'image' | 'document';

export interface SelectChoice {
	value: string;
	label: string;
}

export interface ToolOption {
	key: string;
	label: string;
	type: 'select' | 'range';
	choices?: SelectChoice[];
	min?: number;
	max?: number;
	step?: number;
	defaultValue: string;
	hint?: string;
	/** Formats the range readout, e.g. "85%". */
	display?: 'percent' | 'pixels';
}

export interface ToolDef {
	slug: string;
	name: string;
	shortName: string;
	icon: ToolIcon;
	category: ToolCategory;
	tagline: string;
	description: string;
	fidelity: Fidelity;
	fidelityTitle: string;
	fidelityNote: string;
	accept: string[];
	acceptAttr: string;
	outputExt: string;
	outputLabel: string;
	limitations: string[];
	options: ToolOption[];
	/** Locked inputs for a preset route (e.g. HEIC→JPG forces JPEG output). */
	fixedOptions?: Record<string, string>;
}

export const TOOLS: ToolDef[] = [
	{
		slug: 'audio-converter',
		name: 'Audio Converter',
		shortName: 'Audio',
		icon: 'audio',
		category: 'audio',
		tagline: 'MP3, WAV and MPEG audio — convert locally.',
		description: 'Convert MP3, MPEG audio and WAV files to MP3 or WAV, entirely in your browser.',
		fidelity: 'fair',
		fidelityTitle: 'Re-encoded audio',
		fidelityNote: 'WAV output is uncompressed PCM. MP3 output is re-encoded at 128 kbps; converting MP3 to MP3 loses quality. Metadata is not retained.',
		accept: ['mp3', 'wav', 'mpeg'],
		acceptAttr: '.mp3,.wav,.mpeg,audio/mpeg,audio/wav',
		outputExt: 'mp3',
		outputLabel: 'MP3 or WAV',
		limitations: [
			'MPEG video files are not supported — .mpeg must contain MPEG audio.',
			'Audio decoding depends on your browser. Stereo and mono only.',
			'Large WAV outputs may exceed memory; choose MP3 instead.'
		],
		options: [{
			key: 'format', label: 'Output format', type: 'select',
			choices: [{ value: 'mp3', label: 'MP3 — 128 kbps' }, { value: 'wav', label: 'WAV — uncompressed PCM' }],
			defaultValue: 'mp3'
		}]
	},
	{
		slug: 'image-converter',
		name: 'Image Converter',
		shortName: 'Images',
		icon: 'image',
		category: 'image',
		tagline: 'PNG, JPEG and WebP — plus iPhone HEIC.',
		description:
			'Convert images between PNG, JPEG and WebP. Resize them, pick the quality, and know that the pixels never left your device.',
		fidelity: 'good',
		fidelityTitle: 'Re-encoded images',
		fidelityNote:
			'PNG output uses lossless encoding but cannot restore detail lost in a source file. JPEG and WebP are re-encoded; animated GIFs keep only their first frame.',
		accept: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif', 'heic', 'heif'],
		acceptAttr:
			'image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif,image/heic,image/heif,.heic,.heif',
		outputExt: 'png',
		outputLabel: 'PNG, JPEG or WebP',
		limitations: [
			'Animated GIFs lose their animation — only the first frame is converted.',
			'HEIC and AVIF can be read, but browsers cannot write them, so they are input-only.',
			'Images above 16.7 megapixels are scaled down to fit the browser’s canvas limit.',
			'EXIF metadata such as camera and GPS data is not carried over.'
		],
		options: [
			{
				key: 'format',
				label: 'Output format',
				type: 'select',
				choices: [
					{ value: 'png', label: 'PNG — lossless, larger' },
					{ value: 'jpeg', label: 'JPEG — small, photographic' },
					{ value: 'webp', label: 'WebP — small, modern' }
				],
				defaultValue: 'png'
			},
			{
				key: 'quality',
				label: 'Quality',
				type: 'range',
				min: 0.5,
				max: 1,
				step: 0.05,
				defaultValue: '0.9',
				display: 'percent',
				hint: 'Applies to JPEG and WebP only.'
			},
			{
				key: 'maxWidth',
				label: 'Maximum width',
				type: 'select',
				choices: [
					{ value: '0', label: 'Original size' },
					{ value: '3840', label: '3840 px (4K)' },
					{ value: '1920', label: '1920 px (Full HD)' },
					{ value: '1280', label: '1280 px (web)' }
				],
				defaultValue: '0',
				hint: 'Images are never enlarged.'
			}
		]
	},
	{
		slug: 'word-to-pdf',
		name: 'Word to PDF',
		shortName: 'Word → PDF',
		icon: 'word',
		category: 'document',
		tagline: 'DOCX to a clean, text-based PDF.',
		description:
			'Turn .docx documents into PDFs with real, selectable text. Headings, paragraphs, lists and tables are re-laid-out for the page.',
		fidelity: 'fair',
		fidelityTitle: 'Faithful, not identical',
		fidelityNote:
			'Page size and common text formatting are reconstructed from the document. Complex layouts, fonts, headers and footers may differ; check the PDF before sharing.',
		accept: ['docx'],
		acceptAttr: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		outputExt: 'pdf',
		outputLabel: 'PDF',
		limitations: [
			'Latin text only. Documents written in Chinese, Japanese, Korean or Arabic script are rejected rather than silently mangled.',
			'Legacy .doc files must be saved as .docx first.',
			'Columns, text boxes, footnotes and tracked changes are not laid out.'
		],
		options: [
			{
				key: 'pageSize',
				label: 'Page size',
				type: 'select',
				choices: [
					{ value: 'match', label: 'Match the document' },
					{ value: 'a4', label: 'Force A4 — 210 × 297 mm' },
					{ value: 'letter', label: 'Force Letter — 8.5 × 11 in' }
				],
				defaultValue: 'match',
				hint: 'Uses the page size and margins stored in the file.'
			}
		]
	},
	{
		slug: 'excel-to-pdf',
		name: 'Excel to PDF',
		shortName: 'Excel → PDF',
		icon: 'excel',
		category: 'document',
		tagline: 'Spreadsheets to printable tables.',
		description:
			'Convert .xlsx, .xls and .csv workbooks into PDFs — one table per sheet, with headers repeated across page breaks.',
		fidelity: 'fair',
		fidelityTitle: 'Good for tables',
		fidelityNote:
			'Cell values and basic grid formatting are kept, and wide sheets are fitted to the page. Charts, images, cell fills and defined print areas are lost — this renders the data, not the workbook.',
		accept: ['xlsx', 'xls', 'csv'],
		acceptAttr: '.xlsx,.xls,.csv',
		outputExt: 'pdf',
		outputLabel: 'PDF',
		limitations: [
			'Charts and embedded images are not rendered.',
			'Formulas are exported as their last calculated value.',
			'Sheets with more than 30 columns are scaled down and may be hard to read.'
		],
		options: [
			{
				key: 'orientation',
				label: 'Orientation',
				type: 'select',
				choices: [
					{ value: 'auto', label: 'Auto — landscape for wide sheets' },
					{ value: 'portrait', label: 'Portrait' },
					{ value: 'landscape', label: 'Landscape' }
				],
				defaultValue: 'auto'
			}
		]
	},
	{
		slug: 'pdf-to-word',
		name: 'PDF to Word',
		shortName: 'PDF → Word',
		icon: 'pdf',
		category: 'document',
		tagline: 'Editable text from a PDF, as .docx.',
		description:
			'Extract the text layer from each page and rebuild it into paragraphs you can edit in Word, Google Docs or LibreOffice.',
		fidelity: 'fair',
		fidelityTitle: 'Text first, layout second',
		fidelityNote:
			'Text, headings and some aligned tables are rebuilt from the text layer. Reading order and layout may differ. Images, form fields and exact fonts are not preserved; scans need OCR.',
		accept: ['pdf'],
		acceptAttr: '.pdf,application/pdf',
		outputExt: 'docx',
		outputLabel: 'DOCX',
		limitations: [
			'Scanned or image-only PDFs cannot be converted without OCR.',
			'Only repeated, aligned text columns can become editable Word tables; other layouts may become paragraphs.',
			'Password-protected PDFs cannot be opened in the browser.'
		],
		options: []
	},
	{
		slug: 'mp3-converter',
		name: 'MP3 Converter',
		shortName: 'MP3',
		icon: 'audio',
		category: 'audio',
		tagline: 'WAV and MPEG audio to MP3.',
		description: 'Convert WAV, MPEG audio and M4A files to MP3 at 128 kbps, entirely in your browser.',
		fidelity: 'fair',
		fidelityTitle: 'Re-encoded at 128 kbps',
		fidelityNote: 'MP3 output is re-encoded at 128 kbps. Converting an existing MP3 again loses quality; metadata is not retained.',
		accept: ['mp3', 'wav', 'm4a', 'mpeg'],
		acceptAttr: '.mp3,.wav,.m4a,.mpeg,audio/mpeg,audio/wav,audio/mp4',
		outputExt: 'mp3',
		outputLabel: 'MP3',
		limitations: [
			'Output is always MP3 at 128 kbps — use the Audio Converter to choose WAV.',
			'Audio is limited to 10 minutes and 200 MB decoded.',
			'M4A input depends on the browser’s AAC decoder.'
		],
		options: []
	},
	{
		slug: 'mp4-to-mp3',
		name: 'MP4 to MP3',
		shortName: 'MP4 → MP3',
		icon: 'audio',
		category: 'audio',
		tagline: 'Pull the audio out of an MP4 or MOV.',
		description: 'Extract the audio track from an MP4 or MOV file and save it as MP3, without uploading the video.',
		fidelity: 'fair',
		fidelityTitle: 'Audio only, re-encoded',
		fidelityNote: 'Video is discarded. The audio track is decoded and re-encoded at 128 kbps; metadata and multi-channel audio are not preserved.',
		accept: ['mp4', 'm4v', 'mov', 'm4a'],
		acceptAttr: '.mp4,.m4v,.mov,.m4a,video/mp4,video/quicktime,audio/mp4',
		outputExt: 'mp3',
		outputLabel: 'MP3',
		limitations: [
			'Only the audio track is used — there is no video output.',
			'This browser must support decoding the audio codec (WebCodecs). Chrome, Edge and recent Safari work; AAC may be unavailable in some Firefox builds.',
			'Clips are limited to 25 MB and 30 minutes.'
		],
		options: []
	},
	{
		slug: 'video-to-mp3',
		name: 'Video to MP3',
		shortName: 'Video → MP3',
		icon: 'audio',
		category: 'audio',
		tagline: 'Audio from MP4, M4V and MOV clips.',
		description: 'Turn the audio of an MP4, M4V or MOV clip into MP3. The video never leaves your device and is not re-encoded.',
		fidelity: 'fair',
		fidelityTitle: 'Audio only, re-encoded',
		fidelityNote: 'The video stream is dropped without decoding it. Audio is re-encoded at 128 kbps, so quality is not bit-identical; metadata is not kept.',
		accept: ['mp4', 'm4v', 'mov'],
		acceptAttr: '.mp4,.m4v,.mov,video/mp4,video/quicktime',
		outputExt: 'mp3',
		outputLabel: 'MP3',
		limitations: [
			'MP4/MOV containers only — WebM and OGG video are not supported.',
			'The browser must decode the clip’s audio codec; otherwise the file is refused with an explanation.',
			'Clips are limited to 25 MB and 30 minutes.'
		],
		options: []
	},
	{
		slug: 'jpg-to-pdf',
		name: 'JPG to PDF',
		shortName: 'JPG → PDF',
		icon: 'image',
		category: 'image',
		tagline: 'One JPEG, one clean PDF page.',
		description: 'Wrap a JPEG in a PDF page sized to A4 or Letter, or matched to the image. The picture is embedded, not re-compressed.',
		fidelity: 'good',
		fidelityTitle: 'Image embedded as-is',
		fidelityNote: 'The original JPEG bytes are embedded, so image quality is unchanged. Each file becomes its own PDF; a batch downloads as a ZIP.',
		accept: ['jpg', 'jpeg'],
		acceptAttr: '.jpg,.jpeg,image/jpeg',
		outputExt: 'pdf',
		outputLabel: 'PDF',
		limitations: [
			'Each image becomes a separate PDF — use Image to PDF for multi-page output per file.',
			'PDF page size is fixed at conversion time; margins are 24 pt on A4 and Letter.',
			'EXIF orientation stored by cameras is not applied.'
		],
		options: [
			{
				key: 'pageSize',
				label: 'Page size',
				type: 'select',
				choices: [
					{ value: 'a4', label: 'A4 — 210 × 297 mm' },
					{ value: 'letter', label: 'Letter — 8.5 × 11 in' },
					{ value: 'fit', label: 'Fit the image' }
				],
				defaultValue: 'a4'
			}
		]
	},
	{
		slug: 'image-to-pdf',
		name: 'Image to PDF',
		shortName: 'Image → PDF',
		icon: 'image',
		category: 'image',
		tagline: 'PNG, JPEG and WebP to PDF.',
		description: 'Embed PNG, JPEG, WebP, GIF or BMP images in a PDF page, with transparency preserved where the format allows it.',
		fidelity: 'good',
		fidelityTitle: 'Image embedded',
		fidelityNote: 'JPEG and PNG are embedded directly; WebP, GIF and BMP are converted to PNG first. One PDF per image, ZIP for a batch.',
		accept: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'],
		acceptAttr: '.png,.jpg,.jpeg,.webp,.gif,.bmp,image/png,image/jpeg,image/webp,image/gif,image/bmp',
		outputExt: 'pdf',
		outputLabel: 'PDF',
		limitations: [
			'Each image becomes a separate PDF; combining several images into one file is not supported yet.',
			'GIF is embedded as its first frame only.',
			'Very large images are kept at their pixel size, so the PDF can be large.'
		],
		options: [
			{
				key: 'pageSize',
				label: 'Page size',
				type: 'select',
				choices: [
					{ value: 'a4', label: 'A4 — 210 × 297 mm' },
					{ value: 'letter', label: 'Letter — 8.5 × 11 in' },
					{ value: 'fit', label: 'Fit the image' }
				],
				defaultValue: 'a4'
			}
		]
	},
	{
		slug: 'pdf-to-jpg',
		name: 'PDF to JPG',
		shortName: 'PDF → JPG',
		icon: 'pdf',
		category: 'image',
		tagline: 'Each page as a JPEG image.',
		description: 'Render every page of a PDF to a JPEG. One page returns a JPG; longer documents return a ZIP of numbered pages.',
		fidelity: 'good',
		fidelityTitle: 'Rendered pages',
		fidelityNote: 'Pages are rasterised at 72 dpi (or 144 dpi), so text becomes pixels. Rendering happens on an offscreen canvas without freezing the page.',
		accept: ['pdf'],
		acceptAttr: '.pdf,application/pdf',
		outputExt: 'jpg',
		outputLabel: 'JPG',
		limitations: [
			'Text is no longer selectable — this is an image export, not a text extraction.',
			'60 pages maximum; longer documents are refused rather than silently truncated.',
			'Password-protected PDFs cannot be opened in the browser.'
		],
		options: [
			{
				key: 'scale',
				label: 'Resolution',
				type: 'select',
				choices: [
					{ value: '1', label: 'Standard — 72 dpi' },
					{ value: '2', label: 'High — 144 dpi' }
				],
				defaultValue: '1'
			}
		]
	},
	{
		slug: 'heic-to-jpg',
		name: 'HEIC to JPG',
		shortName: 'HEIC → JPG',
		icon: 'image',
		category: 'image',
		tagline: 'iPhone photos into a format everything opens.',
		description: 'Convert HEIC and HEIF photos from an iPhone or iPad into JPEG, without uploading them.',
		fidelity: 'fair',
		fidelityTitle: 'Re-encoded JPEG',
		fidelityNote: 'The HEIC image is decoded and re-encoded as JPEG at 90% quality. Metadata such as camera, location and depth data is not carried over.',
		accept: ['heic', 'heif'],
		acceptAttr: '.heic,.heif,image/heic,image/heif',
		outputExt: 'jpg',
		outputLabel: 'JPG',
		limitations: [
			'Decoding uses a WebAssembly HEIC decoder on the main thread, so large photos can take a moment.',
			'Live Photos and multi-image HEIC files convert the primary image only.',
			'EXIF orientation and location data are dropped.'
		],
		fixedOptions: { format: 'jpeg', quality: '0.9' },
		options: []
	}
];

export function getTool(slug: string): ToolDef | undefined {
	return TOOLS.find((tool) => tool.slug === slug);
}

export const FIDELITY_LABEL: Record<Fidelity, string> = {
	good: 'Good',
	fair: 'Fair'
};

export const FIDELITY_BADGE: Record<Fidelity, string> = {
	good: 'badge-success',
	fair: 'badge-info'
};
