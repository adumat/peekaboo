<script lang="ts">
	import { onMount } from 'svelte';
	import { Player } from '$lib/player';

	type Camera = { name: string; label: string };

	const version = __APP_VERSION__;

	let cameras = $state<Camera[]>([]);
	let go2rtc = $state('');
	let selected = $state<string[]>([]);
	let playing = $state(false);
	let status = $state('In pausa');
	let visible = $state(true);

	let audioEl: HTMLAudioElement;
	let player: Player;

	const selectedLabel = $derived(
		cameras
			.filter((c) => selected.includes(c.name))
			.map((c) => c.label)
			.join(' + ')
	);
	const shownCams = $derived(cameras.filter((c) => selected.includes(c.name)));

	function toggle(name: string) {
		selected = selected.includes(name)
			? selected.filter((n) => n !== name)
			: [...selected, name];
		if (playing) start(); // re-apply the new selection live
	}

	function start() {
		if (!selected.length) return player.stop();
		player.play(selected, selectedLabel);
	}

	function togglePlay() {
		if (playing) player.stop();
		else start();
	}

	onMount(() => {
		player = new Player(audioEl, (s, p) => {
			status = s;
			playing = p;
		});

		fetch('/api/config')
			.then((r) => r.json())
			.then((cfg: { go2rtc: string; cameras: Camera[] }) => {
				cameras = cfg.cameras;
				go2rtc = cfg.go2rtc;
				selected = cameras.map((c) => c.name); // default: follow everything
			});

		const onVis = () => {
			visible = document.visibilityState === 'visible';
			if (visible) player.resync();
		};
		document.addEventListener('visibilitychange', onVis);
		// the service worker is registered automatically by SvelteKit

		return () => {
			document.removeEventListener('visibilitychange', onVis);
			player.destroy();
		};
	});
</script>

<header>
	<span class="title">Peekaboo</span>
	<span class="ver">{version}</span>
</header>

{#if visible && shownCams.length}
	<div class="videos" style="--cols:{Math.min(shownCams.length, 2)}">
		{#each shownCams as cam (cam.name)}
			<div class="tile">
				<span class="label">{cam.label}</span>
				<iframe title={cam.label} src={`${go2rtc}/webrtc.html?src=${cam.name}&media=video`}></iframe>
			</div>
		{/each}
	</div>
{:else}
	<div class="spacer"></div>
{/if}

<p class="status">{status}</p>

<div class="cameras">
	{#each cameras as cam (cam.name)}
		<button class="cam" class:active={selected.includes(cam.name)} onclick={() => toggle(cam.name)}>
			{cam.label}
		</button>
	{/each}
</div>

<button class="play" class:on={playing} onclick={togglePlay} disabled={!selected.length}>
	{playing ? '⏹ Stop' : '▶ Ascolta'}
</button>

<audio bind:this={audioEl} preload="none"></audio>

<style>
	header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		padding: 12px 16px;
		font-weight: 600;
	}
	.ver {
		font-size: 12px;
		font-weight: 400;
		color: #7a7a7a;
	}
	.videos {
		flex: 1;
		display: grid;
		grid-template-columns: repeat(var(--cols), 1fr);
		gap: 8px;
		padding: 0 12px;
		align-content: start;
	}
	.spacer {
		flex: 1;
	}
	.tile {
		position: relative;
		aspect-ratio: 16 / 9;
		background: #000;
		border-radius: 12px;
		overflow: hidden;
	}
	.tile iframe {
		width: 100%;
		height: 100%;
		border: 0;
		display: block;
	}
	.tile .label {
		position: absolute;
		left: 8px;
		top: 8px;
		font-size: 12px;
		background: rgba(0, 0, 0, 0.45);
		padding: 2px 8px;
		border-radius: 8px;
	}
	.status {
		padding: 8px 16px;
		margin: 0;
		font-size: 13px;
		color: #9a9a9a;
	}
	.cameras {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		padding: 8px 16px;
	}
	.cam {
		flex: 1;
		min-width: 100px;
		padding: 14px 0;
		font-size: 16px;
		border: 0;
		border-radius: 12px;
		background: #2a2a2a;
		color: #eee;
	}
	.cam.active {
		background: #2f7d32;
		color: #fff;
	}
	.play {
		margin: 8px 16px 16px;
		padding: 20px 0;
		font-size: 18px;
		border: 0;
		border-radius: 14px;
		background: #2a2a2a;
		color: #eee;
	}
	.play.on {
		background: #b33;
		color: #fff;
	}
	.play:disabled {
		opacity: 0.4;
	}
	audio {
		display: none;
	}
</style>
