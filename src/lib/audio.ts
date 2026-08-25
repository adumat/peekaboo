import { whepUrl, gainPlan, diffSelection } from './webrtc';

type Conn = {
	pc: RTCPeerConnection;
	el: HTMLAudioElement;
	stream: MediaStream;
	ctx: AudioContext | null;
	node: GainNode | null;
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
 * Realtime WebRTC audio backend: one audio-only WHEP connection per selected camera
 * (signaled through peekaboo's same-origin proxy), played through a hidden `<audio>`
 * element (background-eligible) with live per-camera gain. Parallel to (and independent
 * of) the MP3 `Player`; same public surface plus `setGain`.
 */
export class AudioManager {
	private conns = new Map<string, Conn>();
	private selection: string[] = [];
	private label = '';

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
		for (const cam of next) this.setGain(cam, gains[cam] ?? 1);
		this.setMediaSession();
		this.onStatus(next.length ? 'Live' : 'In pausa', this.playing);
	}

	stop(): void {
		for (const cam of [...this.conns.keys()]) this.close(cam);
		this.selection = [];
		if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
		this.onStatus('In pausa', false);
	}

	/** Live per-camera volume. element `.volume` for <=100%, Web Audio for boost. */
	setGain(cam: string, gain: number): void {
		const c = this.conns.get(cam);
		if (!c) return;
		c.gain = gain;
		const plan = gainPlan(gain);
		c.el.volume = plan.elementVolume;
		if (plan.contextGain != null) {
			this.ensureGraph(c);
			if (c.node) c.node.gain.value = plan.contextGain;
		} else if (c.node) {
			c.node.gain.value = 1; // element `.volume` now carries the level
		}
	}

	destroy(): void {
		this.stop();
	}

	private async open(cam: string, gain: number): Promise<void> {
		const pc = new RTCPeerConnection();
		pc.addTransceiver('audio', { direction: 'recvonly' });
		const stream = new MediaStream();
		const el = document.createElement('audio');
		el.autoplay = true;
		el.style.display = 'none';
		document.body.appendChild(el);
		const conn: Conn = { pc, el, stream, ctx: null, node: null, gain, closed: false };
		this.conns.set(cam, conn);

		pc.ontrack = (e) => {
			stream.addTrack(e.track);
			el.srcObject = stream;
			void el.play().catch(() => {});
			this.setGain(cam, conn.gain); // (re)apply once audio is flowing
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

	private reconnect(cam: string): void {
		if (!this.selection.includes(cam)) return;
		const gain = this.conns.get(cam)?.gain ?? 1;
		this.close(cam);
		void this.open(cam, gain);
	}

	private ensureGraph(c: Conn): void {
		if (c.ctx || !c.stream.getAudioTracks().length) return;
		const ctx = new AudioContext();
		const source = ctx.createMediaStreamSource(c.stream);
		const node = ctx.createGain();
		source.connect(node).connect(ctx.destination);
		c.el.muted = true; // audio now flows through the graph; avoid double output
		void ctx.resume().catch(() => {});
		c.ctx = ctx;
		c.node = node;
	}

	private close(cam: string): void {
		const c = this.conns.get(cam);
		if (!c) return;
		c.closed = true;
		c.ctx?.close().catch(() => {});
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
