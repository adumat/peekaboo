import { describe, it, expect } from 'vitest';
import { clampGain, parseSelection } from './selection';

const valid = new Set(['sofia', 'nicolo']);

describe('clampGain', () => {
	it('defaults to 1 when absent or malformed', () => {
		expect(clampGain(undefined, 1.5)).toBe(1);
		expect(clampGain('abc', 1.5)).toBe(1);
	});
	it('clamps to [0, max]', () => {
		expect(clampGain('9', 1.5)).toBe(1.5);
		expect(clampGain('-1', 1.5)).toBe(0);
		expect(clampGain('1.25', 1.5)).toBe(1.25);
	});
});

describe('parseSelection', () => {
	it('parses name and name:gain, clamps, normalizes', () => {
		expect(parseSelection('nicolo:9,sofia', valid, 1.5)).toEqual([
			{ name: 'nicolo', gain: 1.5 },
			{ name: 'sofia', gain: 1 }
		]);
	});
	it('returns null on unknown camera or empty', () => {
		expect(parseSelection('ghost', valid, 1.5)).toBeNull();
		expect(parseSelection('', valid, 1.5)).toBeNull();
	});
});
