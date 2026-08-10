import {
	EMBEDDING_DIM,
	isValidEmbeddingVector,
	adaptiveIntermediateDim,
	adaptiveNeighbors,
	adaptiveMinClusterSize,
	adaptiveMinSamples,
	createAdaptiveConfig,
	createPipelineConfig,
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
	it('returns fixed 5D for all input dimensions (optimal for clustering)', () => {
		expect(adaptiveIntermediateDim(384)).toBe(5);
		expect(adaptiveIntermediateDim(768)).toBe(5);
		expect(adaptiveIntermediateDim(1536)).toBe(5);
	});

	it('returns 5 regardless of extreme input dimensions', () => {
		expect(adaptiveIntermediateDim(2)).toBe(5);
		expect(adaptiveIntermediateDim(1e12)).toBe(5);
	});

	it('computes adaptive neighbors based on square root of note count, capped at 15', () => {
		expect(adaptiveNeighbors(25)).toBe(5);
		expect(adaptiveNeighbors(100)).toBe(10);
		expect(adaptiveNeighbors(500)).toBe(15);
	});

	it('clamps neighbors between 5 and 15', () => {
		expect(adaptiveNeighbors(2)).toBe(5);
		expect(adaptiveNeighbors(10000)).toBe(15);
	});

	it('creates adaptive configuration dynamically', () => {
		const config = createAdaptiveConfig(768, 100);
		expect(config.metric).toBe('cosine');
		expect(config.intermediateDim).toBe(5);
		expect(config.intermediateNeighbors).toBe(10);
		expect(config.strategies.length).toBe(2);
	});
});

describe('adaptive HDBSCAN parameter scaling', () => {
	it('computes minClusterSize based on square root of note count', () => {
		expect(adaptiveMinClusterSize(25)).toBe(5);
		expect(adaptiveMinClusterSize(100)).toBe(10);
		expect(adaptiveMinClusterSize(500)).toBe(22);
		expect(adaptiveMinClusterSize(1000)).toBe(31);
		expect(adaptiveMinClusterSize(2000)).toBe(44);
	});

	it('clamps minClusterSize between 5 and 50', () => {
		expect(adaptiveMinClusterSize(4)).toBe(5);
		expect(adaptiveMinClusterSize(10)).toBe(5);
		expect(adaptiveMinClusterSize(3000)).toBe(50);
		expect(adaptiveMinClusterSize(10000)).toBe(50);
	});

	it('computes minSamples as half of minClusterSize', () => {
		expect(adaptiveMinSamples(5)).toBe(2);
		expect(adaptiveMinSamples(10)).toBe(5);
		expect(adaptiveMinSamples(22)).toBe(11);
		expect(adaptiveMinSamples(31)).toBe(15);
	});

	it('clamps minSamples to minimum of 2', () => {
		expect(adaptiveMinSamples(2)).toBe(2);
		expect(adaptiveMinSamples(3)).toBe(2);
	});

	it('createAdaptiveConfig uses adaptive HDBSCAN params', () => {
		const config = createAdaptiveConfig(384, 500);
		const hdbscanStrategy = config.strategies.find((s) => s.algorithm === 'hdbscan');
		expect(hdbscanStrategy).toBeDefined();
		expect(hdbscanStrategy!.minClusterSize).toBe(22); // floor(sqrt(500))
		expect(hdbscanStrategy!.minSamples).toBe(11); // floor(22/2)
	});

	it('createPipelineConfig uses adaptive HDBSCAN params', () => {
		const config = createPipelineConfig(500);
		const hdbscanStrategy = config.strategies.find((s) => s.algorithm === 'hdbscan');
		expect(hdbscanStrategy).toBeDefined();
		expect(hdbscanStrategy!.minClusterSize).toBe(22);
		expect(hdbscanStrategy!.minSamples).toBe(11);
	});
});

describe('DEFAULT_CONFIG', () => {
	it('uses cosine metric and seed 42', () => {
		expect(DEFAULT_CONFIG.metric).toBe('cosine');
		expect(DEFAULT_CONFIG.seed).toBe(42);
	});

	it('includes kmeans and hdbscan strategies', () => {
		const names = DEFAULT_CONFIG.strategies.map((s) => s.algorithm);
		expect(names).toContain('kmeans');
		expect(names).toContain('hdbscan');
	});
});
