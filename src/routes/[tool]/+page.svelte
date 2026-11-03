<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount, untrack } from 'svelte';
	import Footer from '#lib/components/Footer.svelte';
	import DropZone from '#lib/components/DropZone.svelte';
	import FailureCard from '#lib/components/FailureCard.svelte';
	import FidelityBadge from '#lib/components/FidelityBadge.svelte';
	import FileRow from '#lib/components/FileRow.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Nav from '#lib/components/Nav.svelte';
	import NoticeList from '#lib/components/NoticeList.svelte';
	import OptionsPanel from '#lib/components/OptionsPanel.svelte';
	import { downloadBlob } from '#lib/core/download';
	import { formatBytes } from '#lib/core/format';
	import {
		consumePendingHandoff,
		peekPendingHandoff,
		waitingFileCount
	} from '#lib/core/handoff.svelte';
	import { registerIntake } from '#lib/core/intake.svelte';
	import { LIMITS, LIMIT_LINE } from '#lib/core/limits';
	import {
		isOptionsCustomized,
		loadStoredOptions,
		resetStoredOptions,
		saveStoredOptions
	} from '#lib/core/options-storage';
	import { BatchQueue, type Job } from '#lib/core/queue.svelte';
	import { mergePdfParts } from '#lib/pipelines/merge-pdf';
	import type { DropNotice } from '#lib/core/route-files';
	import { SITE_ORIGIN } from '#lib/core/site';
	import type { ConvertOptions } from '#lib/core/types';
	import { loadConverter, WORKER_SLUGS } from '#lib/pipelines';
	import { relatedTools, type ToolDef } from '#lib/tools';
	import { createWorkerConverter } from '#lib/workers/client';

	let { data }: { data: { tool: ToolDef; allTools?: ToolDef[] } } = $props();
	// Route data is fixed for the lifetime of this page; read it once, outside reactivity.
	const tool = untrack(() => data.tool);

	/** Canonical and og:url share one value: the base-prefixed tool path. */
	const canonicalUrl = (() => {
		const root = resolve('/');
		const baseDir = root.endsWith('/') ? root : `${root}/`;
		return `${SITE_ORIGIN}${baseDir}${tool.slug}/`;
	})();

	const defaultOptions: ConvertOptions = {
		...(tool.fixedOptions ?? {}),
		...Object.fromEntries(tool.options.map((option) => [option.key, option.defaultValue]))
	};

	let options = $state<ConvertOptions>(loadStoredOptions(tool.slug, defaultOptions));

	$effect(() => {
		saveStoredOptions(tool.slug, options);
	});

	function resetOptions() {
		options = { ...defaultOptions };
		resetStoredOptions(tool.slug);
	}

	const queue = new BatchQueue(
		tool,
		async (file, ctx) => {
			const converter = await loadConverter(tool.slug);
			// Worker-capable tools keep the UI thread free; the queue contract is identical.
			if (!WORKER_SLUGS.has(tool.slug)) return converter(file, ctx);
			return createWorkerConverter(tool.slug, converter)(file, ctx);
		},
		// Many-to-one tools assemble one file from the per-file outputs.
		tool.finalizer
			? async (jobs, runOptions) => {
					if (tool.finalizer === 'combine-images' && runOptions.mode !== 'combined') return null;
					const parts = jobs.map((job) => job.result).filter((blob): blob is Blob => Boolean(blob));
					const pages = jobs.reduce((sum, job) => sum + (job.meta?.pages ?? 0), 0);
					const title = tool.finalizer === 'merge-pdf' ? 'Merged PDF' : 'Combined images';
					const blob = await mergePdfParts(parts, title);
					const date = new Date().toISOString().slice(0, 10);
					return tool.finalizer === 'merge-pdf'
						? {
								blob,
								name: `merged-${date}.pdf`,
								label: `Merged ${parts.length} PDFs${pages > 0 ? ` · ${pages} pages` : ''}`
							}
						: {
								blob,
								name: `images-${date}.pdf`,
								label: `Combined ${parts.length} ${parts.length === 1 ? 'image' : 'images'} into one PDF`
							};
				}
			: undefined
	);

	/** True when this batch produces one file instead of one output per input. */
	const combiningMode = $derived(
		tool.finalizer === 'merge-pdf' || (tool.finalizer === 'combine-images' && options.mode === 'combined')
	);
	const needsMoreFiles = $derived(queue.jobs.length > 0 && queue.jobs.length < tool.minFiles);

	let zipBusy = $state(false);
	let summaryEl = $state<HTMLElement | null>(null);
	/** Files the universal entry refused; shown once, then dismissible. */
	let handoffNotices = $state<DropNotice[]>([]);
	/** Files from the same drop that need a different converter. */
	let waitingCount = $state(0);
	/** Throttled live-region text: at most one announcement per second. */
	let liveMessage = $state('');
	/** Phones keep options collapsed so the drop zone and queue stay in reach. */
	let optionsExpanded = $state(true);
	let compact = $state(false);
	/** Tracks the running→finished edge so the summary is only scrolled to once. */
	let wasRunning = false;

	const maxTotalMb = LIMITS.maxTotalBytes / 1024 / 1024;
	const acceptedLabel = tool.accept.map((ext) => `.${ext}`).join(', ');

	// Consume pending handoff on mount (never auto-start)
	onMount(() => {
		waitingCount = waitingFileCount();

		const narrow = window.matchMedia('(max-width: 1023px)');
		const syncViewport = () => {
			compact = narrow.matches;
			// Desktop keeps options visible; phones start collapsed and can open them.
			optionsExpanded = !narrow.matches;
		};
		syncViewport();
		narrow.addEventListener('change', syncViewport);

		const handoff = peekPendingHandoff();
		if (handoff) {
			consumePendingHandoff();
			if (!handoff.targetToolSlug || handoff.targetToolSlug === tool.slug) {
				handoffNotices = handoff.notices ?? [];
				if (handoff.preselectedOptions) {
					options = { ...options, ...handoff.preselectedOptions };
				}
				if (handoff.files.length > 0) {
					void queue.add(handoff.files).then(() => {
						// Land with the file queued and Convert focused; never auto-start.
						// Phones show Convert in the sticky bar, so focus the visible one.
						window.setTimeout(() => {
							const buttons = document.querySelectorAll<HTMLButtonElement>('button[data-convert]');
							const visible = [...buttons].find((button) => button.getClientRects().length > 0);
							visible?.focus();
						}, 50);
					});
				}
			}
		}

		// Drops anywhere on the tool page join this queue instead of navigating.
		const unregister = registerIntake((files) => queue.add(files));

		// One announcement per second, not one per progress tick.
		const ticker = window.setInterval(() => {
			if (!queue.running) {
				if (liveMessage) liveMessage = '';
				return;
			}
			const settled = queue.jobs.filter(
				(job) => job.state === 'done' || job.state === 'error' || job.state === 'cancelled'
			).length;
			liveMessage = `${settled} of ${queue.jobs.length} files finished.`;
		}, 1000);

		return () => {
			unregister();
			window.clearInterval(ticker);
			narrow.removeEventListener('change', syncViewport);
		};
	});

	// Closing the tab mid-batch loses the work; let the browser ask first.
	$effect(() => {
		if (!queue.running) return;
		const warn = (event: BeforeUnloadEvent) => {
			event.preventDefault();
			event.returnValue = '';
		};
		window.addEventListener('beforeunload', warn);
		return () => window.removeEventListener('beforeunload', warn);
	});

	// On phones the result summary is below the fold; bring it into view when a batch ends.
	$effect(() => {
		const running = queue.running;
		const finished = queue.doneJobs.length;
		if (wasRunning && !running && finished > 0 && summaryEl) {
			// Move focus with the result so keyboard and screen-reader users land on it.
			summaryEl.focus({ preventScroll: true });
			const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
			summaryEl.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
		}
		wasRunning = running;
	});

	function download(job: Job) {
		if (job.result) downloadBlob(job.result, job.resultName);
	}

	function downloadCombined() {
		if (queue.combined) downloadBlob(queue.combined.blob, queue.combined.name);
	}

	async function downloadZip() {
		zipBusy = true;
		try {
			const zip = await queue.zipAll();
			if (zip) downloadBlob(zip.blob, zip.name);
		} catch {
			queue.notify('The ZIP could not be created. Try downloading the files individually.', 'danger');
		} finally {
			zipBusy = false;
		}
	}
</script>

<svelte:head>
	<title>{tool.name} — Converty</title>
	<meta name="description" content="{tool.tagline} {tool.description} Runs in your browser; no upload." />
	<link rel="canonical" href={canonicalUrl} />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="Converty" />
	<meta property="og:title" content="{tool.name} — Converty" />
	<meta
		property="og:description"
		content="{tool.tagline} {tool.description} Runs in your browser; no upload."
	/>
	<meta property="og:url" content={canonicalUrl} />
	<meta name="twitter:card" content="summary" />
</svelte:head>

<Nav />

<main id="main" class="mx-auto max-w-[1200px] px-5 py-8 md:px-6 md:py-12 lg:px-8">
	<nav aria-label="Breadcrumb" class="t-body-sm">
		<a href={resolve('/')} class="inline-flex items-center gap-1.5 text-body hover:text-ink">
			<span aria-hidden="true">&larr;</span> All converters
		</a>
	</nav>

	<header class="mt-4">
		<div class="flex flex-wrap items-center gap-2">
			<span
				class="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-bone text-ink"
			>
				<Icon name={tool.icon} size={19} />
			</span>
			<FidelityBadge fidelity={tool.fidelity} label={tool.fidelityTitle} />
			<span class="badge badge-neutral">100% local</span>
		</div>

		<h1 class="t-display-lg mt-4 text-ink">{tool.name}</h1>
		<p class="t-body-lg mt-2 max-w-[760px] text-body">{tool.description}</p>
	</header>

	<p class="t-body-sm mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-mute">
		<span class="font-semibold text-ink">1</span> Drop {acceptedLabel} files
		<span aria-hidden="true">&rarr;</span>
		<span class="font-semibold text-ink">2</span> Convert
		<span aria-hidden="true">&rarr;</span>
		<span class="font-semibold text-ink">3</span> Download as {tool.outputLabel}
	</p>

	<div class="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
		<section class="card p-5 md:p-6" aria-labelledby="files-heading">
			<div class="flex items-center justify-between gap-4">
				<h2 id="files-heading" class="t-heading-md text-ink">Your files</h2>
				<span class="t-body-sm tabular text-right text-mute">
					{queue.jobs.length}
					{queue.jobs.length === 1 ? 'file' : 'files'}
					{#if queue.totalBytes > 0}
						&middot; {formatBytes(queue.totalBytes)} of {maxTotalMb} MB
					{/if}
				</span>
			</div>

			<div class="mt-4">
				<DropZone
					accept={tool.acceptAttr}
					acceptedLabel={acceptedLabel}
					disabled={queue.running}
					atLimit={queue.totalBytes >= LIMITS.maxTotalBytes}
					pdfLimit={tool.accept.includes('pdf')}
					onfiles={async (files) => {
						await queue.add(files);
					}}
				/>
			</div>

			{#each handoffNotices as notice, index (index)}
				<FailureCard
					message={notice.message}
					suggestion={notice.suggestion}
					onDismiss={() =>
						(handoffNotices = handoffNotices.filter((_, position) => position !== index))}
				/>
			{/each}

			{#if waitingCount > 0}
				<div class="alert alert-info mt-4">
					<span class="mt-0.5 shrink-0 text-info" aria-hidden="true">
						<Icon name="file" size={18} />
					</span>
					<div>
						<p>
							{waitingCount}
							{waitingCount === 1 ? 'file' : 'files'} from that drop
							{waitingCount === 1 ? 'needs' : 'need'} a different converter.
						</p>
						<a href={resolve('/')} class="btn btn-secondary btn-sm mt-2">
							Choose for the rest
						</a>
					</div>
				</div>
			{/if}

			<NoticeList notices={queue.notices} ondismiss={(id) => queue.dismiss(id)} />

			<!-- One announcement per second; the percentage above is not a live region. -->
			<p class="sr-only" role="status" aria-live="polite">{liveMessage}</p>

			<!-- Overall Progress & ETA Banner -->
			{#if queue.running}
				<div class="mt-4 rounded-[var(--radius-md)] border border-info/30 bg-bone p-4">
					<div class="flex flex-wrap items-center justify-between gap-2">
						<span class="t-subtitle font-semibold text-ink flex items-center gap-2">
							<svg class="h-4 w-4 animate-spin text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
								<circle cx="12" cy="12" r="9" opacity="0.25" />
								<path d="M21 12a9 9 0 0 0-9-9" stroke-linecap="round" />
							</svg>
							Processing file {queue.doneJobs.length + 1} of {queue.jobs.length}
						</span>
						<div class="t-body-sm text-mute flex items-center gap-2 tabular">
							<span>{Math.round(queue.overallProgress * 100)}%</span>
							{#if queue.etaSeconds !== null && queue.etaSeconds > 0}
								<span>&middot; ~{queue.etaSeconds}s left</span>
							{/if}
						</div>
					</div>
					<div class="progress mt-2.5" role="progressbar" aria-valuenow={Math.round(queue.overallProgress * 100)} aria-valuemin="0" aria-valuemax="100">
						<div class="progress-fill" style="width: {Math.max(2, queue.overallProgress * 100)}%"></div>
					</div>
				</div>
			{/if}

			{#if tool.options.length > 0}
				<div class="mt-5 border-t border-line pt-5">
					<div class="flex items-center justify-between gap-3 mb-3">
						<span class="t-caption font-semibold uppercase tracking-wider text-mute">Options</span>
						<div class="flex items-center gap-3">
							{#if compact}
								<button
									type="button"
									class="t-caption inline-flex min-h-11 items-center font-semibold text-primary-text hover:underline cursor-pointer"
									aria-expanded={optionsExpanded}
									onclick={() => (optionsExpanded = !optionsExpanded)}
								>
									{optionsExpanded ? 'Hide options' : 'Customize'}
								</button>
							{/if}
							{#if isOptionsCustomized(options, defaultOptions)}
								<button
									type="button"
									class="t-caption inline-flex min-h-11 items-center font-semibold text-primary-text hover:underline cursor-pointer"
									onclick={resetOptions}
								>
									Reset options
								</button>
							{/if}
						</div>
					</div>
					{#if !compact || optionsExpanded}
						<OptionsPanel defs={tool.options} {options} disabled={queue.running} />
					{/if}
				</div>
			{/if}

			{#if queue.jobs.length > 0}
				<div class="mt-5 border-t border-line">
					<ul class="divide-y divide-line" aria-busy={queue.running}>
						{#each queue.jobs as job, index (job.id)}
							<FileRow
								{job}
								icon={tool.icon}
								onDownload={download}
								onRemove={(id) => queue.remove(id)}
								onRetry={(id) => queue.retry(id)}
								oncancel={(id) => queue.cancel(id)}
								busy={queue.running}
								showDownload={!combiningMode}
								canReorder={tool.arity === 'many-to-one' && queue.jobs.length > 1 && !queue.running}
								position={index}
								total={queue.jobs.length}
								onMove={(id, target) => queue.moveTo(id, target)}
							/>
						{/each}
					</ul>
				</div>

				<div class="mt-5 flex flex-col items-stretch gap-2 border-t border-line pt-5 sm:flex-row sm:flex-wrap sm:items-center">
					{#if queue.running || queue.queuedCount > 0}
						<button
							type="button"
							class="btn btn-primary hidden sm:inline-flex"
							data-convert
							disabled={queue.running || queue.queuedCount === 0 || queue.jobs.length < tool.minFiles}
							onclick={() => queue.run({ ...options })}
						>
							{#if queue.running}
								<svg
									class="h-4 w-4 animate-spin"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2.5"
									aria-hidden="true"
								>
									<circle cx="12" cy="12" r="9" opacity="0.25" />
									<path d="M21 12a9 9 0 0 0-9-9" stroke-linecap="round" />
								</svg>
								Converting…
							{:else}
								<Icon name="spark" size={18} />
								Convert {queue.queuedCount}
								{queue.queuedCount === 1 ? 'file' : 'files'}
							{/if}
						</button>
					{/if}

					{#if queue.running}
						<button type="button" class="btn btn-secondary" onclick={() => queue.stop()}>
							Stop
						</button>
					{/if}

					{#if queue.errorCount > 0 && !queue.running}
						<button type="button" class="btn btn-secondary" onclick={() => queue.retryAllFailed()}>
							Retry failed ({queue.errorCount})
						</button>
					{/if}

					{#if queue.doneJobs.length > 0 && queue.queuedCount === 0 && !queue.running}
						<button type="button" class="btn btn-secondary" onclick={() => queue.rerun({ ...options })}>
							Re-run with new settings
						</button>
					{/if}

					{#if queue.doneJobs.length > 1 && !combiningMode}
						<button type="button" class="btn btn-secondary" onclick={downloadZip} disabled={zipBusy}>
							<Icon name="download" size={18} />
							{zipBusy ? 'Zipping…' : `Download all (${queue.doneJobs.length})`}
						</button>
					{/if}

					{#if !queue.running}
						<button type="button" class="btn btn-ghost" onclick={() => queue.clear()}>
							Clear
						</button>
					{/if}
				</div>
			{/if}

			{#if needsMoreFiles}
				<div class="alert alert-info mt-4">
					<span class="mt-0.5 shrink-0 text-info" aria-hidden="true">
						<Icon name="file" size={18} />
					</span>
					<p>
						Add {tool.minFiles - queue.jobs.length} more
						{tool.minFiles - queue.jobs.length === 1 ? 'file' : 'files'} to {tool.shortName.toLowerCase()}.
					</p>
				</div>
			{/if}

			{#if queue.combining}
				<div class="alert alert-info mt-4" role="status">
					<span class="mt-0.5 shrink-0 text-info" aria-hidden="true">
						<Icon name="spark" size={18} />
					</span>
					<p>Combining files into one PDF…</p>
				</div>
			{/if}

			{#if queue.doneJobs.length > 0}
				<div
					class="alert alert-success mt-4"
					role="status"
					tabindex="-1"
					bind:this={summaryEl}
				>
					<span class="mt-0.5 shrink-0 text-success"><Icon name="check" size={18} /></span>
					<p>
						{queue.doneJobs.length} of {queue.jobs.length} converted.
						{#if queue.errorCount > 0}
							{queue.errorCount} failed — the reason is shown on each file above.
						{/if}
					</p>
				</div>
			{/if}

			{#if queue.combined}
				<div class="mt-4 rounded-[var(--radius-md)] border border-success/40 bg-bone p-4">
					<p class="t-subtitle text-ink">{queue.combined.label}</p>
					<p class="t-body-sm mt-0.5 text-mute">
						{formatBytes(queue.combined.blob.size)} · saved locally, not uploaded
					</p>
					<button type="button" class="btn btn-primary btn-sm mt-3" onclick={downloadCombined}>
						<Icon name="download" size={16} />
						Download {queue.combined.name}
					</button>
				</div>
			{/if}

			<p class="t-caption mt-4 flex items-center gap-1.5 text-mute">
				<Icon name="lock" size={14} />
				Files are decoded in this tab. Nothing is uploaded.
			</p>
		</section>

		<aside class="card p-5">
			<h2 class="t-subtitle text-ink">Limits &amp; notes</h2>
			<p class="t-body-sm mt-2 text-body">{tool.fidelityNote}</p>
			<ul class="mt-3 space-y-2">
				{#each tool.limitations as limitation}
					<li class="t-body-sm flex gap-2 text-body">
						<span class="mt-2 h-1 w-1 shrink-0 rounded-full bg-stone" aria-hidden="true"></span>
						{limitation}
					</li>
				{/each}
			</ul>
			<p class="t-caption mt-4 border-t border-line pt-3 text-mute">
				{LIMIT_LINE}{tool.accept.includes('pdf') ? ` · ${LIMITS.maxPdfPages} pages per PDF` : ''}. These
				caps are enforced in this tab to stay within browser memory — they are not a server quota.
			</p>
		</aside>
	</div>

	<!-- Mobile sticky bottom action bar -->
	{#if queue.jobs.length > 0 && (queue.running || queue.queuedCount > 0)}
		<!-- Reserves scroll space so the fixed bar never covers the last row. -->
		<div class="h-20 sm:hidden" aria-hidden="true"></div>
		<div
			class="fixed bottom-0 left-0 right-0 z-40 border-t border-line bg-canvas/95 backdrop-blur p-3 shadow-4 sm:hidden flex items-center justify-between gap-3"
		>
			<div class="min-w-0 flex-1">
				<p class="t-caption font-semibold text-ink truncate">
					{#if queue.running}
						Converting ({Math.round(queue.overallProgress * 100)}%)
					{:else}
						{queue.queuedCount} {queue.queuedCount === 1 ? 'file' : 'files'} ready
					{/if}
				</p>
			</div>
			{#if queue.running}
				<button type="button" class="btn btn-secondary btn-sm" onclick={() => queue.stop()}>
					Stop
				</button>
			{:else}
				<button
					type="button"
					class="btn btn-primary btn-sm"
					data-convert
					disabled={queue.queuedCount === 0 || queue.jobs.length < tool.minFiles}
					onclick={() => queue.run({ ...options })}
				>
					<Icon name="spark" size={16} />
					Convert {queue.queuedCount}
				</button>
			{/if}
		</div>
	{/if}
</main>

<Footer />
