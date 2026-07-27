import { spawn, type ChildProcess } from 'node:child_process';
import { getConfig } from './config';

const BITRATE = '96k';

type Ctrl = ReadableStreamDefaultController<Uint8Array>;

/** Canonical key for a set of cameras: deduped + sorted by id, so every
 *  permutation of the same selection maps to a single shared ffmpeg. */
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
		const rtsp = (name: string) => `rtsp://${go2rtc.rtsp}/${name}`;
		const inFlags = ['-rtsp_transport', 'tcp', '-fflags', 'nobuffer', '-flags', 'low_delay'];
		// -ar 44100 is MANDATORY: Tapo cams emit 8kHz MP3 (MPEG-2.5), which Chrome
		// silently cannot decode (bytes arrive, playback never starts, no error).
		const enc = ['-vn', '-c:a', 'libmp3lame', '-b:a', BITRATE, '-ar', '44100', '-ac', '1', '-f', 'mp3', 'pipe:1'];

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
