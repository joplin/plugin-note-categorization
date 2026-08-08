import { CategorizationConfig, MetricType } from '../types/cluster';

/** Default dimensionality of local ONNX embedding vectors (all-MiniLM-L6-v2 / multilingual-e5-small). */
export const EMBEDDING_DIM = 384;

export function isValidEmbeddingVector(vector: number[] | undefined | null, expectedDim?: number): boolean {
	if (!vector || vector.length === 0) return false;
	if (expectedDim !== undefined && vector.length !== expectedDim) return false;
	return vector.every((v) => Number.isFinite(v));
}

/**
 * Returns the UMAP target dimensionality for clustering.
 *
 * Fixed at 5D — the optimal dimensionality for density-based and centroid-based
 * clustering on text embeddings. Higher dimensions cause the curse of dimensionality
 * (distances converge, density flattens, clusters become inseparable).
 * This is the BERTopic standard used across production topic modeling systems.
 *
 * @param _inputDim  Embedding dimension (unused — output is always 5D)
 */
export function adaptiveIntermediateDim(_inputDim: number): number {
	return 5;
}

/**
 * Computes UMAP neighbor count scaled with square root of note count.
 * Capped at 15 to preserve local topic structure — higher values blur
 * boundaries between distinct topics by connecting cross-topic neighbors.
 * Formula: clamp(⌊√N⌋, 5, 15)
 */
export function adaptiveNeighbors(noteCount: number): number {
	const raw = Math.floor(Math.sqrt(noteCount));
	if (!Number.isFinite(raw)) return 5;
	return Math.max(5, Math.min(15, raw));
}

/**
 * Computes HDBSCAN minClusterSize scaled with square root of note count.
 * Larger datasets need larger minimum clusters to avoid micro-fragmentation.
 * Formula: clamp(⌊√N⌋, 5, 50)
 *
 * Examples: N=25→5, N=100→10, N=500→22, N=1000→31, N=2500→50
 */
export function adaptiveMinClusterSize(noteCount: number): number {
	const raw = Math.floor(Math.sqrt(noteCount));
	if (!Number.isFinite(raw)) return 5;
	return Math.max(5, Math.min(50, raw));
}

/**
 * Computes HDBSCAN minSamples as half of minClusterSize.
 * Lower minSamples relaxes density requirements, reducing noise/outlier ratio.
 * Formula: max(2, ⌊minClusterSize / 2⌋)
 */
export function adaptiveMinSamples(minClusterSize: number): number {
	return Math.max(2, Math.floor(minClusterSize / 2));
}

export function createAdaptiveConfig(
	inputDim: number,
	noteCount: number,
	metric: MetricType = 'cosine',
	seed = 42,
): CategorizationConfig {
	return {
		seed,
		metric,
		intermediateDim: adaptiveIntermediateDim(inputDim),
		intermediateNeighbors: adaptiveNeighbors(noteCount),
		strategies: [
			{ name: 'kmeans-auto', algorithm: 'kmeans', K: 'auto' },
			{
				name: 'hdbscan',
				algorithm: 'hdbscan',
				minClusterSize: adaptiveMinClusterSize(noteCount),
				minSamples: adaptiveMinSamples(adaptiveMinClusterSize(noteCount)),
			},
		],
	};
}

export function createPipelineConfig(noteCount = 100, metric: MetricType = 'cosine', seed = 42): CategorizationConfig {
	return {
		seed,
		metric,
		intermediateDim: 5,
		intermediateNeighbors: adaptiveNeighbors(noteCount),
		strategies: [
			{ name: 'kmeans-auto', algorithm: 'kmeans', K: 'auto' },
			{
				name: 'hdbscan',
				algorithm: 'hdbscan',
				minClusterSize: adaptiveMinClusterSize(noteCount),
				minSamples: adaptiveMinSamples(adaptiveMinClusterSize(noteCount)),
			},
		],
	};
}

export const DEFAULT_CONFIG: CategorizationConfig = createPipelineConfig(100);
