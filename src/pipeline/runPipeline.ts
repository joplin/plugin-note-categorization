import { fetchAllNotes } from './noteReader';
import { benchmark } from './clustering/benchmark';
import { CategorizationConfig } from '../types/cluster';
import { averageVectors, blendVectors, computeTitleWeight, cosineSimilarity } from './vectorAggregator';
import { NoteVector, WorkerMessage } from '../types/embed';
import { PanelNote } from '../types/panel';
import { isGenericTitle } from '../utils/titleFilter';
import { log, logErr } from '../utils/logger';
import { getEncoding } from 'js-tiktoken';
import { VectorCache } from './vectorCache';
import { enrichResultsWithTags } from './clustering/postProcess';

// See testEmbed.ts for rationale on cl100k_base and the 200-token limit.
const enc = getEncoding('cl100k_base');
const MAX_TOKENS = 200;

const DEFAULT_CONFIG: CategorizationConfig = {
	seed: 42,
	metric: 'cosine',
	intermediateDim: 10,
	intermediateNeighbors: 15,
	strategies: [
		{ name: 'kmeans-5', algorithm: 'kmeans', K: 5 },
		{ name: 'kmedoids-5', algorithm: 'kmedoids', K: 5 },
		{ name: 'hdbscan-3', algorithm: 'hdbscan', minClusterSize: 3 },
		{ name: 'hdbscan-3-ms2', algorithm: 'hdbscan', minClusterSize: 3, minSamples: 2 },
		{ name: 'hdbscan-5-ms2', algorithm: 'hdbscan', minClusterSize: 5, minSamples: 2 },
	],
};

export interface PipelineCallbacks {
	onStatus: (text: string) => void;
	onProgress: (current: number, total: number, cached: number, skipped: number) => void;
	onComplete: (strategies: import('../types/cluster').BenchmarkResult[], notes: PanelNote[]) => void;
	onError: (message: string) => void;
}

/**
 * Runs the full embedding + clustering pipeline, reporting progress via callbacks.
 *
 * This is the same logic as testEmbed.ts, but decoupled from console logging
 * so the panel (or any other caller) can receive live updates.
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

		callbacks.onStatus('Loading model...');
		const worker = new Worker(`${installDir}/worker/embedWorker.js`);

		let currentNoteIndex = 0;
		let currentChunkIndex = 0;
		let currentNoteChunks: string[] = [];
		let currentChunkEmbeddings: number[][] = [];
		let currentBodyVector: number[] = [];
		let isEmbeddingTitle = false;
		let totalInferenceTime = 0;
		let skippedCount = 0;
		let cachedCount = 0;
		let currentNoteHash = '';
		const batchStartTime = performance.now();
		const noteVectors: NoteVector[] = [];

		const reportProgress = () => {
			// current = notes finalized so far (embedded + cached + skipped)
			const processed = noteVectors.length + skippedCount;
			callbacks.onProgress(processed, notes.length, cachedCount, skippedCount);
		};

		const prepareNoteChunks = (text: string): string[] => {
			const tokens = enc.encode(text);
			const chunks: string[] = [];
			if (tokens.length === 0) return [];

			for (let i = 0; i < tokens.length; i += MAX_TOKENS) {
				const chunkTokens = tokens.slice(i, i + MAX_TOKENS);
				chunks.push(enc.decode(chunkTokens));
			}
			return chunks;
		};

		const finalizeNote = async (vector: number[], titleWeight: number, hash: string) => {
			const note = notes[currentNoteIndex];
			noteVectors.push({ noteId: note.id, title: note.title, vector, titleWeight });

			await cache.upsertItem(note.id, vector, {
				title: note.title,
				hash,
				updatedTime: note.updated_time,
				titleWeight,
			});

			reportProgress();

			currentNoteIndex++;
			await processNextNote();
		};

		const processNextNote = async () => {
			currentChunkIndex = 0;
			currentNoteChunks = [];
			currentChunkEmbeddings = [];
			currentBodyVector = [];
			isEmbeddingTitle = false;

			// Skip notes with empty body and generic title, and bypass cached notes
			while (currentNoteIndex < notes.length) {
				const note = notes[currentNoteIndex];

				if (note.body.length === 0 && isGenericTitle(note.title)) {
					log(
						`[${currentNoteIndex + 1}/${notes.length}] skipped "${note.title.slice(0, 30)}" (empty body, generic title)`,
					);
					skippedCount++;
					currentNoteIndex++;
					reportProgress();
					continue;
				}

				currentNoteHash = cache.computeHash(note.title, note.body);
				const cachedItem = await cache.getItem(note.id);

				if (cachedItem && cachedItem.metadata.hash === currentNoteHash) {
					log(`[${currentNoteIndex + 1}/${notes.length}] cache hit for "${note.title.slice(0, 30)}"`);
					noteVectors.push({
						noteId: note.id,
						title: note.title,
						vector: cachedItem.vector,
						titleWeight: cachedItem.metadata.titleWeight ?? 0,
					});
					cachedCount++;
					currentNoteIndex++;
					reportProgress();
					continue;
				}

				break;
			}

			if (currentNoteIndex >= notes.length) {
				const totalTime = performance.now() - batchStartTime;
				log(
					`Batch complete: ${notes.length} notes, ${noteVectors.length - cachedCount} embedded, ` +
						`${cachedCount} cached, ${skippedCount} skipped in ${Math.round(totalTime)}ms ` +
						`(inference: ${Math.round(totalInferenceTime)}ms)`,
				);

				await cache.endUpdate();
				worker.terminate();

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

				const panelNotes: PanelNote[] = noteVectors.map((nv) => ({
					noteId: nv.noteId,
					title: nv.title,
				}));

				callbacks.onComplete(results, panelNotes);
				return;
			}

			const note = notes[currentNoteIndex];
			callbacks.onStatus(`Embedding "${note.title.slice(0, 40)}"...`);

			if (note.body.length === 0) {
				isEmbeddingTitle = true;
				worker.postMessage({ type: 'embed', text: note.title, noteId: note.id });
			} else {
				currentNoteChunks = prepareNoteChunks(note.body);
				if (currentNoteChunks.length === 0) {
					// Whitespace-only body — treat as title-only note
					isEmbeddingTitle = true;
					worker.postMessage({ type: 'embed', text: note.title, noteId: note.id });
				} else {
					worker.postMessage({
						type: 'embed',
						text: currentNoteChunks[0],
						noteId: note.id,
					});
				}
			}
		};

		worker.onerror = (err: ErrorEvent) => {
			logErr('Worker error:', err.message);
			cache.cancelUpdate();
			worker.terminate();
			callbacks.onError('Embedding worker failed: ' + err.message);
		};

		worker.onmessage = async (event: MessageEvent<WorkerMessage>) => {
			const data = event.data;

			if (data.type === 'load-result') {
				if (data.success) {
					log(`Model loaded in ${(data.loadTime / 1000).toFixed(1)}s, device: ${data.device}`);
					callbacks.onStatus('Embedding notes...');
					await processNextNote();
				} else {
					logErr('Model load failed:', data.error);
					cache.cancelUpdate();
					worker.terminate();
					callbacks.onError('Failed to load embedding model: ' + (data.error || 'unknown error'));
				}
				return;
			}

			if (data.type === 'embed-result') {
				const note = notes[currentNoteIndex];

				if (!data.success) {
					logErr(`Failed to embed note "${note.title.slice(0, 30)}":`, data.error);
					currentNoteIndex++;
					await processNextNote();
					return;
				}

				totalInferenceTime += data.inferenceTime;

				if (isEmbeddingTitle) {
					const titleEmbedding = data.embedding;

					if (currentBodyVector.length > 0) {
						const sim = cosineSimilarity(currentBodyVector, titleEmbedding);
						const alpha = computeTitleWeight(sim);
						const finalVector = blendVectors(currentBodyVector, titleEmbedding, alpha);
						await finalizeNote(finalVector, alpha, currentNoteHash);
					} else {
						await finalizeNote(titleEmbedding, 1.0, currentNoteHash);
					}
				} else {
					currentChunkEmbeddings.push(data.embedding);
					log(
						`[${currentNoteIndex + 1}/${notes.length}] embedded chunk ${currentChunkIndex + 1}/${currentNoteChunks.length} of "${note.title.slice(0, 30)}"`,
					);

					currentChunkIndex++;
					if (currentChunkIndex < currentNoteChunks.length) {
						worker.postMessage({
							type: 'embed',
							text: currentNoteChunks[currentChunkIndex],
							noteId: note.id,
						});
					} else {
						currentBodyVector = averageVectors(currentChunkEmbeddings);

						if (!isGenericTitle(note.title)) {
							isEmbeddingTitle = true;
							worker.postMessage({ type: 'embed', text: note.title, noteId: note.id });
						} else {
							await finalizeNote(currentBodyVector, 0, currentNoteHash);
						}
					}
				}
			}
		};

		worker.postMessage({ type: 'load' });
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logErr('Pipeline failed:', message);
		callbacks.onError('Pipeline failed: ' + message);
	}
};
