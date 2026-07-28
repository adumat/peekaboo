import { text } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** Liveness/readiness probe: 200 as soon as the server can handle requests. */
export const GET: RequestHandler = () => text('ok');
