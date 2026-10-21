import { error } from '@sveltejs/kit';
import { getTool, TOOLS } from '#lib/tools/registry';

export const prerender = true;

export const entries = () => TOOLS.map((tool) => ({ tool: tool.slug }));

export function load({ params }: { params: { tool: string } }) {
	const tool = getTool(params.tool);
	if (!tool) {
		error(404, 'That converter does not exist.');
	}
	return { tool };
}
