import { DistanceFn } from './metrics';

const MAX_ITERATIONS = 100;

/**
 * Mulberry32: a fast, seedable 32-bit PRNG.
 * Produces deterministic values in [0, 1) for a given seed.
 */
function mulberry32(seed: number): () => number {
	return () => {
		seed |= 0;
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Selects initial centroids using k-means++ strategy.
 * First centroid is chosen randomly; each subsequent centroid is chosen
 * with probability proportional to its squared distance from the nearest
 * existing centroid. This produces better initial clusters than random selection.
 */
function initCentroids(vectors: number[][], K: number, distFn: DistanceFn, rng: () => number): number[][] {
	const n = vectors.length;
	const centroids: number[][] = [];

	// First centroid: random point
	centroids.push([...vectors[Math.floor(rng() * n)]]);

	for (let c = 1; c < K; c++) {
		// Compute squared distance from each point to its nearest centroid
		const distances = new Float64Array(n);
		let totalDist = 0;

		for (let i = 0; i < n; i++) {
			let minDist = Infinity;
			for (const centroid of centroids) {
				const d = distFn(vectors[i], centroid);
				if (d < minDist) minDist = d;
			}
			distances[i] = minDist * minDist;
			totalDist += distances[i];
		}

		// Weighted random selection
		let threshold = rng() * totalDist;
		let selected = 0;
		for (let i = 0; i < n; i++) {
			threshold -= distances[i];
			if (threshold <= 0) {
				selected = i;
				break;
			}
		}

		centroids.push([...vectors[selected]]);
	}

	return centroids;
}

/**
 * Assigns each vector to the index of the nearest centroid.
 */
function assignClusters(vectors: number[][], centroids: number[][], distFn: DistanceFn): number[] {
	return vectors.map((vec) => {
		let bestCluster = 0;
		let bestDist = Infinity;
		for (let c = 0; c < centroids.length; c++) {
			const d = distFn(vec, centroids[c]);
			if (d < bestDist) {
				bestDist = d;
				bestCluster = c;
			}
		}
		return bestCluster;
	});
}

/**
 * Recomputes centroids as the element-wise mean of assigned points.
 * If a cluster is empty, its centroid is re-seeded to a random point.
 */
function recomputeCentroids(
	vectors: number[][],
	assignments: number[],
	K: number,
	dim: number,
	rng: () => number,
): number[][] {
	const centroids: number[][] = Array.from({ length: K }, () => new Array(dim).fill(0));
	const counts = new Array(K).fill(0);

	for (let i = 0; i < vectors.length; i++) {
		const c = assignments[i];
		counts[c]++;
		for (let d = 0; d < dim; d++) {
			centroids[c][d] += vectors[i][d];
		}
	}

	for (let c = 0; c < K; c++) {
		if (counts[c] === 0) {
			// Empty cluster: re-seed to a random point to avoid dead centroids
			const idx = Math.floor(rng() * vectors.length);
			centroids[c] = [...vectors[idx]];
		} else {
			for (let d = 0; d < dim; d++) {
				centroids[c][d] /= counts[c];
			}
		}
	}

	return centroids;
}

/**
 * K-Means clustering using Lloyd's algorithm with k-means++ initialization.
 *
 * @param vectors   Input data points (N x D)
 * @param K         Number of clusters
 * @param distFn    Distance function
 * @param seed      Seed for reproducible initialization
 * @param maxIter   Maximum iterations (default: 100)
 * @returns         Cluster assignment for each vector (length N, values 0..K-1)
 */
export function kmeans(
	vectors: number[][],
	K: number,
	distFn: DistanceFn,
	seed: number,
	maxIter: number = MAX_ITERATIONS,
): number[] {
	const n = vectors.length;
	if (n === 0) throw new Error('Cannot cluster empty input');
	if (K <= 0) throw new Error('K must be positive');

	// If K >= N, each point gets its own cluster
	if (K >= n) return vectors.map((_, i) => i);

	const dim = vectors[0].length;
	const rng = mulberry32(seed);

	let centroids = initCentroids(vectors, K, distFn, rng);
	let assignments = assignClusters(vectors, centroids, distFn);

	for (let iter = 0; iter < maxIter; iter++) {
		centroids = recomputeCentroids(vectors, assignments, K, dim, rng);
		const newAssignments = assignClusters(vectors, centroids, distFn);

		// Convergence check: stop if no assignments changed
		let changed = false;
		for (let i = 0; i < n; i++) {
			if (newAssignments[i] !== assignments[i]) {
				changed = true;
				break;
			}
		}

		assignments = newAssignments;
		if (!changed) break;
	}

	return assignments;
}

/**
 * Returns the centroids for a given clustering.
 * Exported for use by X-Means which needs to inspect centroids.
 */
export function computeCentroids(vectors: number[][], assignments: number[], K: number): number[][] {
	const dim = vectors[0].length;
	const rng = mulberry32(0);
	return recomputeCentroids(vectors, assignments, K, dim, rng);
}
