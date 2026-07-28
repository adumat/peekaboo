import { test, expect } from '@playwright/test';

test('config-driven UI renders and every tile fits on screen', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));

	await page.goto('/', { waitUntil: 'domcontentloaded' });

	// cameras from the config become toggle chips
	await expect(page.locator('.chip')).toHaveCount(2);
	await expect(page.getByRole('button', { name: 'Sofia' })).toBeVisible();

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
