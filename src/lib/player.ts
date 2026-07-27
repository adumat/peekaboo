/**
 * Client-side live-audio player: owns the <audio> element, wires up MediaSession
 * (lockscreen / screen-off controls) and keeps playback pinned to the live edge.
 *
 * Latency control is the whole point: an <audio> element playing an endless MP3
 * stream keeps buffering and, after any rebuffer, drifts further and further
 * behind live (this is how the old build crept toward ~10s). We watch the gap
 * between the buffered edge and currentTime and jump forward when it grows.
 */

const WATCHDOG_MS = 2000;
const MAX_LAG_S = 3; // fall more than this behind the live edge -> jump forward
const RESYNC_LEAD_S = 0.3; // leave a hair of buffer so the jump doesn't stall
const STALL_TIMEOUT_S = 8; // no playback progress for this long -> reconnect

export type StatusListener = (status: string, playing: boolean) => void;

export class Player {
	private selection: string[] = [];
	private label = '';
	private timer: ReturnType<typeof setInterval> | null = null;
	private lastTime = 0;
	private lastProgress = 0;

	constructor(
		private audio: HTMLAudioElement,
		private onStatus: StatusListener
	) {
		audio.addEventListener('playing', () => {
			this.emit('Live');
			this.resync();
		});
		audio.addEventListener('waiting', () => this.emit('Buffering…'));
		// Reconnect ONLY on a real error (not on waiting/stalled, which fire during
		// normal buffering and caused an abort loop in the old build).
		audio.addEventListener('error', () => this.reconnect('Errore, riconnetto…'));
	}

	get playing(): boolean {
		return this.selection.length > 0;
	}

	private url(bust = false): string {
		const q = bust ? `?t=${Date.now()}` : '';
		return `/audio/${this.selection.join(',')}${q}`;
	}

	play(selection: string[], label: string): void {
		this.selection = [...new Set(selection)].sort();
		this.label = label;
		if (!this.selection.length) return this.stop();
		this.audio.src = this.url();
		void this.audio.play().catch(() => {});
		this.setMediaSession();
		this.startWatchdog();
		this.emit('Connessione…');
	}

	stop(): void {
		this.selection = [];
		this.stopWatchdog();
		this.audio.pause();
		this.audio.removeAttribute('src');
		this.audio.load();
		if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
		this.emit('In pausa');
	}

	/** Jump to the live edge if we've drifted too far behind it. */
	resync(): void {
		const b = this.audio.buffered;
		if (!b.length) return;
		const end = b.end(b.length - 1);
		if (end - this.audio.currentTime > MAX_LAG_S) {
			try {
				this.audio.currentTime = Math.max(0, end - RESYNC_LEAD_S);
			} catch {
				/* not seekable yet */
			}
		}
	}

	destroy(): void {
		this.stopWatchdog();
	}

	private reconnect(msg: string): void {
		if (!this.playing) return;
		this.emit(msg);
		this.audio.src = this.url(true);
		void this.audio.play().catch(() => {});
	}

	private startWatchdog(): void {
		this.stopWatchdog();
		this.lastTime = this.audio.currentTime;
		this.lastProgress = Date.now();
		this.timer = setInterval(() => this.tick(), WATCHDOG_MS);
	}

	private stopWatchdog(): void {
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
	}

	private tick(): void {
		if (!this.playing) return;
		if (this.audio.currentTime > this.lastTime + 0.1) {
			this.lastTime = this.audio.currentTime;
			this.lastProgress = Date.now();
		} else if (Date.now() - this.lastProgress > STALL_TIMEOUT_S * 1000) {
			this.lastProgress = Date.now();
			return this.reconnect('Bloccato, riconnetto…');
		}
		this.resync();
	}

	private setMediaSession(): void {
		if (!('mediaSession' in navigator)) return;
		navigator.mediaSession.metadata = new MediaMetadata({ title: this.label, artist: 'Peekaboo' });
		navigator.mediaSession.playbackState = 'playing';
		navigator.mediaSession.setActionHandler('play', () => void this.audio.play().catch(() => {}));
		navigator.mediaSession.setActionHandler('pause', () => this.stop());
	}

	private emit(status: string): void {
		this.onStatus(status, this.playing);
	}
}
