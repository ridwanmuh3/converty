import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// GitHub Pages serves a project site at https://<user>.github.io/<repo>/, so a
// subfolder base is required. Override with BASE_PATH for a custom apex domain.
const basePath = (process.env.BASE_PATH ?? '/converty') as '' | `/${string}`;

export default defineConfig(async () => ({
	plugins: [
		tailwindcss(),
		await sveltekit({
			preprocess: vitePreprocess(),
			adapter: adapter({ pages: 'build', assets: 'build', strict: true }),
			// Absolute asset URLs survive trailing-slash and clean-URL rewrites at the edge.
			paths: { base: basePath, relative: false },
			csp: {
				mode: 'hash',
				directives: {
					'default-src': ['self'],
					'script-src': ['self', 'wasm-unsafe-eval'],
					'style-src': ['self', 'unsafe-inline'],
					'img-src': ['self', 'blob:', 'data:'],
					'media-src': ['self', 'blob:'],
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
