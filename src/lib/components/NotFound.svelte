<script lang="ts">
	import Footer from './Footer.svelte';
	import Icon from './Icon.svelte';
	import Nav from './Nav.svelte';

	let {
		status = 404,
		message = 'That page does not exist. Pick a converter below and your files stay on your device.'
	}: { status?: number; message?: string } = $props();
</script>

<svelte:head>
	<title>Page not found — Converty</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<Nav />

<main id="main" class="mx-auto max-w-[1200px] px-5 py-16 md:px-6 md:py-24 lg:px-8">
	<p class="t-caption tabular text-mute">{status}</p>
	<h1 class="t-display-lg mt-2 text-ink">We can’t find that page</h1>
	<p class="t-body-lg mt-2 max-w-[560px] text-body">{message}</p>

	<div class="mt-6 flex flex-wrap gap-3">
		<a href="/" class="btn btn-primary">
			Choose a converter
			<Icon name="arrow-right" size={18} />
		</a>
		<a href="/#faq" class="btn btn-secondary">Read the FAQ</a>
	</div>
</main>

<Footer />
