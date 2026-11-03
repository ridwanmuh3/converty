import type { FileKind } from '#lib/core/validate';
import type { ToolCategory, ToolDef, ToolOutputDef } from './types';

/**
 * Returns all valid tool outputs for a given file kind, useful for
 * universal drop and smart conversion chooser.
 */
export function outputsFor(
	kind: FileKind,
	tools: ToolDef[]
): Array<{ tool: ToolDef; output: ToolOutputDef }> {
	const matches = tools.filter((tool) => tool.input.kinds.includes(kind));
	const results: Array<{ tool: ToolDef; output: ToolOutputDef }> = [];
	const seen = new Set<string>();

	for (const tool of matches) {
		const key = `${tool.output.ext}:${tool.slug}`;
		if (!seen.has(key)) {
			seen.add(key);
			results.push({ tool, output: tool.output });
		}
	}

	return results;
}

/** A concrete, pre-selectable conversion offered by the universal drop zone. */
export interface OutputChoice {
	tool: ToolDef;
	/** Valid option values to pre-select on the tool page. */
	options: Record<string, string>;
	/** Short label for the produced format, e.g. "PNG" or "PDF". */
	label: string;
	/** Result extension, normalised so jpg/jpeg collapse into one choice. */
	ext: string;
}

const normaliseExt = (ext: string): string => ext.replace(/^\./, '').replace(/^jpeg$/, 'jpg');

/** "JPEG — small, photographic" becomes "JPEG" so chooser buttons stay scannable. */
function shortLabel(label: string): string {
	return label.split('—')[0].split(' - ')[0].trim();
}

/**
 * Every output a file kind can become, including the alternatives hidden behind
 * a tool's `format` option. Results are de-duplicated by extension so the
 * chooser never offers the same target twice.
 *
 * When `ext` is known it also filters by extension, which is what separates
 * .docx from .xlsx (both are `zip` files to the signature detector).
 */
export function outputChoicesFor(kind: FileKind, ext: string, tools: ToolDef[]): OutputChoice[] {
	const choices: OutputChoice[] = [];
	const seen = new Set<string>();

	for (const tool of tools) {
		if (tool.excludeFromChooser) continue;
		if (!tool.input.kinds.includes(kind)) continue;
		if (ext && tool.input.extensions.length > 0 && !tool.input.extensions.includes(ext)) continue;

		const format = tool.options.find(
			(option) => option.key === 'format' && option.type === 'select' && (option.choices?.length ?? 0) > 0
		);

		const candidates = format
			? (format.choices ?? []).map((choice) => ({
					options: { [format.key]: choice.value },
					label: shortLabel(choice.label),
					ext: normaliseExt(choice.value)
				}))
			: [{ options: {}, label: tool.output.label, ext: normaliseExt(tool.output.ext) }];

		for (const candidate of candidates) {
			if (seen.has(candidate.ext)) continue;
			seen.add(candidate.ext);
			choices.push({ tool, ...candidate });
		}
	}

	return choices;
}

/**
 * Returns all tools that accept the given file kind.
 */
export function toolsForKind(kind: FileKind, tools: ToolDef[]): ToolDef[] {
	return tools.filter((tool) => tool.input.kinds.includes(kind));
}

/**
 * Returns tools belonging to a category.
 */
export function toolsByCategory(category: ToolCategory, tools: ToolDef[]): ToolDef[] {
	return tools.filter((tool) => tool.category === category);
}

/**
 * Returns related tools for cross-linking, prioritizing the same category
 * or shared file formats.
 */
export function relatedTools(currentTool: ToolDef, tools: ToolDef[], limit = 4): ToolDef[] {
	const others = tools.filter((t) => t.slug !== currentTool.slug);

	const scored = others.map((candidate) => {
		let score = 0;
		if (candidate.category === currentTool.category) score += 3;
		// Shared input extensions
		const sharedInputs = candidate.input.extensions.filter((ext) =>
			currentTool.input.extensions.includes(ext)
		);
		score += sharedInputs.length * 2;
		// Candidate produces what current tool consumes, or vice versa
		if (currentTool.input.extensions.includes(candidate.output.ext)) score += 4;
		if (candidate.input.extensions.includes(currentTool.output.ext)) score += 4;
		return { candidate, score };
	});

	scored.sort((a, b) => b.score - a.score);
	return scored.slice(0, limit).map((s) => s.candidate);
}

/**
 * Selected popular conversions for quick-access strips and home highlight.
 */
export const POPULAR_SLUGS = [
	'image-converter',
	'pdf-to-word',
	'merge-pdf',
	'compress-image',
	'word-to-pdf',
	'pdf-to-jpg'
];

export function popularTools(tools: ToolDef[]): ToolDef[] {
	const map = new Map(tools.map((t) => [t.slug, t]));
	return POPULAR_SLUGS.map((slug) => map.get(slug)).filter((t): t is ToolDef => Boolean(t));
}

/**
 * Validates manifest invariants at build/runtime. Throws if any rule is violated.
 */
export function validateManifestInvariants(tools: ToolDef[]): void {
	const slugs = new Set<string>();

	for (const tool of tools) {
		// Unique slug
		if (slugs.has(tool.slug)) {
			throw new Error(`Duplicate tool slug detected: ${tool.slug}`);
		}
		slugs.add(tool.slug);

		// Non-empty metadata
		if (!tool.name.trim() || !tool.shortName.trim()) {
			throw new Error(`Tool ${tool.slug} is missing name or shortName.`);
		}
		if (!tool.copy.tagline.trim() || !tool.copy.description.trim()) {
			throw new Error(`Tool ${tool.slug} is missing copy tagline or description.`);
		}
		if (!tool.copy.fidelity || !tool.copy.fidelityTitle.trim() || !tool.copy.fidelityNote.trim()) {
			throw new Error(`Tool ${tool.slug} is missing fidelity metadata.`);
		}
		if (!tool.copy.limitations || tool.copy.limitations.length === 0) {
			throw new Error(`Tool ${tool.slug} must specify at least one limitation.`);
		}

		// Input validation
		if (!tool.input.extensions || tool.input.extensions.length === 0) {
			throw new Error(`Tool ${tool.slug} must declare at least one input extension.`);
		}
		for (const ext of tool.input.extensions) {
			if (ext.startsWith('.') || ext !== ext.toLowerCase()) {
				throw new Error(
					`Tool ${tool.slug} has invalid extension "${ext}". Must be lower-case without leading dot.`
				);
			}
		}
		if (!tool.input.kinds || tool.input.kinds.length === 0) {
			throw new Error(`Tool ${tool.slug} must declare at least one input FileKind.`);
		}

		// Output validation
		if (!tool.output.ext || tool.output.ext.startsWith('.') || tool.output.ext !== tool.output.ext.toLowerCase()) {
			throw new Error(`Tool ${tool.slug} has invalid output extension "${tool.output.ext}".`);
		}
		if (!tool.output.mime || !tool.output.label) {
			throw new Error(`Tool ${tool.slug} must declare output mime and label.`);
		}

		// Memory and arity
		if (![1, 2, 3].includes(tool.memoryWeight)) {
			throw new Error(`Tool ${tool.slug} has invalid memoryWeight: ${tool.memoryWeight}`);
		}
		if (!['single', 'many-to-one', 'one-to-many'].includes(tool.arity)) {
			throw new Error(`Tool ${tool.slug} has invalid arity: ${tool.arity}`);
		}

		// Options validation
		for (const opt of tool.options) {
			if (!opt.key || !opt.label || !opt.defaultValue) {
				throw new Error(`Tool ${tool.slug} has an invalid option missing key, label, or defaultValue.`);
			}
			if (opt.type === 'select') {
				if (!opt.choices || opt.choices.length === 0) {
					throw new Error(`Tool ${tool.slug} option "${opt.key}" is select type but has no choices.`);
				}
				const hasDefault = opt.choices.some((c) => c.value === opt.defaultValue);
				if (!hasDefault) {
					throw new Error(
						`Tool ${tool.slug} option "${opt.key}" defaultValue "${opt.defaultValue}" is not in choices.`
					);
				}
			}
		}
	}
}
