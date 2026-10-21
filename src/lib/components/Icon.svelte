<script lang="ts">
	import type { IconName } from './icon-names';

	let {
		name,
		size = 20,
		strokeWidth = 1.75
	}: { name: IconName; size?: number; strokeWidth?: number } = $props();

	const paths: Record<IconName, string[]> = {
		image: [
			'M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z',
			'M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3',
			'm20 15.5-4.2-4.2L6 20'
		],
		word: ['M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z', 'M14 3v5h5', 'M9 13h6M9 17h4'],
		excel: [
			'M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z',
			'M4 10h16M10 10v10'
		],
		pdf: ['M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z', 'M14 3v5h5', 'M9 17v-4h2a1.5 1.5 0 0 1 0 3H9'],
		'arrow-right': ['M4 12h15', 'm13 6 6 6-6 6'],
		download: ['M12 3v12', 'm8 11 4 4 4-4', 'M4 21h16'],
		close: ['m6 6 12 12', 'M18 6 6 18'],
		check: ['m5 13 4 4L19 7'],
		alert: ['M10.3 4.2 2.7 17a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z', 'M12 9v4', 'M12 17h.01'],
		shield: ['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', 'm9 12 2 2 4-4'],
		lock: ['M6 11h12v9H6z', 'M9 11V8a3 3 0 0 1 6 0v3'],
		upload: ['M12 21V9', 'm8 13 4-4 4 4', 'M4 4h16'],
		sun: [
			'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
			'M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4'
		],
		moon: ['M21 12.8A8.5 8.5 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8'],
		spark: ['M13 2 4 14h6l-1 8 9-12h-6z'],
		file: ['M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z', 'M14 3v5h5'],
		trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13', 'M10 11v6M14 11v6']
	};
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width={strokeWidth}
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
	focusable="false"
>
	{#each paths[name] as d}
		<path {d} />
	{/each}
</svg>
