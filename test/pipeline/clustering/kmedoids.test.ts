import { kmedoids } from '../../../src/pipeline/clustering/kmedoids';
import { euclideanDistance, cosineDistance } from '../../../src/pipeline/clustering/metrics';

const SEPARATED_CLUSTERS = [
	[0.1, 0.2],
	[0.2, 0.1],
	[0.0, 0.0],
	[100, 0.1],
	[99.9, 0.2],
	[100.1, 0.0],
	[0.1, 100],
	[0.2, 99.9],
	[0.0, 100.1],
];

describe('kmedoids', () => {
	it('is deterministic: same seed produces same result', () => {
		const a = kmedoids(SEPARATED_CLUSTERS, 3, euclideanDistance, 42);
		const b = kmedoids(SEPARATED_CLUSTERS, 3, euclideanDistance, 42);
		expect(a).toEqual(b);
	});

	it('correctly assigns well-separated clusters', () => {
		const assignments = kmedoids(SEPARATED_CLUSTERS, 3, euclideanDistance, 42);
		expect(assignments[0]).toBe(assignments[1]);
		expect(assignments[0]).toBe(assignments[2]);
		expect(assignments[3]).toBe(assignments[4]);
		expect(assignments[3]).toBe(assignments[5]);
		expect(assignments[6]).toBe(assignments[7]);
		expect(assignments[6]).toBe(assignments[8]);
		expect(assignments[0]).not.toBe(assignments[3]);
		expect(assignments[0]).not.toBe(assignments[6]);
		expect(assignments[3]).not.toBe(assignments[6]);
	});

	it('K >= N gives each point its own cluster', () => {
		const data = [
			[1, 0],
			[0, 1],
			[1, 1],
		];
		expect(kmedoids(data, 5, euclideanDistance, 42)).toEqual([0, 1, 2]);
	});

	it('throws on empty input', () => {
		expect(() => kmedoids([], 2, euclideanDistance, 42)).toThrow('Cannot cluster empty input');
	});

	it('throws on K <= 0', () => {
		expect(() => kmedoids([[1, 0]], 0, euclideanDistance, 42)).toThrow('K must be positive');
	});

	it('works with cosineDistance', () => {
		// Unit vectors in clearly different directions
		const unitVecs = [
			[1, 0],
			[0.99, 0.01], // near x-axis
			[0, 1],
			[0.01, 0.99], // near y-axis
			[-1, 0],
			[-0.99, -0.01], // near -x-axis
		];
		const assignments = kmedoids(unitVecs, 3, cosineDistance, 42);
		expect(assignments[0]).toBe(assignments[1]);
		expect(assignments[2]).toBe(assignments[3]);
		expect(assignments[4]).toBe(assignments[5]);
	});

	it('returns assignments with correct length and valid range', () => {
		const K = 3;
		const assignments = kmedoids(SEPARATED_CLUSTERS, K, euclideanDistance, 42);
		expect(assignments).toHaveLength(SEPARATED_CLUSTERS.length);
		for (const a of assignments) {
			expect(a).toBeGreaterThanOrEqual(0);
			expect(a).toBeLessThan(K);
		}
	});
});
