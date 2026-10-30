import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig(async () => ({
	plugins: [
		tailwindcss(),
		await sveltekit({
			preprocess: vitePreprocess(),
			adapter: adapter({ pages: 'build', assets: 'build', strict: true }),
			// Absolute asset URLs survive trailing-slash and clean-URL rewrites at the edge.
			paths: { relative: false },
			csp: {
				mode: 'hash',
				directives: {
					'default-src': ['self'],
					'script-src': ['self', 'wasm-unsafe-eval'],
					'style-src': ['self', 'unsafe-inline'],
					'img-src': ['self', 'blob:', 'data:'],
					'font-src': ['self'],
					'worker-src': ['self', 'blob:'],
					'connect-src': ['self'],
					'form-action': ['none'],
					'base-uri': ['self'],
					'object-src': ['none']
				}
			}
		})
	],
	optimizeDeps: {
		include: ['pdfjs-dist', 'jspdf', 'jspdf-autotable', 'docx', 'fflate', 'xlsx']
	}
}));
