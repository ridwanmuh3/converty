<script lang="ts">
	import { page } from '$app/state';
	import NotFound from '#lib/components/NotFound.svelte';
</script>

<NotFound
	status={page.status}
	message={page.error?.message ?? 'That page does not exist. Pick a converter below and your files stay on your device.'}
/>
