export interface UmapProjectorOptions {
	/** Number of dimensions in the output (default: 2) */
	nComponents?: number;
	/** Number of nearest neighbors for manifold approximation (default: 15) */
	nNeighbors?: number;
	/** Minimum distance between points in output space (default: 0.1) */
	minDist?: number;
	/** Distance metric: 'cosine' or 'euclidean' (default: 'cosine') */
	metric?: 'cosine' | 'euclidean';
	/** Seed for reproducible results (default: 42) */
	seed?: number;
}
