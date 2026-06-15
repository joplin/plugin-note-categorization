/**
 * Mulberry32: a fast, seedable 32-bit PRNG.
 * Produces deterministic values in [0, 1) for a given seed.
 * Used instead of Math.random() so UMAP and clustering results are reproducible.
 */
export function mulberry32(seed: number): () => number {
	return () => {
		seed |= 0;
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
