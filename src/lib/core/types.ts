export type Fidelity = 'good' | 'fair';

export type ConvertOptions = Record<string, string>;

export interface ConvertContext {
	options: ConvertOptions;
	onProgress: (fraction: number) => void;
	/** Coarse stage label, e.g. "Rendering page 3 of 12". */
	onPhase?: (label: string) => void;
	signal: AbortSignal;
}

/**
 * Facts about an output that the UI can show without decoding it again.
 * Everything here is optional: a pipeline that cannot know a value omits it.
 */
export interface ConvertMeta {
	pages?: number;
	width?: number;
	height?: number;
	durationSeconds?: number;
	/** 32 normalised peak amplitudes (0–1), oldest first, for a waveform preview. */
	waveform?: number[];
}

export interface ConvertOutput {
	blob: Blob;
	/** Overrides the tool's default extension (image output depends on the chosen format). */
	ext?: string;
	meta?: ConvertMeta;
}

export type Converter = (file: File, ctx: ConvertContext) => Promise<ConvertOutput>;
