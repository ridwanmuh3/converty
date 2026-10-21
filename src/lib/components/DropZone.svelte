<script lang="ts">
	import { LIMIT_LINE, LIMITS } from '#lib/core/limits';
	import Icon from './Icon.svelte';

	let {
		accept,
		acceptedLabel,
		onfiles,
		disabled = false,
		count = 0
	}: {
		accept: string;
		acceptedLabel: string;
		onfiles: (files: File[]) => void;
		disabled?: boolean;
		count?: number;
	} = $props();

	let dragging = $state(false);
	let input = $state<HTMLInputElement | null>(null);

	const atLimit = $derived(count >= LIMITS.maxFiles);

	function pick(files: FileList | null) {
		if (!files || disabled) return;
		onfiles(Array.from(files));
		if (input) input.value = '';
	}

	function openPicker() {
		if (!disabled && !atLimit) input?.click();
	}
</script>

<div
	class="dropzone"
	class:opacity-60={disabled || atLimit}
	class:cursor-not-allowed={disabled || atLimit}
	data-dragging={dragging}
	role="button"
	tabindex={disabled || atLimit ? -1 : 0}
	aria-disabled={disabled || atLimit}
	aria-label="Add files: {acceptedLabel}"
	onclick={openPicker}
	onkeydown={(event) => {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			openPicker();
		}
	}}
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
		onclick={(event) => event.stopPropagation()}
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
	<p class="t-body-md text-body">
		{#if atLimit}
			Convert or remove a file to add more — the limit is {LIMITS.maxFiles} per batch.
		{:else}
			or <span class="font-semibold text-primary">click to browse</span>
		{/if}
	</p>
	<p class="t-body-sm mt-1 text-mute">{acceptedLabel}</p>
	<p class="t-caption text-mute">{LIMIT_LINE} · PDFs up to {LIMITS.maxPdfPages} pages</p>
</div>
