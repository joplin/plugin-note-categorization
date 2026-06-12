import { fetchAllNotes } from '../pipeline/noteReader';
import { benchmark } from '../pipeline/clustering/benchmark';
import { CategorizationConfig } from '../types/cluster';
import { averageVectors, blendVectors, computeTitleWeight, cosineSimilarity } from '../pipeline/vectorAggregator';
import { NoteVector, WorkerMessage } from '../types/embed';
import { isGenericTitle } from '../utils/titleFilter';
import { log, logErr } from '../utils/logger';
import { getEncoding } from 'js-tiktoken';
import { VectorCache } from '../pipeline/vectorCache';

// We use cl100k_base to approximate token counts for chunking.
// The embedding model (all-MiniLM-L6-v2) uses a WordPiece tokenizer with a
// 512-token limit. WordPiece has a smaller vocab (~30k vs ~100k) so it produces
// ~1.3-1.5x more tokens than cl100k_base for the same text. A limit of 200
// cl100k_base tokens expands to ~300 WordPiece tokens in the worst case,
// well within the model's 512-token ceiling.
const enc = getEncoding('cl100k_base');
const MAX_TOKENS = 200;

export const runTestEmbed = async (installDir: string) => {
	log('Test embed command triggered');

	const notes = await fetchAllNotes();
	log(`Fetched ${notes.length} notes`);

	if (notes.length === 0) {
		log('No notes found. Create some notes and try again.');
		return;
	}

	const cache = await VectorCache.create();

	// Handle deletions: Remove notes from index that are no longer in Joplin
	const indexedIds = await cache.getIndexedIds();
	const joplinNoteIds = new Set(notes.map((n) => n.id));
	const idsToDelete = indexedIds.filter((id) => !joplinNoteIds.has(id));

	if (idsToDelete.length > 0) {
		log(`Removing ${idsToDelete.length} obsolete notes from cache`);
		await cache.deleteItems(idsToDelete);
	}

	await cache.beginUpdate();

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
	const batchStartTime = performance.now();
	const noteVectors: NoteVector[] = [];

	worker.onerror = (err: ErrorEvent) => {
		logErr('Worker error:', err.message);
		cache.cancelUpdate();
		worker.terminate();
	};

	const prepareNoteChunks = (text: string): string[] => {
		const tokens = enc.encode(text);
		const chunks: string[] = [];
		if (tokens.length === 0) return [''];

		for (let i = 0; i < tokens.length; i += MAX_TOKENS) {
			const chunkTokens = tokens.slice(i, i + MAX_TOKENS);
			chunks.push(enc.decode(chunkTokens));
		}
		return chunks;
	};

	const finalizeNote = async (vector: number[], titleWeight: number, hash: string) => {
		const note = notes[currentNoteIndex];
		noteVectors.push({ noteId: note.id, title: note.title, vector, titleWeight });
		const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
		log(`  → final vector: dim=${vector.length}, titleWeight=${titleWeight.toFixed(3)}, norm=${norm.toFixed(4)}`);

		await cache.upsertItem(note.id, vector, {
			title: note.title,
			hash,
			updatedTime: note.updated_time,
			titleWeight,
		});

		currentNoteIndex++;
		await processNextNote();
	};

	let currentNoteHash = '';

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
				continue;
			}

			break;
		}

		if (currentNoteIndex >= notes.length) {
			const totalTime = performance.now() - batchStartTime;
			log(`-------------------------------------------`);
			log(`Batch execution complete!`);
			log(`Total notes processed: ${notes.length}`);
			log(`Notes embedded: ${noteVectors.length - cachedCount}`);
			log(`Notes loaded from cache: ${cachedCount}`);
			log(`Notes skipped: ${skippedCount}`);
			log(`Sum of inference times: ${Math.round(totalInferenceTime)}ms`);
			log(`Real total batch time (including worker message passing): ${Math.round(totalTime)}ms`);
			log(`-------------------------------------------`);

			await cache.endUpdate();

			worker.terminate();
			log('Worker terminated. Embedding complete.');

			// ── Clustering Benchmark ─────────────────────────────
			// Edit this config to compare different algorithms and dimensions.
			// Results are printed as a comparison table in the console.
			const clusterConfig: CategorizationConfig = {
				seed: 42,
				metric: 'cosine',
				intermediateDim: 10,
				intermediateNeighbors: 15,
				strategies: [
					{ name: 'kmeans-5', algorithm: 'kmeans', K: 5 },
					{ name: 'kmeans-8', algorithm: 'kmeans', K: 8 },
					{ name: 'kmedoids-5', algorithm: 'kmedoids', K: 5 },
					{ name: 'hdbscan-3', algorithm: 'hdbscan', minClusterSize: 3 },
					{ name: 'hdbscan-3-ms2', algorithm: 'hdbscan', minClusterSize: 3, minSamples: 2 },
					{ name: 'hdbscan-5-ms2', algorithm: 'hdbscan', minClusterSize: 5, minSamples: 2 },
				],
			};

			if (noteVectors.length >= 3) {
				const vectors = noteVectors.map((nv) => nv.vector);
				const results = benchmark(vectors, clusterConfig);

				// Log note titles per cluster for all strategies, in order (best to worst)
				for (const res of results) {
					log(`\nCluster assignments (${res.strategyName}):`);
					const clusterNotes = new Map<number, string[]>();
					for (let i = 0; i < noteVectors.length; i++) {
						const c = res.assignments[i];
						if (!clusterNotes.has(c)) clusterNotes.set(c, []);
						clusterNotes.get(c)!.push(noteVectors[i].title);
					}
					for (const [clusterId, titles] of clusterNotes) {
						const label = clusterId < 0 ? 'Noise/Outliers' : `Cluster ${clusterId}`;
						log(`  ${label} (${titles.length} notes):`);
						for (const title of titles) {
							log(`    - ${title}`);
						}
					}
				}
			} else {
				log('Too few notes for clustering (need at least 3).');
			}

			return;
		}

		const note = notes[currentNoteIndex];

		if (note.body.length === 0) {
			// Empty body with descriptive title → embed title as the final vector
			isEmbeddingTitle = true;
			worker.postMessage({ type: 'embed', text: note.title, noteId: note.id });
		} else {
			// Has body → chunk and embed sequentially
			currentNoteChunks = prepareNoteChunks(note.body);
			worker.postMessage({
				type: 'embed',
				text: currentNoteChunks[0],
				noteId: note.id,
			});
		}
	};

	worker.onmessage = async (event: MessageEvent<WorkerMessage>) => {
		const data = event.data;

		if (data.type === 'load-result') {
			if (data.success) {
				log(
					`Model loaded in ${(data.loadTime / 1000).toFixed(1)}s, device: ${data.device}, dtype: ${data.dtype}`,
				);
				log(
					`  Worker WebGPU diagnostics - gpu in navigator: ${data.workerGpuExists}, env.IS_WEBGPU_AVAILABLE: ${data.isWebGpuAvailable}`,
				);
				log(`Starting sequential embedding of ${notes.length} notes with chunking...`);
				await processNextNote();
			} else {
				logErr('Model load failed:', data.error);
				cache.cancelUpdate();
				worker.terminate();
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
					// Body was embedded → blend body + title
					const sim = cosineSimilarity(currentBodyVector, titleEmbedding);
					const alpha = computeTitleWeight(sim);
					const finalVector = blendVectors(currentBodyVector, titleEmbedding, alpha);
					log(
						`  → title embedded in ${Math.round(data.inferenceTime)}ms, sim=${sim.toFixed(3)}, weight=${alpha.toFixed(3)}`,
					);
					await finalizeNote(finalVector, alpha, currentNoteHash);
				} else {
					// Empty body, descriptive title → title is the entire vector
					log(
						`[${currentNoteIndex + 1}/${notes.length}] embedded title of "${note.title.slice(0, 30)}" in ${Math.round(data.inferenceTime)}ms (no body)`,
					);
					await finalizeNote(titleEmbedding, 1.0, currentNoteHash);
				}
			} else {
				// Body chunk result
				currentChunkEmbeddings.push(data.embedding);
				log(
					`[${currentNoteIndex + 1}/${notes.length}] embedded chunk ${currentChunkIndex + 1}/${currentNoteChunks.length} of "${note.title.slice(0, 30)}" in ${Math.round(data.inferenceTime)}ms`,
				);

				currentChunkIndex++;
				if (currentChunkIndex < currentNoteChunks.length) {
					// More chunks to process
					worker.postMessage({
						type: 'embed',
						text: currentNoteChunks[currentChunkIndex],
						noteId: note.id,
					});
				} else {
					// All chunks done → compute body vector
					currentBodyVector = averageVectors(currentChunkEmbeddings);

					if (!isGenericTitle(note.title)) {
						// Descriptive title → embed it for blending
						isEmbeddingTitle = true;
						worker.postMessage({ type: 'embed', text: note.title, noteId: note.id });
					} else {
						// Generic title → body vector is the final vector
						await finalizeNote(currentBodyVector, 0, currentNoteHash);
					}
				}
			}
		}
	};

	log('Loading model...');
	worker.postMessage({ type: 'load' });
};
