<script lang="ts">
	import { onMount } from 'svelte';
	import { updated } from '$app/state';
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
	let volume = $state<Record<string, number>>({});
	let maxGain = $state(1.5);
	let openVol = $state<string | null>(null); // which tile's volume popover is open
	let solo = $state<string | null>(null);

	let playing = $state(false);
	let status = $state('In pausa');
	let visible = $state(true);
	let stats = $state({ lag: 0, buffer: 0, reconnects: 0 });

	let audioEl: HTMLAudioElement;
	let player: Player;
	let ready = $state(false);

	const shownCams = $derived(cameras.filter((c) => selected.includes(c.name)));
	const selectedLabel = $derived(shownCams.map((c) => c.label).join(' + '));
	// which tiles to render: the solo'd camera, else every selected one
	const tiles = $derived(solo && selected.includes(solo) ? cameras.filter((c) => c.name === solo) : shownCams);

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
	$effect(() => {
		if (ready) save('peekaboo:volume', volume);
	});

	// ---- audio -------------------------------------------------------------
	let applyTimer: ReturnType<typeof setTimeout> | null = null;
	function apply() {
		if (!selected.length) return player.stop();
		player.play(selected, volume, selectedLabel);
	}
	// volume changes re-request the (server-mixed) stream; debounce so a slider
	// drag or repeated steps collapse into a single reconnect.
	function debouncedApply() {
		if (applyTimer) clearTimeout(applyTimer);
		applyTimer = setTimeout(() => {
			applyTimer = null;
			if (playing) apply();
		}, 400);
	}
	function togglePlay() {
		if (playing) player.stop();
		else apply();
	}
	function toggleCamera(name: string) {
		selected = selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name];
		if (solo && !selected.includes(solo)) solo = null;
		if (playing) apply(); // re-apply the mix live
	}
	function toggleLayout() {
		layout = layout === 'stack' ? 'side' : 'stack';
	}

	// ---- per-camera zoom, pan & tap-to-solo -------------------------------
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

	// ---- per-camera volume (gain multiplier; 1 = 100%) --------------------
	const volFor = (name: string): number => volume[name] ?? 1;
	function setVolume(name: string, v: number) {
		volume = { ...volume, [name]: clamp(v, 0, maxGain) };
		if (playing) debouncedApply();
	}
	function volReset(name: string) {
		setVolume(name, 1);
	}
	function toggleSolo(name: string) {
		solo = solo === name ? null : name;
	}

	type Drag = { name: string; sx: number; sy: number; ox: number; oy: number; w: number; h: number; zoomed: boolean; moved: boolean };
	let drag: Drag | null = null;
	function pointerDown(e: PointerEvent, name: string) {
		const z = zoomFor(name);
		const el = e.currentTarget as HTMLElement;
		el.setPointerCapture(e.pointerId);
		drag = { name, sx: e.clientX, sy: e.clientY, ox: z.x, oy: z.y, w: el.clientWidth, h: el.clientHeight, zoomed: z.s > 1, moved: false };
	}
	function pointerMove(e: PointerEvent) {
		if (!drag) return;
		if (Math.abs(e.clientX - drag.sx) > 6 || Math.abs(e.clientY - drag.sy) > 6) drag.moved = true;
		if (!drag.zoomed) return; // only pan when zoomed
		const z = zoomFor(drag.name);
		const lim = 50 * (1 - 1 / z.s); // keep the frame covering the tile
		const dx = ((e.clientX - drag.sx) / drag.w) * 100 / z.s;
		const dy = ((e.clientY - drag.sy) / drag.h) * 100 / z.s;
		setZoom(drag.name, { ...z, x: clamp(drag.ox + dx, -lim, lim), y: clamp(drag.oy + dy, -lim, lim) });
	}
	function pointerUp() {
		if (drag && !drag.moved) toggleSolo(drag.name); // a tap (not a pan) toggles fullscreen
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
		volume = load<Record<string, number>>('peekaboo:volume', {});
		const savedSel = load<string[] | null>('peekaboo:selected', null);

		fetch('/api/config', { redirect: 'manual' })
			.then((r) => {
				// no/expired session -> the request was redirected to the OIDC provider;
				// do a top-level navigation so the browser runs the login flow natively.
				if (r.type === 'opaqueredirect' || r.status === 401 || r.status === 403) {
					location.href = '/';
					return null;
				}
				return r.json();
			})
			.then((cfg: { go2rtc: string; cameras: Camera[]; maxGain?: number } | null) => {
				if (!cfg) return;
				cameras = cfg.cameras;
				go2rtc = cfg.go2rtc;
				maxGain = typeof cfg.maxGain === 'number' && cfg.maxGain >= 1 ? cfg.maxGain : 1.5;
				const names = new Set(cameras.map((c) => c.name));
				const restored = (savedSel ?? []).filter((n) => names.has(n));
				selected = restored.length ? restored : cameras.map((c) => c.name);
				ready = true;
			});

		const statsTimer = setInterval(() => {
			stats = { lag: player.lag, buffer: player.bufferSpan, reconnects: player.reconnectCount };
		}, 1000);
		// poll for a newer deployed version -> drives the "update" banner
		const updTimer = setInterval(() => updated.check(), 60_000);

		const onVis = () => {
			visible = document.visibilityState === 'visible';
			if (visible) player.resync();
		};
		document.addEventListener('visibilitychange', onVis);

		return () => {
			clearInterval(statsTimer);
			clearInterval(updTimer);
			document.removeEventListener('visibilitychange', onVis);
			player.destroy();
		};
	});
</script>

{#if updated.current}
	<button class="update" onclick={() => location.reload()}>
		Nuova versione disponibile — tocca per aggiornare
	</button>
{/if}

<header class="topbar">
	<div class="cams">
		{#each cameras as cam (cam.name)}
			<button class="chip" class:active={selected.includes(cam.name)} onclick={() => toggleCamera(cam.name)}>
				{cam.label}
			</button>
		{/each}
	</div>
	<div class="controls">
		<button class="ctl" class:active={showTiles} aria-label="Mostra/nascondi video" title="Mostra/nascondi video" onclick={() => (showTiles = !showTiles)}>📹</button>
		{#if solo}
			<button class="ctl" aria-label="Esci da schermo intero" title="Esci da schermo intero" onclick={() => (solo = null)}>▦</button>
		{:else if shownCams.length > 1}
			<button class="ctl" aria-label="Cambia layout" title="Layout" onclick={toggleLayout}>{layout === 'stack' ? '▤' : '▥'}</button>
		{/if}
		<button class="ctl play" class:on={playing} disabled={!selected.length} aria-label={playing ? 'Stop' : 'Ascolta'} title={playing ? 'Stop' : 'Ascolta'} onclick={togglePlay}>{playing ? '⏹' : '▶'}</button>
	</div>
</header>

<main class="videos {layout}" class:solo={!!solo}>
	{#if showTiles && visible}
		{#each tiles as cam (cam.name)}
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
					onpointerdown={(e) => pointerDown(e, cam.name)}
					onpointermove={pointerMove}
					onpointerup={pointerUp}
					onpointercancel={pointerUp}
				></div>
				<span class="label">{cam.label}</span>
				<div class="zctl">
					<button onclick={() => zoomBy(cam.name, -0.25)} aria-label="Zoom out">−</button>
					<button onclick={() => zoomReset(cam.name)} aria-label="Reset zoom">⟲</button>
					<button onclick={() => zoomBy(cam.name, 0.25)} aria-label="Zoom in">＋</button>
				</div>
				<div class="vctl">
					{#if openVol === cam.name}
						<input
							class="vslider"
							type="range"
							min="0"
							max={maxGain}
							step="0.05"
							value={volFor(cam.name)}
							aria-label="Volume {cam.label}"
							oninput={(e) => setVolume(cam.name, +e.currentTarget.value)}
						/>
					{/if}
					<button
						class="spk"
						class:muted={volFor(cam.name) === 0}
						class:boost={volFor(cam.name) > 1}
						aria-label="Volume {cam.label}"
						title="Volume (doppio tap = 100%)"
						onclick={() => (openVol = openVol === cam.name ? null : cam.name)}
						ondblclick={() => volReset(cam.name)}
					>
						{volFor(cam.name) === 0 ? '🔇' : '🔊'}<span class="pct">{Math.round(volFor(cam.name) * 100)}%</span>
					</button>
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
	.update {
		width: 100%;
		border: 0;
		padding: 10px 16px;
		font-size: 14px;
		font-weight: 600;
		background: #2f7d32;
		color: #fff;
		text-align: center;
	}

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
	.videos.solo {
		grid-template-columns: 1fr;
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
		cursor: zoom-in;
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

	.tile .vctl {
		position: absolute;
		left: 6px;
		bottom: 6px;
		z-index: 2;
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.tile .vctl .spk {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		height: 34px;
		padding: 0 10px;
		border: 0;
		border-radius: 9px;
		background: rgba(0, 0, 0, 0.55);
		color: #fff;
		font-size: 15px;
		line-height: 1;
	}
	.tile .vctl .spk .pct {
		font-size: 12px;
		font-variant-numeric: tabular-nums;
	}
	.tile .vctl .spk.boost {
		color: #ffd479;
	}
	.tile .vctl .spk.muted {
		opacity: 0.6;
	}
	.tile .vctl .vslider {
		width: 120px;
		accent-color: #2f7d32;
		touch-action: none;
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
