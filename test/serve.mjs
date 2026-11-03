import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = join(process.cwd(), 'build');

// Optional base path, mirroring a GitHub Pages project site: /converty/…
const basePath = process.env.BASE_URL || process.env.BASE_PATH || '/converty';

const TYPES = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.json': 'application/json',
	'.wasm': 'application/wasm',
	'.txt': 'text/plain; charset=utf-8',
	'.woff2': 'font/woff2',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.webp': 'image/webp'
};

export function startServer(port = 4173, base = undefined) {
	const basePath = base ?? process.env.BASE_PATH ?? '/converty';
	const server = createServer(async (request, response) => {
		let pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);

		// GitHub Pages strips the project-site prefix before resolving files.
		if (basePath && pathname === basePath) pathname = '/';
		else if (basePath && pathname.startsWith(`${basePath}/`)) pathname = pathname.slice(basePath.length);

		const candidates =
			pathname === '/' ? ['/index.html'] : [pathname, `${pathname}.html`, join(pathname, 'index.html')];

		const candidates404 = ['404.html'];

		for (const candidate of [...candidates, ...candidates404]) {
			const file = normalize(join(root, candidate));
			if (!file.startsWith(root)) continue;
			// A missing candidate falls through to the next one, never aborts the loop.
			const info = await stat(file).catch(() => null);
			if (!info || !info.isFile()) continue;
			response.writeHead(candidate === '404.html' ? 404 : 200, {
				'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
				'cache-control': 'no-store'
			});
			response.end(await readFile(file));
			return;
		}

		response.writeHead(404, { 'content-type': 'text/plain' });
		response.end('not found');
	});

	return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const port = Number(process.env.PORT ?? 4173);
	await startServer(port);
	console.log(`serving build on http://localhost:${port}${basePath}`);
}
