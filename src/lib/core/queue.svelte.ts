import { zip } from 'fflate';
import { concurrencyFor } from './capabilities';
import { outputName, uniqueName } from './format';
import { LIMITS } from './limits';
import { noteConversion } from './pwa.svelte';
import type { ConvertMeta, ConvertOptions, Converter } from './types';
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
	phase?: string;
	previewUrl?: string;
	/** Short result fact, e.g. the duration of an audio output. */
	previewLabel?: string;
	resultSize?: number;
	deltaPercent?: number;
	/** Facts the pipeline reported about its output (pages, duration, dimensions). */
	meta?: ConvertMeta;
}

export interface Notice {
	id: number;
	text: string;
	tone: 'info' | 'warning' | 'danger';
}

/** One document assembled from the whole batch, e.g. merged PDFs. */
export interface CombinedOutput {
	blob: Blob;
	name: string;
	label: string;
}

/**
 * Joins the per-file outputs into one file. Returning null means "no combined
 * output for this batch", which is the normal case for single-file tools.
 */
export type BatchFinalizer = (
	jobs: Job[],
	options: ConvertOptions
) => Promise<CombinedOutput | null>;

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

/** "3 pages", "0:42", "1920 × 1080 px" — whichever fact the pipeline reported. */
function describeMeta(meta: ConvertMeta | undefined): string | undefined {
	if (!meta) return undefined;
	if (meta.pages !== undefined) return `${meta.pages} ${meta.pages === 1 ? 'page' : 'pages'}`;
	if (meta.durationSeconds !== undefined) return formatDuration(meta.durationSeconds) || undefined;
	if (meta.width && meta.height) return `${meta.width} × ${meta.height} px`;
	return undefined;
}

function formatDuration(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds < 0) return '';
	const total = Math.round(seconds);
	return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Reads the output's duration without decoding the whole file to PCM. */
async function describeAudio(blob: Blob): Promise<string | undefined> {
	const url = URL.createObjectURL(blob);
	try {
		const duration = await new Promise<number>((resolve, reject) => {
			const audio = new Audio();
			audio.preload = 'metadata';
			audio.onloadedmetadata = () => resolve(audio.duration);
			audio.onerror = () => reject(new Error('No audio metadata'));
			audio.src = url;
		});
		return formatDuration(duration) || undefined;
	} catch {
		return undefined;
	} finally {
		URL.revokeObjectURL(url);
	}
}

export class BatchQueue {
	jobs = $state<Job[]>([]);
	notices = $state<Notice[]>([]);
	running = $state(false);
	stopping = $state(false);
	batchStartTime = $state<number | null>(null);
	combined = $state<CombinedOutput | null>(null);
	combining = $state(false);

	readonly tool: ToolDef;
	readonly #converter: Converter;
	readonly #finalize?: BatchFinalizer;
	readonly #controllers = new Map<string, AbortController>();
	#noticeId = 0;

	constructor(tool: ToolDef, converter: Converter, finalize?: BatchFinalizer) {
		this.tool = tool;
		this.#converter = converter;
		this.#finalize = finalize;
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

	get activeJob(): Job | undefined {
		return this.jobs.find((job) => job.state === 'working');
	}

	/**
	 * Overall progress across the whole batch (0 to 1).
	 */
	/** Input bytes weighted by state: big files move the bar further than small ones. */
	get overallProgress(): number {
		const total = this.jobs.reduce((sum, job) => sum + Math.max(1, job.file.size), 0);
		if (total === 0) return 0;
		let completed = 0;
		for (const job of this.jobs) {
			const weight = Math.max(1, job.file.size);
			if (job.state === 'done' || job.state === 'error' || job.state === 'cancelled') {
				completed += weight;
			} else if (job.state === 'working') {
				completed += weight * job.progress;
			}
		}
		return Math.min(1, Math.max(0, completed / total));
	}

	/**
	 * Estimated seconds remaining from the batch's actual byte throughput.
	 */
	get etaSeconds(): number | null {
		if (!this.running || !this.batchStartTime) return null;
		const elapsedMs = Date.now() - this.batchStartTime;
		const settledBytes = this.jobs
			.filter((job) => job.state === 'done' || job.state === 'error' || job.state === 'cancelled')
			.reduce((sum, job) => sum + Math.max(1, job.file.size), 0);
		if (settledBytes === 0 || elapsedMs < 250) return null;
		const remainingBytes = this.jobs
			.filter((job) => job.state === 'queued' || job.state === 'working')
			.reduce((sum, job) => sum + Math.max(1, job.file.size), 0);
		if (remainingBytes === 0) return 0;
		const bytesPerMs = settledBytes / elapsedMs;
		return Math.max(1, Math.round((remainingBytes / bytesPerMs) / 1000));
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
		}

		// Validate everything first, then append in one assignment: a half-validated
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

			// Generate preview for image input if supported
			let inputPreviewUrl: string | undefined;
			if (file.type.startsWith('image/') && !file.type.includes('heic')) {
				try {
					inputPreviewUrl = URL.createObjectURL(file);
				} catch {
					// Ignore
				}
			}

			accepted.push({
				id: nextId(),
				file,
				state: 'queued',
				progress: 0,
				message: '',
				result: null,
				resultName: outputName(file.name, this.tool.outputExt),
				previewUrl: inputPreviewUrl
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
		if (job.previewUrl) URL.revokeObjectURL(job.previewUrl);
		this.jobs = this.jobs.filter((candidate) => candidate.id !== id);
	}

	clear(): void {
		if (this.running) return;
		for (const job of this.jobs) {
			if (job.previewUrl) URL.revokeObjectURL(job.previewUrl);
			// Drop the Blob references so the browser can reclaim the output bytes.
			job.result = null;
			job.previewUrl = undefined;
		}
		this.jobs = [];
		this.notices = [];
		this.batchStartTime = null;
		this.combined = null;
	}

	retry(id: string): void {
		if (this.running) return;
		const job = this.jobs.find((candidate) => candidate.id === id);
		if (!job || (job.state !== 'error' && job.state !== 'cancelled')) return;
		job.state = 'queued';
		job.progress = 0;
		job.message = '';
		job.phase = undefined;
		job.result = null;
		job.meta = undefined;
		job.previewLabel = undefined;
	}

	/** Moves a file within the batch; list order is page order for combining tools. */
	reorder(id: string, offset: -1 | 1): boolean {
		if (this.running) return false;
		const index = this.jobs.findIndex((job) => job.id === id);
		const target = index + offset;
		if (index < 0 || target < 0 || target >= this.jobs.length) return false;
		const next = [...this.jobs];
		[next[index], next[target]] = [next[target], next[index]];
		this.jobs = next;
		// The combined file was built in the old order; rebuild it on the next run.
		this.combined = null;
		return true;
	}

	/** Drag-and-drop reorder: moves a job to an absolute position. */
	moveTo(id: string, index: number): boolean {
		if (this.running) return false;
		const from = this.jobs.findIndex((job) => job.id === id);
		if (from < 0 || index < 0 || index >= this.jobs.length || from === index) return false;
		const next = [...this.jobs];
		const [job] = next.splice(from, 1);
		next.splice(index, 0, job);
		this.jobs = next;
		this.combined = null;
		return true;
	}

	retryAllFailed(): void {
		if (this.running) return;
		for (const job of this.jobs) {
			if (job.state === 'error' || job.state === 'cancelled') {
				job.state = 'queued';
				job.progress = 0;
				job.message = '';
				job.phase = undefined;
				job.result = null;
				job.meta = undefined;
				job.previewLabel = undefined;
			}
		}
	}

	/**
	 * Allows re-running already completed files with new settings without re-uploading.
	 */
	rerun(options: ConvertOptions): void {
		if (this.running) return;
		for (const job of this.jobs) {
			if (job.state === 'done') {
				job.state = 'queued';
				job.progress = 0;
				job.message = '';
				job.phase = undefined;
				job.result = null;
				job.meta = undefined;
				job.previewLabel = undefined;
			}
		}
		this.run(options);
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
		this.batchStartTime = Date.now();
		this.combined = null;

		const pending = this.jobs.filter((job) => job.state === 'queued');
		// Two lanes on a desktop with headroom; heavy pipelines always run alone.
		const lanes = Math.min(concurrencyFor(this.tool.memoryWeight), pending.length);
		let cursor = 0;

		const convertOne = async (job: Job) => {
			job.state = 'working';
			job.progress = 0;
			job.message = '';
			job.phase = 'Reading file';
			let phaseReported = false;

			const controller = new AbortController();
			this.#controllers.set(job.id, controller);

			try {
				const output = await this.#converter(job.file, {
					options,
					signal: controller.signal,
					onPhase: (label) => {
						phaseReported = true;
						job.phase = label;
					},
					onProgress: (fraction) => {
						job.progress = Math.min(0.99, Math.max(0, fraction));
						if (phaseReported) return;
						if (fraction < 0.2) job.phase = 'Reading file';
						else if (fraction < 0.8) job.phase = 'Converting';
						else job.phase = 'Encoding output';
					}
				});

				if (controller.signal.aborted) {
					job.state = 'cancelled';
					job.message = 'Stopped. No output was written.';
					job.phase = undefined;
					return;
				}

				job.result = output.blob;
				job.resultSize = output.blob.size;
				job.meta = output.meta;
				job.previewLabel = describeMeta(output.meta);
				job.deltaPercent = Math.round(((output.blob.size - job.file.size) / job.file.size) * 100);
				job.resultName = outputName(job.file.name, output.ext ?? this.tool.outputExt);
				job.progress = 1;
				job.phase = 'Complete';
				job.state = 'done';
				noteConversion();

				// Preview cheaply on the main thread: an object URL for images and a
				// duration probe only when the pipeline did not already report one.
				// No PDF engine is pulled in here; PDF previews load on demand.
				if (output.blob.type.startsWith('image/')) {
					try {
						if (job.previewUrl) URL.revokeObjectURL(job.previewUrl);
						job.previewUrl = URL.createObjectURL(output.blob);
					} catch {
						// Preview is optional; the file itself is unaffected.
					}
				} else if (output.blob.type.startsWith('audio/') && !job.previewLabel) {
					void describeAudio(output.blob).then((label) => {
						job.previewLabel = label;
					});
				}
			} catch (error) {
				if (controller.signal.aborted) {
					job.state = 'cancelled';
					job.message = 'Stopped. No output was written.';
					job.phase = undefined;
				} else {
					job.state = 'error';
					job.message = messageOf(error);
					job.phase = undefined;
				}
			} finally {
				this.#controllers.delete(job.id);
			}
		};

		const lane = async () => {
			for (;;) {
				if (this.stopping) return;
				const job = pending[cursor];
				cursor += 1;
				if (!job) return;
				if (job.state !== 'queued') continue;
				await convertOne(job);
				// Let the browser paint progress before taking the next file.
				await new Promise((resolve) => setTimeout(resolve, 0));
			}
		};

		try {
			await Promise.all(Array.from({ length: Math.max(1, lanes) }, () => lane()));
			if (!this.stopping) await this.#combine(options);
		} finally {
			this.running = false;
			this.stopping = false;
		}
	}

	/**
	 * Builds the single output for many-to-one tools (merged PDFs, combined
	 * images). Combination only makes sense when every input succeeded; a partial
	 * merge would silently drop pages, so it is reported instead.
	 */
	async #combine(options: ConvertOptions): Promise<void> {
		if (!this.#finalize) return;
		const finished = this.jobs.filter((job) => job.state === 'done' && job.result);
		const failed = this.jobs.filter((job) => job.state === 'error');
		if (failed.length > 0) {
			this.notify(
				'Some files failed, so no combined file was created. Fix or remove them, then run again.',
				'warning'
			);
			return;
		}
		if (finished.length < this.tool.minFiles) {
			this.notify(
				this.tool.minFiles > 1
					? `This tool needs at least ${this.tool.minFiles} files to produce one output.`
					: 'There is nothing to combine yet.',
				'warning'
			);
			return;
		}

		this.combining = true;
		try {
			this.combined = await this.#finalize(finished, options);
		} catch (error) {
			this.notify(messageOf(error), 'danger');
		} finally {
			this.combining = false;
		}
	}

	async zipAll(): Promise<{ blob: Blob; name: string } | null> {
		const jobs = this.doneJobs;
		if (jobs.length === 0) return null;

		const taken = new Set<string>();
		const files: Record<string, Uint8Array> = {};

		for (const job of jobs) {
			if (!job.result) continue;
			const unique = uniqueName(job.resultName, taken);
			files[unique] = new Uint8Array(await job.result.arrayBuffer());
		}

		// Stored, not deflated: every output format here is already compressed
		// (PDF, DOCX, JPEG, MP3), so level 0 is faster with no size penalty.
		return new Promise((resolve, reject) => {
			zip(files, { level: 0 }, (error, data) => {
				if (error) return reject(error);
				const blob = new Blob([data as Uint8Array<ArrayBuffer>], {
					type: 'application/zip'
				});
				const date = new Date().toISOString().slice(0, 10);
				resolve({ blob, name: `converty-${this.tool.slug}-${date}.zip` });
			});
		});
	}
}
