import { spawn, type ChildProcess } from 'node:child_process';
import { getConfig } from './config';

const BITRATE = '96k';

type Ctrl = ReadableStreamDefaultController<Uint8Array>;

export type CamGain = { name: string; gain: number };

/** Dedupe by name (last wins), sort by name — so any permutation of the same
 *  selection+gains maps to one shared ffmpeg. */
export function normalizeSpecs(specs: CamGain[]): CamGain[] {
	const byName = new Map<string, number>();
	for (const s of specs) byName.set(s.name, s.gain);
	return [...byName.entries()]
		.map(([name, gain]) => ({ name, gain }))
		.sort((a, b) => a.name.localeCompare(b.name));
}

/** Canonical key / URL form: "name" when gain===1, else "name:gain". */
export function specKey(specs: CamGain[]): string {
	return normalizeSpecs(specs)
		.map((s) => (s.gain === 1 ? s.name : `${s.name}:${s.gain}`))
		.join(',');
}

/** Canonical key for a set of cameras: deduped + sorted by id, so every
 *  permutation of the same selection maps to a single shared ffmpeg.
 *  TODO(task4): replaced by specKey once getStream is gain-aware. */
export function streamKey(cameras: string[]): string {
	return [...new Set(cameras)].sort().join(',');
}

/**
 * One on-demand ffmpeg per selection of cameras (any subset of the configured
 * ones), fanned out to every current listener. Spawned on the FIRST listener,
 * killed `idleTimeout` seconds after the LAST one leaves — so we never
 * mix/transcode when nobody is listening (the whole point of on-demand).
 * A single camera is a passthrough transcode; two or more are amix'd together.
 */
class Stream {
	private subs = new Set<Ctrl>();
	private proc: ChildProcess | null = null;
	private idle: ReturnType<typeof setTimeout> | null = null;

	/** @param cameras deduped, sorted camera ids (>= 1) */
	constructor(private cameras: string[]) {}

	private buildArgs(): string[] {
		const { go2rtc } = getConfig();
		// `?audio=pcma` asks go2rtc for ONLY the camera's native G.711 a-law track:
		// no h264 to demux (avoids the video-analysis stall + amix dts warnings and
		// cuts data), and it pins the direct camera codec so go2rtc never routes us
		// through its on-demand opus transcoder (a `ffmpeg:...#audio=opus` producer,
		// which would add buffering/latency).
		const rtsp = (name: string) => `rtsp://${go2rtc.rtsp}/${name}?audio=pcma`;
		// analyzeduration 0 + probesize 32 are the big latency win: without them
		// ffmpeg spends ~4s analysing the input before emitting anything (measured),
		// so on-demand playback starts seconds behind live.
		const inFlags = [
			'-rtsp_transport', 'tcp',
			'-fflags', 'nobuffer',
			'-flags', 'low_delay',
			'-analyzeduration', '0',
			'-probesize', '32'
		];
		// -ar 44100 is MANDATORY: Tapo cams emit 8kHz MP3 (MPEG-2.5), which Chrome
		// silently cannot decode (bytes arrive, playback never starts, no error).
		// flush_packets/avioflags direct/write_xing 0 stop the muxer buffering frames.
		const enc = [
			'-vn',
			'-c:a', 'libmp3lame', '-b:a', BITRATE, '-ar', '44100', '-ac', '1',
			'-flush_packets', '1',
			'-avioflags', 'direct',
			'-write_xing', '0',
			'-f', 'mp3', 'pipe:1'
		];

		const inputs = this.cameras.flatMap((c) => [...inFlags, '-i', rtsp(c)]);
		if (this.cameras.length === 1) return [...inputs, ...enc];
		return [...inputs, '-filter_complex', `amix=inputs=${this.cameras.length}:duration=longest:normalize=0`, ...enc];
	}

	private start(): void {
		if (this.proc) return;
		const args = ['-hide_banner', '-loglevel', 'warning', ...this.buildArgs()];
		const label = this.cameras.join('+');
		console.log(`[peekaboo] ffmpeg start "${label}"`);
		const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'inherit'] });
		this.proc = proc;

		proc.stdout?.on('data', (chunk: Buffer) => {
			for (const sub of this.subs) {
				try {
					sub.enqueue(new Uint8Array(chunk));
				} catch {
					this.subs.delete(sub); // controller already closed
				}
			}
		});
		proc.on('error', (e) => console.error(`[peekaboo] ffmpeg "${label}" error:`, e.message));
		proc.on('exit', (code) => {
			if (this.proc === proc) this.proc = null;
			if (this.subs.size > 0) {
				console.log(`[peekaboo] ffmpeg "${label}" exited (${code}); restarting`);
				setTimeout(() => this.start(), 1000);
			} else {
				console.log(`[peekaboo] ffmpeg "${label}" stopped`);
			}
		});
	}

	private stop(): void {
		this.proc?.kill('SIGTERM');
		this.proc = null;
	}

	add(ctrl: Ctrl): void {
		if (this.idle) {
			clearTimeout(this.idle);
			this.idle = null;
		}
		this.subs.add(ctrl);
		this.start();
	}

	remove(ctrl: Ctrl): void {
		this.subs.delete(ctrl);
		if (this.subs.size === 0 && !this.idle) {
			const ms = getConfig().idleTimeout * 1000;
			this.idle = setTimeout(() => {
				this.idle = null;
				if (this.subs.size === 0) this.stop();
			}, ms);
		}
	}
}

const streams = new Map<string, Stream>();

/** Get (or lazily create) the shared stream for a selection of cameras. */
export function getStream(cameras: string[]): Stream {
	const key = streamKey(cameras);
	let s = streams.get(key);
	if (!s) {
		s = new Stream(key.split(','));
		streams.set(key, s);
	}
	return s;
}
