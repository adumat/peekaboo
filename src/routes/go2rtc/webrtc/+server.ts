import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getConfig } from '$lib/server/config';

/**
 * Same-origin WHEP proxy for realtime audio. The browser POSTs its SDP offer here;
 * we forward it to go2rtc's `/api/webrtc?src=<cam>` server-side (no browser Origin, so
 * go2rtc's cross-origin guard is satisfied) and return the SDP answer. This keeps
 * go2rtc locked to same-origin — the browser only ever talks to peekaboo — while the
 * WebRTC media (ICE/UDP) still flows browser<->go2rtc directly, exactly like the video.
 */
export const POST: RequestHandler = async ({ url, request }) => {
	const src = url.searchParams.get('src');
	if (!src) error(400, 'missing src');

	const base = getConfig().go2rtc.api;
	const offer = await request.text();

	let res: Response;
	try {
		res = await fetch(`${base}/api/webrtc?src=${encodeURIComponent(src)}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/sdp' },
			body: offer
		});
	} catch (e) {
		error(502, `go2rtc unreachable: ${(e as Error).message}`);
	}

	const answer = await res.text();
	if (!res.ok) error(502, `go2rtc ${res.status}: ${answer.slice(0, 200)}`);
	return new Response(answer, { headers: { 'Content-Type': 'application/sdp' } });
};
