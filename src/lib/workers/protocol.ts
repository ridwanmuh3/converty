import type { ConvertMeta } from '#lib/core/types';

export interface RunRequest {
	type: 'run';
	id: number;
	slug: string;
	options: Record<string, string>;
	/**
	 * The File is structured-cloned, not copied: the browser keeps one copy of
	 * the bytes, so a 25 MB input is not duplicated on the main thread first.
	 * Output bytes are still transferred back.
	 */
	file: File;
}

export type WorkerRequest = RunRequest;

export type WorkerResponse =
	| { type: 'progress'; id: number; value: number }
	| { type: 'phase'; id: number; label: string }
	| { type: 'done'; id: number; bytes: ArrayBuffer; mime: string; ext?: string; meta?: ConvertMeta }
	| { type: 'error'; id: number; message: string };
