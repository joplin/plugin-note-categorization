export interface LoadResultMessage {
	type: 'load-result';
	success: boolean;
	loadTime: number;
	device: string;
	dtype: string;
	workerGpuExists: boolean;
	isWebGpuAvailable: boolean;
	error?: string;
}

export interface EmbedResultMessage {
	type: 'embed-result';
	noteId: string;
	success: boolean;
	inferenceTime: number;
	dimensions: number;
	embedding: number[];
	error?: string;
}

export type WorkerMessage = LoadResultMessage | EmbedResultMessage;

export interface NoteVector {
	noteId: string;
	title: string;
	vector: number[];
	titleWeight: number;
}
