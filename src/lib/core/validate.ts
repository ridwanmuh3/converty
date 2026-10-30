import { extensionOf } from './format';
import { LIMITS } from './limits';
import type { ToolDef } from '#lib/tools/registry';

export type FileKind = 'pdf' | 'zip' | 'ole' | 'png' | 'jpeg' | 'webp' | 'gif' | 'bmp' | 'avif' | 'heic' | 'mp4' | 'csv' | 'wav' | 'mp3' | 'unknown';

const startsWith = (bytes: Uint8Array, signature: number[]) =>
	signature.every((value, index) => bytes[index] === value);

const ascii = (bytes: Uint8Array, start: number, length: number) =>
	String.fromCharCode(...bytes.slice(start, start + length));

export async function detectKind(file: File): Promise<FileKind> {
	const bytes = new Uint8Array(await file.slice(0, 32).arrayBuffer());
	const ext = extensionOf(file.name);

	if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return 'pdf'; // %PDF
	if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return 'zip'; // docx/xlsx are zips
	if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0])) return 'ole'; // legacy .doc/.xls
	if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return 'png';
	if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpeg';
	if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return 'gif';
	if (startsWith(bytes, [0x42, 0x4d])) return 'bmp';
	if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'webp';
	if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WAVE') return 'wav';
	if (ascii(bytes, 0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0 && (bytes[1] & 0x18) !== 0x08)) return 'mp3';
	if (ascii(bytes, 4, 4) === 'ftyp') {
		const brand = ascii(bytes, 8, 4);
		if (brand === 'avif' || brand === 'avis') return 'avif';
		if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) return 'heic';
		// MP4, M4A, M4V and QuickTime containers share the same box layout.
		if (['mp41', 'mp42', 'isom', 'iso2', 'iso4', 'iso5', 'avc1', 'M4V ', 'M4A ', 'M4B ', 'qt  ', 'dash'].includes(brand)) {
			return 'mp4';
		}
	}
	// CSV has no signature; trust the extension only when the file is plain text.
	if (ext === 'csv' && !bytes.includes(0)) return 'csv';

	return 'unknown';
}

const KIND_LABEL: Record<FileKind, string> = {
	pdf: 'PDF',
	zip: 'ZIP-based file',
	ole: 'legacy Office file',
	png: 'PNG image',
	jpeg: 'JPEG image',
	webp: 'WebP image',
	gif: 'GIF image',
	bmp: 'BMP image',
	avif: 'AVIF image',
	heic: 'HEIC image',
	mp4: 'MP4/MOV file',
	csv: 'CSV file',
	wav: 'WAV audio',
	mp3: 'MPEG audio',
	unknown: 'unknown file type'
};

/** Returns a human-readable reason, or null when the file is acceptable. */
export async function validateForTool(file: File, tool: ToolDef): Promise<string | null> {
	const ext = extensionOf(file.name);

	if (file.size === 0) return `“${file.name}” is empty (0 bytes).`;
	if (file.size > LIMITS.maxFileBytes) {
		return `“${file.name}” is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${
			LIMITS.maxFileBytes / 1024 / 1024
		} MB per file.`;
	}

	const kind = await detectKind(file);

	if (ext === 'doc' || (kind === 'ole' && tool.accept.includes('docx'))) {
		return `“${file.name}” is a legacy .doc file. Open it in Word and save as .docx first.`;
	}

	if (kind === 'unknown' && ext !== 'csv') {
		return `“${file.name}” doesn’t look like a ${tool.accept.map((e) => `.${e}`).join(' / ')} file.`;
	}
	if (ext === 'csv' && tool.accept.includes('csv')) return null;

	if (!tool.accept.includes(ext)) {
		return `“${file.name}” is ${KIND_LABEL[kind]}. This tool accepts ${tool.accept
			.map((e) => `.${e}`)
			.join(', ')}.`;
	}

	const expected: Record<string, FileKind[]> = {
		docx: ['zip'],
		xlsx: ['zip', 'ole'],
		xls: ['ole', 'zip'],
		pdf: ['pdf'],
		png: ['png'],
		jpg: ['jpeg'],
		jpeg: ['jpeg'],
		webp: ['webp'],
		gif: ['gif'],
		bmp: ['bmp'],
		avif: ['avif'],
		heic: ['heic'],
		heif: ['heic'],
		mp4: ['mp4'],
		m4v: ['mp4'],
		mov: ['mp4'],
		m4a: ['mp4'],
		wav: ['wav'],
		mp3: ['mp3'],
		mpeg: ['mp3']
	};
	const allowed = expected[ext];
	if (allowed && !allowed.includes(kind)) {
		return `“${file.name}” is named .${ext} but its contents are ${KIND_LABEL[kind]}. The file may be corrupt or mislabelled.`;
	}

	return null;
}
