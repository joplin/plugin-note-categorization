import { fetchAllNotes } from '../pipeline/noteReader';
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
	let totalInferenceTime = 0;
	const batchStartTime = performance.now();

	worker.onerror = (err) => {
		logErr('Worker error:', err.message || err);
		worker.terminate();
	};

	const prepareNoteChunks = (text: string): string[] => {
		const tokens = enc.encode(text);
		const chunks: string[] = [];
		if (tokens.length === 0) return [""];
		
		for (let i = 0; i < tokens.length; i += MAX_TOKENS) {
			const chunkTokens = tokens.slice(i, i + MAX_TOKENS);
			chunks.push(enc.decode(chunkTokens));
		}
		return chunks;
	};

	const sendNextChunk = () => {
		if (currentNoteIndex >= notes.length) {
			const totalTime = performance.now() - batchStartTime;
			log(`-------------------------------------------`);
			log(`Batch execution complete!`);
			log(`Total notes processed: ${notes.length}`);
			log(`Sum of inference times: ${Math.round(totalInferenceTime)}ms`);
			log(`Real total batch time (including worker message passing): ${Math.round(totalTime)}ms`);
			log(`-------------------------------------------`);
			worker.terminate();
			log('Worker terminated. Test complete.');
			return;
		}

		const note = notes[currentNoteIndex];

		if (currentChunkIndex === 0) {
			// First time processing this note, let's chunk it!
			const textToEmbed = note.body.length > 0 ? note.body : note.title;
			currentNoteChunks = prepareNoteChunks(textToEmbed);
		}

		worker.postMessage({
			type: 'embed',
			text: currentNoteChunks[currentChunkIndex],
			noteId: note.id,
			chunkIndex: currentChunkIndex,
			totalChunks: currentNoteChunks.length
		});
	};

	worker.onmessage = async (event) => {
		const data = event.data;

		if (data.type === 'load-result') {
			if (data.success) {
				log(`Model loaded in ${(data.loadTime / 1000).toFixed(1)}s, device: ${data.device}, dtype: ${data.dtype}`);
				log(`  Worker WebGPU diagnostics - gpu in navigator: ${data.workerGpuExists}, env.IS_WEBGPU_AVAILABLE: ${data.isWebGpuAvailable}`);
				log(`Starting sequential embedding of ${notes.length} notes with chunking...`);
				sendNextChunk();
			} else {
				logErr('Model load failed:', data.error);
				worker.terminate();
			}
			return;
		}

		if (data.type === 'embed-result') {
			if (data.success) {
				totalInferenceTime += data.inferenceTime;
				const note = notes[currentNoteIndex];
				log(`[${currentNoteIndex + 1}/${notes.length}] embedded chunk ${currentChunkIndex + 1}/${currentNoteChunks.length} of "${note.title.slice(0, 30)}" in ${Math.round(data.inferenceTime)}ms`);
			} else {
				logErr(`Failed to embed note at index ${currentNoteIndex}:`, data.error);
			}
			
			currentChunkIndex++;
			if (currentChunkIndex >= currentNoteChunks.length) {
				// We finished all chunks for this note
				currentNoteIndex++;
				currentChunkIndex = 0;
			}
			
			sendNextChunk();
		}
	};

	log('Loading model...');
	worker.postMessage({ type: 'load' });
};
