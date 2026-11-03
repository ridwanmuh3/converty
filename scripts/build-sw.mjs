import { createHash } from 'node:crypto';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

/**
 * Fills in `build/service-worker.js`, copied verbatim from `static/` by Vite.
 *
 * SvelteKit 3 no longer ships a `$service-worker` module, so the worker is a
 * static template: this script computes a build hash for cache versioning and
 * the shell list (pages, entry scripts, stylesheets, static files) to precache.
 */
const ROOT = join(process.cwd(), 'build');
const BASE = (process.env.BASE_PATH ?? '/converty').replace(/\/+$/, '');
const SW = join(ROOT, 'service-worker.js');

async function walk(directory) {
	const entries = await readdir(directory, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) files.push(...(await walk(path)));
		else files.push(path);
	}
	return files;
}

const files = await walk(ROOT);
const hash = createHash('sha256');
for (const file of [...files].sort()) {
	const info = await stat(file);
	hash.update(`${relative(ROOT, file).split(sep).join('/')}:${info.size}\n`);
}
const version = hash.digest('hex').slice(0, 10);

const relativeUrl = (file) => relative(ROOT, file).split(sep).join('/');
const url = (file) => `${BASE}/${relativeUrl(file)}`;
const shell = new Set();

for (const file of files) {
	const pathname = relativeUrl(file);
	if (pathname.startsWith('_app/immutable/entry/')) shell.add(url(file));
	else if (/^_app\/immutable\/assets\/.*\.css$/.test(pathname)) shell.add(url(file));
	else if (/^icons\/.+\.png$/.test(pathname)) shell.add(url(file));
	else if (/^(manifest\.json|favicon\.svg|theme\.js|robots\.txt)$/.test(pathname)) shell.add(url(file));
	else if (pathname === 'index.html') shell.add(url(file).replace(/index\.html$/, ''));
	else if (/^[^/]+\/index\.html$/.test(pathname) && !pathname.startsWith('404/')) {
		shell.add(url(file).replace(/index\.html$/, ''));
	}
}

const template = await readFile(SW, 'utf8');
const output = template
	.replace('__VERSION__', version)
	.replace('__SHELL__', JSON.stringify([...shell].sort(), null, '\t'));

await writeFile(SW, output);
console.log(`service-worker.js: ${shell.size} shell entries, version ${version}`);
