/**
 * Type declarations for Joplin's experimental native AI API.
 * These are not yet part of the official plugin API types.
 * When Joplin officially adds them to api/Joplin.d.ts, remove this file.
 */

export interface AiIndexStatus {
	state: string;
	ready: boolean;
	modelId?: string;
}

export interface AiEmbeddingChunk {
	noteId: string;
	chunkIndex: number;
	chunkText: string;
	vector: number[];
}

export interface AiEmbeddingsPage {
	chunks: AiEmbeddingChunk[];
	modelId: string;
	nextCursor?: string;
}

export interface AiGetEmbeddingsOptions {
	noteIds: string[];
	cursor?: string;
	limit?: number;
}

export interface JoplinAi {
	getIndexStatus(): Promise<AiIndexStatus>;
	getEmbeddings(options: AiGetEmbeddingsOptions): Promise<AiEmbeddingsPage>;
}
