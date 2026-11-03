<script lang="ts">
	import '../app.css';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import GlobalDropOverlay from '#lib/components/GlobalDropOverlay.svelte';
	import PwaStatus from '#lib/components/PwaStatus.svelte';
	import { setPendingDrop } from '#lib/core/handoff.svelte';
	import { deliverFiles } from '#lib/core/intake.svelte';
	import { analyzeDrop, openInTool, toolAcceptsAll } from '#lib/core/route-files';
	import { getTool } from '#lib/tools';

	let { children } = $props();

	const homePath = resolve('/');

	function isHome(pathname: string): boolean {
		return pathname === homePath || `${pathname}/` === homePath || pathname === homePath.slice(0, -1);
	}

	async function handleDrop(files: File[]) {
		if (files.length === 0) return;

		// On a tool page, a drop the current tool understands stays on that page
		// and joins its queue. Everything else takes the universal path.
		const current = page.params.tool ? getTool(page.params.tool) : undefined;
		if (current && toolAcceptsAll(current, files) && deliverFiles(files)) return;

		const analysis = await analyzeDrop(files);
		if (analysis.groups.length === 1 && analysis.groups[0].choices.length === 1) {
			await openInTool(analysis.groups[0].choices[0], analysis.groups[0].files, analysis.notices);
			return;
		}

		// A choice (or a refusal) is needed; the home page owns that UI.
		if (isHome(page.url.pathname) && deliverFiles(files)) return;
		setPendingDrop(files);
		await goto(homePath);
	}
</script>

<a
	href="#main"
	class="sr-only rounded-[var(--radius-md)] bg-primary px-4 py-2 text-white focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
>
	Skip to content
</a>

<GlobalDropOverlay ondropfiles={handleDrop} />
<PwaStatus />

{@render children()}
