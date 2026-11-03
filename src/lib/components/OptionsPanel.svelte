<script lang="ts">
	import type { ConvertOptions } from '#lib/core/types';
	import type { ToolOption } from '#lib/tools/registry';

	let {
		defs,
		options,
		disabled = false
	}: { defs: ToolOption[]; options: ConvertOptions; disabled?: boolean } = $props();

	function set(key: string, value: string) {
		options[key] = value;
	}
</script>

{#if defs.length > 0}
	<div class="grid gap-4 sm:grid-cols-2">
		{#each defs as def (def.key)}
			<div class={def.type === 'range' ? 'sm:col-span-2' : ''}>
				<label class="t-body-sm mb-1.5 block font-semibold text-ink" for="option-{def.key}">
					{def.label}
					{#if def.type === 'range'}
						<span class="tabular ml-1 font-normal text-body"
							>{Math.round(Number(options[def.key]) * 100)}%</span
						>
					{/if}
				</label>

				{#if def.type === 'text'}
					<input
						id="option-{def.key}"
						class="select h-11 w-full"
						type="text"
						placeholder={def.placeholder}
						{disabled}
						value={options[def.key]}
						oninput={(event) => set(def.key, event.currentTarget.value)}
					/>
				{:else if def.type === 'select'}
					<select
						id="option-{def.key}"
						class="select"
						{disabled}
						value={options[def.key]}
						onchange={(event) => set(def.key, event.currentTarget.value)}
					>
						{#each def.choices ?? [] as choice}
							<option value={choice.value}>{choice.label}</option>
						{/each}
					</select>
				{:else}
					<input
						id="option-{def.key}"
						class="h-11 w-full"
						style="accent-color: var(--primary)"
						type="range"
						min={def.min ?? 0}
						max={def.max ?? 1}
						step={def.step ?? 0.05}
						{disabled}
						value={options[def.key]}
						oninput={(event) => set(def.key, event.currentTarget.value)}
					/>
				{/if}

				{#if def.hint}
					<p class="t-caption mt-1 text-mute">{def.hint}</p>
				{/if}
			</div>
		{/each}
	</div>
{/if}
