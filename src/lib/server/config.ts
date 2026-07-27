import fs from 'node:fs';
import { parse } from 'yaml';

export interface Camera {
	/** go2rtc stream name */
	name: string;
	/** UI label */
	label: string;
}

export interface Config {
	go2rtc: {
		/** base URL the BROWSER uses for the WebRTC video page */
		url: string;
		/** host:port the audio pipeline (ffmpeg) pulls RTSP from */
		rtsp: string;
	};
	/** seconds to keep an ffmpeg running after the last listener leaves */
	idleTimeout: number;
	cameras: Camera[];
}

const CONFIG_PATH = process.env.PEEKABOO_CONFIG ?? '/config/config.yaml';
const DEFAULT_IDLE_TIMEOUT = 15; // seconds

let cached: Config | null = null;

export function getConfig(): Config {
	if (cached) return cached;
	let raw: Record<string, any> = {};
	try {
		raw = parse(fs.readFileSync(CONFIG_PATH, 'utf8')) ?? {};
	} catch (e: any) {
		console.warn(`[peekaboo] no config at ${CONFIG_PATH} (${e.code ?? e.message}); using env/defaults`);
	}
	const g = raw.go2rtc ?? {};
	const idle = Number(raw.idleTimeout ?? process.env.PEEKABOO_IDLE_TIMEOUT);
	cached = {
		go2rtc: {
			url: String(g.url ?? process.env.GO2RTC_URL ?? 'http://localhost:1984').replace(/\/+$/, ''),
			rtsp: g.rtsp ?? process.env.GO2RTC_RTSP ?? 'localhost:8554'
		},
		idleTimeout: Number.isFinite(idle) ? idle : DEFAULT_IDLE_TIMEOUT,
		cameras: (raw.cameras ?? []).map((c: any) => ({ name: c.name, label: c.label ?? c.name }))
	};
	if (!cached.cameras.length) console.warn('[peekaboo] WARNING: no cameras configured');
	return cached;
}

/** The subset served to the browser (no internal RTSP host). */
export function publicConfig() {
	const c = getConfig();
	return { go2rtc: c.go2rtc.url, cameras: c.cameras };
}
