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
const ASSETS = [...build, ...files]; // hashed app JS/CSS + everything in static/

sw.addEventListener('install', (event) => {
	event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => sw.skipWaiting()));
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

	// Never touch live audio, the config API, or cross-origin (go2rtc) requests.
	if (url.origin !== location.origin) return;
	if (url.pathname.startsWith('/audio/') || url.pathname.startsWith('/api/')) return;

	// Precached build assets are immutable+hashed -> serve from cache. Anything
	// else (incl. the config-driven shell) is network-first, cache as fallback.
	event.respondWith(
		caches.match(req).then((hit) => {
			if (hit) return hit;
			return fetch(req)
				.then((res) => {
					if (res.ok && res.type === 'basic') {
						const copy = res.clone();
						caches.open(CACHE).then((c) => c.put(req, copy));
					}
					return res;
				})
				.catch(() => caches.match('/') as Promise<Response>);
		})
	);
});
