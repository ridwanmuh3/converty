<script lang="ts">
	import '../app.css';

	let { children } = $props();
</script>

<a
	href="#main"
	class="sr-only rounded-[var(--radius-md)] bg-primary px-4 py-2 text-white focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
>
	Skip to content
</a>

{@render children()}
