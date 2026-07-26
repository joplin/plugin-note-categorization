import {
	averageVectors,
	weightedAverageVectors,
	weightedAverageVectorsWithNorm,
	cosineSimilarity,
	computeTitleWeight,
	blendVectors,
} from '../../src/pipeline/vectorAggregator';

describe('averageVectors', () => {
	it('normalizes a single vector', () => {
		// [3, 4] has norm 5, so normalized = [0.6, 0.8]
		const result = averageVectors([[3, 4]]);
		expect(result[0]).toBeCloseTo(0.6, 10);
		expect(result[1]).toBeCloseTo(0.8, 10);
	});

	it('averages then normalizes multiple vectors', () => {
		// mean of [1,0,0], [0,1,0], [0,0,1] = [1/3, 1/3, 1/3]
		// norm = sqrt(3 * (1/9)) = sqrt(1/3) ≈ 0.5774
		// normalized = each component / norm = (1/3) / (1/√3) = 1/√3
		const result = averageVectors([
			[1, 0, 0],
			[0, 1, 0],
			[0, 0, 1],
		]);
		const expected = 1 / Math.sqrt(3);
		expect(result[0]).toBeCloseTo(expected, 10);
		expect(result[1]).toBeCloseTo(expected, 10);
		expect(result[2]).toBeCloseTo(expected, 10);
	});

	it('returns zero vector when opposing vectors cancel out', () => {
		// mean of [1, 0] and [-1, 0] = [0, 0], norm = 0
		// normalise returns the zero vector as-is (line 3: if norm === 0 return vec)
		const result = averageVectors([
			[1, 0],
			[-1, 0],
		]);
		expect(result[0]).toBe(0);
		expect(result[1]).toBe(0);
	});

	it('throws on empty input', () => {
		expect(() => averageVectors([])).toThrow('Cannot average zero vectors');
	});

	it('throws on dimension mismatch', () => {
		expect(() =>
			averageVectors([
				[1, 2],
				[1, 2, 3],
			]),
		).toThrow('different dimensions');
	});
});

describe('weightedAverageVectors', () => {
	it('normalizes a single vector', () => {
		const result = weightedAverageVectors([[3, 4]]);
		expect(result[0]).toBeCloseTo(0.6, 10);
		expect(result[1]).toBeCloseTo(0.8, 10);
	});

	it('gives lead chunk (index 0) higher weight than tail chunks', () => {
		const chunk0 = [1, 0];
		const chunk1 = [0, 1];
		const result = weightedAverageVectors([chunk0, chunk1]);

		// Chunk 0 has weight = exp(0) + 0.5 = 1.5
		// Chunk 1 has weight = exp(-0.15) ≈ 0.8607
		// Therefore result[0] > result[1]
		expect(result[0]).toBeGreaterThan(result[1]);
	});

	it('supports custom lambda and leadBoost parameters', () => {
		const chunk0 = [1, 0];
		const chunk1 = [0, 1];
		const result = weightedAverageVectors([chunk0, chunk1], { lambda: 0.5, leadBoost: 1.0 });

		// Chunk 0 weight = 2.0, Chunk 1 weight = exp(-0.5) ≈ 0.6065
		expect(result[0]).toBeGreaterThan(result[1]);
	});

	it('throws on empty input', () => {
		expect(() => weightedAverageVectors([])).toThrow('Cannot average zero vectors');
	});

	it('throws on dimension mismatch', () => {
		expect(() =>
			weightedAverageVectors([
				[1, 2],
				[1, 2, 3],
			]),
		).toThrow('different dimensions');
	});
});

describe('weightedAverageVectorsWithNorm', () => {
	it('returns both normalized vector and pre-normalization raw norm', () => {
		const chunk0 = [0.6, 0.8];
		const res = weightedAverageVectorsWithNorm([chunk0]);
		expect(res.vector[0]).toBeCloseTo(0.6, 10);
		expect(res.vector[1]).toBeCloseTo(0.8, 10);
		expect(res.rawNorm).toBeCloseTo(1.0, 10);
	});

	it('detects near-zero raw norm when vectors cancel out', () => {
		// Opposing unit vectors with equal weights
		const chunk0 = [1, 0];
		const chunk1 = [-1, 0];
		// Weight chunk0 = 1.5, weight chunk1 = exp(-0.15) ≈ 0.8607
		// If lambda=0 and leadBoost=0, weights are equal
		const res = weightedAverageVectorsWithNorm([chunk0, chunk1], { lambda: 0, leadBoost: 0 });
		expect(res.rawNorm).toBeCloseTo(0, 10);
	});
});

describe('cosineSimilarity', () => {
	it('returns 1 for identical unit vectors', () => {
		expect(cosineSimilarity([0.6, 0.8], [0.6, 0.8])).toBeCloseTo(1.0, 10);
	});

	it('returns 0 for orthogonal vectors', () => {
		expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0, 10);
	});

	it('returns -1 for opposite vectors', () => {
		expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1.0, 10);
	});

	it('returns 0 when one vector is zero', () => {
		// dot product of [0,0] · [1,0] = 0
		expect(cosineSimilarity([0, 0], [1, 0])).toBe(0);
	});

	it('throws on dimension mismatch', () => {
		expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow('different dimensions');
	});
});

describe('computeTitleWeight', () => {
	it('maps similarity=1 to maxWeight', () => {
		expect(computeTitleWeight(1.0)).toBeCloseTo(0.3, 10);
	});

	it('maps similarity=0 to 0', () => {
		expect(computeTitleWeight(0.0)).toBe(0);
	});

	it('clamps negative similarity to 0', () => {
		// Math.max(0, -0.5) = 0, then * 0.3 = 0
		expect(computeTitleWeight(-0.5)).toBe(0);
	});

	it('clamps similarity > 1 to maxWeight', () => {
		// Math.min(1, 1.5) = 1, then * 0.3 = 0.3
		expect(computeTitleWeight(1.5)).toBeCloseTo(0.3, 10);
	});

	it('uses custom maxWeight', () => {
		expect(computeTitleWeight(0.5, 0.6)).toBeCloseTo(0.3, 10);
	});
});

describe('blendVectors', () => {
	it('alpha=0 returns normalized body', () => {
		const result = blendVectors([3, 4], [0, 1], 0);
		expect(result[0]).toBeCloseTo(0.6, 10);
		expect(result[1]).toBeCloseTo(0.8, 10);
	});

	it('alpha=1 returns normalized title', () => {
		const result = blendVectors([3, 4], [0, 1], 1);
		expect(result[0]).toBeCloseTo(0, 10);
		expect(result[1]).toBeCloseTo(1, 10);
	});

	it('alpha=0.5 blends equally and normalizes', () => {
		// (0.5*[1,0] + 0.5*[0,1]) = [0.5, 0.5], norm = √0.5
		// normalized = [1/√2, 1/√2]
		const result = blendVectors([1, 0], [0, 1], 0.5);
		const expected = 1 / Math.sqrt(2);
		expect(result[0]).toBeCloseTo(expected, 10);
		expect(result[1]).toBeCloseTo(expected, 10);
	});

	it('throws on dimension mismatch', () => {
		expect(() => blendVectors([1, 2], [1, 2, 3], 0.5)).toThrow('different dimensions');
	});
});
