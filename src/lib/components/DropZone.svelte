<script lang="ts">
	import { LIMIT_LINE, LIMITS } from '#lib/core/limits';
	import Icon from './Icon.svelte';

	let {
		accept,
		acceptedLabel,
		onfiles,
		disabled = false,
		atLimit = false,
		pdfLimit = false
	}: {
		accept: string;
		acceptedLabel: string;
		onfiles: (files: File[]) => void;
		disabled?: boolean;
		atLimit?: boolean;
		pdfLimit?: boolean;
	} = $props();

	let dragging = $state(false);
	let input = $state<HTMLInputElement | null>(null);

	function pick(files: FileList | null) {
		if (!files || disabled || atLimit) return;
		onfiles(Array.from(files));
		if (input) input.value = '';
	}
</script>

<!--
	A native <label> wrapping the file input gives the input its accessible name
	from the visible text, and keeps one keyboard focus stop (the input). Clicking
	the label opens the picker without a scripted click, and Enter/Space work
	because the underlying control is a real file input.
-->
<label
	class="dropzone"
	class:opacity-60={disabled || atLimit}
	class:cursor-not-allowed={disabled || atLimit}
	data-dragging={dragging}
	ondragover={(event) => {
		event.preventDefault();
		if (!disabled && !atLimit) dragging = true;
	}}
	ondragleave={() => (dragging = false)}
	ondrop={(event) => {
		event.preventDefault();
		dragging = false;
		pick(event.dataTransfer?.files ?? null);
	}}
>
	<input
		bind:this={input}
		class="sr-only"
		type="file"
		{accept}
		multiple
		disabled={disabled || atLimit}
		onchange={(event) => pick(event.currentTarget.files)}
	/>

	<span
		class="flex h-11 w-11 items-center justify-center rounded-full bg-bone text-ink"
		aria-hidden="true"
	>
		<Icon name="upload" size={22} />
	</span>

	<p class="t-subtitle mt-1 text-ink">
		{atLimit ? 'Batch is full' : dragging ? 'Drop to add' : 'Drop files here'}
	</p>
	<p class="t-body-md text-body" aria-live="polite">
		{#if atLimit}
			Input size limit reached — remove files to add more.
		{:else}
			or <span class="font-semibold text-primary-text">click to browse</span>
		{/if}
	</p>
	<p class="t-body-sm mt-1 text-mute">{acceptedLabel}</p>
	<p class="t-caption text-mute">{LIMIT_LINE}{pdfLimit ? ` · PDFs up to ${LIMITS.maxPdfPages} pages` : ''}</p>
</label>
