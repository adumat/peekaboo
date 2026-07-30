/** Encode a camera selection + per-camera gains as the `/audio/<sel>` path
 *  segment. The gain suffix is added ONLY when gain !== 1, so the default case
 *  is byte-identical to the historic `name,name` form (and still shared). */
export function encodeSelection(selection: string[], gains: Record<string, number>): string {
	return [...new Set(selection)]
		.sort()
		.map((n) => {
			const g = gains[n] ?? 1;
			return g === 1 ? n : `${n}:${g}`;
		})
		.join(',');
}
