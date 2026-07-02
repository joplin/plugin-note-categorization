import { CategorizationConfig } from '../types/cluster';

/** Dimensionality of embedding vectors (all-MiniLM-L6-v2 / multilingual-e5-small). */
export const EMBEDDING_DIM = 384;

export function isValidEmbeddingVector(vector: number[] | undefined | null): boolean {
	if (!vector) return false;
	if (vector.length !== EMBEDDING_DIM) return false;
	return vector.every((v) => v !== null && !Number.isNaN(v));
}

export const DEFAULT_CONFIG: CategorizationConfig = {
	seed: 42,
	metric: 'cosine',
	intermediateDim: 8,
	intermediateNeighbors: 5,
	strategies: [
		{ name: 'kmeans-6', algorithm: 'kmeans', K: 6 },
		{ name: 'kmedoids-6', algorithm: 'kmedoids', K: 6 },
		{ name: 'hdbscan-tuned', algorithm: 'hdbscan', minClusterSize: 4, minSamples: 1 },
		{ name: 'hdbscan-conservative', algorithm: 'hdbscan', minClusterSize: 3, minSamples: 2 },
	],
};
