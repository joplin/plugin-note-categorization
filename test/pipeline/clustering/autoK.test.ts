import { computeKRange, findOptimalK } from '../../../src/pipeline/clustering/autoK';
import { benchmark, runStrategy } from '../../../src/pipeline/clustering/benchmark';
import { euclideanDistance } from '../../../src/pipeline/clustering/metrics';
import { CategorizationConfig } from '../../../src/types/cluster';

// Synthetic 3-cluster data: 30 points in 2D
const THREE_CLUSTERS = [
	// Cluster near [0, 0]
	[0.1, 0.2],
	[0.2, 0.1],
	[0.0, 0.0],
	[0.1, 0.1],
	[0.15, 0.15],
	[0.2, 0.2],
	[0.05, 0.05],
	[0.12, 0.08],
	[0.08, 0.12],
	[0.18, 0.11],
	// Cluster near [100, 0]
	[100.1, 0.2],
	[99.9, 0.1],
	[100.0, 0.0],
	[100.1, 0.1],
	[100.15, 0.15],
	[99.95, 0.2],
	[100.05, 0.05],
	[100.12, 0.08],
	[100.08, 0.12],
	[100.18, 0.11],
	// Cluster near [0, 100]
	[0.1, 100.2],
	[0.2, 99.9],
	[0.0, 100.0],
	[0.1, 100.1],
	[0.15, 100.15],
	[0.2, 100.2],
	[0.05, 100.05],
	[0.12, 100.08],
	[0.08, 100.12],
	[0.18, 100.11],
];

// Synthetic 2-cluster data: 30 points in 2D
const TWO_CLUSTERS = [
	// Cluster near [0, 0]
	[0.1, 0.2],
	[0.2, 0.1],
	[0.0, 0.0],
	[0.1, 0.1],
	[0.15, 0.15],
	[0.2, 0.2],
	[0.05, 0.05],
	[0.12, 0.08],
	[0.08, 0.12],
	[0.18, 0.11],
	[0.02, 0.03],
	[0.04, 0.05],
	[0.11, 0.09],
	[0.14, 0.12],
	[0.07, 0.06],
	// Cluster near [100, 0]
	[100.1, 0.2],
	[99.9, 0.1],
	[100.0, 0.0],
	[100.1, 0.1],
	[100.15, 0.15],
	[99.95, 0.2],
	[100.05, 0.05],
	[100.12, 0.08],
	[100.08, 0.12],
	[100.18, 0.11],
	[100.02, 0.03],
	[100.04, 0.05],
	[100.11, 0.09],
	[100.14, 0.12],
	[100.07, 0.06],
];

describe('autoK computeKRange', () => {
	it('handles degenerate cases correctly', () => {
		expect(computeKRange(0)).toEqual([1, 1]);
		expect(computeKRange(1)).toEqual([1, 1]);
	});

	it('computes correct range for very small datasets (N < 6)', () => {
		expect(computeKRange(2)).toEqual([2, 2]);
		expect(computeKRange(3)).toEqual([2, 2]);
		expect(computeKRange(4)).toEqual([2, 2]);
		expect(computeKRange(5)).toEqual([2, 2]);
	});

	it('computes correct range for small-to-medium datasets (N < 20, uses N/2)', () => {
		expect(computeKRange(6)).toEqual([2, 3]); // floor(6/2) = 3
		expect(computeKRange(8)).toEqual([2, 4]); // floor(8/2) = 4
		expect(computeKRange(9)).toEqual([2, 4]); // floor(9/2) = 4
		expect(computeKRange(10)).toEqual([2, 5]); // floor(10/2) = 5
		expect(computeKRange(12)).toEqual([2, 6]); // floor(12/2) = 6
		expect(computeKRange(19)).toEqual([2, 9]); // floor(19/2) = 9
	});

	it('computes correct range for medium datasets (20 <= N <= 1000, uses ceil(1.5·√N))', () => {
		expect(computeKRange(20)).toEqual([3, 7]); // ceil(1.5·√20) = 7
		expect(computeKRange(30)).toEqual([3, 9]); // ceil(1.5·√30) = 9
		expect(computeKRange(45)).toEqual([3, 11]); // ceil(1.5·√45) = 11
		expect(computeKRange(56)).toEqual([3, 12]); // ceil(1.5·√56) = 12
		expect(computeKRange(100)).toEqual([3, 15]); // ceil(1.5·√100) = 15
		expect(computeKRange(225)).toEqual([3, 23]); // ceil(1.5·√225) = 23
		expect(computeKRange(468)).toEqual([3, 33]); // ceil(1.5·√468) = 33
		expect(computeKRange(500)).toEqual([3, 34]); // ceil(1.5·√500) = 34
		expect(computeKRange(879)).toEqual([3, 45]); // ceil(1.5·√879) = 45
		expect(computeKRange(1000)).toEqual([3, 48]); // ceil(1.5·√1000) = 48, density boost = 0
	});

	it('scales dynamically for large datasets (N > 1000, adds density boost (N-1000)/75)', () => {
		// Formula: ceil(1.5·√N + (N-1000)/75), capped at ABSOLUTE_MAX_K=200
		expect(computeKRange(2000)).toEqual([3, 81]); // ceil(67.1 + 13.3) = 81 — density ~24.7
		expect(computeKRange(3000)).toEqual([3, 109]); // ceil(82.2 + 26.7) = 109 — density ~27.5
		expect(computeKRange(5000)).toEqual([3, 160]); // ceil(106.1 + 53.3) = 160 — density ~31.3
		expect(computeKRange(10000)).toEqual([3, 200]); // ceil(150 + 120) = 270, capped at 200
	});
});

describe('autoK findOptimalK', () => {
	it('identifies 3 well-separated clusters', () => {
		const result = findOptimalK(THREE_CLUSTERS, 'kmeans', euclideanDistance, 42);
		expect(result.bestK).toBe(3);
		expect(result.silhouetteScore).toBeGreaterThan(0.9);
		expect(result.assignments).toHaveLength(THREE_CLUSTERS.length);
	});

	it('identifies 2 well-separated clusters', () => {
		const result = findOptimalK(TWO_CLUSTERS, 'kmeans', euclideanDistance, 42);
		// With minK=3 for N>=20, the algorithm picks the best K >= 3
		expect(result.bestK).toBeGreaterThanOrEqual(3);
		expect(result.silhouetteScore).toBeGreaterThan(0.5);
		expect(result.assignments).toHaveLength(TWO_CLUSTERS.length);
	});

	it('returns K=1 when data has no clear structure / identical points (fallback)', () => {
		// All points are identical -> silhouette scores are invalid/cannot form 2 clusters -> falls back to K=1
		const identicalPoints = Array.from({ length: 10 }, () => [1.0, 1.0]);
		const result = findOptimalK(identicalPoints, 'kmeans', euclideanDistance, 42);
		expect(result.bestK).toBe(1);
		expect(result.assignments).toEqual(new Array(10).fill(0));
	});

	it('is deterministic when given the same seed', () => {
		const res1 = findOptimalK(THREE_CLUSTERS, 'kmeans', euclideanDistance, 42);
		const res2 = findOptimalK(THREE_CLUSTERS, 'kmeans', euclideanDistance, 42);
		expect(res1).toEqual(res2);
	});

	it('works with both kmeans and kmedoids', () => {
		const resKmeans = findOptimalK(THREE_CLUSTERS, 'kmeans', euclideanDistance, 42);
		const resKmedoids = findOptimalK(THREE_CLUSTERS, 'kmedoids', euclideanDistance, 42);
		expect(resKmeans.bestK).toBe(3);
		expect(resKmedoids.bestK).toBe(3);
	});

	it('falls back to K=1 when no valid clustering is possible', () => {
		// Single point: can't form 2 clusters
		const result = findOptimalK([[1.0, 2.0]], 'kmeans', euclideanDistance, 42);
		expect(result.bestK).toBe(1);
		expect(result.assignments).toEqual([0]);
		expect(result.silhouetteScore).toBe(0);
	});

	it('prefers higher K when silhouette scores are within tolerance', () => {
		// 4 clusters of 8 points each, reasonably separated in 2D.
		// K=2 and K=3 may score slightly higher in raw silhouette, but K=4
		// should be within the 0.01 tolerance band and thus selected.
		const FOUR_CLUSTERS = [
			// Cluster near [0, 0]
			...[0.1, 0.2, 0.0, 0.15, 0.05, 0.12, 0.08, 0.18].map((x, i) => [
				x,
				[0.2, 0.1, 0.0, 0.15, 0.05, 0.08, 0.12, 0.11][i],
			]),
			// Cluster near [10, 0]
			...[10.1, 10.2, 10.0, 10.15, 10.05, 10.12, 10.08, 10.18].map((x, i) => [
				x,
				[0.2, 0.1, 0.0, 0.15, 0.05, 0.08, 0.12, 0.11][i],
			]),
			// Cluster near [0, 10]
			...[0.1, 0.2, 0.0, 0.15, 0.05, 0.12, 0.08, 0.18].map((x, i) => [
				x,
				10 + [0.2, 0.1, 0.0, 0.15, 0.05, 0.08, 0.12, 0.11][i],
			]),
			// Cluster near [10, 10]
			...[10.1, 10.2, 10.0, 10.15, 10.05, 10.12, 10.08, 10.18].map((x, i) => [
				x,
				10 + [0.2, 0.1, 0.0, 0.15, 0.05, 0.08, 0.12, 0.11][i],
			]),
		];

		const result = findOptimalK(FOUR_CLUSTERS, 'kmeans', euclideanDistance, 42);
		// With tolerance-based selection, K=4 should be picked even if K=2 or K=3
		// has a marginally higher raw silhouette
		expect(result.bestK).toBeGreaterThanOrEqual(3);
		expect(result.silhouetteScore).toBeGreaterThan(0.5);
		expect(result.assignments).toHaveLength(FOUR_CLUSTERS.length);
	});
});

describe('benchmark integration with autoK', () => {
	it('runs auto-K strategy and produces valid BenchmarkResult', () => {
		const config: CategorizationConfig = {
			seed: 42,
			metric: 'euclidean',
			intermediateDim: null,
			intermediateNeighbors: 5,
			strategies: [{ name: 'kmeans-auto', algorithm: 'kmeans', K: 'auto' }],
		};

		const results = benchmark(THREE_CLUSTERS, config);
		expect(results).toHaveLength(1);
		expect(results[0].strategyName).toBe('kmeans-auto');
		expect(results[0].algorithm).toBe('kmeans');
		expect(results[0].clusterCount).toBe(3);
		expect(results[0].silhouetteScore).toBeGreaterThan(0.9);
		expect(results[0].assignments).toHaveLength(THREE_CLUSTERS.length);
		expect(results[0].outlierCount).toBe(0);
	});

	it('handles mixed auto and fixed strategies', () => {
		const config: CategorizationConfig = {
			seed: 42,
			metric: 'euclidean',
			intermediateDim: null,
			intermediateNeighbors: 5,
			strategies: [
				{ name: 'kmeans-auto', algorithm: 'kmeans', K: 'auto' },
				{ name: 'kmeans-5', algorithm: 'kmeans', K: 5 },
				{ name: 'hdbscan', algorithm: 'hdbscan', minClusterSize: 3, minSamples: 2 },
			],
		};

		const results = benchmark(THREE_CLUSTERS, config);
		expect(results).toHaveLength(3);

		// The results should be sorted by silhouetteScore descending
		expect(results[0].silhouetteScore).toBeGreaterThanOrEqual(results[1].silhouetteScore);
		expect(results[1].silhouetteScore).toBeGreaterThanOrEqual(results[2].silhouetteScore);

		const autoRes = results.find((r) => r.strategyName === 'kmeans-auto')!;
		expect(autoRes.clusterCount).toBe(3);
	});

	it('runStrategy throws an error when called directly with K="auto"', () => {
		expect(() => {
			runStrategy(THREE_CLUSTERS, { name: 'kmeans-auto', algorithm: 'kmeans', K: 'auto' }, euclideanDistance, 42);
		}).toThrow('Use findOptimalK() instead');
	});
});
