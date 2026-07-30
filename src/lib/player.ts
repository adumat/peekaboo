/**
 * Client-side live-audio player: owns the <audio> element, wires up MediaSession
 * (lockscreen / screen-off controls) and keeps playback close to the live edge.
 *
 * Latency control: an endless MP3 stream is NOT seekable, and it arrives with an
 * initial burst (go2rtc hands over a few seconds at once), so hard-seeking to the
 * buffered edge just throws the buffer away and stutters forever. Instead we nudge
 * playbackRate slightly faster when we drift behind live and drop back to 1x once
 * caught up — inaudible, no skips. A hard jump is a last resort for huge gaps only.
 */

import { encodeSelection } from '$lib/selection';

const WATCHDOG_MS = 1000;
const TARGET_LAG_S = 1; // latency we sync to, behind the live edge (also the buffer left)
const CATCHUP_HIGH_S = 2.5; // drift past this -> speed up a touch
const CATCHUP_LOW_S = 1.5; // back under this -> normal speed (hysteresis)
const CATCHUP_RATE = 1.05; // gentle, pitch-preserved catch-up
const HARD_SEEK_S = 6; // egregious gap -> jump to live
const STALL_TIMEOUT_S = 8; // no playback progress for this long -> reconnect

export type StatusListener = (status: string, playing: boolean) => void;

export class Player {
	private selection: string[] = [];
	private gains: Record<string, number> = {};
	private label = '';
	private timer: ReturnType<typeof setInterval> | null = null;
	private lastTime = 0;
	private lastProgress = 0;
	private reconnects = 0;
	private synced = false; // did we jump to the live edge for this connection yet?

	constructor(
		private audio: HTMLAudioElement,
		private onStatus: StatusListener
	) {
		audio.preservesPitch = true; // keep pitch constant when we nudge playbackRate
		audio.addEventListener('playing', () => this.emit('Live'));
		audio.addEventListener('waiting', () => this.emit('Buffering…'));
		// Reconnect ONLY on a real error (not on waiting/stalled, which fire during
		// normal buffering).
		audio.addEventListener('error', () => this.reconnect('Errore, riconnetto…'));
	}

	get playing(): boolean {
		return this.selection.length > 0;
	}

	/** how many seconds behind the live edge we currently are */
	get lag(): number {
		const b = this.audio.buffered;
		if (!b.length) return 0;
		return Math.max(0, b.end(b.length - 1) - this.audio.currentTime);
	}

	/** seconds buffered in the current live range */
	get bufferSpan(): number {
		const b = this.audio.buffered;
		if (!b.length) return 0;
		const i = b.length - 1;
		return Math.max(0, b.end(i) - b.start(i));
	}

	get reconnectCount(): number {
		return this.reconnects;
	}

	play(selection: string[], gains: Record<string, number>, label: string): void {
		this.selection = [...new Set(selection)].sort();
		this.gains = gains;
		this.label = label;
		if (!this.selection.length) return this.stop();
		this.synced = false;
		this.audio.playbackRate = 1;
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
		this.audio.playbackRate = 1;
		this.audio.removeAttribute('src');
		this.audio.load();
		if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
		this.emit('In pausa');
	}

	/** Re-lock to the live edge now (e.g. when the tab becomes visible again). */
	resync(): void {
		this.synced = false;
		this.adjustLatency();
	}

	destroy(): void {
		this.stopWatchdog();
	}

	private url(bust = false): string {
		const q = bust ? `?t=${Date.now()}` : '';
		return `/audio/${encodeSelection(this.selection, this.gains)}${q}`;
	}

	private reconnect(msg: string): void {
		if (!this.playing) return;
		this.reconnects++;
		this.synced = false;
		this.audio.playbackRate = 1;
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
		if (this.audio.currentTime > this.lastTime + 0.05) {
			this.lastTime = this.audio.currentTime;
			this.lastProgress = Date.now();
		} else if (Date.now() - this.lastProgress > STALL_TIMEOUT_S * 1000) {
			this.lastProgress = Date.now();
			return this.reconnect('Bloccato, riconnetto…');
		}
		this.adjustLatency();
	}

	/**
	 * Keep playback near the live edge. The stream starts with a burst backlog,
	 * so once per connection we JUMP to the live edge (leaving TARGET seconds of
	 * buffer). After that, small drift is trimmed with playbackRate, and only an
	 * egregious gap warrants another jump.
	 */
	private adjustLatency(): void {
		if (!this.playing || this.audio.paused) return;
		const b = this.audio.buffered;
		if (!b.length) return;
		const end = b.end(b.length - 1);
		const lag = end - this.audio.currentTime;

		const jumpToLive = () => {
			try {
				this.audio.currentTime = Math.max(0, end - TARGET_LAG_S);
			} catch {
				/* not seekable */
			}
		};

		// one-time jump to live, once a startup backlog has actually built up
		if (!this.synced && lag > TARGET_LAG_S + 1) {
			jumpToLive();
			this.synced = true;
			this.audio.playbackRate = 1;
			return;
		}

		// maintenance
		if (lag > HARD_SEEK_S) {
			jumpToLive();
			this.audio.playbackRate = 1;
		} else if (lag > CATCHUP_HIGH_S) {
			this.audio.playbackRate = CATCHUP_RATE;
		} else if (lag < CATCHUP_LOW_S) {
			this.audio.playbackRate = 1;
		}
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
