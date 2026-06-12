import { DistanceFn } from './metrics';
import { mulberry32 } from '../../utils/prng';

const MAX_ITERATIONS = 100;

/**
 * Finds the index of the point that is farthest from any existing medoid.
 * Used for greedy medoid initialization (BUILD phase of PAM).
 */
function findFarthestPoint(vectors: number[][], medoidIndices: number[], distFn: DistanceFn): number {
	let bestIdx = 0;
	let bestMinDist = -1;

	for (let i = 0; i < vectors.length; i++) {
		if (medoidIndices.includes(i)) continue;

		let minDist = Infinity;
		for (const m of medoidIndices) {
			const d = distFn(vectors[i], vectors[m]);
			if (d < minDist) minDist = d;
		}

		if (minDist > bestMinDist) {
			bestMinDist = minDist;
			bestIdx = i;
		}
	}

	return bestIdx;
}

/**
 * Assigns each point to the nearest medoid.
 */
function assignToMedoids(vectors: number[][], medoidIndices: number[], distFn: DistanceFn): number[] {
	return vectors.map((vec) => {
		let bestCluster = 0;
		let bestDist = Infinity;
		for (let c = 0; c < medoidIndices.length; c++) {
			const d = distFn(vec, vectors[medoidIndices[c]]);
			if (d < bestDist) {
				bestDist = d;
				bestCluster = c;
			}
		}
		return bestCluster;
	});
}

/**
 * Computes the total cost (sum of distances from each point to its medoid).
 */
function totalCost(vectors: number[][], assignments: number[], medoidIndices: number[], distFn: DistanceFn): number {
	let cost = 0;
	for (let i = 0; i < vectors.length; i++) {
		cost += distFn(vectors[i], vectors[medoidIndices[assignments[i]]]);
	}
	return cost;
}

/**
 * K-Medoids clustering using a simplified PAM (Partitioning Around Medoids).
 *
 * Unlike K-Means, medoids are always actual data points rather than
 * computed means. This makes K-Medoids more robust to outliers and
 * works naturally with any distance metric (not just Euclidean).
 *
 * @param vectors   Input data points (N x D)
 * @param K         Number of clusters
 * @param distFn    Distance function
 * @param seed      Seed for reproducible initialization
 * @param maxIter   Maximum iterations (default: 100)
 * @returns         Cluster assignments (length N, values 0..K-1)
 */
export function kmedoids(
	vectors: number[][],
	K: number,
	distFn: DistanceFn,
	seed: number,
	maxIter: number = MAX_ITERATIONS,
): number[] {
	const n = vectors.length;
	if (n === 0) throw new Error('Cannot cluster empty input');
	if (K <= 0) throw new Error('K must be positive');
	if (K >= n) return vectors.map((_, i) => i);

	const rng = mulberry32(seed);

	// BUILD phase: initialize medoids greedily
	// First medoid is random, subsequent ones maximize distance from existing medoids
	const medoidIndices: number[] = [Math.floor(rng() * n)];
	for (let c = 1; c < K; c++) {
		medoidIndices.push(findFarthestPoint(vectors, medoidIndices, distFn));
	}

	let assignments = assignToMedoids(vectors, medoidIndices, distFn);
	let currentCost = totalCost(vectors, assignments, medoidIndices, distFn);

	// SWAP phase: try swapping each medoid with each non-medoid
	for (let iter = 0; iter < maxIter; iter++) {
		let improved = false;

		for (let m = 0; m < K; m++) {
			for (let i = 0; i < n; i++) {
				if (medoidIndices.includes(i)) continue;

				// Try swapping medoid m with point i
				const oldMedoid = medoidIndices[m];
				medoidIndices[m] = i;

				const newAssignments = assignToMedoids(vectors, medoidIndices, distFn);
				const newCost = totalCost(vectors, newAssignments, medoidIndices, distFn);

				if (newCost < currentCost) {
					// Keep the swap
					assignments = newAssignments;
					currentCost = newCost;
					improved = true;
				} else {
					// Revert the swap
					medoidIndices[m] = oldMedoid;
				}
			}
		}

		if (!improved) break;
	}

	return assignments;
}
