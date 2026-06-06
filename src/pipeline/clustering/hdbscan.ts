import { HDBSCAN } from 'hdbscan-ts';
import { DistanceFn, euclideanDistance } from './metrics';

const DEFAULT_MIN_CLUSTER_SIZE = 3;

/**
 * HDBSCAN clustering using the hdbscan-ts library.
 *
 * Unlike K-Means, HDBSCAN:
 * - Automatically determines the number of clusters
 * - Identifies outlier/noise points (labeled -1)
 * - Handles clusters of varying densities
 *
 * Note: hdbscan-ts only supports euclidean distance internally.
 * When using cosine distance, we pre-normalize vectors so that
 * euclidean distance in the normalized space approximates cosine distance.
 * (For unit vectors: euclidean² = 2 * (1 - cosine_similarity))
 *
 * @param vectors         Input data points (N x D)
 * @param minClusterSize  Minimum points to form a cluster (default: 3)
 * @param distFn          Distance function (used to determine if normalization is needed)
 * @returns               Cluster assignments (length N). -1 = noise/outlier, 0..K = cluster IDs
 */
export function hdbscan(
	vectors: number[][],
	minClusterSize: number = DEFAULT_MIN_CLUSTER_SIZE,
	distFn: DistanceFn,
): number[] {
	const n = vectors.length;
	if (n === 0) throw new Error('Cannot cluster empty input');
	if (minClusterSize < 2) throw new Error('minClusterSize must be at least 2');
	if (n < minClusterSize) return new Array(n).fill(-1);

	// hdbscan-ts only supports euclidean distance. If the user chose cosine,
	// we L2-normalize the vectors first. In the normalized space, euclidean
	// distance is monotonically related to cosine distance.
	const isCosine = distFn !== euclideanDistance;
	const inputVectors = isCosine ? vectors.map(normalize) : vectors;

	const clusterer = new HDBSCAN({
		minClusterSize,
		minSamples: minClusterSize,
	});

	return clusterer.fit(inputVectors);
}

/**
 * L2-normalizes a vector to unit length.
 */
function normalize(vec: number[]): number[] {
	let norm = 0;
	for (let i = 0; i < vec.length; i++) {
		norm += vec[i] * vec[i];
	}
	norm = Math.sqrt(norm);
	if (norm === 0) return vec;
	return vec.map((v) => v / norm);
}
