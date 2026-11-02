<script lang="ts">
	import { resolve } from '$app/paths';
	import { TOOLS } from '#lib/tools/registry';
	import Icon from './Icon.svelte';

	const year = new Date().getFullYear();
</script>

<footer class="border-t border-line bg-bone">
	<div class="mx-auto max-w-[1200px] px-5 py-12 md:px-6 lg:px-8">
		<div class="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
			<div>
				<div class="flex items-center gap-2.5">
					<span
						class="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] bg-primary text-white"
					>
						<Icon name="spark" size={18} />
					</span>
					<span class="t-subtitle text-ink">Converty</span>
				</div>
				<p class="t-body-md mt-3 max-w-[320px] text-body">
					Files are converted in your browser, without uploading them for processing. Size caps keep the tab within memory.
				</p>
			</div>

			<div>
				<h2 class="t-body-sm font-semibold text-ink">Converters</h2>
				<ul class="mt-3 space-y-2">
					{#each TOOLS as tool}
						<li>
							<a class="t-body-sm text-body hover:text-ink" href={`${resolve('/')}${tool.slug}`}>{tool.name}</a>
						</li>
					{/each}
				</ul>
			</div>

			<div>
				<h2 class="t-body-sm font-semibold text-ink">Good to know</h2>
				<ul class="mt-3 space-y-2">
				<li><a class="t-body-sm text-body hover:text-ink" href={resolve('/#privacy')}>Privacy</a></li>
				<li><a class="t-body-sm text-body hover:text-ink" href={resolve('/#limits')}>Limits</a></li>
				<li><a class="t-body-sm text-body hover:text-ink" href={resolve('/#faq')}>FAQ</a></li>
				</ul>
			</div>
		</div>

		<div class="mt-10 flex flex-col gap-2 border-t border-line-strong pt-6">
			<p class="t-caption text-mute">
				© {year} Converty. File conversion runs on your device.
			</p>
			<p class="t-caption text-mute">
				Product names such as PDF, Word and Excel are trademarks of their owners and are used only
				to describe compatibility.
			</p>
		</div>
	</div>
</footer>
