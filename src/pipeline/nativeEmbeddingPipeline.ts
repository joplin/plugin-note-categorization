import joplin from 'api';
import { log } from '../utils/logger';

export interface NativeEmbeddingChunk {
	noteId: string;
	chunkIndex: number;
	chunkText: string;
	vector: number[];
}

/**
 * Checks if Joplin's native AI indexing is active and ready.
 */
export const isNativeAiReady = async (): Promise<boolean> => {
	try {
		const status = await (joplin as any).ai.getIndexStatus();
		const ready = !!(status && status.ready);
		log(`Native AI check - state: ${status?.state}, ready: ${ready}, modelId: ${status?.modelId}`);
		return ready;
	} catch (err: any) {
		log('Native AI check failed:', err.message);
		return false;
	}
};

/**
 * Pages through Joplin's native index to fetch raw embedding vectors for the requested notes.
 */
export const fetchNativeEmbeddings = async (noteIds: string[]): Promise<NativeEmbeddingChunk[]> => {
	if (noteIds.length === 0) return [];

	log(`Fetching native embeddings for ${noteIds.length} notes...`);
	const chunks: NativeEmbeddingChunk[] = [];
	const BATCH_SIZE = 500;
	let modelId: string | null = null;

	for (let i = 0; i < noteIds.length; i += BATCH_SIZE) {
		const batchIds = noteIds.slice(i, i + BATCH_SIZE);
		let cursor: string | undefined;
		const seenCursors = new Set<string>();

		do {
			const page = await (joplin as any).ai.getEmbeddings({
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
			chunks.push(...page.chunks);
			cursor = page.nextCursor;

			if (cursor) {
				if (seenCursors.has(cursor)) {
					throw new Error('Detected duplicate cursor in pagination, aborting to prevent infinite loop.');
				}
				seenCursors.add(cursor);
			}
		} while (cursor);
	}

	log(`Successfully fetched ${chunks.length} embedding chunks`);
	return chunks;
};
