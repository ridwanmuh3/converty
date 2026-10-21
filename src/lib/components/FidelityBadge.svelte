<script lang="ts">
	import type { Fidelity } from '#lib/core/types';
	import { FIDELITY_BADGE, FIDELITY_LABEL } from '#lib/tools/registry';

	let { fidelity, label }: { fidelity: Fidelity; label?: string } = $props();
</script>

<span class="badge {FIDELITY_BADGE[fidelity]}">{label ?? FIDELITY_LABEL[fidelity]}</span>
