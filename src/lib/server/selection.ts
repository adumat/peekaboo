import { normalizeSpecs, type CamGain } from './streams';

/** Parse a single gain token into a multiplier clamped to [0, maxGain];
 *  absent or malformed → 1 (default). */
export function clampGain(raw: string | undefined, maxGain: number): number {
	if (raw === undefined) return 1;
	const g = Number(raw);
	if (!Number.isFinite(g)) return 1;
	return Math.min(Math.max(g, 0), maxGain);
}

/** Parse "name[:gain],…" into normalized specs, or null if empty / any name is
 *  unknown. Order-insensitive; duplicates deduped (last wins). */
export function parseSelection(raw: string, valid: Set<string>, maxGain: number): CamGain[] | null {
	const specs = raw
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean)
		.map((tok) => {
			const idx = tok.indexOf(':');
			const name = idx === -1 ? tok : tok.slice(0, idx);
			const gain = clampGain(idx === -1 ? undefined : tok.slice(idx + 1), maxGain);
			return { name, gain };
		});
	const norm = normalizeSpecs(specs);
	if (norm.length === 0 || norm.some((s) => !valid.has(s.name))) return null;
	return norm;
}
