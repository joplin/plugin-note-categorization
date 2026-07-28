import {
	EMBEDDING_DIM,
	isValidEmbeddingVector,
	adaptiveIntermediateDim,
	adaptiveNeighbors,
	createAdaptiveConfig,
	DEFAULT_CONFIG,
} from '../../src/pipeline/pipelineConfig';

describe('isValidEmbeddingVector', () => {
	it('accepts a valid vector of finite numbers with default dimension check', () => {
		const vec = new Array(EMBEDDING_DIM).fill(0.1);
		expect(isValidEmbeddingVector(vec)).toBe(true);
	});

	it('accepts custom dimension vectors when expectedDim is specified', () => {
		const vec768 = new Array(768).fill(0.05);
		const vec1536 = new Array(1536).fill(0.02);
		expect(isValidEmbeddingVector(vec768, 768)).toBe(true);
		expect(isValidEmbeddingVector(vec1536, 1536)).toBe(true);
	});

	it('rejects null and undefined', () => {
		expect(isValidEmbeddingVector(null)).toBe(false);
		expect(isValidEmbeddingVector(undefined)).toBe(false);
	});

	it('rejects empty array', () => {
		expect(isValidEmbeddingVector([])).toBe(false);
	});

	it('rejects vector matching wrong expected dimension', () => {
		expect(isValidEmbeddingVector(new Array(768).fill(0.1), 384)).toBe(false);
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

describe('adaptive scaling functions', () => {
	it('computes adaptive intermediate dimensions logarithmic with input dimension', () => {
		expect(adaptiveIntermediateDim(384)).toBe(17);
		expect(adaptiveIntermediateDim(768)).toBe(19);
		expect(adaptiveIntermediateDim(1536)).toBe(21);
	});

	it('clamps intermediate dimensions between 5 and 50', () => {
		expect(adaptiveIntermediateDim(2)).toBe(5);
		expect(adaptiveIntermediateDim(1e12)).toBe(50);
	});

	it('computes adaptive neighbors based on square root of note count', () => {
		expect(adaptiveNeighbors(25)).toBe(5);
		expect(adaptiveNeighbors(100)).toBe(10);
		expect(adaptiveNeighbors(500)).toBe(22);
	});

	it('clamps neighbors between 5 and 50', () => {
		expect(adaptiveNeighbors(2)).toBe(5);
		expect(adaptiveNeighbors(10000)).toBe(50);
	});

	it('creates adaptive configuration dynamically', () => {
		const config = createAdaptiveConfig(768, 100);
		expect(config.metric).toBe('cosine');
		expect(config.intermediateDim).toBe(19);
		expect(config.intermediateNeighbors).toBe(10);
		expect(config.strategies.length).toBe(3);
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
