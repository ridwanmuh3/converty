<script lang="ts">
	import { onMount } from 'svelte';
	import { applyUpdate, dismissInstall, pwa, requestInstall, startPwa } from '#lib/core/pwa.svelte';

	onMount(() => startPwa());

	const showInstall = $derived(pwa.canInstall && pwa.converted && !pwa.dismissed);
</script>

{#if pwa.offline}
	<div
		class="fixed inset-x-0 top-0 z-50 bg-ink px-4 py-1.5 text-center t-caption text-white"
		role="status"
	>
		Offline — tools you have already opened keep working.
	</div>
{/if}

{#if pwa.updateReady || showInstall}
	<div
		class="card fixed right-4 bottom-24 z-40 w-[min(20rem,calc(100vw-2rem))] border border-line bg-surface p-4 shadow-2 sm:bottom-4"
		role="status"
	>
		{#if pwa.updateReady}
			<p class="t-body-strong">A new version is ready.</p>
			<p class="t-caption mt-1 text-mute">Reload to pick up the latest fixes and tools.</p>
			<div class="mt-3 flex gap-2">
				<button
					type="button"
					class="min-h-11 rounded-[var(--radius-sm)] bg-primary px-3 t-caption font-medium text-white hover:bg-primary-deep"
					onclick={applyUpdate}
				>
					Reload
				</button>
				<button
					type="button"
					class="min-h-11 rounded-[var(--radius-sm)] px-3 t-caption text-mute hover:text-ink"
					onclick={() => (pwa.updateReady = false)}
				>
					Later
				</button>
			</div>
		{:else}
			<p class="t-body-strong">Install Converty</p>
			<p class="t-caption mt-1 text-mute">
				One tap from your home screen. Files still never leave this device.
			</p>
			<div class="mt-3 flex gap-2">
				<button
					type="button"
					class="min-h-11 rounded-[var(--radius-sm)] bg-primary px-3 t-caption font-medium text-white hover:bg-primary-deep"
					onclick={requestInstall}
				>
					Install
				</button>
				<button
					type="button"
					class="min-h-11 rounded-[var(--radius-sm)] px-3 t-caption text-mute hover:text-ink"
					onclick={dismissInstall}
				>
					Not now
				</button>
			</div>
		{/if}
	</div>
{/if}
