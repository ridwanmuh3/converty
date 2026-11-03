import type { Converter } from '#lib/core/types';
import { concurrencyFor } from '#lib/core/capabilities';
import { getTool, type WorkerFamily } from '#lib/tools';
import type { WorkerResponse } from './protocol';

/**
 * One entry per tool family. Keeping them separate means an image conversion
 * never downloads the PDF engine or the video demuxer.
 */
const WORKER_FACTORIES: Record<WorkerFamily, () => Worker> = {
	image: () =>
		new Worker(new URL('./entries/image.worker.ts', import.meta.url), { type: 'module' }),
	'image-pdf': () =>
		new Worker(new URL('./entries/image-pdf.worker.ts', import.meta.url), { type: 'module' }),
	'pdf-image': () =>
		new Worker(new URL('./entries/pdf-image.worker.ts', import.meta.url), { type: 'module' }),
	video: () =>
		new Worker(new URL('./entries/video.worker.ts', import.meta.url), { type: 'module' }),
	document: () =>
		new Worker(new URL('./entries/document.worker.ts', import.meta.url), { type: 'module' }),
	'pdf-edit': () =>
		new Worker(new URL('./entries/pdf-edit.worker.ts', import.meta.url), { type: 'module' })
};

interface PoolEntry {
	worker: Worker;
	busy: boolean;
}

interface Pool {
	limit: number;
	entries: PoolEntry[];
	waiters: Array<(entry: PoolEntry) => void>;
}

const pools = new Map<WorkerFamily, Pool>();
let sequence = 0;

function poolFor(family: WorkerFamily, limit: number): Pool {
	let pool = pools.get(family);
	if (!pool) {
		pool = { limit, entries: [], waiters: [] };
		pools.set(family, pool);
	} else {
		// The strictest tool in a family wins, so a heavy member never shares a lane.
		pool.limit = Math.min(pool.limit, limit);
	}
	return pool;
}

function spawn(family: WorkerFamily): PoolEntry {
	const factory = WORKER_FACTORIES[family];
	if (!factory) throw new Error(`No worker factory for family ${family}`);
	return { worker: factory(), busy: true };
}

/** Returns an idle worker, or waits for one to be released. */
function acquire(family: WorkerFamily, limit: number): Promise<PoolEntry> {
	const pool = poolFor(family, limit);
	const idle = pool.entries.find((entry) => !entry.busy);
	if (idle) {
		idle.busy = true;
		return Promise.resolve(idle);
	}
	if (pool.entries.length < pool.limit) {
		try {
			const entry = spawn(family);
			pool.entries.push(entry);
			return Promise.resolve(entry);
		} catch {
			return Promise.reject(new Error('This browser could not start a conversion worker.'));
		}
	}
	return new Promise((resolve) => pool.waiters.push(resolve));
}

/**
 * Frees a lane. A terminated worker is removed from the pool, and a waiting
 * job gets a fresh one instead of a dead reference.
 */
function release(family: WorkerFamily, entry: PoolEntry, dispose = false): void {
	const pool = pools.get(family);
	if (!pool) return;
	if (dispose) {
		entry.worker.terminate();
		const index = pool.entries.indexOf(entry);
		if (index >= 0) pool.entries.splice(index, 1);
	} else {
		entry.busy = false;
	}

	const next = pool.waiters.shift();
	if (!next) return;
	if (!dispose) {
		next(entry);
		return;
	}
	if (pool.entries.length < pool.limit) {
		try {
			const replacement = spawn(family);
			pool.entries.push(replacement);
			next(replacement);
		} catch {
			pool.waiters.unshift(next);
		}
	} else {
		// Another entry will become idle shortly; hand the waiter to it.
		pool.waiters.unshift(next);
		const idle = pool.entries.find((candidate) => !candidate.busy);
		if (idle) {
			pool.waiters.shift();
			release(family, idle, false);
		}
	}
}

/**
 * Records a main-thread fallback so tests can tell a real worker conversion from
 * a silent retry. Harmless in production: it is one number on the window.
 */
function noteFallback(reason: string): void {
	const scope = globalThis as typeof globalThis & {
		__workerFallbacks?: number;
		__workerFallbackReasons?: string[];
	};
	scope.__workerFallbacks = (scope.__workerFallbacks ?? 0) + 1;
	scope.__workerFallbackReasons = [...(scope.__workerFallbackReasons ?? []), reason].slice(-4);
}

/** Drops every idle worker; call when the page is left. */
export function disposeWorkerPool(): void {
	for (const pool of pools.values()) {
		for (const entry of pool.entries) entry.worker.terminate();
		pool.entries = [];
		pool.waiters = [];
	}
	pools.clear();
}

/**
 * Runs conversions in a dedicated worker so encoding and layout never block the
 * UI thread. The returned value implements the same Converter contract as the
 * main-thread pipelines, so the queue, progress, retry and ZIP are unchanged.
 */
export function createWorkerConverter(slug: string, fallback: Converter): Converter {
	const tool = getTool(slug);
	const family = tool?.worker ?? null;
	if (!family) return fallback;
	const limit = concurrencyFor(tool?.memoryWeight ?? 1);

	return async (file, ctx) => {
		const extension = file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase();
		// heic2any needs the DOM, so HEIC keeps the main-thread decoder.
		if (extension === 'heic' || extension === 'heif') return fallback(file, ctx);

		const id = (sequence += 1);
		let entry: PoolEntry;
		try {
			entry = await acquire(family, limit);
		} catch {
			noteFallback('worker-unavailable');
			return fallback(file, ctx);
		}

		return new Promise((resolve, reject) => {
			let settled = false;
			const finish = () => {
				settled = true;
				entry.worker.removeEventListener('message', onMessage);
				entry.worker.removeEventListener('error', onError);
				ctx.signal.removeEventListener('abort', onAbort);
			};

			/** A worker-only failure should not dead-end a file the main thread can handle. */
			const retryOnMainThread = (message: string) => {
				noteFallback(message);
				fallback(file, ctx).then(resolve, () => reject(new Error(message)));
			};

			// Synchronous encoders cannot observe a signal mid-loop, so cancelling
			// terminates the worker; the next file respawns it in this slot.
			const onAbort = () => {
				finish();
				release(family, entry, true);
				reject(new DOMException('Aborted', 'AbortError'));
			};

			const onError = () => {
				finish();
				release(family, entry, true);
				retryOnMainThread('Conversion stopped unexpectedly. Try this file again.');
			};

			const onMessage = (event: MessageEvent<WorkerResponse>) => {
				const message = event.data;
				if (message.id !== id) return;
				if (message.type === 'progress') {
					ctx.onProgress(message.value);
					return;
				}
				if (message.type === 'phase') {
					ctx.onPhase?.(message.label);
					return;
				}
				finish();
				if (message.type === 'done') {
					release(family, entry);
					resolve({
						blob: new Blob([message.bytes], { type: message.mime }),
						ext: message.ext,
						meta: message.meta
					});
				} else {
					release(family, entry);
					retryOnMainThread(message.message);
				}
			};

			entry.worker.addEventListener('message', onMessage);
			entry.worker.addEventListener('error', onError);
			ctx.signal.addEventListener('abort', onAbort, { once: true });
			try {
				entry.worker.postMessage({ type: 'run', id, slug, options: ctx.options, file });
			} catch (error) {
				finish();
				release(family, entry, true);
				if (settled) return;
				reject(error instanceof Error ? error : new Error('The file could not be passed to the worker.'));
			}
		});
	};
}
