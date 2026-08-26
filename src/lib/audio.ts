import { whepUrl, diffSelection } from './webrtc';

type Conn = {
	pc: RTCPeerConnection;
	stream: MediaStream;
	el: HTMLAudioElement; // plays the stream directly (element mode) or as a muted pump (mix mode)
	source: MediaStreamAudioSourceNode | null; // created lazily when this conn joins the mix
	gnode: GainNode | null;
	inMix: boolean;
	gain: number;
	closed: boolean;
};

export type StatusListener = (status: string, playing: boolean) => void;

/** Wait until ICE gathering finishes (non-trickle WHEP) or a short cap elapses. */
function waitIceGathering(pc: RTCPeerConnection): Promise<void> {
	if (pc.iceGatheringState === 'complete') return Promise.resolve();
	return new Promise((resolve) => {
		const done = () => {
			clearTimeout(timer);
			pc.removeEventListener('icegatheringstatechange', check);
			resolve();
		};
		const check = () => {
			if (pc.iceGatheringState === 'complete') done();
		};
		const timer = setTimeout(done, 2000);
		pc.addEventListener('icegatheringstatechange', check);
	});
}

/**
 * Realtime WebRTC audio: one audio-only WHEP connection per camera (signaled through
 * peekaboo's same-origin proxy), with live per-camera gain.
 *
 * Playback is adaptive so mobile plays every selected camera (phones output only ONE
 * media element at a time):
 *  - ONE camera at <=100%: play its own `<audio>` element directly — no AudioContext,
 *    which is the path that survives screen-off/lock.
 *  - TWO+ cameras (or any boost >100%): mix them through a single AudioContext
 *    (per-camera GainNode) into one hidden sink `<audio>`, so the phone hears one
 *    combined stream. The per-camera elements stay as muted pumps (Chrome needs the
 *    WebRTC stream attached to a playing media element for createMediaStreamSource).
 */
export class AudioManager {
	private conns = new Map<string, Conn>();
	private selection: string[] = [];
	private label = '';
	private ctx: AudioContext | null = null;
	private dest: MediaStreamAudioDestinationNode | null = null;
	private sink: HTMLAudioElement | null = null;

	constructor(private onStatus: StatusListener) {}

	get playing(): boolean {
		return this.selection.length > 0;
	}

	play(selection: string[], gains: Record<string, number>, label: string): void {
		this.label = label;
		const next = [...new Set(selection)].sort();
		const { add, remove } = diffSelection(this.selection, next);
		this.selection = next;
		for (const cam of remove) this.close(cam);
		for (const cam of add) void this.open(cam, gains[cam] ?? 1);
		for (const cam of next) {
			const c = this.conns.get(cam);
			if (c) c.gain = gains[cam] ?? 1;
		}
		this.route();
		this.setMediaSession();
		this.onStatus(next.length ? 'Live' : 'In pausa', this.playing);
	}

	stop(): void {
		for (const cam of [...this.conns.keys()]) this.close(cam);
		this.selection = [];
		this.route();
		if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
		this.onStatus('In pausa', false);
	}

	setGain(cam: string, gain: number): void {
		const c = this.conns.get(cam);
		if (!c) return;
		c.gain = gain;
		this.route();
	}

	destroy(): void {
		this.stop();
		this.sink?.remove();
		this.sink = null;
		this.dest = null;
		this.ctx?.close().catch(() => {});
		this.ctx = null;
	}

	private async open(cam: string, gain: number): Promise<void> {
		const pc = new RTCPeerConnection();
		pc.addTransceiver('audio', { direction: 'recvonly' });
		const stream = new MediaStream();
		const el = document.createElement('audio');
		el.autoplay = true;
		el.style.display = 'none';
		document.body.appendChild(el);
		const conn: Conn = { pc, stream, el, source: null, gnode: null, inMix: false, gain, closed: false };
		this.conns.set(cam, conn);

		pc.ontrack = (e) => {
			stream.addTrack(e.track);
			el.srcObject = stream;
			void el.play().catch(() => {});
			this.route(); // this conn now has a live track
		};
		pc.oniceconnectionstatechange = () => {
			const st = pc.iceConnectionState;
			if (st === 'failed' || st === 'disconnected') this.reconnect(cam);
		};

		try {
			await pc.setLocalDescription(await pc.createOffer());
			await waitIceGathering(pc);
			if (conn.closed) return;
			const res = await fetch(whepUrl(cam), {
				method: 'POST',
				headers: { 'Content-Type': 'application/sdp' },
				body: pc.localDescription!.sdp
			});
			if (!res.ok) throw new Error(`WHEP ${res.status}`);
			const sdp = await res.text();
			if (conn.closed) return;
			await pc.setRemoteDescription({ type: 'answer', sdp });
		} catch {
			this.onStatus('Errore audio', this.playing);
			if (!conn.closed) setTimeout(() => this.reconnect(cam), 2000);
		}
	}

	/**
	 * Decide element vs. mix playback for the currently-connected cameras and wire the
	 * Web Audio graph to match. Idempotent — safe to call on every change.
	 */
	private route(): void {
		const active = [...this.conns.values()].filter((c) => c.stream.getAudioTracks().length);
		const useMix = active.length >= 2 || active.some((c) => c.gain > 1);

		if (useMix) {
			this.ensureMix();
			for (const c of active) {
				c.el.muted = true; // silent pump; audio flows through the mix
				if (!c.source && this.ctx) c.source = this.ctx.createMediaStreamSource(c.stream);
				if (!c.gnode && this.ctx) c.gnode = this.ctx.createGain();
				if (!c.inMix && c.source && c.gnode && this.dest) {
					c.source.connect(c.gnode).connect(this.dest);
					c.inMix = true;
				}
				if (c.gnode) c.gnode.gain.value = c.gain;
			}
			void this.ctx?.resume().catch(() => {});
			void this.sink?.play().catch(() => {});
		} else {
			// element mode: at most one active camera at <=100%
			for (const c of this.conns.values()) {
				if (c.inMix) {
					try {
						c.source?.disconnect();
						c.gnode?.disconnect();
					} catch {
						/* already disconnected */
					}
					c.inMix = false;
				}
				c.el.muted = false;
				c.el.volume = Math.max(0, Math.min(1, c.gain));
			}
			this.sink?.pause();
		}
	}

	private ensureMix(): void {
		if (this.ctx) return;
		this.ctx = new AudioContext();
		this.dest = this.ctx.createMediaStreamDestination();
		this.sink = document.createElement('audio');
		this.sink.autoplay = true;
		this.sink.style.display = 'none';
		this.sink.dataset.peekabooSink = '1';
		document.body.appendChild(this.sink);
		this.sink.srcObject = this.dest.stream;
	}

	private reconnect(cam: string): void {
		if (!this.selection.includes(cam)) return;
		const gain = this.conns.get(cam)?.gain ?? 1;
		this.close(cam);
		void this.open(cam, gain);
	}

	private close(cam: string): void {
		const c = this.conns.get(cam);
		if (!c) return;
		c.closed = true;
		try {
			c.source?.disconnect();
			c.gnode?.disconnect();
		} catch {
			/* already disconnected */
		}
		try {
			c.pc.close();
		} catch {
			/* already closed */
		}
		c.el.srcObject = null;
		c.el.remove();
		this.conns.delete(cam);
	}

	private setMediaSession(): void {
		if (!('mediaSession' in navigator)) return;
		navigator.mediaSession.metadata = new MediaMetadata({ title: this.label, artist: 'Peekaboo' });
		navigator.mediaSession.playbackState = this.playing ? 'playing' : 'none';
		navigator.mediaSession.setActionHandler('pause', () => this.stop());
	}
}
