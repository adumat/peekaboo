import { describe, it, expect } from 'vitest';
import { normalizeSpecs, specKey, buildFfmpegArgs } from './streams';

const OPTS = { rtspBase: 'go:8554', bitrate: '96k' };
const j = (a: string[]) => a.join(' ');

describe('buildFfmpegArgs', () => {
	it('single camera, gain 1 → no volume filter', () => {
		const a = buildFfmpegArgs([{ name: 'sofia', gain: 1 }], OPTS);
		expect(j(a)).not.toContain('volume=');
		expect(j(a)).toContain('-i rtsp://go:8554/sofia?audio=pcma');
	});
	it('single camera, boosted → -af volume=', () => {
		expect(j(buildFfmpegArgs([{ name: 'sofia', gain: 1.5 }], OPTS))).toContain('-af volume=1.5');
	});
	it('two cameras, all gain 1 → plain amix (unchanged)', () => {
		const a = j(buildFfmpegArgs([{ name: 'a', gain: 1 }, { name: 'b', gain: 1 }], OPTS));
		expect(a).toContain('-filter_complex amix=inputs=2:duration=longest:normalize=0');
		expect(a).not.toContain('volume=');
	});
	it('two cameras, one boosted → per-input volume then amix', () => {
		const a = j(buildFfmpegArgs([{ name: 'a', gain: 1 }, { name: 'b', gain: 1.5 }], OPTS));
		expect(a).toContain(
			'-filter_complex [1:a]volume=1.5[g1];[0:a][g1]amix=inputs=2:duration=longest:normalize=0'
		);
	});
});

describe('normalizeSpecs', () => {
	it('dedupes by name (last wins) and sorts by name', () => {
		expect(
			normalizeSpecs([
				{ name: 'b', gain: 1 },
				{ name: 'a', gain: 1.5 },
				{ name: 'a', gain: 2 }
			])
		).toEqual([
			{ name: 'a', gain: 2 },
			{ name: 'b', gain: 1 }
		]);
	});
});

describe('specKey', () => {
	it('is the canonical name[:gain] form, gain omitted when 1', () => {
		expect(specKey([{ name: 'b', gain: 1 }, { name: 'a', gain: 1 }])).toBe('a,b');
		expect(specKey([{ name: 'a', gain: 1.5 }, { name: 'b', gain: 1 }])).toBe('a:1.5,b');
	});
});
