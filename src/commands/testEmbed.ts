import { fetchAllNotes } from '../pipeline/noteReader';
import { averageVectors, blendVectors, computeTitleWeight, cosineSimilarity } from '../pipeline/vectorAggregator';
import { isGenericTitle } from '../utils/titleFilter';
import { log, logErr } from '../utils/logger';
import { getEncoding } from 'js-tiktoken';

// We use cl100k_base to approximate token counts for chunking.
// The embedding model (all-MiniLM-L6-v2) uses a WordPiece tokenizer with a
// 512-token limit. WordPiece has a smaller vocab (~30k vs ~100k) so it produces
// ~1.3-1.5x more tokens than cl100k_base for the same text. A limit of 200
// cl100k_base tokens expands to ~300 WordPiece tokens in the worst case,
// well within the model's 512-token ceiling.
const enc = getEncoding('cl100k_base');
const MAX_TOKENS = 200;

interface LoadResultMessage {
	type: 'load-result';
	success: boolean;
	loadTime: number;
	device: string;
	dtype: string;
	workerGpuExists: boolean;
	isWebGpuAvailable: boolean;
	error?: string;
}

interface EmbedResultMessage {
	type: 'embed-result';
	noteId: string;
	success: boolean;
	inferenceTime: number;
	dimensions: number;
	embedding: number[];
	error?: string;
}

type WorkerMessage = LoadResultMessage | EmbedResultMessage;

export interface NoteVector {
	noteId: string;
	title: string;
	vector: number[];
	titleWeight: number;
}

export const runTestEmbed = async (installDir: string) => {
	log('Test embed command triggered');

	const notes = await fetchAllNotes();
	log(`Fetched ${notes.length} notes`);

	if (notes.length === 0) {
		log('No notes found. Create some notes and try again.');
		return;
	}

	const worker = new Worker(`${installDir}/worker/embedWorker.js`);
	let currentNoteIndex = 0;
	let currentChunkIndex = 0;
	let currentNoteChunks: string[] = [];
	let currentChunkEmbeddings: number[][] = [];
	let currentBodyVector: number[] = [];
	let isEmbeddingTitle = false;
	let totalInferenceTime = 0;
	let skippedCount = 0;
	const batchStartTime = performance.now();
	const noteVectors: NoteVector[] = [];

	worker.onerror = (err: ErrorEvent) => {
		logErr('Worker error:', err.message);
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

	const finalizeNote = (vector: number[], titleWeight: number) => {
		const note = notes[currentNoteIndex];
		noteVectors.push({ noteId: note.id, title: note.title, vector, titleWeight });
		const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
		log(`  → final vector: dim=${vector.length}, titleWeight=${titleWeight.toFixed(3)}, norm=${norm.toFixed(4)}`);
		currentNoteIndex++;
		processNextNote();
	};

	const processNextNote = () => {
		currentChunkIndex = 0;
		currentNoteChunks = [];
		currentChunkEmbeddings = [];
		currentBodyVector = [];
		isEmbeddingTitle = false;

		// Skip notes with empty body and generic title — no semantic content to embed
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
			break;
		}

		if (currentNoteIndex >= notes.length) {
			const totalTime = performance.now() - batchStartTime;
			log(`-------------------------------------------`);
			log(`Batch execution complete!`);
			log(`Total notes processed: ${notes.length}`);
			log(`Notes embedded: ${noteVectors.length}`);
			log(`Notes skipped: ${skippedCount}`);
			log(`Sum of inference times: ${Math.round(totalInferenceTime)}ms`);
			log(`Real total batch time (including worker message passing): ${Math.round(totalTime)}ms`);
			log(`-------------------------------------------`);
			worker.terminate();
			log('Worker terminated. Test complete.');
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

	worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
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
				processNextNote();
			} else {
				logErr('Model load failed:', data.error);
				worker.terminate();
			}
			return;
		}

		if (data.type === 'embed-result') {
			const note = notes[currentNoteIndex];

			if (data.noteId !== note.id) {
				logErr(`Error: Received out-of-order worker result. Expected noteId: ${note.id}, got: ${data.noteId}`);
				worker.terminate();
				return;
			}

			if (!data.success) {
				logErr(`Failed to embed note "${note.title.slice(0, 30)}":`, data.error);
				currentNoteIndex++;
				processNextNote();
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
					finalizeNote(finalVector, alpha);
				} else {
					// Empty body, descriptive title → title is the entire vector
					log(
						`[${currentNoteIndex + 1}/${notes.length}] embedded title of "${note.title.slice(0, 30)}" in ${Math.round(data.inferenceTime)}ms (no body)`,
					);
					finalizeNote(titleEmbedding, 1.0);
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
						finalizeNote(currentBodyVector, 0);
					}
				}
			}
		}
	};

	log('Loading model...');
	worker.postMessage({ type: 'load' });
};
