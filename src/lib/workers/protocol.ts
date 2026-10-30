export interface RunRequest {
	type: 'run';
	id: number;
	slug: string;
	options: Record<string, string>;
	name: string;
	mime: string;
	bytes: ArrayBuffer;
}

export type WorkerRequest = RunRequest;

export type WorkerResponse =
	| { type: 'progress'; id: number; value: number }
	| { type: 'done'; id: number; bytes: ArrayBuffer; mime: string; ext?: string }
	| { type: 'error'; id: number; message: string };
