import { test, expect } from '@playwright/test';

test('config-driven UI renders and every tile fits on screen', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));

	await page.goto('/', { waitUntil: 'domcontentloaded' });

	// cameras from the config become toggle chips
	await expect(page.locator('.chip')).toHaveCount(2);
	await expect(page.getByRole('button', { name: 'Sofia', exact: true })).toBeVisible();

	// one video tile per selected camera, pointing at go2rtc's WebRTC page
	const tiles = page.locator('.tile iframe');
	await expect(tiles).toHaveCount(2);
	await expect(tiles.first()).toHaveAttribute('src', /webrtc\.html\?src=.+&media=video/);

	// regression guard: both tiles must be within the viewport, otherwise the
	// browser auto-pauses the off-screen iframe's video (the v0.2.0 bug).
	const vh = page.viewportSize()!.height;
	const bottoms = await tiles.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().bottom));
	for (const bottom of bottoms) expect(bottom).toBeLessThanOrEqual(vh + 1);

	expect(errors).toEqual([]);
});

test('tapping a tile toggles fullscreen/solo', async ({ page }) => {
	await page.goto('/', { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.tile')).toHaveCount(2);

	await page.locator('.tile .drag').first().click(); // a tap
	await expect(page.locator('.tile')).toHaveCount(1); // solo'd

	await page.getByRole('button', { name: 'Esci da schermo intero' }).click();
	await expect(page.locator('.tile')).toHaveCount(2);
});

test('audio backend toggle defaults to WebRTC and switches to MP3', async ({ page }) => {
	await page.goto('/', { waitUntil: 'domcontentloaded' });
	const toggle = page.getByRole('button', { name: 'Cambia motore audio' });
	await expect(toggle).toHaveAttribute('title', /WebRTC/);
	await toggle.click();
	await expect(toggle).toHaveAttribute('title', /MP3/);
	// persists across reload
	await page.reload({ waitUntil: 'domcontentloaded' });
	await expect(page.getByRole('button', { name: 'Cambia motore audio' })).toHaveAttribute(
		'title',
		/MP3/
	);
});

test('healthz responds 200', async ({ request }) => {
	const res = await request.get('/healthz');
	expect(res.status()).toBe(200);
	expect(await res.text()).toBe('ok');
});

test('per-camera volume: boost is encoded in the audio URL and persists', async ({ page }) => {
	await page.goto('/', { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.tile')).toHaveCount(2);

	// this test exercises the MP3 backend's gained-mix URL; the app now defaults to
	// the WebRTC backend, so switch to MP3 first.
	await page.getByRole('button', { name: 'Cambia motore audio' }).click();

	// start audio, then boost the first tile to 150%
	await page.getByRole('button', { name: 'Ascolta' }).click();
	await page.locator('.tile .vctl .spk').first().click(); // open popover
	await page.locator('.tile .vctl .vslider').first().fill('1.5');

	// the audio element re-requests the gained mix (debounced ~400ms)
	await expect
		.poll(() => page.locator('audio').evaluate((a: HTMLAudioElement) => a.src))
		.toContain(':1.5');

	// persists across reload
	await page.reload({ waitUntil: 'domcontentloaded' });
	await page.locator('.tile .vctl .spk').first().click();
	await expect(page.locator('.tile .vctl .vslider').first()).toHaveValue('1.5');
});
