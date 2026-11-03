<script lang="ts">
	import Icon from './Icon.svelte';

	let { ondropfiles }: { ondropfiles: (files: File[]) => void } = $props();

	let dragging = $state(false);
	let dragCounter = 0;

	function hasFiles(event: DragEvent): boolean {
		return event.dataTransfer?.types?.includes('Files') ?? false;
	}

	function onDragEnter(event: DragEvent) {
		if (!hasFiles(event)) return;
		dragCounter += 1;
		dragging = true;
	}

	function onDragLeave() {
		dragCounter -= 1;
		if (dragCounter <= 0) {
			dragCounter = 0;
			dragging = false;
		}
	}

	function onDragOver(event: DragEvent) {
		if (hasFiles(event)) event.preventDefault();
	}

	function onDrop(event: DragEvent) {
		// A dropzone below us already handled this drop.
		if (event.defaultPrevented) {
			dragCounter = 0;
			dragging = false;
			return;
		}
		event.preventDefault();
		dragCounter = 0;
		dragging = false;
		const files = event.dataTransfer?.files;
		if (files && files.length > 0) ondropfiles(Array.from(files));
	}
</script>

<svelte:window
	ondragenter={onDragEnter}
	ondragleave={onDragLeave}
	ondragover={onDragOver}
	ondrop={onDrop}
	ondragend={() => {
		dragCounter = 0;
		dragging = false;
	}}
/>

{#if dragging}
	<div
		class="pointer-events-none fixed inset-0 z-50 flex flex-col items-center justify-center bg-canvas/80 p-6 backdrop-blur-sm"
		aria-hidden="true"
	>
		<div
			class="flex w-full max-w-md flex-col items-center justify-center rounded-[var(--radius-lg)] border-2 border-dashed border-primary bg-bone/90 p-10 text-center shadow-4"
		>
			<span
				class="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-white shadow-2"
			>
				<Icon name="upload" size={32} />
			</span>
			<h3 class="t-heading-sm text-ink mt-4">Drop files anywhere</h3>
			<p class="t-body-md text-body mt-1">
				Supported files open in the right converter. Nothing leaves this device.
			</p>
		</div>
	</div>
{/if}
