<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from './Icon.svelte';

	let theme = $state<'light' | 'dark'>('light');

	onMount(() => {
		theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
	});

	function toggle() {
		theme = theme === 'dark' ? 'light' : 'dark';
		document.documentElement.dataset.theme = theme;
		try {
			localStorage.setItem('theme', theme);
		} catch {
			// Private-mode storage failures should never break the toggle.
		}
	}
</script>

<button
	type="button"
	class="btn btn-ghost btn-icon"
	aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
	title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
	onclick={toggle}
>
	<Icon name={theme === 'dark' ? 'sun' : 'moon'} size={20} />
</button>
