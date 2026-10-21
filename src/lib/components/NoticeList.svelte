<script lang="ts">
	import type { Notice } from '#lib/core/queue.svelte';
	import Icon from './Icon.svelte';

	let { notices, ondismiss }: { notices: Notice[]; ondismiss: (id: number) => void } = $props();

	const toneClass: Record<Notice['tone'], string> = {
		info: 'alert-info',
		warning: 'alert-warning',
		danger: 'alert-danger'
	};
</script>

{#if notices.length > 0}
	<div class="mt-4 space-y-2" aria-live="polite">
		{#each notices as notice (notice.id)}
			<div class="alert {toneClass[notice.tone]}" role="status">
				<span class="mt-0.5 shrink-0" class:text-warning={notice.tone === 'warning'} class:text-danger={notice.tone === 'danger'} class:text-info={notice.tone === 'info'}>
					<Icon name="alert" size={18} />
				</span>
				<p class="flex-1">{notice.text}</p>
				<button
					type="button"
					class="btn btn-ghost btn-icon -my-2 -mr-2 shrink-0"
					aria-label="Dismiss message"
					onclick={() => ondismiss(notice.id)}
				>
					<Icon name="close" size={18} />
				</button>
			</div>
		{/each}
	</div>
{/if}
