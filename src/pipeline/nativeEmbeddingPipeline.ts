import joplin from 'api';
import { log } from '../utils/logger';
import { JoplinAi } from '../types/joplinAi';

// The Joplin AI API is experimental and not in the official type declarations.
// We access it via a typed cast to maintain type safety.
const joplinAi = (joplin as unknown as { ai: JoplinAi }).ai;

export interface NativeEmbeddingChunk {
	noteId: string;
	chunkIndex: number;
	chunkText: string;
	vector: number[];
}

export interface NativeEmbeddingResult {
	chunks: NativeEmbeddingChunk[];
	modelId: string;
	dimension: number;
}

/**
 * Checks if Joplin's native AI indexing is active and ready.
 */
export const isNativeAiReady = async (): Promise<boolean> => {
	try {
		const status = await joplinAi.getIndexStatus();
		const ready = !!(status && status.ready);
		log(`Native AI check - state: ${status?.state}, ready: ${ready}, modelId: ${status?.modelId}`);
		return ready;
	} catch (err) {
		log('Native AI check failed:', err instanceof Error ? err.message : String(err));
		return false;
	}
};

/**
 * Pages through Joplin's native index to fetch raw embedding vectors for the requested notes,
 * returning the chunks along with modelId and vector dimension metadata.
 */
export const fetchNativeEmbeddings = async (noteIds: string[]): Promise<NativeEmbeddingResult> => {
	if (noteIds.length === 0) {
		return { chunks: [], modelId: 'unknown', dimension: 384 };
	}

	log(`Fetching native embeddings for ${noteIds.length} notes...`);
	const chunks: NativeEmbeddingChunk[] = [];
	const BATCH_SIZE = 500;
	let modelId: string | null = null;
	let dimension: number | null = null;

	for (let i = 0; i < noteIds.length; i += BATCH_SIZE) {
		const batchIds = noteIds.slice(i, i + BATCH_SIZE);
		let cursor: string | undefined;
		const seenCursors = new Set<string>();

		do {
			const page = await joplinAi.getEmbeddings({
				noteIds: batchIds,
				cursor,
				limit: 1000,
			});

			if (!page || !Array.isArray(page.chunks)) {
				throw new Error('Invalid response from Joplin native getEmbeddings API');
			}

			if (modelId && page.modelId !== modelId) {
				throw new Error('Embedding model changed mid-fetch. Please restart.');
			}
			modelId = page.modelId;

			if (typeof page.dimension === 'number' && page.dimension > 0) {
				if (dimension && dimension !== page.dimension) {
					throw new Error('Embedding dimension changed mid-fetch. Please restart.');
				}
				dimension = page.dimension;
			}

			for (const chunk of page.chunks) {
				if (!chunk.noteId || !Array.isArray(chunk.vector)) {
					log(`Skipping malformed embedding chunk: ${JSON.stringify(chunk).slice(0, 100)}`);
					continue;
				}
				if (!dimension && chunk.vector.length > 0) {
					dimension = chunk.vector.length;
				}
				chunks.push(chunk);
			}
			cursor = page.nextCursor;

			if (cursor) {
				if (seenCursors.has(cursor)) {
					throw new Error('Detected duplicate cursor in pagination, aborting to prevent infinite loop.');
				}
				seenCursors.add(cursor);
			}
		} while (cursor);
	}

	const finalDimension = dimension ?? (chunks.length > 0 ? chunks[0].vector.length : 384);
	const finalModelId = modelId ?? 'native-ai';

	log(
		`Successfully fetched ${chunks.length} native embedding chunks (model: ${finalModelId}, dim: ${finalDimension})`,
	);
	return { chunks, modelId: finalModelId, dimension: finalDimension };
};
