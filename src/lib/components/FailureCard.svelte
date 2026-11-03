<script lang="ts">
	import Icon from './Icon.svelte';

	let {
		title = 'File cannot be converted',
		message,
		suggestion,
		onDismiss
	}: {
		title?: string;
		message: string;
		suggestion?: string;
		onDismiss?: () => void;
	} = $props();
</script>

<div class="card border-line border p-4 bg-bone/50 dark:bg-card my-3" role="alert">
	<div class="flex items-start gap-3">
		<span class="mt-0.5 shrink-0 text-danger" aria-hidden="true">
			<svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
				<path
					fill-rule="evenodd"
					d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
					clip-rule="evenodd"
				/>
			</svg>
		</span>
		<div class="flex-1 min-w-0">
			<h4 class="t-subtitle text-ink">{title}</h4>
			<p class="t-body-sm text-body mt-1">{message}</p>
			{#if suggestion}
				<div class="mt-2 rounded-[var(--radius-sm)] bg-surface px-3 py-2 text-mute t-caption">
					<span class="font-semibold text-ink">Suggested action: </span>{suggestion}
				</div>
			{/if}
		</div>
		{#if onDismiss}
			<button
				type="button"
				class="btn btn-ghost btn-sm shrink-0"
				onclick={onDismiss}
				aria-label="Dismiss message"
			>
				Close
			</button>
		{/if}
	</div>
</div>
