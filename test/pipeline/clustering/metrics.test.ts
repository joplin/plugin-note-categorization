import {
	cosineDistance,
	euclideanDistance,
	getDistanceFn,
	silhouetteScore,
} from '../../../src/pipeline/clustering/metrics';

describe('cosineDistance', () => {
	it('returns 0 for identical vectors', () => {
		expect(cosineDistance([1, 0], [1, 0])).toBeCloseTo(0, 10);
	});

	it('returns 1 for orthogonal vectors', () => {
		expect(cosineDistance([1, 0], [0, 1])).toBeCloseTo(1.0, 10);
	});

	it('returns 2 for opposite vectors', () => {
		expect(cosineDistance([1, 0], [-1, 0])).toBeCloseTo(2.0, 10);
	});

	it('returns 1 when a vector is zero (denom guard)', () => {
		// denom = 0, function returns 1
		expect(cosineDistance([0, 0], [1, 0])).toBe(1);
	});

	it('returns 0 for parallel non-unit vectors', () => {
		// [3,4] and [6,8] are parallel → cosine similarity = 1 → distance = 0
		expect(cosineDistance([3, 4], [6, 8])).toBeCloseTo(0, 10);
	});
});

describe('euclideanDistance', () => {
	it('returns 0 for identical vectors', () => {
		expect(euclideanDistance([1, 2], [1, 2])).toBe(0);
	});

	it('computes 3-4-5 triangle', () => {
		expect(euclideanDistance([0, 0], [3, 4])).toBeCloseTo(5.0, 10);
	});

	it('works in higher dimensions', () => {
		// sqrt((4-1)^2 + (5-2)^2 + (6-3)^2) = sqrt(27) = 3√3
		expect(euclideanDistance([1, 2, 3], [4, 5, 6])).toBeCloseTo(3 * Math.sqrt(3), 10);
	});
});

describe('getDistanceFn', () => {
	it('returns cosineDistance for "cosine"', () => {
		expect(getDistanceFn('cosine')).toBe(cosineDistance);
	});

	it('returns euclideanDistance for "euclidean"', () => {
		expect(getDistanceFn('euclidean')).toBe(euclideanDistance);
	});
});

describe('silhouetteScore', () => {
	it('returns near +1 for perfectly separated clusters', () => {
		// Two tight clusters far apart
		const vectors = [
			[-10, 0],
			[-9, 0],
			[9, 0],
			[10, 0],
		];
		const assignments = [0, 0, 1, 1];
		const score = silhouetteScore(vectors, assignments, euclideanDistance);
		expect(score).toBeGreaterThan(0.9);
	});

	it('returns 0 for single cluster', () => {
		const vectors = [
			[1, 0],
			[2, 0],
			[3, 0],
		];
		const assignments = [0, 0, 0];
		expect(silhouetteScore(vectors, assignments, euclideanDistance)).toBe(0);
	});

	it('returns 0 for single point', () => {
		expect(silhouetteScore([[1, 0]], [0], euclideanDistance)).toBe(0);
	});

	it('returns negative score for poorly separated clusters', () => {
		// Interleaved assignments: adjacent points in different clusters
		const vectors = [
			[0, 0],
			[1, 0],
			[2, 0],
			[3, 0],
		];
		const assignments = [0, 1, 0, 1];
		const score = silhouetteScore(vectors, assignments, euclideanDistance);
		expect(score).toBeLessThan(0);
	});
});
