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
 * Computes the mean silhouette coefficient for a clustering.
 *
 * For each point i:
 *   a(i) = mean distance to other points in the same cluster
 *   b(i) = mean distance to points in the nearest other cluster
 *   s(i) = (b(i) - a(i)) / max(a(i), b(i))
 *
 * Returns the mean of s(i) across all points.
 * Range: -1 (poor) to +1 (well-separated clusters).
 */
export function silhouetteScore(vectors: number[][], assignments: number[], distFn: DistanceFn): number {
	const n = vectors.length;
	if (n <= 1) return 0;

	const uniqueClusters = [...new Set(assignments)];
	if (uniqueClusters.length <= 1) return 0;

	// Group point indices by cluster
	const clusterIndices = new Map<number, number[]>();
	for (let i = 0; i < n; i++) {
		const c = assignments[i];
		if (!clusterIndices.has(c)) clusterIndices.set(c, []);
		clusterIndices.get(c)!.push(i);
	}

	let totalScore = 0;

	for (let i = 0; i < n; i++) {
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

	return totalScore / n;
}
