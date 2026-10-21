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
		oncancel
	}: {
		job: Job;
		icon: ToolIcon;
		onDownload: (job: Job) => void;
		onRemove: (id: string) => void;
		onRetry: (id: string) => void;
		oncancel: (id: string) => void;
	} = $props();

	const STATUS: Record<JobState, { label: string; badge: string }> = {
		queued: { label: 'Queued', badge: 'badge-neutral' },
		working: { label: 'Converting', badge: 'badge-info' },
		done: { label: 'Done', badge: 'badge-success' },
		error: { label: 'Failed', badge: 'badge-danger' },
		cancelled: { label: 'Cancelled', badge: 'badge-neutral' }
	};

	const status = $derived(STATUS[job.state]);
</script>

<li class="flex items-start gap-3 py-3.5">
	<span class="mt-0.5 shrink-0 text-mute" aria-hidden="true">
		<Icon name={icon} size={20} />
	</span>

	<div class="min-w-0 flex-1">
		<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
			<p class="t-body-md min-w-0 truncate font-semibold text-ink">{job.file.name}</p>
			<span class="badge {status.badge} tabular">
				{status.label}{job.state === 'working' ? ` ${Math.round(job.progress * 100)}%` : ''}
			</span>
		</div>

		<p class="t-body-sm mt-0.5 text-mute">
			{formatBytes(job.file.size)}
			{#if job.state === 'done'}
				· Saved as {job.resultName}
			{:else if job.state === 'queued'}
				· Waiting in the queue
			{/if}
		</p>

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
	</div>

	<div class="flex shrink-0 items-center gap-1">
		{#if job.state === 'done'}
			<button
				type="button"
				class="btn btn-ghost btn-sm"
				onclick={() => onDownload(job)}
				aria-label="Download {job.resultName}"
			>
				<Icon name="download" size={16} />
				<span class="hidden sm:inline">Download</span>
			</button>
		{/if}

		{#if job.state === 'error' || job.state === 'cancelled'}
			<button type="button" class="btn btn-ghost btn-sm" onclick={() => onRetry(job.id)}>
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
				onclick={() => onRemove(job.id)}
				aria-label="Remove {job.file.name}"
				title="Remove"
			>
				<Icon name="trash" size={17} />
			</button>
		{/if}
	</div>
</li>
