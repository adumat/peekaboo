import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { publicConfig } from '$lib/server/config';

/** GET /api/config -> cameras + go2rtc base URL for the browser. */
export const GET: RequestHandler = () => json(publicConfig());
