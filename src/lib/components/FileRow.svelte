<script lang="ts">
	import { formatBytes } from '#lib/core/format';
	import type { Job, JobState } from '#lib/core/queue.svelte';
	import type { ToolIcon } from '#lib/tools/registry';
	import Icon from './Icon.svelte';

	let {
		job,
		icon,
		onDownload,
		onRemove,
		onRetry,
		oncancel,
		busy = false,
		showDownload = true,
		canReorder = false,
		position = 0,
		total = 1,
		onMove
	}: {
		job: Job;
		icon: ToolIcon;
		onDownload: (job: Job) => void;
		onRemove: (id: string) => void;
		onRetry: (id: string) => void;
		oncancel: (id: string) => void;
		/** True while the batch runner is active; queue mutations are refused then. */
		busy?: boolean;
		/** Many-to-one tools show one combined download, not partial files. */
		showDownload?: boolean;
		canReorder?: boolean;
		position?: number;
		total?: number;
		onMove?: (id: string, target: number) => void;
	} = $props();

	const STATUS: Record<JobState, { label: string; badge: string }> = {
		queued: { label: 'Queued', badge: 'badge-neutral' },
		working: { label: 'Converting', badge: 'badge-info' },
		done: { label: 'Done', badge: 'badge-success' },
		error: { label: 'Failed', badge: 'badge-danger' },
		cancelled: { label: 'Cancelled', badge: 'badge-neutral' }
	};

	const status = $derived(STATUS[job.state]);

	/** First page of a PDF result, rendered on demand so nothing heavy loads early. */
	let pdfPreview = $state<string | null>(null);
	let previewBusy = $state(false);
	let previewError = $state('');

	async function togglePdfPreview() {
		if (pdfPreview) {
			pdfPreview = null;
			return;
		}
		if (!job.result || previewBusy) return;
		previewBusy = true;
		previewError = '';
		try {
			const { pdfFirstPagePreview } = await import('#lib/core/preview');
			pdfPreview = await pdfFirstPagePreview(job.result);
		} catch {
			previewError = 'The first page could not be previewed. The PDF itself is unaffected.';
		} finally {
			previewBusy = false;
		}
	}
</script>

<li
	class="flex flex-wrap items-start gap-x-3 gap-y-2 py-3.5 sm:flex-nowrap"
	class:cursor-grab={canReorder}
	draggable={canReorder}
	ondragstart={(event) => {
		if (!canReorder) return;
		event.dataTransfer?.setData('text/plain', job.id);
		if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
	}}
	ondragover={(event) => {
		if (canReorder) event.preventDefault();
	}}
	ondrop={(event) => {
		if (!canReorder) return;
		event.preventDefault();
		const id = event.dataTransfer?.getData('text/plain');
		if (id) onMove?.(id, position);
	}}
>
	{#if job.previewUrl}
		<div
			class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-sm)] border border-line bg-bone"
			aria-hidden="true"
		>
			<img src={job.previewUrl} alt="" class="h-full w-full object-cover" />
		</div>
	{:else}
		<span class="mt-0.5 shrink-0 text-mute" aria-hidden="true">
			<Icon name={icon} size={20} />
		</span>
	{/if}

	<div class="min-w-0 flex-1">
		<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
			<p class="t-body-md min-w-0 break-all font-semibold text-ink sm:truncate">{job.file.name}</p>
			<span class="badge {status.badge} tabular">
				{status.label}{job.state === 'working' ? ` ${Math.round(job.progress * 100)}%` : ''}
			</span>
		</div>

		<div class="t-body-sm mt-0.5 flex flex-wrap items-center gap-x-1.5 text-mute">
			{#if job.state === 'done' && job.resultSize !== undefined}
				{#if job.previewLabel}
					<span class="tabular">{job.previewLabel}</span>
					<span aria-hidden="true">&middot;</span>
				{/if}
				<span>{formatBytes(job.file.size)} &rarr; {formatBytes(job.resultSize)}</span>
				{#if job.deltaPercent !== undefined}
					<span
						class="badge {job.deltaPercent <= 0 ? 'badge-success' : 'badge-neutral'} tabular text-xs"
					>
						{job.deltaPercent > 0 ? `+${job.deltaPercent}%` : `${job.deltaPercent}%`}
					</span>
				{/if}
				<span>&middot; Saved as {job.resultName}</span>
			{:else if job.state === 'queued'}
				<span>{formatBytes(job.file.size)} &middot; Waiting in queue</span>
			{:else}
				<span>{formatBytes(job.file.size)}</span>
			{/if}
		</div>

		{#if job.state === 'working'}
			<div class="mt-2.5 max-w-[420px]">
				<div
					class="progress"
					role="progressbar"
					aria-label="Converting {job.file.name}"
					aria-valuemin="0"
					aria-valuemax="100"
					aria-valuenow={Math.round(job.progress * 100)}
				>
					<div class="progress-fill" style="width: {Math.max(2, job.progress * 100)}%"></div>
				</div>
				{#if job.phase}
					<p class="t-caption mt-1 text-mute">{job.phase}&hellip;</p>
				{/if}
			</div>
		{/if}

		{#if job.message}
			<p
				class="t-body-sm mt-1.5"
				class:text-danger={job.state === 'error'}
				class:text-mute={job.state !== 'error'}
			>
				{job.message}
			</p>
		{/if}

		{#if job.meta?.waveform?.length}
			<svg
				class="mt-2 h-8 w-40 text-primary"
				viewBox="0 0 32 10"
				preserveAspectRatio="none"
				role="img"
				aria-label="Waveform of {job.resultName}"
			>
				{#each job.meta.waveform as peak, index}
					<rect
						x={index}
						y={5 - Math.max(0.15, peak) * 5}
						width="0.7"
						height={Math.max(0.3, peak * 10)}
						rx="0.2"
						fill="currentColor"
					/>
				{/each}
			</svg>
		{/if}

		{#if job.state === 'done' && job.result?.type === 'application/pdf'}
			<div class="mt-2">
				<button
					type="button"
					class="t-caption inline-flex min-h-11 items-center font-semibold text-primary-text hover:underline"
					aria-expanded={Boolean(pdfPreview)}
					onclick={togglePdfPreview}
				>
					{pdfPreview ? 'Hide preview' : previewBusy ? 'Rendering preview…' : 'Preview first page'}
				</button>
				{#if pdfPreview}
					<img
						src={pdfPreview}
						alt="First page of {job.resultName}"
						class="mt-2 max-h-64 w-auto rounded-[var(--radius-sm)] border border-line"
					/>
				{/if}
				{#if previewError}
					<p class="t-caption mt-1 text-danger">{previewError}</p>
				{/if}
			</div>
		{/if}
	</div>

	<div class="flex w-full flex-wrap items-center justify-end gap-1 pl-8 sm:w-auto sm:shrink-0 sm:pl-0">
		{#if canReorder}
			<div class="flex items-center gap-0.5" role="group" aria-label="Order of {job.file.name}">
				<span class="t-caption tabular w-5 text-center text-mute">{position + 1}</span>
				<button
					type="button"
					class="btn btn-ghost btn-icon"
					disabled={position === 0}
					onclick={() => onMove?.(job.id, position - 1)}
					aria-label="Move {job.file.name} up"
				>
					<span aria-hidden="true">↑</span>
				</button>
				<button
					type="button"
					class="btn btn-ghost btn-icon"
					disabled={position >= total - 1}
					onclick={() => onMove?.(job.id, position + 1)}
					aria-label="Move {job.file.name} down"
				>
					<span aria-hidden="true">↓</span>
				</button>
			</div>
		{/if}

		{#if job.state === 'done' && showDownload}
			<button
				type="button"
				class="btn btn-ghost btn-sm"
				onclick={() => onDownload(job)}
				aria-label="Download {job.resultName}"
			>
				<Icon name="download" size={16} />
				<span>Download</span>
			</button>
		{/if}

		{#if job.state === 'error' || job.state === 'cancelled'}
			<button
				type="button"
				class="btn btn-ghost btn-sm"
				disabled={busy}
				title={busy ? 'Available when the batch finishes' : 'Retry this file'}
				onclick={() => onRetry(job.id)}
			>
				Retry
			</button>
		{/if}

		{#if job.state === 'queued' || job.state === 'working'}
			<button
				type="button"
				class="btn btn-ghost btn-sm text-mute"
				onclick={() => oncancel(job.id)}
				aria-label="Cancel {job.file.name}"
			>
				Cancel
			</button>
		{/if}

		{#if job.state !== 'working'}
			<button
				type="button"
				class="btn btn-ghost btn-icon text-mute"
				disabled={busy}
				onclick={() => onRemove(job.id)}
				aria-label="Remove {job.file.name}"
				title={busy ? 'Available when the batch finishes' : 'Remove'}
			>
				<Icon name="trash" size={17} />
			</button>
		{/if}
	</div>
</li>
