import { DistanceFn, silhouetteScore } from './metrics';
import { kmeans } from './kmeans';
// NOTE: kmedoids is not used in the default pipeline (too slow), but kept here for manual benchmarking
import { kmedoids } from './kmedoids';
import { log } from '../../utils/logger';

/** Absolute minimum K to try (silhouette needs at least 2 clusters). */
const MIN_K = 2;

/**
 * Absolute safety ceiling for maxK to bound sweep runtime.
 * At N=10,000 the dynamic formula yields ~270, so this caps it at 200
 * to prevent excessive K-Means iterations at extreme vault sizes.
 * Silhouette evaluation remains O(500²) per K due to stratified sampling.
 */
const ABSOLUTE_MAX_K = 200;

/**
 * Absolute silhouette tolerance for K selection. Clusterings whose silhouette
 * score is within this margin of the sweep's peak are considered equivalently
 * good, and the highest K among them is selected.
 *
 * Rationale: silhouette score naturally biases toward fewer, coarser clusters.
 * A small drop (e.g. 0.008) when going from K=4 to K=7 is statistically
 * insignificant, but the finer granularity is far more useful for note
 * categorization. 0.01 is a strict tolerance for equivalent peak selection.
 */
const SILHOUETTE_TOLERANCE = 0.01;

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
 * Two-part scaling formula for maxK:
 *
 * - **Base term** (all N ≥ 20): `1.5 · √N` — the BERTopic-standard sqrt rule
 *   of thumb that scales sub-linearly with dataset size.
 * - **Density boost** (N > 1000): `(N − 1000) / 75` — a linear term that adds
 *   ~13 extra K per 1000 additional notes, preventing clusters from growing too
 *   large in big vaults. This maintains ~25–35 notes per cluster up to N ≈ 5000.
 *
 * The combined formula `maxK = ⌈1.5·√N + max(0, (N−1000)/75)⌉` is continuous
 * at N = 1000 (density boost is 0) and preserves all existing behavior for
 * N ≤ 1000.
 *
 * Range rules:
 * - minK is 2 for small datasets (N < 20), 3 for larger ones (N ≥ 20).
 * - For small datasets (N < 20): maxK = floor(N / 2).
 * - maxK is always clamped to ABSOLUTE_MAX_K (200).
 *
 * Examples:
 *   N=100 → 15, N=500 → 34, N=1000 → 48,
 *   N=2000 → 81, N=3000 → 109, N=5000 → 160, N=10000 → 200 (capped)
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
		// Base scaling: 1.5·√N (standard sqrt rule of thumb).
		// For large datasets (N > 1000), add a linear density term
		// to maintain ~25-35 notes per cluster as N grows.
		// The density term (N-1000)/75 adds ~13 categories per 1000 additional
		// notes, preventing clusters from growing too large in big vaults.
		const sqrtTerm = 1.5 * Math.sqrt(n);
		const densityBoost = Math.max(0, (n - 1000) / 75);
		maxK = Math.ceil(sqrtTerm + densityBoost);
	}

	// Clamp to [minK, ABSOLUTE_MAX_K]
	maxK = Math.min(Math.max(maxK, minK), ABSOLUTE_MAX_K);

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
