<script lang="ts">
	import { onMount } from 'svelte';
	import { formatBytes } from '#lib/core/format';
	import type { FileGroup } from '#lib/core/route-files';
	import type { OutputChoice } from '#lib/tools';
	import Icon from './Icon.svelte';

	let {
		groups,
		onselect,
		oncancel
	}: {
		groups: FileGroup[];
		onselect: (group: FileGroup, choice: OutputChoice) => void;
		oncancel: () => void;
	} = $props();

	let heading = $state<HTMLHeadingElement | null>(null);

	// The chooser replaces the drop zone in place, so move focus into it.
	onMount(() => heading?.focus());

	const totalFiles = $derived(groups.reduce((sum, group) => sum + group.files.length, 0));

	/** "1 PDF document", "2 PDF documents". */
	function labelFor(group: FileGroup): string {
		return group.files.length === 1 ? group.label.replace(/s$/, '') : group.label;
	}
</script>

<div
	class="card border-line border p-6 bg-surface shadow-2"
	role="dialog"
	aria-labelledby="chooser-title"
	tabindex="-1"
	onkeydown={(event) => {
		if (event.key === 'Escape') {
			event.preventDefault();
			oncancel();
		}
	}}
>
	<div class="flex items-start justify-between gap-4 border-b border-line pb-4">
		<div>
			<h3
				id="chooser-title"
				class="t-heading-sm text-ink focus:outline-none"
				tabindex="-1"
				bind:this={heading}
			>
				Choose an output
			</h3>
			<p class="t-body-sm text-mute mt-0.5">
				{totalFiles}
				{totalFiles === 1 ? 'file' : 'files'} detected in this tab. Nothing has been uploaded.
			</p>
		</div>
		<button type="button" class="btn btn-ghost btn-sm" onclick={oncancel}>
			Cancel
		</button>
	</div>

	{#if groups.length > 1}
		<p class="t-body-sm mt-4 text-body">
			These file types need different converters. Start with one group — the rest stay waiting
			for you on this page.
		</p>
	{/if}

	<div class="mt-4 space-y-4">
		{#each groups as group}
			<div class="rounded-[var(--radius-md)] border border-line bg-bone/30 p-4">
				<div
					class="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-3"
				>
					<div class="flex items-center gap-2">
						<span class="badge badge-info font-medium">
							{group.files.length}
							{labelFor(group)}
						</span>
						<span class="t-body-sm text-mute">
							({formatBytes(group.files.reduce((sum, file) => sum + file.size, 0))})
						</span>
					</div>
					<div class="t-caption text-mute truncate max-w-xs">
						{group.files
							.map((file) => file.name)
							.slice(0, 3)
							.join(', ')}{group.files.length > 3 ? ` +${group.files.length - 3} more` : ''}
					</div>
				</div>

				<div class="mt-3.5">
					<p class="t-caption font-semibold text-mute uppercase tracking-wider mb-2.5">
						Available conversions:
					</p>
					<div class="flex flex-wrap gap-2">
						{#each group.choices as choice (choice.ext)}
							<button
								type="button"
								class="btn btn-secondary btn-sm flex items-center gap-2 hover:border-primary hover:text-primary"
								onclick={() => onselect(group, choice)}
							>
								<Icon name={choice.tool.icon} size={16} />
								<span>Convert to <strong class="text-ink">{choice.label}</strong></span>
							</button>
						{/each}
					</div>
				</div>
			</div>
		{/each}
	</div>
</div>
