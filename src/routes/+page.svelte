<script lang="ts">
	import { onMount } from 'svelte';
	import { Player } from '$lib/player';
	import { load, save } from '$lib/storage';

	type Camera = { name: string; label: string };
	type Zoom = { s: number; x: number; y: number };

	const version = __APP_VERSION__;
	const DEFAULT_ZOOM: Zoom = { s: 1, x: 0, y: 0 };

	let cameras = $state<Camera[]>([]);
	let go2rtc = $state('');
	let selected = $state<string[]>([]);
	let layout = $state<'stack' | 'side'>('stack');
	let showTiles = $state(true);
	let zoom = $state<Record<string, Zoom>>({});

	let playing = $state(false);
	let status = $state('In pausa');
	let visible = $state(true);
	let stats = $state({ lag: 0, buffer: 0, reconnects: 0 });

	let audioEl: HTMLAudioElement;
	let player: Player;
	let ready = $state(false);

	const shownCams = $derived(cameras.filter((c) => selected.includes(c.name)));
	const selectedLabel = $derived(shownCams.map((c) => c.label).join(' + '));

	// ---- persistence (client-only effects) --------------------------------
	$effect(() => {
		if (ready) save('peekaboo:selected', selected);
	});
	$effect(() => {
		if (ready) save('peekaboo:layout', layout);
	});
	$effect(() => {
		if (ready) save('peekaboo:tiles', showTiles);
	});
	$effect(() => {
		if (ready) save('peekaboo:zoom', zoom);
	});

	// ---- audio -------------------------------------------------------------
	function apply() {
		if (!selected.length) return player.stop();
		player.play(selected, selectedLabel);
	}
	function togglePlay() {
		if (playing) player.stop();
		else apply();
	}
	function toggleCamera(name: string) {
		selected = selected.includes(name)
			? selected.filter((n) => n !== name)
			: [...selected, name];
		if (playing) apply(); // re-apply the mix live
	}
	function toggleLayout() {
		layout = layout === 'stack' ? 'side' : 'stack';
	}

	// ---- per-camera zoom & pan --------------------------------------------
	const zoomFor = (name: string): Zoom => zoom[name] ?? DEFAULT_ZOOM;
	const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

	function setZoom(name: string, z: Zoom) {
		zoom = { ...zoom, [name]: z };
	}
	function zoomBy(name: string, d: number) {
		const z = zoomFor(name);
		const s = clamp(Math.round((z.s + d) * 100) / 100, 1, 4);
		setZoom(name, s === 1 ? { ...DEFAULT_ZOOM } : { ...z, s });
	}
	function zoomReset(name: string) {
		setZoom(name, { ...DEFAULT_ZOOM });
	}

	let drag: { name: string; sx: number; sy: number; ox: number; oy: number; w: number; h: number } | null = null;
	function panStart(e: PointerEvent, name: string) {
		const z = zoomFor(name);
		if (z.s <= 1) return; // nothing to pan when not zoomed
		const el = e.currentTarget as HTMLElement;
		el.setPointerCapture(e.pointerId);
		drag = { name, sx: e.clientX, sy: e.clientY, ox: z.x, oy: z.y, w: el.clientWidth, h: el.clientHeight };
	}
	function panMove(e: PointerEvent) {
		if (!drag) return;
		const z = zoomFor(drag.name);
		const lim = 50 * (1 - 1 / z.s); // keep the frame covering the tile
		// translate() sits inside scale(), so a screen-space delta is magnified by s
		const dx = ((e.clientX - drag.sx) / drag.w) * 100 / z.s;
		const dy = ((e.clientY - drag.sy) / drag.h) * 100 / z.s;
		setZoom(drag.name, { ...z, x: clamp(drag.ox + dx, -lim, lim), y: clamp(drag.oy + dy, -lim, lim) });
	}
	function panEnd() {
		drag = null;
	}

	// ---- lifecycle ---------------------------------------------------------
	onMount(() => {
		player = new Player(audioEl, (s, p) => {
			status = s;
			playing = p;
		});

		layout = load<'stack' | 'side'>('peekaboo:layout', 'stack');
		showTiles = load('peekaboo:tiles', true);
		zoom = load<Record<string, Zoom>>('peekaboo:zoom', {});
		const savedSel = load<string[] | null>('peekaboo:selected', null);

		fetch('/api/config')
			.then((r) => r.json())
			.then((cfg: { go2rtc: string; cameras: Camera[] }) => {
				cameras = cfg.cameras;
				go2rtc = cfg.go2rtc;
				const names = new Set(cameras.map((c) => c.name));
				const restored = (savedSel ?? []).filter((n) => names.has(n));
				selected = restored.length ? restored : cameras.map((c) => c.name);
				ready = true;
			});

		const statsTimer = setInterval(() => {
			stats = { lag: player.lag, buffer: player.bufferSpan, reconnects: player.reconnectCount };
		}, 1000);

		const onVis = () => {
			visible = document.visibilityState === 'visible';
			if (visible) player.resync();
		};
		document.addEventListener('visibilitychange', onVis);

		return () => {
			clearInterval(statsTimer);
			document.removeEventListener('visibilitychange', onVis);
			player.destroy();
		};
	});
</script>

<header class="topbar">
	<div class="cams">
		{#each cameras as cam (cam.name)}
			<button
				class="chip"
				class:active={selected.includes(cam.name)}
				onclick={() => toggleCamera(cam.name)}
			>
				{cam.label}
			</button>
		{/each}
	</div>
	<div class="controls">
		<button
			class="ctl"
			class:active={showTiles}
			title="Mostra/nascondi video"
			onclick={() => (showTiles = !showTiles)}>📹</button
		>
		{#if shownCams.length > 1}
			<button class="ctl" title="Layout" onclick={toggleLayout}>{layout === 'stack' ? '▤' : '▥'}</button>
		{/if}
		<button
			class="ctl play"
			class:on={playing}
			disabled={!selected.length}
			title={playing ? 'Stop' : 'Ascolta'}
			onclick={togglePlay}>{playing ? '⏹' : '▶'}</button
		>
	</div>
</header>

<main class="videos {layout}">
	{#if showTiles && visible}
		{#each shownCams as cam (cam.name)}
			{@const z = zoomFor(cam.name)}
			<div class="tile">
				<iframe
					title={cam.label}
					src={`${go2rtc}/webrtc.html?src=${cam.name}&media=video`}
					style="transform: scale({z.s}) translate({z.x}%, {z.y}%)"
				></iframe>
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="drag"
					class:grab={z.s > 1}
					onpointerdown={(e) => panStart(e, cam.name)}
					onpointermove={panMove}
					onpointerup={panEnd}
					onpointercancel={panEnd}
				></div>
				<span class="label">{cam.label}</span>
				<div class="zctl">
					<button onclick={() => zoomBy(cam.name, -0.25)} aria-label="Zoom out">−</button>
					<button onclick={() => zoomReset(cam.name)} aria-label="Reset zoom">⟲</button>
					<button onclick={() => zoomBy(cam.name, 0.25)} aria-label="Zoom in">＋</button>
				</div>
			</div>
		{/each}
	{/if}
</main>

<footer class="statusbar">
	<span class="left">
		<span class="dot" class:on={playing}></span>
		{status}
	</span>
	<span class="nerd">
		{#if playing}delay {stats.lag.toFixed(1)}s · buf {stats.buffer.toFixed(1)}s · ↻{stats.reconnects} · {/if}v{version}
	</span>
</footer>

<audio bind:this={audioEl} preload="none"></audio>

<style>
	.topbar {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 10px;
		padding: 10px 12px;
	}
	.cams {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.chip {
		border: 0;
		border-radius: 999px;
		padding: 8px 14px;
		font-size: 14px;
		background: #2a2a2a;
		color: #bbb;
	}
	.chip.active {
		background: #2f7d32;
		color: #fff;
	}
	.controls {
		display: flex;
		gap: 8px;
		flex-shrink: 0;
	}
	.ctl {
		width: 40px;
		height: 40px;
		border: 0;
		border-radius: 10px;
		background: #2a2a2a;
		color: #eee;
		font-size: 18px;
		line-height: 1;
	}
	.ctl.active {
		color: #fff;
		background: #3a3a3a;
	}
	.ctl.play.on {
		background: #b33;
		color: #fff;
	}
	.ctl:disabled {
		opacity: 0.4;
	}

	.videos {
		flex: 1;
		min-height: 0;
		display: grid;
		gap: 8px;
		padding: 0 12px 8px;
		grid-template-columns: 1fr;
		/* share the available height so every selected tile stays on screen
		   (an off-viewport iframe gets its video auto-paused by the browser) */
		grid-auto-rows: 1fr;
	}
	.videos.side {
		grid-template-columns: 1fr 1fr;
	}

	.tile {
		position: relative;
		min-height: 0;
		background: #000;
		border-radius: 12px;
		overflow: hidden;
	}
	.tile iframe {
		width: 100%;
		height: 100%;
		border: 0;
		display: block;
		transform-origin: center center;
	}
	.tile .drag {
		position: absolute;
		inset: 0;
		z-index: 1;
		touch-action: none;
	}
	.tile .drag.grab {
		cursor: grab;
	}
	.tile .label {
		position: absolute;
		left: 8px;
		top: 8px;
		z-index: 2;
		font-size: 12px;
		background: rgba(0, 0, 0, 0.45);
		padding: 2px 8px;
		border-radius: 8px;
	}
	.tile .zctl {
		position: absolute;
		top: 6px;
		right: 6px;
		z-index: 2;
		display: flex;
		gap: 5px;
	}
	.tile .zctl button {
		width: 34px;
		height: 34px;
		border: 0;
		border-radius: 9px;
		background: rgba(0, 0, 0, 0.55);
		color: #fff;
		font-size: 17px;
		line-height: 1;
	}

	.statusbar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		padding: 8px 14px;
		font-size: 12px;
		color: #9a9a9a;
		border-top: 1px solid #222;
	}
	.statusbar .left {
		display: flex;
		align-items: center;
		gap: 8px;
		color: #ccc;
	}
	.dot {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: #666;
	}
	.dot.on {
		background: #2f7d32;
		box-shadow: 0 0 6px #2f7d32;
	}
	.nerd {
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	audio {
		display: none;
	}
</style>
