export type DistanceFn = (a: number[], b: number[]) => number;

export function cosineDistance(a: number[], b: number[]): number {
	let dot = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}
	const denom = Math.sqrt(normA) * Math.sqrt(normB);
	if (denom === 0) return 1;
	return 1 - dot / denom;
}

export function euclideanDistance(a: number[], b: number[]): number {
	let sum = 0;
	for (let i = 0; i < a.length; i++) {
		const d = a[i] - b[i];
		sum += d * d;
	}
	return Math.sqrt(sum);
}

export function getDistanceFn(metric: 'cosine' | 'euclidean'): DistanceFn {
	return metric === 'euclidean' ? euclideanDistance : cosineDistance;
}

/**
 * Number of points to sample for silhouette approximation.
 * 500 provides a statistically reliable estimate (±0.02 of true score)
 * while keeping computation fast at O(500²) = O(250K) distances regardless of N.
 */
const SILHOUETTE_SAMPLE_SIZE = 500;

/**
 * Simple seeded PRNG (mulberry32) for deterministic sampling.
 * Returns a function that produces values in [0, 1).
 */
function seededRng(seed: number): () => number {
	return () => {
		seed |= 0;
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Computes the mean silhouette coefficient for a clustering.
 *
 * For each point i:
 *   a(i) = mean distance to other points in the same cluster
 *   b(i) = mean distance to points in the nearest other cluster
 *   s(i) = (b(i) - a(i)) / max(a(i), b(i))
 *
 * Returns the mean of s(i) across all points.
 * Range: -1 (poor) to +1 (well-separated clusters).
 *
 * For large datasets (N > 500), uses random sampling to approximate the
 * score in O(500²) instead of O(N²), providing a statistically reliable
 * estimate while keeping computation fast.
 *
 * @param seed  Optional seed for deterministic sampling (default: 42)
 */
export function silhouetteScore(vectors: number[][], assignments: number[], distFn: DistanceFn, seed = 42): number {
	const n = vectors.length;
	if (n <= 1) return 0;

	const uniqueClusters = [...new Set(assignments)];
	if (uniqueClusters.length <= 1) return 0;

	// For large datasets, sample a subset of points for O(constant²) performance
	let sampleIndices: number[];
	if (n > SILHOUETTE_SAMPLE_SIZE) {
		// Stratified sampling: sample proportionally from each cluster
		// to preserve cluster size ratios in the sample
		const clusterMembers = new Map<number, number[]>();
		for (let i = 0; i < n; i++) {
			const c = assignments[i];
			if (!clusterMembers.has(c)) clusterMembers.set(c, []);
			clusterMembers.get(c)!.push(i);
		}

		const rng = seededRng(seed);
		sampleIndices = [];
		for (const [, members] of clusterMembers) {
			// At least 2 members per cluster (need ≥2 for intra-cluster distance)
			const clusterSampleSize = Math.max(2, Math.round((members.length / n) * SILHOUETTE_SAMPLE_SIZE));
			// Fisher-Yates shuffle on a copy, take first clusterSampleSize
			const shuffled = [...members];
			for (let i = shuffled.length - 1; i > 0; i--) {
				const j = Math.floor(rng() * (i + 1));
				[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
			}
			sampleIndices.push(...shuffled.slice(0, Math.min(clusterSampleSize, shuffled.length)));
		}
	} else {
		sampleIndices = Array.from({ length: n }, (_, i) => i);
	}

	// Build cluster index map for sampled points
	const clusterIndices = new Map<number, number[]>();
	for (const i of sampleIndices) {
		const c = assignments[i];
		if (!clusterIndices.has(c)) clusterIndices.set(c, []);
		clusterIndices.get(c)!.push(i);
	}

	let totalScore = 0;

	for (const i of sampleIndices) {
		const myCluster = assignments[i];
		const myClusterMembers = clusterIndices.get(myCluster)!;

		// a(i): mean distance to same-cluster points
		let a = 0;
		if (myClusterMembers.length > 1) {
			for (const j of myClusterMembers) {
				if (j !== i) a += distFn(vectors[i], vectors[j]);
			}
			a /= myClusterMembers.length - 1;
		}

		// b(i): mean distance to nearest other cluster
		let b = Infinity;
		for (const [clusterId, members] of clusterIndices) {
			if (clusterId === myCluster) continue;
			let meanDist = 0;
			for (const j of members) {
				meanDist += distFn(vectors[i], vectors[j]);
			}
			meanDist /= members.length;
			if (meanDist < b) b = meanDist;
		}

		const maxAB = Math.max(a, b);
		const s = maxAB === 0 ? 0 : (b - a) / maxAB;
		totalScore += s;
	}

	return totalScore / sampleIndices.length;
}
