/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />

// SvelteKit builds and auto-registers this file. `$service-worker` gives the
// precise asset list and a per-build `version` hash, so a new deploy names a
// new cache and the old one is evicted — no manual version bumping.
import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = `peekaboo-${version}`;
const ASSETS = new Set([...build, ...files]); // hashed app JS/CSS + everything in static/

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((c) => c.addAll([...ASSETS, '/'])) // '/' too, for offline navigation
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => sw.clients.claim())
	);
});

sw.addEventListener('fetch', (event) => {
	const req = event.request;
	if (req.method !== 'GET') return;
	const url = new URL(req.url);

	// Always hit the network: cross-origin (go2rtc), live audio, the config API,
	// the SW itself, and the version manifest (must stay fresh so update detection
	// and the "new version" prompt work).
	if (url.origin !== location.origin) return;
	if (url.pathname.startsWith('/audio/') || url.pathname.startsWith('/api/')) return;
	if (url.pathname === '/service-worker.js' || url.pathname === '/_app/version.json') return;

	// Immutable, hashed build assets -> cache-first.
	if (ASSETS.has(url.pathname)) {
		event.respondWith(caches.match(req).then((hit) => hit ?? fetch(req)));
		return;
	}

	// Navigations -> network-first (fresh config-driven shell), cached shell offline.
	if (req.mode === 'navigate') {
		event.respondWith(
			fetch(req)
				.then((res) => {
					const copy = res.clone();
					caches.open(CACHE).then((c) => c.put('/', copy));
					return res;
				})
				.catch(() => caches.match('/') as Promise<Response>)
		);
		return;
	}

	// Everything else: straight to the network, no caching.
});
