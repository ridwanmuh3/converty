<script lang="ts">
	let { steps }: { steps: string[] } = $props();
</script>

<section aria-labelledby="how-to-heading">
	<h2 id="how-to-heading" class="t-heading-md text-ink">How to use this tool</h2>
	<ol class="mt-3 grid gap-3 sm:grid-cols-3">
		{#each steps as step, index}
			<li class="card flex gap-3 p-4">
				<span
					class="tabular flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bone t-body-sm font-semibold text-ink"
					aria-hidden="true">{index + 1}</span
				>
				<span class="t-body-md text-body">{step}</span>
			</li>
		{/each}
	</ol>
</section>
