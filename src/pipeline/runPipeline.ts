import { fetchAllNotes } from './noteReader';
import { benchmark } from './clustering/benchmark';
import { weightedAverageVectorsWithNorm } from './vectorAggregator';
import { PanelNote } from '../types/panel';
import { MetricType } from '../types/cluster';
import { log, logErr } from '../utils/logger';
import { VectorCache } from './vectorCache';
import { isNativeAiReady, fetchNativeEmbeddings } from './nativeEmbeddingPipeline';
import { createPipelineConfig, isValidEmbeddingVector, createAdaptiveConfig } from './pipelineConfig';
import { enrichResultsWithTags } from './clustering/postProcess';
import { upgradeClusterNamesWithAi } from './clustering/aiNamingService';
import { EmbeddingWorkerOrchestrator } from './EmbeddingWorkerOrchestrator';

export interface PipelineCallbacks {
	onStatus: (text: string) => void;
	onProgress: (current: number, total: number, cached: number, skipped: number) => void;
	onComplete: (strategies: import('../types/cluster').BenchmarkResult[], notes: PanelNote[]) => void;
	onError: (message: string) => void;
}

interface IndexedVector {
	chunkIndex: number;
	vector: number[];
}

/**
 * Runs the full embedding + clustering pipeline, reporting progress via callbacks.
 *
 * This process is decoupled from console logging so the panel (or any other caller)
 * can receive live updates.
 */
export const runPipeline = async (installDir: string, callbacks: PipelineCallbacks): Promise<void> => {
	try {
		callbacks.onStatus('Fetching notes...');
		const notes = await fetchAllNotes();
		log(`Fetched ${notes.length} notes`);

		if (notes.length === 0) {
			callbacks.onError('No notes found. Create some notes and try again.');
			return;
		}

		if (notes.length < 3) {
			callbacks.onError('Too few notes for clustering (need at least 3).');
			return;
		}

		// Pipeline configuration defaults (Cosine metric for text embeddings, seed 42 for reproducibility)
		const userMetric: MetricType = 'cosine';
		const userSeed = 42;
		log(`Pipeline settings: metric="${userMetric}", seed=${userSeed}`);

		if (await isNativeAiReady()) {
			log('Native AI Search active: using native embeddings pipeline');
			callbacks.onStatus('Fetching native embeddings...');

			try {
				const noteIds = notes.map((n) => n.id);
				const nativeResult = await fetchNativeEmbeddings(noteIds);
				log(`Native AI embeddings retrieved (model: ${nativeResult.modelId}, dim: ${nativeResult.dimension})`);

				// Group chunks by noteId preserving chunkIndex for ordering
				const noteChunksMap = new Map<string, IndexedVector[]>();
				for (const chunk of nativeResult.chunks) {
					const list = noteChunksMap.get(chunk.noteId) || [];
					list.push({ chunkIndex: chunk.chunkIndex, vector: chunk.vector });
					noteChunksMap.set(chunk.noteId, list);
				}

				const validNotes: typeof notes = [];
				const vectors: number[][] = [];

				for (const note of notes) {
					const chunkEntries = noteChunksMap.get(note.id);
					if (chunkEntries && chunkEntries.length > 0) {
						// Sort by chunkIndex ascending to ensure lead paragraph/header (chunk 0) gets highest weight
						const sortedEntries = chunkEntries.sort((a, b) => a.chunkIndex - b.chunkIndex);
						const chunkVectors = sortedEntries.map((e) => e.vector);

						const { vector: avgVector, rawNorm } = weightedAverageVectorsWithNorm(chunkVectors);

						if (rawNorm < 1e-6) {
							logErr(
								`Native embedding for note "${note.title}" has near-zero L2 norm (${rawNorm}). Skipping as outlier.`,
							);
							continue;
						}

						if (isValidEmbeddingVector(avgVector, nativeResult.dimension)) {
							vectors.push(avgVector);
							validNotes.push(note);
						} else {
							logErr(
								`Native embedding for note "${note.title}" contains NaN/null or wrong dimension. Skipping.`,
							);
						}
					}
				}

				log(`Grouped embeddings: found ${vectors.length} notes with valid embeddings.`);

				if (validNotes.length < 3) {
					log('Too few indexed notes found in native DB. Falling back to local ONNX Web Worker.');
				} else {
					callbacks.onStatus('Clustering...');
					const clusterStart = performance.now();
					const adaptiveConfig = createAdaptiveConfig(
						nativeResult.dimension,
						validNotes.length,
						userMetric,
						userSeed,
					);
					const results = benchmark(vectors, adaptiveConfig);
					log(`Clustering (UMAP + benchmark): ${Math.round(performance.now() - clusterStart)}ms`);

					// Post-process to extract tags/keywords for each cluster (keep parity with local pipeline)
					const allPipelineDocuments = validNotes.map((n) => ({
						title: n.title,
						body: n.body,
					}));

					callbacks.onStatus(
						`Extracting topics for ${results.reduce((sum, r) => sum + r.clusterCount, 0)} clusters...`,
					);
					const enrichStart = performance.now();
					await enrichResultsWithTags(results, allPipelineDocuments, 5, callbacks.onStatus);
					log(`Topic extraction: ${Math.round(performance.now() - enrichStart)}ms`);

					callbacks.onStatus('Generating AI cluster names...');
					const aiStart = performance.now();
					await upgradeClusterNamesWithAi(results, allPipelineDocuments);
					log(`AI naming: ${Math.round(performance.now() - aiStart)}ms`);

					const panelNotes: PanelNote[] = validNotes.map((n) => ({
						noteId: n.id,
						title: n.title,
					}));

					callbacks.onComplete(results, panelNotes);
					return;
				}
			} catch (err) {
				logErr('Failed to run native embeddings pipeline:', err instanceof Error ? err.message : String(err));
			}
		}

		log('Native AI Search unavailable: falling back to local ONNX Web Worker');

		const cache = await VectorCache.create();

		// Remove notes from cache that are no longer in Joplin
		const indexedIds = await cache.getIndexedIds();
		const joplinNoteIds = new Set(notes.map((n) => n.id));
		const idsToDelete = indexedIds.filter((id) => !joplinNoteIds.has(id));

		if (idsToDelete.length > 0) {
			log(`Removing ${idsToDelete.length} obsolete notes from cache`);
			await cache.deleteItems(idsToDelete);
		}

		await cache.beginUpdate();

		const batchStartTime = performance.now();
		const orchestrator = new EmbeddingWorkerOrchestrator(installDir, notes, cache, callbacks);

		let result;
		try {
			result = await orchestrator.run();
		} catch (err) {
			cache.cancelUpdate();
			const message = err instanceof Error ? err.message : String(err);
			callbacks.onError('Pipeline failed: ' + message);
			return;
		}

		const { noteVectors, cachedCount, skippedCount, totalInferenceTime } = result;

		const totalTime = performance.now() - batchStartTime;
		log(
			`Batch complete: ${notes.length} notes, ${noteVectors.length - cachedCount} embedded, ` +
				`${cachedCount} cached, ${skippedCount} skipped in ${Math.round(totalTime)}ms ` +
				`(inference: ${Math.round(totalInferenceTime)}ms)`,
		);

		await cache.endUpdate();

		callbacks.onStatus('Clustering...');

		if (noteVectors.length < 3) {
			callbacks.onError('Too few notes for clustering (need at least 3).');
			return;
		}

		const vectors = noteVectors.map((nv) => nv.vector);
		const clusterStart = performance.now();
		const pipelineConfig = createPipelineConfig(noteVectors.length, userMetric, userSeed);
		const results = benchmark(vectors, pipelineConfig);
		log(`Clustering (UMAP + benchmark): ${Math.round(performance.now() - clusterStart)}ms`);

		// Post-process to extract tags/keywords for each cluster
		const notesMap = new Map(notes.map((n) => [n.id, n]));
		const allPipelineDocuments = noteVectors.map((nv) => {
			const originalNote = notesMap.get(nv.noteId);
			return {
				title: nv.title,
				body: originalNote ? originalNote.body : '',
			};
		});

		callbacks.onStatus(`Extracting topics for ${results.reduce((sum, r) => sum + r.clusterCount, 0)} clusters...`);
		const enrichStart = performance.now();
		await enrichResultsWithTags(results, allPipelineDocuments, 5, callbacks.onStatus);
		log(`Topic extraction: ${Math.round(performance.now() - enrichStart)}ms`);

		callbacks.onStatus('Generating AI cluster names...');
		const aiStart = performance.now();
		await upgradeClusterNamesWithAi(results, allPipelineDocuments);
		log(`AI naming: ${Math.round(performance.now() - aiStart)}ms`);

		const panelNotes: PanelNote[] = noteVectors.map((nv) => ({
			noteId: nv.noteId,
			title: nv.title,
		}));

		callbacks.onComplete(results, panelNotes);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logErr('Pipeline failed:', message);
		callbacks.onError('Pipeline failed: ' + message);
	}
};
