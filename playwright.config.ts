import { defineConfig } from '@playwright/test';

// Runs the production build (node build) with a fixture config (no real go2rtc
// needed) and drives it with a mobile-portrait Chromium.
export default defineConfig({
	testDir: 'tests',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	use: {
		baseURL: 'http://localhost:4173',
		viewport: { width: 390, height: 844 },
		hasTouch: true
	},
	webServer: {
		command: 'node build',
		port: 4173,
		reuseExistingServer: !process.env.CI,
		env: {
			PORT: '4173',
			PEEKABOO_CONFIG: 'tests/fixtures/config.yaml'
		}
	}
});
