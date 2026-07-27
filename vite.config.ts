import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
	define: {
		// single source of truth for the version -> shown in the UI header
		__APP_VERSION__: JSON.stringify(pkg.version)
	},
	// Bundle runtime deps into the adapter-node output so the Docker image is
	// self-contained (no node_modules at runtime). Add new pure-JS runtime deps here.
	ssr: {
		noExternal: ['yaml']
	},
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) => filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter()
		})
	]
});
