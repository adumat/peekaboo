import { describe, it, expect } from 'vitest';
import { encodeSelection } from './selection';

describe('encodeSelection', () => {
	it('omits the gain suffix when gain is 1 (default byte-identical)', () => {
		expect(encodeSelection(['b', 'a'], {})).toBe('a,b');
		expect(encodeSelection(['a'], { a: 1 })).toBe('a');
	});
	it('adds name:gain only for non-default gains', () => {
		expect(encodeSelection(['a', 'b'], { b: 1.5 })).toBe('a,b:1.5');
	});
});
