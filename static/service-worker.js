/**
 * Service worker template. `test/build-sw.mjs` fills in the build hash and the
 * shell file list, so this file never needs to know about hashed asset names.
 *
 * - The shell (HTML, entry scripts, CSS, static files) is precached at install.
 * - Every other same-origin GET is cached on first use, so a tool works offline
 *   after it has been opened once.
 * - Runtime entries are capped at 50 MB; the shell is never evicted.
 * - No user file is ever cached: user files never make a request, and only this
 *   origin's assets are handled here.
 */
const VERSION = '__VERSION__';
const SHELL = __SHELL__;
const MAX_RUNTIME_BYTES = 50 * 1024 * 1024;
const TRIM_DELAY_MS = 1500;

const SHELL_CACHE = `converty-shell-${VERSION}`;
const RUNTIME_CACHE = `converty-runtime-${VERSION}`;

const basePath = new URL(self.registration.scope).pathname.replace(/\/$/, '');
const OFFLINE_FALLBACK = `${basePath}/index.html`;

let trimTimer = null;

async function trimRuntimeCache() {
	const cache = await caches.open(RUNTIME_CACHE);
	const requests = await cache.keys();
	let total = 0;
	const measured = [];

	for (const request of requests) {
		const response = await cache.match(request);
		if (!response) continue;
		const header = Number(response.headers.get('content-length') ?? 0);
		const bytes = header > 0 ? header : (await response.clone().blob()).size;
		measured.push({ request, bytes });
		total += bytes;
	}

	// Cache keys come back in insertion order, so the oldest go first.
	for (const entry of measured) {
		if (total <= MAX_RUNTIME_BYTES) break;
		await cache.delete(entry.request);
		total -= entry.bytes;
	}
}

function scheduleTrim() {
	if (trimTimer) return;
	trimTimer = setTimeout(() => {
		trimTimer = null;
		void trimRuntimeCache();
	}, TRIM_DELAY_MS);
}

/**
 * Stores a response without delaying it. Awaiting `cache.put` before responding
 * serialises every lazy chunk fetch behind a disk write, which is visible in
 * conversions that import several modules from a worker.
 */
async function cacheResponse(request, response) {
	if (!response.ok || response.status === 206) return;
	const cache = await caches.open(RUNTIME_CACHE);
	await cache.put(request, response);
	scheduleTrim();
}

async function networkFirst(event) {
	const request = event.request;
	try {
		const response = await fetch(request);
		if (response.ok) event.waitUntil(cacheResponse(request, response.clone()));
		return response;
	} catch {
		const cached = (await caches.match(request)) ?? (await caches.match(OFFLINE_FALLBACK));
		if (cached) return cached;
		return new Response('This page is not available offline yet. Reconnect once to cache it.', {
			status: 503,
			headers: { 'content-type': 'text/plain; charset=utf-8' }
		});
	}
}

async function cacheFirst(event) {
	const request = event.request;
	const cached = await caches.match(request);
	if (cached) return cached;
	const response = await fetch(request);
	event.waitUntil(cacheResponse(request, response.clone()));
	return response;
}

self.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(SHELL_CACHE);
			// A single missing optional asset must not stop the install.
			await Promise.allSettled(SHELL.map((url) => cache.add(url)));
		})()
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			const keys = await caches.keys();
			await Promise.all(
				keys
					.filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE)
					.map((key) => caches.delete(key))
			);
			await self.clients.claim();
		})()
	);
});

self.addEventListener('message', (event) => {
	if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
	const request = event.request;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;

	if (request.mode === 'navigate') {
		event.respondWith(networkFirst(event));
		return;
	}

	event.respondWith(cacheFirst(event));
});
