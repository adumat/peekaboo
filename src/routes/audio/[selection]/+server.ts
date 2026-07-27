import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getConfig } from '$lib/server/config';
import { getStream } from '$lib/server/streams';

/**
 * GET /audio/<sel>  where <sel> is a comma-separated selection of camera ids,
 * e.g. /audio/sofias-room  or  /audio/sofias-room,nicolos-room  (order-insensitive).
 * Streams a single live MP3 that is the mix of the selected cameras.
 */
export const GET: RequestHandler = ({ params }) => {
	const valid = new Set(getConfig().cameras.map((c) => c.name));
	const selected = [...new Set(params.selection.split(',').map((s) => s.trim()).filter(Boolean))];
	if (selected.length === 0 || selected.some((n) => !valid.has(n))) {
		error(404, `unknown camera selection: ${params.selection}`);
	}

	const stream = getStream(selected);
	let ctrl: ReadableStreamDefaultController<Uint8Array>;
	const body = new ReadableStream<Uint8Array>({
		start(c) {
			ctrl = c;
			stream.add(c);
		},
		cancel() {
			stream.remove(ctrl);
		}
	});

	return new Response(body, {
		headers: {
			'content-type': 'audio/mpeg',
			'cache-control': 'no-store'
		}
	});
};
