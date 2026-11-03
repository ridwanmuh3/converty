import type { Fidelity } from '#lib/core/types';
import type { FileKind } from '#lib/core/validate';

export type ToolIcon = 'image' | 'word' | 'excel' | 'pdf' | 'audio';
export type ToolCategory = 'audio' | 'image' | 'document';

export type PipelineId =
	| 'audio'
	| 'image'
	| 'heic'
	| 'docx-to-pdf'
	| 'xlsx-to-pdf'
	| 'pdf-to-docx'
	| 'pdf-to-image'
	| 'image-pdf'
	| 'video-to-audio'
	| 'merge-pdf'
	| 'split-pdf'
	| 'compress-image';

export type WorkerFamily =
	| 'image'
	| 'image-pdf'
	| 'pdf-image'
	| 'video'
	| 'document'
	| 'pdf-edit';

export type ToolArity = 'single' | 'many-to-one' | 'one-to-many';

export interface SelectChoice {
	value: string;
	label: string;
}

export interface ToolOption {
	key: string;
	label: string;
	type: 'select' | 'range' | 'text';
	placeholder?: string;
	choices?: SelectChoice[];
	min?: number;
	max?: number;
	step?: number;
	defaultValue: string;
	hint?: string;
	/** Formats the range readout, e.g. "85%". */
	display?: 'percent' | 'pixels';
}

export interface ToolInputDef {
	extensions: string[];
	kinds: FileKind[];
	acceptAttr?: string;
}

export interface ToolOutputDef {
	ext: string;
	mime: string;
	label: string;
}

export interface ToolCopyDef {
	tagline: string;
	description: string;
	fidelity: Fidelity;
	fidelityTitle: string;
	fidelityNote: string;
	limitations: string[];
}

export interface ToolDefInput {
	slug: string;
	/** Minimum files before Convert makes sense, e.g. 2 for Merge PDF. */
	minFiles?: number;
	/** Multi-file intents reachable from the catalog only, not the drop chooser. */
	excludeFromChooser?: boolean;
	name: string;
	shortName: string;
	icon: ToolIcon;
	category: ToolCategory;
	input: ToolInputDef;
	output: ToolOutputDef;
	pipeline: PipelineId;
	worker: WorkerFamily | null;
	memoryWeight?: 1 | 2 | 3;
	arity?: ToolArity;
	finalizer?: 'merge-pdf' | 'combine-images';
	options?: ToolOption[];
	fixedOptions?: Record<string, string>;
	copy: ToolCopyDef;
}

export interface ToolDef {
	slug: string;
	name: string;
	shortName: string;
	icon: ToolIcon;
	category: ToolCategory;
	input: {
		extensions: string[];
		kinds: FileKind[];
		acceptAttr: string;
	};
	output: ToolOutputDef;
	pipeline: PipelineId;
	worker: WorkerFamily | null;
	memoryWeight: 1 | 2 | 3;
	arity: ToolArity;
	minFiles: number;
	excludeFromChooser: boolean;
	finalizer?: 'merge-pdf' | 'combine-images';
	options: ToolOption[];
	fixedOptions?: Record<string, string>;
	copy: ToolCopyDef;

	// Backwards compatibility accessors
	accept: string[];
	acceptAttr: string;
	outputExt: string;
	outputLabel: string;
	tagline: string;
	description: string;
	fidelity: Fidelity;
	fidelityTitle: string;
	fidelityNote: string;
	limitations: string[];
}
