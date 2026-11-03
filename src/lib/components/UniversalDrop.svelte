<script lang="ts">
	import { tick } from 'svelte';
	import { analyzeDrop, openInTool, type DropNotice, type FileGroup } from '#lib/core/route-files';
	import { setWaitingFiles } from '#lib/core/handoff.svelte';
	import { LIMITS } from '#lib/core/limits';
	import type { OutputChoice } from '#lib/tools';
	import FailureCard from './FailureCard.svelte';
	import Icon from './Icon.svelte';
	import OutputChooser from './OutputChooser.svelte';

	let dragging = $state(false);
	let analyzing = $state(false);
	let fileInput = $state<HTMLInputElement | null>(null);
	let detectedGroups = $state<FileGroup[] | null>(null);
	let notices = $state<DropNotice[]>([]);

	/**
	 * Detects and routes a set of files. Exported so the global drag overlay can
	 * feed the home page without a second copy of the routing rules.
	 */
	export async function handleFiles(files: File[]): Promise<void> {
		if (files.length === 0) return;
		analyzing = true;
		detectedGroups = null;
		notices = [];

		try {
			const analysis = await analyzeDrop(files);
			notices = analysis.notices;

			if (analysis.groups.length === 0) return;

			// One group with one possible output: no decision left to make.
			if (analysis.groups.length === 1 && analysis.groups[0].choices.length === 1) {
				const group = analysis.groups[0];
				await openInTool(group.choices[0], group.files, analysis.notices);
				return;
			}

			detectedGroups = analysis.groups;
		} finally {
			analyzing = false;
			if (fileInput) fileInput.value = '';
		}
	}

	async function choose(group: FileGroup, choice: OutputChoice): Promise<void> {
		const rest = (detectedGroups ?? []).filter((entry) => entry !== group).flatMap((entry) => entry.files);
		if (rest.length > 0) setWaitingFiles(rest);
		await openInTool(choice, group.files, notices);
	}

	async function cancel() {
		detectedGroups = null;
		notices = [];
		// The drop zone returns; put keyboard focus back on its file input.
		await tick();
		fileInput?.focus();
	}
</script>

<div class="w-full max-w-2xl mx-auto">
	{#each notices as notice, index (index)}
		<FailureCard
			message={notice.message}
			suggestion={notice.suggestion}
			onDismiss={() => (notices = notices.filter((_, position) => position !== index))}
		/>
	{/each}

	{#if detectedGroups && detectedGroups.length > 0}
		<OutputChooser groups={detectedGroups} onselect={choose} oncancel={cancel} />
	{:else}
		<label
			class="dropzone"
			data-dragging={dragging}
			aria-busy={analyzing}
			ondragover={(event) => {
				event.preventDefault();
				dragging = true;
			}}
			ondragleave={() => (dragging = false)}
			ondrop={(event) => {
				event.preventDefault();
				dragging = false;
				if (event.dataTransfer?.files) {
					void handleFiles(Array.from(event.dataTransfer.files));
				}
			}}
		>
			<input
				bind:this={fileInput}
				class="sr-only"
				type="file"
				multiple
				onchange={(event) => {
					if (event.currentTarget.files) {
						void handleFiles(Array.from(event.currentTarget.files));
					}
				}}
			/>

			<span
				class="flex h-11 w-11 items-center justify-center rounded-full bg-bone text-ink"
				aria-hidden="true"
			>
				{#if analyzing}
					<svg
						class="h-5 w-5 animate-spin text-primary"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.5"
					>
						<circle cx="12" cy="12" r="9" opacity="0.25" />
						<path d="M21 12a9 9 0 0 0-9-9" stroke-linecap="round" />
					</svg>
				{:else}
					<Icon name="upload" size={22} />
				{/if}
			</span>

			<p class="t-subtitle mt-1 text-ink font-semibold">
				{analyzing ? 'Checking files…' : dragging ? 'Drop to convert' : 'Drop any file here'}
			</p>
			<p class="t-body-md text-body">
				or <span class="font-semibold text-primary-text">click to browse</span>
			</p>
			<p class="t-body-sm mt-1 text-mute">
				Images, PDFs, Word, Excel, Audio, Videos &middot; Local in your browser
			</p>
			<p class="t-caption mt-2 text-mute">
				Up to {LIMITS.maxFileBytes / 1024 / 1024} MB per file. Nothing leaves this device.
			</p>
		</label>
	{/if}
</div>
