import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getConfig } from '$lib/server/config';
import { getStream } from '$lib/server/streams';
import { parseSelection } from '$lib/server/selection';

/**
 * GET /audio/<sel>  where <sel> is a comma-separated selection of camera ids,
 * each optionally suffixed with :gain (e.g. sofia,nicolo:1.5). Order-insensitive.
 * Streams a single live MP3 that is the (optionally per-camera gained) mix.
 */
export const GET: RequestHandler = ({ params }) => {
	const cfg = getConfig();
	const valid = new Set(cfg.cameras.map((c) => c.name));
	const specs = parseSelection(params.selection, valid, cfg.maxGain);
	if (!specs) error(404, `unknown camera selection: ${params.selection}`);

	const stream = getStream(specs);
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
