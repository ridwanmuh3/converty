export type Fidelity = 'good' | 'fair';

export type ConvertOptions = Record<string, string>;

export interface ConvertContext {
	options: ConvertOptions;
	onProgress: (fraction: number) => void;
	signal: AbortSignal;
}

export interface ConvertOutput {
	blob: Blob;
	/** Overrides the tool's default extension (image output depends on the chosen format). */
	ext?: string;
}

export type Converter = (file: File, ctx: ConvertContext) => Promise<ConvertOutput>;
