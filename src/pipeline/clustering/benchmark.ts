import { CategorizationConfig, BenchmarkResult, ClusteringStrategy } from '../../types/cluster';
import { DistanceFn, getDistanceFn, silhouetteScore } from './metrics';
import { kmeans } from './kmeans';
import { xmeans } from './xmeans';
import { kmedoids } from './kmedoids';
import { hdbscan } from './hdbscan';
import { UmapProjector } from '../UmapProjector';
import { log } from '../../utils/logger';

const DEFAULT_K = 5;
const DEFAULT_K_MIN = 2;
const DEFAULT_K_MAX = 10;
const DEFAULT_MIN_CLUSTER_SIZE = 3;

/**
 * Runs a single clustering strategy and returns the cluster assignments.
 */
function runStrategy(vectors: number[][], strategy: ClusteringStrategy, distFn: DistanceFn, seed: number): number[] {
	switch (strategy.algorithm) {
		case 'kmeans':
			return kmeans(vectors, strategy.K ?? DEFAULT_K, distFn, seed);
		case 'xmeans':
			return xmeans(vectors, strategy.K_min ?? DEFAULT_K_MIN, strategy.K_max ?? DEFAULT_K_MAX, distFn, seed);
		case 'kmedoids':
			return kmedoids(vectors, strategy.K ?? DEFAULT_K, distFn, seed);
		case 'hdbscan':
			return hdbscan(vectors, strategy.minClusterSize ?? DEFAULT_MIN_CLUSTER_SIZE, strategy.minSamples, distFn);
		default:
			throw new Error(`Unknown clustering algorithm: ${strategy.algorithm}`);
	}
}

/**
 * Counts the number of points in each cluster (excluding noise points labeled -1).
 */
function computeClusterSizes(assignments: number[]): number[] {
	const counts = new Map<number, number>();
	for (const c of assignments) {
		if (c < 0) continue; // skip noise points
		counts.set(c, (counts.get(c) ?? 0) + 1);
	}
	if (counts.size === 0) return [];
	const maxCluster = Math.max(...counts.keys());
	const sizes: number[] = [];
	for (let c = 0; c <= maxCluster; c++) {
		sizes.push(counts.get(c) ?? 0);
	}
	return sizes;
}

/**
 * Formats the benchmark results as a readable comparison table.
 */
function logBenchmarkTable(results: BenchmarkResult[]): void {
	log('=== Clustering Benchmark Results ===');
	log('');

	const header = `${'Strategy'.padEnd(20)} | ${'Algo'.padEnd(10)} | ${'K'.padStart(3)} | ${'Silhouette'.padStart(10)} | ${'Outliers'.padStart(8)} | ${'Time'.padStart(8)} | Cluster Sizes`;
	log(header);
	log('-'.repeat(header.length + 20));

	for (const r of results) {
		const sizesStr = `[${r.clusterSizes.join(', ')}]`;
		log(
			`${r.strategyName.padEnd(20)} | ${r.algorithm.padEnd(10)} | ${String(r.clusterCount).padStart(3)} | ${r.silhouetteScore.toFixed(4).padStart(10)} | ${String(r.outlierCount).padStart(8)} | ${(r.timeMs.toFixed(0) + 'ms').padStart(8)} | ${sizesStr}`,
		);
	}

	log('');
	if (results.length > 0) {
		log(`Best: ${results[0].strategyName} (silhouette = ${results[0].silhouetteScore.toFixed(4)})`);
	}
	log('===================================');
}

/**
 * Runs all clustering strategies in the config against the provided vectors,
 * computes silhouette scores, and returns results sorted by quality (best first).
 *
 * If intermediateDim is set, vectors are first UMAP-reduced before clustering.
 * The original high-dimensional vectors are passed in; reduction is handled here.
 *
 * For HDBSCAN, noise points (labeled -1) are excluded from the silhouette calculation
 * since they intentionally don't belong to any cluster.
 *
 * @param vectors  High-dimensional note vectors (N x D)
 * @param config   Categorization config with strategies to benchmark
 * @returns        Benchmark results sorted by silhouette score (descending)
 */
export function benchmark(vectors: number[][], config: CategorizationConfig): BenchmarkResult[] {
	if (vectors.length === 0) {
		log('No vectors to cluster.');
		return [];
	}

	const distFn = getDistanceFn(config.metric);

	// Optionally reduce dimensionality before clustering
	let clusteringVectors = vectors;
	if (config.intermediateDim !== null) {
		log(`Reducing ${vectors[0].length}D → ${config.intermediateDim}D for clustering...`);
		const projector = new UmapProjector({
			nComponents: config.intermediateDim,
			nNeighbors: config.intermediateNeighbors,
			metric: config.metric,
			seed: config.seed,
		});
		clusteringVectors = projector.project(vectors);
	}

	const results: BenchmarkResult[] = [];

	for (const strategy of config.strategies) {
		log(`Running strategy: ${strategy.name} (${strategy.algorithm})...`);
		const startTime = performance.now();

		try {
			const assignments = runStrategy(clusteringVectors, strategy, distFn, config.seed);
			const timeMs = performance.now() - startTime;

			const outlierCount = assignments.filter((a) => a < 0).length;
			const clusterSizes = computeClusterSizes(assignments);
			const clusterCount = clusterSizes.filter((s) => s > 0).length;

			// For silhouette, exclude noise points (-1) since they're intentionally unassigned
			let score = 0;
			if (clusterCount >= 2) {
				const clusteredIndices = assignments.map((a, i) => (a >= 0 ? i : -1)).filter((i) => i >= 0);
				const clusteredVectors = clusteredIndices.map((i) => clusteringVectors[i]);
				const clusteredAssignments = clusteredIndices.map((i) => assignments[i]);
				score = silhouetteScore(clusteredVectors, clusteredAssignments, distFn);
			}

			results.push({
				strategyName: strategy.name,
				algorithm: strategy.algorithm,
				clusterCount,
				assignments,
				clusterSizes,
				silhouetteScore: score,
				outlierCount,
				timeMs,
			});
		} catch (err) {
			log(`Strategy ${strategy.name} failed: ${err}`);
		}
	}

	// Sort by silhouette score descending (best first)
	results.sort((a, b) => b.silhouetteScore - a.silhouetteScore);

	logBenchmarkTable(results);

	return results;
}
