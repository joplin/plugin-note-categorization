import { kmeans } from '../../../src/pipeline/clustering/kmeans';
import { euclideanDistance } from '../../../src/pipeline/clustering/metrics';

// Three well-separated 2D clusters
const SEPARATED_CLUSTERS = [
	// Cluster near [0, 0]
	[0.1, 0.2],
	[0.2, 0.1],
	[0.0, 0.0],
	// Cluster near [100, 0]
	[100, 0.1],
	[99.9, 0.2],
	[100.1, 0.0],
	// Cluster near [0, 100]
	[0.1, 100],
	[0.2, 99.9],
	[0.0, 100.1],
];

describe('kmeans', () => {
	it('is deterministic: same seed produces same result', () => {
		const a = kmeans(SEPARATED_CLUSTERS, 3, euclideanDistance, 42);
		const b = kmeans(SEPARATED_CLUSTERS, 3, euclideanDistance, 42);
		expect(a).toEqual(b);
	});

	it('correctly assigns well-separated clusters', () => {
		const assignments = kmeans(SEPARATED_CLUSTERS, 3, euclideanDistance, 42);
		// Points 0,1,2 should share a cluster; 3,4,5 share another; 6,7,8 share the third
		expect(assignments[0]).toBe(assignments[1]);
		expect(assignments[0]).toBe(assignments[2]);
		expect(assignments[3]).toBe(assignments[4]);
		expect(assignments[3]).toBe(assignments[5]);
		expect(assignments[6]).toBe(assignments[7]);
		expect(assignments[6]).toBe(assignments[8]);
		// And the three groups are distinct
		expect(assignments[0]).not.toBe(assignments[3]);
		expect(assignments[0]).not.toBe(assignments[6]);
		expect(assignments[3]).not.toBe(assignments[6]);
	});

	it('K=1 assigns all points to cluster 0', () => {
		const assignments = kmeans(SEPARATED_CLUSTERS, 1, euclideanDistance, 42);
		expect(assignments.every((a) => a === 0)).toBe(true);
	});

	it('K >= N gives each point its own cluster', () => {
		const data = [
			[1, 0],
			[0, 1],
			[1, 1],
		];
		const assignments = kmeans(data, 5, euclideanDistance, 42);
		expect(assignments).toEqual([0, 1, 2]);
	});

	it('throws on empty input', () => {
		expect(() => kmeans([], 2, euclideanDistance, 42)).toThrow('Cannot cluster empty input');
	});

	it('throws on K <= 0', () => {
		expect(() => kmeans([[1, 0]], 0, euclideanDistance, 42)).toThrow('K must be positive');
	});

	it('returns assignments with correct length and valid range', () => {
		const K = 3;
		const assignments = kmeans(SEPARATED_CLUSTERS, K, euclideanDistance, 42);
		expect(assignments).toHaveLength(SEPARATED_CLUSTERS.length);
		for (const a of assignments) {
			expect(a).toBeGreaterThanOrEqual(0);
			expect(a).toBeLessThan(K);
		}
	});

	it('converges with maxIter=1 without error', () => {
		// Shouldn't hang or error even with just 1 iteration
		const assignments = kmeans(SEPARATED_CLUSTERS, 3, euclideanDistance, 42, 1);
		expect(assignments).toHaveLength(SEPARATED_CLUSTERS.length);
	});
});
