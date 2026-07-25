import { fetchAllNotes } from './noteReader';
import { benchmark } from './clustering/benchmark';
import { averageVectors } from './vectorAggregator';
import { PanelNote } from '../types/panel';
import { log, logErr } from '../utils/logger';
import { VectorCache } from './vectorCache';
import { isNativeAiReady, fetchNativeEmbeddings } from './nativeEmbeddingPipeline';
import { DEFAULT_CONFIG, isValidEmbeddingVector } from './pipelineConfig';
import { enrichResultsWithTags } from './clustering/postProcess';
import { upgradeClusterNamesWithAi } from './clustering/aiNamingService';
import { EmbeddingWorkerOrchestrator } from './EmbeddingWorkerOrchestrator';

export interface PipelineCallbacks {
	onStatus: (text: string) => void;
	onProgress: (current: number, total: number, cached: number, skipped: number) => void;
	onComplete: (strategies: import('../types/cluster').BenchmarkResult[], notes: PanelNote[]) => void;
	onError: (message: string) => void;
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

		if (await isNativeAiReady()) {
			log('Native AI Search active: using native embeddings pipeline');
			callbacks.onStatus('Fetching native embeddings...');

			try {
				const noteIds = notes.map((n) => n.id);
				const chunks = await fetchNativeEmbeddings(noteIds);

				// Group chunks by noteId
				const noteChunksMap = new Map<string, number[][]>();
				for (const chunk of chunks) {
					const list = noteChunksMap.get(chunk.noteId) || [];
					list.push(chunk.vector);
					noteChunksMap.set(chunk.noteId, list);
				}

				const validNotes: typeof notes = [];
				const vectors: number[][] = [];

				for (const note of notes) {
					const chunkVectors = noteChunksMap.get(note.id);
					if (chunkVectors && chunkVectors.length > 0) {
						const avgVector = averageVectors(chunkVectors);

						if (isValidEmbeddingVector(avgVector)) {
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
					const results = benchmark(vectors, DEFAULT_CONFIG);

					// Post-process to extract tags/keywords for each cluster (keep parity with local pipeline)
					const allPipelineDocuments = validNotes.map((n) => ({
						title: n.title,
						body: n.body,
					}));

					enrichResultsWithTags(results, allPipelineDocuments);

					callbacks.onStatus('Generating AI cluster names...');
					await upgradeClusterNamesWithAi(results, allPipelineDocuments);

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
		const results = benchmark(vectors, DEFAULT_CONFIG);

		// Post-process to extract tags/keywords for each cluster
		const notesMap = new Map(notes.map((n) => [n.id, n]));
		const allPipelineDocuments = noteVectors.map((nv) => {
			const originalNote = notesMap.get(nv.noteId);
			return {
				title: nv.title,
				body: originalNote ? originalNote.body : '',
			};
		});

		enrichResultsWithTags(results, allPipelineDocuments);

		callbacks.onStatus('Generating AI cluster names...');
		await upgradeClusterNamesWithAi(results, allPipelineDocuments);

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
