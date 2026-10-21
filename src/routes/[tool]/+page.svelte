<script lang="ts">
	import { untrack } from 'svelte';
	import Footer from '#lib/components/Footer.svelte';
	import DropZone from '#lib/components/DropZone.svelte';
	import FidelityBadge from '#lib/components/FidelityBadge.svelte';
	import FileRow from '#lib/components/FileRow.svelte';
	import HowTo from '#lib/components/HowTo.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Nav from '#lib/components/Nav.svelte';
	import NoticeList from '#lib/components/NoticeList.svelte';
	import OptionsPanel from '#lib/components/OptionsPanel.svelte';
	import { downloadBlob } from '#lib/core/download';
	import { LIMITS } from '#lib/core/limits';
	import { BatchQueue, type Job } from '#lib/core/queue.svelte';
	import type { ConvertOptions } from '#lib/core/types';
	import { loadConverter } from '#lib/pipelines';
	import { TOOLS, type ToolDef } from '#lib/tools/registry';

	let { data }: { data: { tool: ToolDef } } = $props();
	// Route data is fixed for the lifetime of this page; read it once, outside reactivity.
	const tool = untrack(() => data.tool);

	let options = $state<ConvertOptions>(
		Object.fromEntries(tool.options.map((option) => [option.key, option.defaultValue]))
	);

	const queue = new BatchQueue(tool, async (file, ctx) => {
		const converter = await loadConverter(tool.slug);
		return converter(file, ctx);
	});

	let zipBusy = $state(false);

	const acceptedLabel = tool.accept.map((ext) => `.${ext}`).join(', ');
	const otherTools = TOOLS.filter((candidate) => candidate.slug !== tool.slug);

	function download(job: Job) {
		if (job.result) downloadBlob(job.result, job.resultName);
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
	<title>{tool.name} — LocalConvert</title>
	<meta name="description" content="{tool.tagline} {tool.description} Runs in your browser; no upload." />
</svelte:head>

<Nav />

<main id="main" class="mx-auto max-w-[1200px] px-5 py-8 md:px-6 md:py-12 lg:px-8">
	<nav aria-label="Breadcrumb" class="t-body-sm">
		<a href="/" class="inline-flex items-center gap-1.5 text-body hover:text-ink">
			<span aria-hidden="true">←</span> All converters
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

	<div class="mt-8">
		<HowTo steps={tool.steps} />
	</div>

	<div class="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
		<section class="card p-5 md:p-6" aria-labelledby="files-heading">
			<div class="flex items-center justify-between gap-4">
				<h2 id="files-heading" class="t-heading-md text-ink">Your files</h2>
				<span class="t-body-sm tabular text-mute">
					{queue.jobs.length} / {LIMITS.maxFiles}
				</span>
			</div>

			<div class="mt-4">
				<DropZone
					accept={tool.acceptAttr}
					acceptedLabel={acceptedLabel}
					disabled={queue.running}
					count={queue.jobs.length}
					onfiles={async (files) => {
						await queue.add(files);
					}}
				/>
			</div>

			<NoticeList notices={queue.notices} ondismiss={(id) => queue.dismiss(id)} />

			{#if tool.options.length > 0}
				<div class="mt-5 border-t border-line pt-5">
					<OptionsPanel defs={tool.options} {options} disabled={queue.running} />
				</div>
			{/if}

			{#if queue.jobs.length > 0}
				<div class="mt-5 border-t border-line">
					<ul class="divide-y divide-line" aria-live="polite">
						{#each queue.jobs as job (job.id)}
							<FileRow
								{job}
								icon={tool.icon}
								onDownload={download}
								onRemove={(id) => queue.remove(id)}
								onRetry={(id) => queue.retry(id)}
								oncancel={(id) => queue.cancel(id)}
							/>
						{/each}
					</ul>
				</div>

				<div class="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-5">
					<button
						type="button"
						class="btn btn-primary"
						disabled={queue.running || queue.queuedCount === 0}
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

					{#if queue.running}
						<button type="button" class="btn btn-secondary" onclick={() => queue.stop()}>
							Stop
						</button>
					{/if}

					{#if queue.doneJobs.length > 1}
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

			{#if queue.doneJobs.length > 0}
				<div class="alert alert-success mt-4" role="status">
					<span class="mt-0.5 shrink-0 text-success"><Icon name="check" size={18} /></span>
					<p>
						{queue.doneJobs.length} of {queue.jobs.length} converted.
						{#if queue.errorCount > 0}
							{queue.errorCount} failed — the reason is shown on each file above.
						{/if}
					</p>
				</div>
			{/if}

			<p class="t-caption mt-4 flex items-center gap-1.5 text-mute">
				<Icon name="lock" size={14} />
				Files are decoded in this tab. Nothing is uploaded.
			</p>
		</section>

		<aside class="space-y-4">
			<div class="card p-5">
				<h2 class="t-subtitle text-ink">What you get</h2>
				<p class="t-body-sm mt-2 text-body">{tool.fidelityNote}</p>
			</div>

			<div class="card p-5">
				<h2 class="t-subtitle text-ink">Known limits</h2>
				<ul class="mt-3 space-y-2">
					{#each tool.limitations as limitation}
						<li class="t-body-sm flex gap-2 text-body">
							<span class="mt-2 h-1 w-1 shrink-0 rounded-full bg-stone" aria-hidden="true"></span>
							{limitation}
						</li>
					{/each}
				</ul>
			</div>

			<div class="card p-5">
				<h2 class="t-subtitle text-ink">Batch limits</h2>
				<ul class="t-body-sm mt-3 space-y-2">
					<li class="flex items-center justify-between gap-3 border-b border-line pb-2">
						<span class="text-body">Files per batch</span>
						<span class="tabular font-semibold text-ink">{LIMITS.maxFiles}</span>
					</li>
					<li class="flex items-center justify-between gap-3 border-b border-line pb-2">
						<span class="text-body">Size per file</span>
						<span class="tabular font-semibold text-ink"
							>{LIMITS.maxFileBytes / 1024 / 1024} MB</span
						>
					</li>
					<li class="flex items-center justify-between gap-3 border-b border-line pb-2">
						<span class="text-body">Total per batch</span>
						<span class="tabular font-semibold text-ink"
							>{LIMITS.maxTotalBytes / 1024 / 1024} MB</span
						>
					</li>
					{#if tool.accept.includes('pdf')}
						<li class="flex items-center justify-between gap-3">
							<span class="text-body">Pages per PDF</span>
							<span class="tabular font-semibold text-ink">{LIMITS.maxPdfPages}</span>
						</li>
					{/if}
				</ul>
			</div>

			<div class="card p-5">
				<h2 class="t-subtitle text-ink">Proof, not a promise</h2>
				<p class="t-body-sm mt-2 text-body">
					Open DevTools → Network, then convert a file. No request carries your document.
				</p>
			</div>
		</aside>
	</div>

	{#if otherTools.length > 0}
		<section class="mt-12 border-t border-line pt-8" aria-labelledby="other-tools">
			<h2 id="other-tools" class="t-heading-md text-ink">Other converters</h2>
			<ul class="mt-4 flex flex-wrap gap-2">
				{#each otherTools as other}
					<li>
						<a
							href="/{other.slug}"
							class="btn btn-secondary btn-sm"
						>
							<Icon name={other.icon} size={16} />
							{other.name}
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</main>

<Footer />
