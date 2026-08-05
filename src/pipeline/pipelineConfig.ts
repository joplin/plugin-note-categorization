import { CategorizationConfig, MetricType } from '../types/cluster';

/** Default dimensionality of local ONNX embedding vectors (all-MiniLM-L6-v2 / multilingual-e5-small). */
export const EMBEDDING_DIM = 384;

export function isValidEmbeddingVector(vector: number[] | undefined | null, expectedDim?: number): boolean {
	if (!vector || vector.length === 0) return false;
	if (expectedDim !== undefined && vector.length !== expectedDim) return false;
	return vector.every((v) => Number.isFinite(v));
}

/**
 * Computes UMAP intermediate dimensionality scaled logarithmically with input embedding dimension.
 * Formula: clamp(⌊2·log₂(D)⌋, 5, 50)
 */
export function adaptiveIntermediateDim(inputDim: number): number {
	const raw = Math.floor(2 * Math.log2(inputDim));
	if (!Number.isFinite(raw)) return 5;
	return Math.max(5, Math.min(50, raw));
}

/**
 * Computes UMAP neighbor count scaled with square root of note count.
 * Formula: clamp(⌊√N⌋, 5, 50)
 */
export function adaptiveNeighbors(noteCount: number): number {
	const raw = Math.floor(Math.sqrt(noteCount));
	if (!Number.isFinite(raw)) return 5;
	return Math.max(5, Math.min(50, raw));
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
			{ name: 'kmedoids-auto', algorithm: 'kmedoids', K: 'auto' },
			{ name: 'hdbscan', algorithm: 'hdbscan', minClusterSize: 3, minSamples: 2 },
		],
	};
}

export function createPipelineConfig(metric: MetricType = 'cosine', seed = 42): CategorizationConfig {
	return {
		seed,
		metric,
		intermediateDim: 8,
		intermediateNeighbors: 5,
		strategies: [
			{ name: 'kmeans-auto', algorithm: 'kmeans', K: 'auto' },
			{ name: 'kmedoids-auto', algorithm: 'kmedoids', K: 'auto' },
			{ name: 'hdbscan', algorithm: 'hdbscan', minClusterSize: 3, minSamples: 2 },
		],
	};
}

export const DEFAULT_CONFIG: CategorizationConfig = createPipelineConfig();
