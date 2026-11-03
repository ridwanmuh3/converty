import type { ToolDef, ToolDefInput } from './types';

const MIME_BY_EXT: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	webp: 'image/webp',
	gif: 'image/gif',
	bmp: 'image/bmp',
	avif: 'image/avif',
	heic: 'image/heic',
	heif: 'image/heif',
	pdf: 'application/pdf',
	docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	xls: 'application/vnd.ms-excel',
	csv: 'text/csv',
	mp3: 'audio/mpeg',
	wav: 'audio/wav',
	mpeg: 'audio/mpeg',
	m4a: 'audio/mp4',
	mp4: 'video/mp4',
	m4v: 'video/mp4',
	mov: 'video/quicktime'
};

export function deriveAcceptAttr(extensions: string[]): string {
	const items: string[] = [];
	for (const ext of extensions) {
		const clean = ext.replace(/^\./, '').toLowerCase();
		items.push(`.${clean}`);
		const mime = MIME_BY_EXT[clean];
		if (mime && !items.includes(mime)) {
			items.push(mime);
		}
	}
	return items.join(',');
}

export function defineTool(input: ToolDefInput): ToolDef {
	if (!input.slug || !/^[a-z0-9-]+$/.test(input.slug)) {
		throw new Error(`Invalid tool slug: "${input.slug}"`);
	}
	if (!input.name || !input.shortName) {
		throw new Error(`Tool ${input.slug} must have a name and shortName`);
	}
	if (!input.input?.extensions?.length) {
		throw new Error(`Tool ${input.slug} must specify at least one input extension`);
	}
	if (!input.output?.ext) {
		throw new Error(`Tool ${input.slug} must specify an output extension`);
	}

	const normalizedExtensions = input.input.extensions.map((ext) => ext.replace(/^\./, '').toLowerCase());
	const acceptAttr = input.input.acceptAttr ?? deriveAcceptAttr(normalizedExtensions);

	const memoryWeight = input.memoryWeight ?? 1;
	const arity = input.arity ?? 'single';
	const options = input.options ?? [];

	const def: ToolDef = {
		slug: input.slug,
		name: input.name,
		shortName: input.shortName,
		icon: input.icon,
		category: input.category,
		input: {
			extensions: normalizedExtensions,
			kinds: input.input.kinds,
			acceptAttr
		},
		output: input.output,
		pipeline: input.pipeline,
		worker: input.worker,
		memoryWeight,
		arity,
		minFiles: input.minFiles ?? 1,
		excludeFromChooser: input.excludeFromChooser ?? false,
		finalizer: input.finalizer,
		options,
		fixedOptions: input.fixedOptions,
		copy: input.copy,

		// Backward-compatibility getters
		get accept() {
			return this.input.extensions;
		},
		get acceptAttr() {
			return this.input.acceptAttr;
		},
		get outputExt() {
			return this.output.ext;
		},
		get outputLabel() {
			return this.output.label;
		},
		get tagline() {
			return this.copy.tagline;
		},
		get description() {
			return this.copy.description;
		},
		get fidelity() {
			return this.copy.fidelity;
		},
		get fidelityTitle() {
			return this.copy.fidelityTitle;
		},
		get fidelityNote() {
			return this.copy.fidelityNote;
		},
		get limitations() {
			return this.copy.limitations;
		}
	};

	return def;
}
