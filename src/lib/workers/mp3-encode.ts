/**
 * Main-thread client for the MP3 encoding worker.
 *
 * Returns null when the worker cannot run at all, so the caller can fall back to
 * encoding on the UI thread instead of failing the file.
 */
let encoder: Worker | null = null;
let sequence = 0;

/** Diagnostics for the perf suite: which encoder path actually ran. */
function notePath(value: 'worker' | 'unavailable' | 'failed'): void {
	const scope = globalThis as typeof globalThis & { __mp3EncodePath?: string };
	scope.__mp3EncodePath = value;
}

function spawn(): Worker {
	return new Worker(new URL('./entries/audio.worker.ts', import.meta.url), { type: 'module' });
}

export function encodeMp3InWorker(
	channels: Float32Array[],
	sampleRate: number,
	onProgress: (fraction: number) => void,
	signal: AbortSignal
): Promise<Blob | null> {
	let target: Worker;
	try {
		if (!encoder) encoder = spawn();
		target = encoder;
	} catch {
		notePath('unavailable');
		return Promise.resolve(null);
	}

	const id = (sequence += 1);

	return new Promise((resolve, reject) => {
		const finish = () => {
			target.removeEventListener('message', onMessage);
			target.removeEventListener('error', onError);
			signal.removeEventListener('abort', onAbort);
		};

		const onAbort = () => {
			finish();
			target.terminate();
			if (encoder === target) encoder = null;
			reject(new DOMException('Aborted', 'AbortError'));
		};

		// A worker failure is not a dead end: the caller decodes again and encodes
		// on the main thread, which is slower but always works.
		const onError = () => {
			finish();
			target.terminate();
			if (encoder === target) encoder = null;
			notePath('failed');
			resolve(null);
		};

		const onMessage = (event: MessageEvent) => {
			const message = event.data as { type: string; id: number; value?: number; bytes?: ArrayBuffer; message?: string };
			if (message.id !== id) return;
			if (message.type === 'progress') {
				onProgress(message.value ?? 0);
				return;
			}
			finish();
			if (message.type === 'done' && message.bytes) {
				notePath('worker');
				resolve(new Blob([message.bytes], { type: 'audio/mpeg' }));
			} else {
				// Reject with a readable message; the caller's error path reports it.
				reject(new Error(message.message ?? 'The MP3 encoder failed.'));
			}
		};

		target.addEventListener('message', onMessage);
		target.addEventListener('error', onError);
		signal.addEventListener('abort', onAbort, { once: true });
		try {
			target.postMessage(
				{ type: 'encode-mp3', id, sampleRate, channels },
				channels.map((channel) => channel.buffer as ArrayBuffer)
			);
		} catch {
			finish();
			notePath('unavailable');
			resolve(null);
		}
	});
}
