/**
 * Same-origin path for go2rtc's WHEP signaling. The browser POSTs its SDP offer here;
 * peekaboo's server forwards it to go2rtc (server-side, no browser Origin, so go2rtc's
 * cross-origin guard is satisfied) and returns the SDP answer. Keeps go2rtc same-origin
 * only; media (ICE/UDP) still flows browser<->go2rtc directly, like the video iframe.
 */
export function whepUrl(cam: string): string {
	return `/go2rtc/webrtc?src=${encodeURIComponent(cam)}`;
}

/**
 * Decide how to realise a per-camera gain. Values <= 1 use the media element's own
 * `.volume` (no AudioContext -> background-safe, the path validated on-device). Values
 * > 1 (boost) pin the element to 1 and apply the extra via a Web Audio GainNode.
 */
export function gainPlan(gain: number): { elementVolume: number; contextGain: number | null } {
	if (gain <= 1) return { elementVolume: Math.max(0, gain), contextGain: null };
	return { elementVolume: 1, contextGain: gain };
}

/** Which cameras to open / close when the selection changes. */
export function diffSelection(
	current: string[],
	next: string[]
): { add: string[]; remove: string[] } {
	const cur = new Set(current);
	const nxt = new Set(next);
	return {
		add: next.filter((n) => !cur.has(n)),
		remove: current.filter((n) => !nxt.has(n))
	};
}
