import type { Converter } from '#lib/core/types';
import type { WorkerRequest, WorkerResponse } from './protocol';

const scope = self as unknown as {
	onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
	postMessage: (message: WorkerResponse, transfer?: Transferable[]) => void;
};

function messageOf(error: unknown): string {
	if (error instanceof Error && error.message) return error.message;
	return 'Conversion failed. The file may be damaged or use an unsupported feature.';
}

/** Runs one pipeline per worker entry so unrelated libraries are never bundled. */
export function serve(converters: Record<string, Converter>): void {
	scope.onmessage = async (event) => {
		const request = event.data;
		if (!request || request.type !== 'run') return;

		const converter = converters[request.slug];
		if (!converter) {
			scope.postMessage({
				type: 'error',
				id: request.id,
				message: 'That converter is not available in this worker.'
			});
			return;
		}

		let lastSent = 0;
		let pending: number | null = null;

		const post = (message: WorkerResponse, transfer?: Transferable[]) =>
			transfer ? scope.postMessage(message, transfer) : scope.postMessage(message);

		try {
			const file = new File([request.bytes], request.name, { type: request.mime });
			const output = await converter(file, {
				options: request.options,
				signal: new AbortController().signal,
				onProgress: (value) => {
					const now = performance.now();
					// The UI only needs ~10 updates per second.
					if (now - lastSent < 80 && value < 1) {
						pending = value;
						return;
					}
					lastSent = now;
					pending = null;
					post({ type: 'progress', id: request.id, value });
				}
			});

			if (pending !== null) post({ type: 'progress', id: request.id, value: pending });
			const bytes = await output.blob.arrayBuffer();
			post(
				{
					type: 'done',
					id: request.id,
					bytes,
					mime: output.blob.type || 'application/octet-stream',
					ext: output.ext
				},
				[bytes]
			);
		} catch (error) {
			post({ type: 'error', id: request.id, message: messageOf(error) });
		}
	};
}
