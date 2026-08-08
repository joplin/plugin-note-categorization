import { BenchmarkResult } from '../../types/cluster';
import { DocumentText, TfidfExtractor } from './tfidf';
import { selectDedupedTags, filterDemotedUnigrams } from './tagExtraction';
import { generateClusterName, toTitleCase } from './clusterNaming';

// Re-export data constants
export { STOP_WORDS } from './data/stopWords';
export { TAXONOMY_MAPPING } from './data/taxonomy';

// Re-export TF-IDF functions & class
export {
	DocumentText,
	TfidfExtractor,
	cleanText,
	singularize,
	tokenize,
	getNgrams,
	hasConsecutiveDuplicates,
} from './tfidf';

// Re-export tag extraction functions
export { filterDemotedUnigrams, selectDedupedTags } from './tagExtraction';

// Re-export cluster naming functions
export { toTitleCase, shareWords, getTaxonomyCategory, generateClusterName } from './clusterNaming';

/**
 * Enriches benchmark results with extracted TF-IDF tags and cluster names for each cluster.
 *
 * Builds the TF-IDF corpus from all pipeline documents once, then iterates
 * over each strategy result to extract the top tags and generated names per cluster.
 *
 * This function is async to yield control to the event loop between strategies,
 * allowing the Joplin panel to receive poll responses and update status messages.
 *
 * @param results    Benchmark results from the clustering pipeline
 * @param documents  All note documents used in the pipeline (same order as noteVectors)
 * @param topK       Number of tags to extract per cluster (default: 5)
 * @param onStatus   Optional callback to report progress to the UI
 */
export async function enrichResultsWithTags(
	results: BenchmarkResult[],
	documents: DocumentText[],
	topK = 5,
	onStatus?: (text: string) => void,
): Promise<void> {
	onStatus?.('Building topic index...');
	// Yield so the status message can be delivered via poll before the CPU-intensive constructor runs
	await new Promise((resolve) => setTimeout(resolve, 0));

	const tfidfExtractor = new TfidfExtractor(documents);

	for (let stratIdx = 0; stratIdx < results.length; stratIdx++) {
		const result = results[stratIdx];
		onStatus?.(`Extracting topics (strategy ${stratIdx + 1}/${results.length}: ${result.strategyName})...`);
		// Yield so the UI can update before processing this strategy
		await new Promise((resolve) => setTimeout(resolve, 0));

		const tags: { [clusterId: number]: string[] } = {};
		const clusterNames: { [clusterId: number]: string } = {};

		const clusterIndices: { [clusterId: number]: number[] } = {};
		result.assignments.forEach((clusterId, noteIdx) => {
			if (clusterId !== -1) {
				if (!clusterIndices[clusterId]) {
					clusterIndices[clusterId] = [];
				}
				clusterIndices[clusterId].push(noteIdx);
			}
		});

		// Cache ngram scores to avoid recomputation during collision resolution
		const cachedScores: { [clusterId: number]: { ngram: string; score: number }[] } = {};

		for (const clusterIdStr of Object.keys(clusterIndices)) {
			const clusterId = Number(clusterIdStr);
			const indices = clusterIndices[clusterId];

			// Use index-based extraction (uses cached ngrams, no re-processing)
			const ngramScores = tfidfExtractor.extractClusterNgramsByIndices(indices);
			cachedScores[clusterId] = ngramScores;

			tags[clusterId] = selectDedupedTags(ngramScores, topK);
			clusterNames[clusterId] = generateClusterName(ngramScores, clusterId);
		}

		// Count occurrences of each mapped name to identify collisions (e.g. multiple "Recipes" sections)
		const nameCounts: { [name: string]: number } = {};
		for (const idStr of Object.keys(clusterNames)) {
			const name = clusterNames[Number(idStr)];
			nameCounts[name] = (nameCounts[name] || 0) + 1;
		}

		// Resolve duplicates by appending the cluster's top-scoring candidate keyword in parentheses
		const usedNames = new Set<string>(Object.values(clusterNames).filter((name) => nameCounts[name] === 1));

		for (const idStr of Object.keys(clusterNames)) {
			const id = Number(idStr);
			const name = clusterNames[id];
			if (nameCounts[name] > 1) {
				const filteredScores = filterDemotedUnigrams(cachedScores[id]);
				if (filteredScores.length > 0 && filteredScores[0].score > 0) {
					const subTopic = toTitleCase(filteredScores[0].ngram);
					let resolved = `${name} (${subTopic})`;
					// Guard against re-collision: append numeric suffix if still duplicate
					if (usedNames.has(resolved)) {
						let suffix = 2;
						while (usedNames.has(`${resolved} ${suffix}`)) suffix++;
						resolved = `${resolved} ${suffix}`;
					}
					clusterNames[id] = resolved;
					usedNames.add(resolved);
				}
			}
		}

		result.tags = tags;
		result.clusterNames = clusterNames;
	}
}
