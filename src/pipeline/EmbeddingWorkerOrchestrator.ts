import { getEncoding } from 'js-tiktoken';
import { NoteVector, WorkerMessage } from '../types/embed';
import { VectorCache } from './vectorCache';
import { isGenericTitle } from '../utils/titleFilter';
import { log, logErr } from '../utils/logger';
import { averageVectors, blendVectors, computeTitleWeight, cosineSimilarity } from './vectorAggregator';
import { isValidEmbeddingVector } from './pipelineConfig';

const enc = getEncoding('cl100k_base');
const MAX_TOKENS = 200;

export interface OrchestratorCallbacks {
	onStatus: (text: string) => void;
	onProgress: (current: number, total: number, cached: number, skipped: number) => void;
}

export interface EmbeddingResult {
	noteVectors: NoteVector[];
	cachedCount: number;
	skippedCount: number;
	totalInferenceTime: number;
}

export class EmbeddingWorkerOrchestrator {
	private currentNoteIndex = 0;
	private currentChunkIndex = 0;
	private currentNoteChunks: string[] = [];
	private currentChunkEmbeddings: number[][] = [];
	private currentBodyVector: number[] = [];
	private isEmbeddingTitle = false;
	private totalInferenceTime = 0;
	private skippedCount = 0;
	private cachedCount = 0;
	private currentNoteHash = '';
	private noteVectors: NoteVector[] = [];
	private worker: Worker | null = null;
	private resolvePromise: ((value: EmbeddingResult) => void) | null = null;
	private rejectPromise: ((reason: any) => void) | null = null;

	constructor(
		private installDir: string,
		private notes: any[],
		private cache: VectorCache,
		private callbacks: OrchestratorCallbacks,
	) {}

	public async run(): Promise<EmbeddingResult> {
		return new Promise((resolve, reject) => {
			this.resolvePromise = resolve;
			this.rejectPromise = reject;

			try {
				this.callbacks.onStatus('Loading model...');
				this.worker = new Worker(`${this.installDir}/worker/embedWorker.js`);

				this.worker.onerror = (err: ErrorEvent) => {
					logErr('Worker error:', err.message);
					this.cache.cancelUpdate();
					this.terminate();
					reject(new Error('Embedding worker failed: ' + err.message));
				};

				this.worker.onmessage = async (event: MessageEvent<WorkerMessage>) => {
					const data = event.data;

					if (data.type === 'load-result') {
						if (data.success) {
							log(`Model loaded in ${(data.loadTime / 1000).toFixed(1)}s, device: ${data.device}`);
							this.callbacks.onStatus('Embedding notes...');
							await this.processNextNote();
						} else {
							logErr('Model load failed:', data.error);
							this.cache.cancelUpdate();
							this.terminate();
							reject(new Error('Failed to load embedding model: ' + (data.error || 'unknown error')));
						}
						return;
					}

					if (data.type === 'embed-result') {
						const note = this.notes[this.currentNoteIndex];

						if (!data.success) {
							logErr(`Failed to embed note "${note.title.slice(0, 30)}":`, data.error);
							this.currentNoteIndex++;
							await this.processNextNote();
							return;
						}

						this.totalInferenceTime += data.inferenceTime;

						if (this.isEmbeddingTitle) {
							const titleEmbedding = data.embedding;

							if (this.currentBodyVector.length > 0) {
								const sim = cosineSimilarity(this.currentBodyVector, titleEmbedding);
								const alpha = computeTitleWeight(sim);
								const finalVector = blendVectors(this.currentBodyVector, titleEmbedding, alpha);
								await this.finalizeNote(finalVector, alpha, this.currentNoteHash);
							} else {
								await this.finalizeNote(titleEmbedding, 1.0, this.currentNoteHash);
							}
						} else {
							this.currentChunkEmbeddings.push(data.embedding);
							log(
								`[${this.currentNoteIndex + 1}/${this.notes.length}] embedded chunk ${this.currentChunkIndex + 1}/${this.currentNoteChunks.length} of "${note.title.slice(0, 30)}"`,
							);

							this.currentChunkIndex++;
							if (this.currentChunkIndex < this.currentNoteChunks.length) {
								this.worker?.postMessage({
									type: 'embed',
									text: this.currentNoteChunks[this.currentChunkIndex],
									noteId: note.id,
								});
							} else {
								this.currentBodyVector = averageVectors(this.currentChunkEmbeddings);

								if (!isGenericTitle(note.title)) {
									this.isEmbeddingTitle = true;
									this.worker?.postMessage({ type: 'embed', text: note.title, noteId: note.id });
								} else {
									await this.finalizeNote(this.currentBodyVector, 0, this.currentNoteHash);
								}
							}
						}
					}
				};

				this.worker.postMessage({ type: 'load' });
			} catch (err) {
				this.terminate();
				reject(err);
			}
		});
	}

	private terminate() {
		if (this.worker) {
			this.worker.terminate();
			this.worker = null;
		}
	}

	private reportProgress() {
		// current = notes finalized so far (embedded + cached + skipped)
		const processed = this.noteVectors.length + this.skippedCount;
		this.callbacks.onProgress(processed, this.notes.length, this.cachedCount, this.skippedCount);
	}

	private prepareNoteChunks(text: string): string[] {
		const tokens = enc.encode(text);
		const chunks: string[] = [];
		if (tokens.length === 0) return [];

		for (let i = 0; i < tokens.length; i += MAX_TOKENS) {
			const chunkTokens = tokens.slice(i, i + MAX_TOKENS);
			chunks.push(enc.decode(chunkTokens));
		}
		return chunks;
	}

	private async finalizeNote(vector: number[], titleWeight: number, hash: string) {
		const note = this.notes[this.currentNoteIndex];
		this.noteVectors.push({ noteId: note.id, title: note.title, vector, titleWeight });

		await this.cache.upsertItem(note.id, vector, {
			title: note.title,
			hash,
			updatedTime: note.updated_time,
			titleWeight,
		});

		this.reportProgress();

		this.currentNoteIndex++;
		await this.processNextNote();
	}

	private async processNextNote() {
		this.currentChunkIndex = 0;
		this.currentNoteChunks = [];
		this.currentChunkEmbeddings = [];
		this.currentBodyVector = [];
		this.isEmbeddingTitle = false;

		// Skip notes with empty body and generic title, and bypass cached notes
		while (this.currentNoteIndex < this.notes.length) {
			const note = this.notes[this.currentNoteIndex];

			if (note.body.length === 0 && isGenericTitle(note.title)) {
				log(
					`[${this.currentNoteIndex + 1}/${this.notes.length}] skipped "${note.title.slice(0, 30)}" (empty body, generic title)`,
				);
				this.skippedCount++;
				this.currentNoteIndex++;
				this.reportProgress();
				continue;
			}

			this.currentNoteHash = this.cache.computeHash(note.title, note.body);
			const cachedItem = await this.cache.getItem(note.id);

			if (cachedItem && cachedItem.metadata.hash === this.currentNoteHash) {
				if (isValidEmbeddingVector(cachedItem.vector)) {
					log(
						`[${this.currentNoteIndex + 1}/${this.notes.length}] cache hit for "${note.title.slice(0, 30)}"`,
					);
					this.noteVectors.push({
						noteId: note.id,
						title: note.title,
						vector: cachedItem.vector,
						titleWeight: cachedItem.metadata.titleWeight ?? 0,
					});
					this.cachedCount++;
					this.currentNoteIndex++;
					this.reportProgress();
					continue;
				} else {
					log(
						`[${this.currentNoteIndex + 1}/${this.notes.length}] cache invalid (contains null/NaN) for "${note.title.slice(0, 30)}"`,
					);
				}
			}

			break;
		}

		if (this.currentNoteIndex >= this.notes.length) {
			this.terminate();
			if (this.resolvePromise) {
				this.resolvePromise({
					noteVectors: this.noteVectors,
					cachedCount: this.cachedCount,
					skippedCount: this.skippedCount,
					totalInferenceTime: this.totalInferenceTime,
				});
			}
		} else {
			const note = this.notes[this.currentNoteIndex];
			this.callbacks.onStatus(`Embedding "${note.title.slice(0, 40)}"...`);

			if (note.body.length === 0) {
				this.isEmbeddingTitle = true;
				this.worker?.postMessage({ type: 'embed', text: note.title, noteId: note.id });
			} else {
				this.currentNoteChunks = this.prepareNoteChunks(note.body);
				if (this.currentNoteChunks.length === 0) {
					// Whitespace-only body — treat as title-only note
					this.isEmbeddingTitle = true;
					this.worker?.postMessage({ type: 'embed', text: note.title, noteId: note.id });
				} else {
					this.worker?.postMessage({
						type: 'embed',
						text: this.currentNoteChunks[0],
						noteId: note.id,
					});
				}
			}
		}
	}
}
