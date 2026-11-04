import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
import { setPendingHandoff } from './handoff.svelte';
import { extensionOf } from './format';
import { LIMITS } from './limits';
import { detectKind, type FileKind } from './validate';
import { outputChoicesFor, TOOLS, type OutputChoice } from '#lib/tools';

/** A file the universal entry could not route, with the nearest valid action. */
export interface DropNotice {
	message: string;
	suggestion?: string;
}

export interface FileGroup {
	kind: FileKind;
	label: string;
	files: File[];
	choices: OutputChoice[];
}

export interface DropAnalysis {
	groups: FileGroup[];
	notices: DropNotice[];
}

const KIND_LABEL: Record<FileKind, string> = {
	png: 'PNG images',
	jpeg: 'JPEG images',
	webp: 'WebP images',
	gif: 'GIF images',
	bmp: 'BMP images',
	avif: 'AVIF images',
	heic: 'iPhone HEIC photos',
	pdf: 'PDF documents',
	zip: 'Word / Excel documents',
	ole: 'Legacy Office documents',
	csv: 'CSV spreadsheets',
	mp4: 'MP4 videos',
	mp3: 'MP3 audio',
	wav: 'WAV audio',
	unknown: 'Unsupported files'
};

const mb = (bytes: number): string => (bytes / 1024 / 1024).toFixed(1);

const IMAGE_KINDS = new Set<FileKind>(['png', 'jpeg', 'webp', 'gif', 'bmp', 'avif', 'heic']);

/**
 * Inspects dropped files without touching the network or any storage.
 *
 * Files are grouped by the tools that can convert them, so a mixed drop of
 * PNGs and JPEGs stays one batch while a .docx and a .xlsx split into two
 * groups. Nothing is discarded silently: every refused file returns a notice.
 */
export async function analyzeDrop(files: File[]): Promise<DropAnalysis> {
	const notices: DropNotice[] = [];
	const byKey = new Map<string, FileGroup>();

	for (const file of files) {
		if (file.size === 0) {
			notices.push({ message: `“${file.name}” is empty (0 bytes).` });
			continue;
		}
		if (file.size > LIMITS.maxFileBytes) {
			notices.push({
				message: `“${file.name}” is ${mb(file.size)} MB. Files are limited to ${mb(LIMITS.maxFileBytes)} MB each so processing stays within browser memory.`,
				suggestion: 'Compress or split large files before converting locally.'
			});
			continue;
		}

		const kind = await detectKind(file);
		const ext = extensionOf(file.name);

		if (ext === 'doc') {
			notices.push({
				message: `“${file.name}” is a legacy .doc file.`,
				suggestion: 'Open it in Word and save as .docx first.'
			});
			continue;
		}

		const choices = outputChoicesFor(kind, ext, TOOLS);
		if (choices.length === 0) {
			notices.push({
				message: `“${file.name}” is not recognized or not currently supported for local conversion.`,
				suggestion: 'Check the supported formats in the catalog below.'
			});
			continue;
		}

		const key = choices.map((choice) => choice.tool.slug).join('|');
		let group = byKey.get(key);
		if (!group) {
			group = { kind, label: KIND_LABEL[kind], files: [], choices };
			byKey.set(key, group);
		} else if (group.kind !== kind) {
			group.label =
				IMAGE_KINDS.has(group.kind) && IMAGE_KINDS.has(kind) ? 'Images' : 'Files';
		}
		group.files.push(file);
	}

	// A many-to-one tool cannot produce anything from fewer files than it needs,
	// so do not offer a dead end in the chooser (e.g. Merge PDF for one PDF).
	const groups: FileGroup[] = [];
	for (const group of byKey.values()) {
		group.choices = group.choices.filter(
			(choice) => choice.tool.minFiles <= group.files.length
		);
		if (group.choices.length === 0) {
			notices.push({
				message: `The available converters for ${group.label.toLowerCase()} need more files than this drop contains.`,
				suggestion: 'Open a converter from the catalog below and add the remaining files there.'
			});
			continue;
		}
		groups.push(group);
	}

	return { groups, notices };
}

function basePath(): string {
	const root = resolve('/');
	return root.endsWith('/') ? root.slice(0, -1) : root;
}

/**
 * Hands files to a tool page. The handoff lives in module memory only, so it
 * survives client-side navigation and disappears on reload.
 */
export function openInTool(
	choice: OutputChoice,
	files: File[],
	notices: DropNotice[] = []
): Promise<void> {
	setPendingHandoff({
		files,
		targetToolSlug: choice.tool.slug,
		preselectedOptions: choice.options,
		notices
	});
	return goto(`${basePath()}/${choice.tool.slug}`);
}

/**
 * True when one tool can accept every file in the drop, so a global drop can
 * be added to the page the visitor is already on instead of navigating away.
 */
export function toolAcceptsAll(tool: { input: { extensions: string[] } }, files: File[]): boolean {
	return files.every((file) => {
		if (file.size === 0 || file.size > LIMITS.maxFileBytes) return false;
		return tool.input.extensions.includes(extensionOf(file.name));
	});
}
