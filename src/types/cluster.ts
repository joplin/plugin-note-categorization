export type ClusteringAlgorithm = 'kmeans' | 'xmeans' | 'kmedoids' | 'hdbscan';

export interface ClusteringStrategy {
	/** Human-readable label for this run, e.g. 'kmeans-5', 'xmeans-auto' */
	name: string;
	algorithm: ClusteringAlgorithm;
	/** Number of clusters (kmeans / kmedoids) */
	K?: number;
	/** Minimum clusters to try (xmeans) */
	K_min?: number;
	/** Maximum clusters to try (xmeans) */
	K_max?: number;
	/** Minimum points to form a cluster (hdbscan, default: 3) */
	minClusterSize?: number;
}

export interface CategorizationConfig {
	/** Seed for UMAP and clustering reproducibility */
	seed: number;
	/** Distance metric for clustering and UMAP */
	metric: 'cosine' | 'euclidean';
	/**
	 * If set, UMAP-reduce to this dimensionality before clustering.
	 * null = cluster directly on the raw embedding vectors (e.g. 384D).
	 */
	intermediateDim: number | null;
	/** Number of nearest neighbors for UMAP intermediate projection */
	intermediateNeighbors: number;
	/** Clustering strategies to benchmark side-by-side */
	strategies: ClusteringStrategy[];
}

export interface BenchmarkResult {
	strategyName: string;
	algorithm: ClusteringAlgorithm;
	clusterCount: number;
	/** Cluster ID per note, in the same order as the input vectors */
	assignments: number[];
	/** Number of notes in each cluster, indexed by cluster ID */
	clusterSizes: number[];
	/** Mean silhouette coefficient: -1 (poor) to +1 (excellent) */
	silhouetteScore: number;
	/** Number of points classified as noise/outliers (HDBSCAN only) */
	outlierCount: number;
	/** Time taken to run this strategy in milliseconds */
	timeMs: number;
}
