import { DistanceFn, silhouetteScore } from './metrics';
import { kmeans } from './kmeans';
// NOTE: kmedoids is not used in the default pipeline (too slow), but kept here for manual benchmarking
import { kmedoids } from './kmedoids';
import { log } from '../../utils/logger';

/** Absolute minimum K to try (silhouette needs at least 2 clusters). */
const MIN_K = 2;

/** Absolute maximum K to try (caps the sweep to bound runtime and avoid tiny clusters). */
const MAX_K_CAP = 15;

/**
 * Absolute silhouette tolerance for K selection. Clusterings whose silhouette
 * score is within this margin of the sweep's peak are considered equivalently
 * good, and the highest K among them is selected.
 *
 * Rationale: silhouette score naturally biases toward fewer, coarser clusters.
 * A small drop (e.g. 0.017) when going from K=4 to K=7 is statistically
 * insignificant, but the finer granularity is far more useful for note
 * categorization. 0.025 is within the standard range (0.02–0.05) used in
 * clustering literature for "equivalent quality" comparisons.
 */
const SILHOUETTE_TOLERANCE = 0.025;

export interface AutoKResult {
	/** The optimal K value found by the sweep. */
	bestK: number;
	/** Cluster assignments for the optimal K (length N, values 0..bestK-1). */
	assignments: number[];
	/** Silhouette score achieved at the optimal K. */
	silhouetteScore: number;
}

/**
 * Computes the K search range [minK, maxK] based on dataset size.
 *
 * - minK is 2 for small datasets (N < 20), 3 for larger ones (N >= 20).
 *   For 20+ notes, 2 categories is too coarse to be useful.
 * - For small datasets (N < 20): maxK = floor(N / 2).
 *   Ensures the sweep can explore meaningful K values (e.g. N=8 → [2,4]).
 * - For larger datasets (N >= 20): maxK = floor(N / 3).
 *   Ensures each cluster has at least ~3 notes on average.
 *   This is more generous than sqrt(N) and prevents under-clustering
 *   (e.g. N=56 → [2,15] instead of [2,7]).
 * - maxK is always clamped to MAX_K_CAP (15).
 *
 * @param n  Number of data points
 * @returns  Tuple [minK, maxK]
 */
export function computeKRange(n: number): [number, number] {
	if (n < 2) return [1, 1]; // degenerate: can't cluster at all

	const minK = n >= 20 ? 3 : MIN_K;
	let maxK: number;

	if (n < 20) {
		// For small datasets, allow up to N/2 clusters so the sweep
		// can actually explore meaningful K values (e.g. N=8 → [2,4])
		maxK = Math.max(MIN_K, Math.floor(n / 2));
	} else {
		// For larger datasets, allow 1 cluster per 3 notes on average.
		// This is more generous than sqrt(N) and avoids under-clustering
		// (e.g. N=56 → maxK=18 capped to 15, vs sqrt giving only 7).
		maxK = Math.floor(n / 3);
	}

	// Clamp to [minK, MAX_K_CAP]
	maxK = Math.min(Math.max(maxK, minK), MAX_K_CAP);

	return [minK, maxK];
}

/**
 * Finds the optimal number of clusters (K) by sweeping K values and
 * using silhouette-tolerance selection.
 *
 * Algorithm:
 * 1. Run the specified clustering algorithm for each K in [minK, maxK].
 * 2. Compute silhouette scores for all valid K values.
 * 3. Find the peak silhouette score across the sweep.
 * 4. Among all K values whose silhouette is within SILHOUETTE_TOLERANCE
 *    of the peak, select the **highest K**.
 *
 * This tolerance-based approach prevents the well-known silhouette bias
 * toward coarse clusters. When scores are nearly identical (e.g. K=4 at
 * 0.551 vs K=7 at 0.533), the finer granularity is preferred because it
 * produces more useful note categories.
 *
 * @param vectors    Input data points (N x D), already UMAP-reduced if applicable
 * @param algorithm  Which algorithm to use: 'kmeans' or 'kmedoids' (note: kmedoids is not used in the default pipeline)
 * @param distFn     Distance function (cosine or euclidean)
 * @param seed       Seed for reproducible initialization
 * @returns          The optimal K, its assignments, and its silhouette score
 */
export function findOptimalK(
	vectors: number[][],
	algorithm: 'kmeans' | 'kmedoids',
	distFn: DistanceFn,
	seed: number,
): AutoKResult {
	const n = vectors.length;
	const [minK, maxK] = computeKRange(n);

	log(`Auto-K: sweeping K=${minK}..${maxK} for ${algorithm} (N=${n})`);

	const clusterFn = algorithm === 'kmeans' ? kmeans : kmedoids;

	// Collect all valid (k, score, assignments) candidates
	const candidates: { k: number; score: number; assignments: number[] }[] = [];

	for (let k = minK; k <= maxK; k++) {
		const assignments = clusterFn(vectors, k, distFn, seed + k);

		// Count unique non-negative clusters actually formed
		const uniqueClusters = new Set(assignments.filter((a) => a >= 0));

		// Silhouette requires at least 2 distinct clusters
		if (uniqueClusters.size < 2) {
			log(`  K=${k}: only ${uniqueClusters.size} cluster(s) formed, skipping`);
			continue;
		}

		const score = silhouetteScore(vectors, assignments, distFn);
		log(`  K=${k}: silhouette=${score.toFixed(4)}`);
		candidates.push({ k, score, assignments });
	}

	let bestK: number;
	let bestScore: number;
	let bestAssignments: number[];

	if (candidates.length === 0) {
		// Fallback: no K produced ≥2 valid clusters, put everything in one cluster
		log('Auto-K: no valid clustering found, falling back to single cluster (K=1)');
		bestK = 1;
		bestAssignments = new Array(n).fill(0);
		bestScore = 0;
	} else {
		// Find peak silhouette across all candidates
		const peakScore = Math.max(...candidates.map((c) => c.score));
		const threshold = peakScore - SILHOUETTE_TOLERANCE;

		// Among candidates within tolerance of peak, pick the highest K.
		// This prevents silhouette's natural bias toward coarser clusters.
		const viable = candidates.filter((c) => c.score >= threshold);
		const best = viable.reduce((a, b) => (a.k >= b.k ? a : b));

		bestK = best.k;
		bestScore = best.score;
		bestAssignments = best.assignments;
	}

	log(`Auto-K: best K=${bestK} (silhouette=${bestScore.toFixed(4)})`);

	return {
		bestK,
		assignments: bestAssignments,
		silhouetteScore: bestScore,
	};
}
