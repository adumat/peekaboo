import { describe, it, expect } from 'vitest';
import { normalizeSpecs, specKey } from './streams';

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
