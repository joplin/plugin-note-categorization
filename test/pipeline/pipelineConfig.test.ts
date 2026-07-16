import { EMBEDDING_DIM, isValidEmbeddingVector, DEFAULT_CONFIG } from '../../src/pipeline/pipelineConfig';

describe('isValidEmbeddingVector', () => {
	it('accepts a valid 384-dim vector of finite numbers', () => {
		const vec = new Array(EMBEDDING_DIM).fill(0.1);
		expect(isValidEmbeddingVector(vec)).toBe(true);
	});

	it('rejects null', () => {
		expect(isValidEmbeddingVector(null)).toBe(false);
	});

	it('rejects undefined', () => {
		expect(isValidEmbeddingVector(undefined)).toBe(false);
	});

	it('rejects wrong dimension', () => {
		expect(isValidEmbeddingVector(new Array(383).fill(0.1))).toBe(false);
	});

	it('rejects vector containing NaN', () => {
		const vec = new Array(EMBEDDING_DIM).fill(0.1);
		vec[100] = NaN;
		expect(isValidEmbeddingVector(vec)).toBe(false);
	});

	it('rejects vector containing Infinity', () => {
		const vec = new Array(EMBEDDING_DIM).fill(0.1);
		vec[0] = Infinity;
		expect(isValidEmbeddingVector(vec)).toBe(false);
	});
});

describe('DEFAULT_CONFIG', () => {
	it('uses cosine metric and seed 42', () => {
		expect(DEFAULT_CONFIG.metric).toBe('cosine');
		expect(DEFAULT_CONFIG.seed).toBe(42);
	});

	it('includes kmeans, kmedoids, and hdbscan strategies', () => {
		const names = DEFAULT_CONFIG.strategies.map((s) => s.algorithm);
		expect(names).toContain('kmeans');
		expect(names).toContain('kmedoids');
		expect(names).toContain('hdbscan');
	});
});
