import { zip } from 'fflate';
import { outputName, uniqueName } from './format';
import { LIMITS } from './limits';
import type { ConvertOptions, Converter } from './types';
import type { ToolDef } from '#lib/tools/registry';
import { validateForTool } from './validate';

export type JobState = 'queued' | 'working' | 'done' | 'error' | 'cancelled';

export interface Job {
	id: string;
	file: File;
	state: JobState;
	progress: number;
	message: string;
	result: Blob | null;
	resultName: string;
}

export interface Notice {
	id: number;
	text: string;
	tone: 'info' | 'warning' | 'danger';
}

const nextId = (() => {
	let counter = 0;
	return () => {
		counter += 1;
		return `job-${Date.now().toString(36)}-${counter}`;
	};
})();

function messageOf(error: unknown): string {
	if (error instanceof Error && error.message) return error.message;
	return 'Conversion failed. The file may be damaged or use an unsupported feature.';
}

export class BatchQueue {
	jobs = $state<Job[]>([]);
	notices = $state<Notice[]>([]);
	running = $state(false);
	stopping = $state(false);

	readonly tool: ToolDef;
	readonly #converter: Converter;
	readonly #controllers = new Map<string, AbortController>();
	#noticeId = 0;

	constructor(tool: ToolDef, converter: Converter) {
		this.tool = tool;
		this.#converter = converter;
	}

	get totalBytes(): number {
		return this.jobs.reduce((sum, job) => sum + job.file.size, 0);
	}

	get queuedCount(): number {
		return this.jobs.filter((job) => job.state === 'queued').length;
	}

	get doneJobs(): Job[] {
		return this.jobs.filter((job) => job.state === 'done' && job.result);
	}

	get errorCount(): number {
		return this.jobs.filter((job) => job.state === 'error').length;
	}

	notify(text: string, tone: Notice['tone'] = 'warning'): void {
		if (this.notices.some((notice) => notice.text === text)) return;
		this.#noticeId += 1;
		this.notices = [...this.notices, { id: this.#noticeId, text, tone }].slice(-4);
	}

	dismiss(id: number): void {
		this.notices = this.notices.filter((notice) => notice.id !== id);
	}

	async add(files: File[]): Promise<void> {
		if (this.running) {
			this.notify('Wait for the current batch to finish before adding more files.', 'info');
			return;
		}		// Validate everything first, then append in one assignment: a half-validated
		// drop cannot be started by the Convert button while files are still checked.
		const accepted: Job[] = [];
		let pendingBytes = this.totalBytes;

		for (const file of files) {
			if (pendingBytes + file.size > LIMITS.maxTotalBytes) {
				this.notify(
					`“${file.name}” was not added. Selected input is limited to ${LIMITS.maxTotalBytes / 1024 / 1024} MB per batch; remove files or start a new batch.`
				);
				continue;
			}

			const problem = await validateForTool(file, this.tool);
			if (problem) {
				this.notify(problem);
				continue;
			}

			pendingBytes += file.size;
			accepted.push({
				id: nextId(),
				file,
				state: 'queued',
				progress: 0,
				message: '',
				result: null,
				resultName: outputName(file.name, this.tool.outputExt)
			});
		}

		if (accepted.length === 0) return;
		if (this.running) {
			this.notify(
				'The batch started before these files finished checking. Add them again when it finishes.',
				'info'
			);
			return;
		}
		this.jobs = [...this.jobs, ...accepted];
	}

	remove(id: string): void {
		const job = this.jobs.find((candidate) => candidate.id === id);
		if (!job || job.state === 'working' || this.running) return;
		this.jobs = this.jobs.filter((candidate) => candidate.id !== id);
	}

	clear(): void {
		if (this.running) return;
		this.jobs = [];
		this.notices = [];
	}

	retry(id: string): void {
		if (this.running) return;
		const job = this.jobs.find((candidate) => candidate.id === id);
		if (!job || (job.state !== 'error' && job.state !== 'cancelled')) return;
		job.state = 'queued';
		job.progress = 0;
		job.message = '';
		job.result = null;
	}

	cancel(id: string): void {
		const job = this.jobs.find((candidate) => candidate.id === id);
		if (!job) return;
		if (job.state === 'queued') {
			job.state = 'cancelled';
			job.message = 'Cancelled before it started.';
			return;
		}
		if (job.state === 'working') {
			this.#controllers.get(id)?.abort();
		}
	}

	/** Stops after the file currently being converted, so no output is half-written. */
	stop(): void {
		if (!this.running) return;
		this.stopping = true;
		for (const controller of this.#controllers.values()) controller.abort();
	}

	async run(options: ConvertOptions): Promise<void> {
		if (this.running) return;
		this.running = true;
		this.stopping = false;

		try {
			for (const job of [...this.jobs]) {
				if (job.state !== 'queued') continue;
				if (this.stopping) break;

				job.state = 'working';
				job.progress = 0;
				job.message = '';

				const controller = new AbortController();
				this.#controllers.set(job.id, controller);

				try {
					const output = await this.#converter(job.file, {
						options,
						signal: controller.signal,
						onProgress: (fraction) => {
							job.progress = Math.min(0.99, Math.max(0, fraction));
						}
					});

					if (controller.signal.aborted) {
						job.state = 'cancelled';
						job.message = 'Stopped. No output was written.';
						continue;
					}

					job.result = output.blob;
					job.resultName = outputName(job.file.name, output.ext ?? this.tool.outputExt);
					job.progress = 1;
					job.state = 'done';
				} catch (error) {
					if (controller.signal.aborted) {
						job.state = 'cancelled';
						job.message = 'Stopped. No output was written.';
					} else {
						job.state = 'error';
						job.message = messageOf(error);
					}
				} finally {
					this.#controllers.delete(job.id);
				}

				// Let the browser paint progress before the next file starts.
				await new Promise((resolve) => setTimeout(resolve, 0));
			}
		} finally {
			this.running = false;
			this.stopping = false;
		}
	}

	async zipAll(): Promise<{ blob: Blob; name: string } | null> {
		const jobs = this.doneJobs;
		if (jobs.length === 0) return null;

		const taken = new Set<string>();
		const entries: Record<string, Uint8Array> = {};
		for (const job of jobs) {
			entries[uniqueName(job.resultName, taken)] = new Uint8Array(
				await job.result!.arrayBuffer()
			);
		}

		// fflate's async zip runs in a worker, so a large batch does not freeze the tab
		// and the "Zipping…" state can actually paint.
		const zipped = await new Promise<Uint8Array>((resolve, reject) => {
			zip(entries, { level: 6 }, (error, data) => (error ? reject(error) : resolve(data)));
		});
		// Copy into a fresh buffer so the type is ArrayBuffer-backed (a valid BlobPart).
		const bytes = new Uint8Array(zipped.length);
		bytes.set(zipped);
		return { blob: new Blob([bytes], { type: 'application/zip' }), name: 'converted-files.zip' };
	}
}
