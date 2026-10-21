import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = join(process.cwd(), 'build');

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
	'.png': 'image/png'
};

export function startServer(port = 4173) {
	const server = createServer(async (request, response) => {
		const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
		const candidates =
			pathname === '/'
				? ['/index.html']
				: [pathname, `${pathname}.html`, join(pathname, 'index.html')];

		for (const candidate of candidates) {
			const file = normalize(join(root, candidate));
			if (!file.startsWith(root)) continue;
			try {
				const info = await stat(file);
				if (!info.isFile()) continue;
				response.writeHead(200, {
					'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
					'cache-control': 'no-store'
				});
				response.end(await readFile(file));
				return;
			} catch {
				// try the next candidate
			}
		}

		response.writeHead(404, { 'content-type': 'text/plain' });
		response.end('not found');
	});

	return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const port = Number(process.env.PORT ?? 4173);
	await startServer(port);
	console.log(`serving build on http://localhost:${port}`);
}
