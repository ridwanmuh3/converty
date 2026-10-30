import type { Converter } from '#lib/core/types';
import type { WorkerResponse } from './protocol';

/**
 * One entry per tool family. Keeping them separate means an image conversion
 * never downloads the PDF engine or the video demuxer.
 */
const FACTORY: Record<string, () => Worker> = {
	'image-converter': () =>
		new Worker(new URL('./entries/image.worker.ts', import.meta.url), { type: 'module' }),
	'heic-to-jpg': () =>
		new Worker(new URL('./entries/image.worker.ts', import.meta.url), { type: 'module' }),
	'jpg-to-pdf': () =>
		new Worker(new URL('./entries/image-pdf.worker.ts', import.meta.url), { type: 'module' }),
	'image-to-pdf': () =>
		new Worker(new URL('./entries/image-pdf.worker.ts', import.meta.url), { type: 'module' }),
	'pdf-to-jpg': () =>
		new Worker(new URL('./entries/pdf-image.worker.ts', import.meta.url), { type: 'module' }),
	'mp4-to-mp3': () =>
		new Worker(new URL('./entries/video.worker.ts', import.meta.url), { type: 'module' }),
	'video-to-mp3': () =>
		new Worker(new URL('./entries/video.worker.ts', import.meta.url), { type: 'module' })
};

let worker: Worker | null = null;
let workerSlug: string | null = null;
let sequence = 0;

function ensureWorker(slug: string): Worker {
	if (worker && workerSlug === slug) return worker;
	worker?.terminate();
	const factory = FACTORY[slug];
	if (!factory) throw new Error(`No worker pipeline for ${slug}`);
	worker = factory();
	workerSlug = slug;
	return worker;
}

function release(target: Worker): void {
	target.terminate();
	if (worker === target) {
		worker = null;
		workerSlug = null;
	}
}

/**
 * Runs conversions in a dedicated worker so encoding and layout never block the
 * UI thread. The returned value implements the same Converter contract as the
 * main-thread pipelines, so the queue, progress, retry and ZIP are unchanged.
 */
export function createWorkerConverter(slug: string, fallback: Converter): Converter {
	return async (file, ctx) => {
		const extension = file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase();
		// heic2any needs the DOM, so HEIC keeps the main-thread decoder.
		if (extension === 'heic' || extension === 'heif') return fallback(file, ctx);

		const bytes = await file.arrayBuffer();
		const id = (sequence += 1);
		let target: Worker;
		try {
			target = ensureWorker(slug);
		} catch {
			return fallback(file, ctx);
		}

		return new Promise((resolve, reject) => {
			const finish = () => {
				target.removeEventListener('message', onMessage);
				target.removeEventListener('error', onError);
				ctx.signal.removeEventListener('abort', onAbort);
			};

			/** A worker-only failure should not dead-end a file the main thread can handle. */
			const retryOnMainThread = (message: string) => {
				fallback(file, ctx).then(resolve, () => reject(new Error(message)));
			};

			// Synchronous encoders cannot observe a signal mid-loop, so cancelling
			// terminates the worker; the next file respawns it.
			const onAbort = () => {
				finish();
				release(target);
				reject(new DOMException('Aborted', 'AbortError'));
			};

			const onError = () => {
				finish();
				release(target);
				retryOnMainThread('Conversion stopped unexpectedly. Try this file again.');
			};

			const onMessage = (event: MessageEvent<WorkerResponse>) => {
				const message = event.data;
				if (message.id !== id) return;
				if (message.type === 'progress') {
					ctx.onProgress(message.value);
					return;
				}
				finish();
				if (message.type === 'done') {
					resolve({
						blob: new Blob([message.bytes], { type: message.mime }),
						ext: message.ext
					});
				} else {
					retryOnMainThread(message.message);
				}
			};

			target.addEventListener('message', onMessage);
			target.addEventListener('error', onError);
			ctx.signal.addEventListener('abort', onAbort, { once: true });
			target.postMessage({ type: 'run', id, slug, name: file.name, mime: file.type, options: ctx.options, bytes }, [
				bytes
			]);
		});
	};
}
