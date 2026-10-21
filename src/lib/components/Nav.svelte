<script lang="ts">
	import Icon from './Icon.svelte';
	import ThemeToggle from './ThemeToggle.svelte';
</script>

<header class="navbar">
	<div class="mx-auto flex h-full max-w-[1200px] items-center justify-between px-5 md:px-6 lg:px-8">
		<a href="/" class="flex items-center gap-2.5" aria-label="LocalConvert home">
			<span
				class="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] bg-primary text-white"
			>
				<Icon name="spark" size={18} />
			</span>
			<span class="t-subtitle text-ink">LocalConvert</span>
		</a>

		<nav class="hidden items-center gap-6 md:flex" aria-label="Main">
			<a class="t-body-md text-body hover:text-ink" href="/#tools">Tools</a>
			<a class="t-body-md text-body hover:text-ink" href="/#how">How it works</a>
			<a class="t-body-md text-body hover:text-ink" href="/#privacy">Privacy</a>
			<a class="t-body-md text-body hover:text-ink" href="/#faq">FAQ</a>
		</nav>

		<div class="flex items-center gap-1">
			<div class="hidden md:block">
				<a href="/#tools" class="btn btn-secondary btn-sm">Start converting</a>
			</div>
			<ThemeToggle />
		</div>
	</div>
</header>
