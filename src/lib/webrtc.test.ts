import { describe, it, expect } from 'vitest';
import { whepUrl, gainPlan, diffSelection } from './webrtc';

describe('whepUrl', () => {
	it('is a same-origin proxy path with the src query', () => {
		expect(whepUrl('sofias-room')).toBe('/go2rtc/webrtc?src=sofias-room');
	});
	it('encodes the camera name', () => {
		expect(whepUrl('a b')).toBe('/go2rtc/webrtc?src=a%20b');
	});
});

describe('gainPlan', () => {
	it('<=1 uses element volume, no context', () => {
		expect(gainPlan(0)).toEqual({ elementVolume: 0, contextGain: null });
		expect(gainPlan(1)).toEqual({ elementVolume: 1, contextGain: null });
		expect(gainPlan(0.5)).toEqual({ elementVolume: 0.5, contextGain: null });
	});
	it('>1 pins element to 1 and boosts via context', () => {
		expect(gainPlan(1.5)).toEqual({ elementVolume: 1, contextGain: 1.5 });
	});
});

describe('diffSelection', () => {
	it('reports adds and removes', () => {
		expect(diffSelection(['a', 'b'], ['b', 'c'])).toEqual({ add: ['c'], remove: ['a'] });
	});
	it('empty when unchanged', () => {
		expect(diffSelection(['a'], ['a'])).toEqual({ add: [], remove: [] });
	});
});
