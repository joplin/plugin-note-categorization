import joplin from 'api';
import { LocalIndex, MetadataTypes } from 'vectra';
import * as path from 'path';
import * as crypto from 'crypto';
import { log } from '../utils/logger';

export interface CacheMetadata {
	title: string;
	hash: string;
	updatedTime: number;
	titleWeight: number;
	[key: string]: MetadataTypes;
}

export class VectorCache {
	private index: LocalIndex;

	constructor(private dbPath: string) {
		this.index = new LocalIndex(dbPath);
	}

	/**
	 * Factory method to initialize the cache service.
	 * Resolves Joplin's data directory and configures the Vectra LocalIndex.
	 */
	public static async create(): Promise<VectorCache> {
		const dataDir = await joplin.plugins.dataDir();
		const dbPath = path.join(dataDir, 'vector_index');
		const cache = new VectorCache(dbPath);
		await cache.init();
		return cache;
	}

	/**
	 * Initializes the database structure if it does not exist.
	 */
	private async init(): Promise<void> {
		if (!(await this.index.isIndexCreated())) {
			log('Initializing local vector index at:', this.dbPath);
			await this.index.createIndex();
		}
	}

	/**
	 * Computes a unique SHA-256 hash of the note content (title + body).
	 */
	public computeHash(title: string, body: string): string {
		return crypto
			.createHash('sha256')
			.update(title + '\n\n' + body, 'utf8')
			.digest('hex');
	}

	/**
	 * Retrieves an item by its ID from the cache.
	 */
	public async getItem(id: string) {
		try {
			return await this.index.getItem<CacheMetadata>(id);
		} catch (err) {
			log('Error getting cached item:', err);
			return undefined;
		}
	}

	/**
	 * Inserts or updates an item in the cache.
	 */
	public async upsertItem(id: string, vector: number[], metadata: CacheMetadata) {
		return await this.index.upsertItem({
			id,
			vector,
			metadata,
		});
	}

	/**
	 * Starts a batch update transaction.
	 */
	public async beginUpdate() {
		await this.index.beginUpdate();
	}

	/**
	 * Commits the batch update transaction to disk.
	 */
	public async endUpdate() {
		await this.index.endUpdate();
	}

	/**
	 * Aborts a batch update transaction.
	 */
	public cancelUpdate() {
		this.index.cancelUpdate();
	}

	/**
	 * Deletes multiple items from the cache.
	 */
	public async deleteItems(ids: string[]) {
		if (ids.length > 0) {
			await this.beginUpdate();
			for (const id of ids) {
				await this.index.deleteItem(id);
			}
			await this.endUpdate();
		}
	}

	/**
	 * Returns all indexed item IDs.
	 */
	public async getIndexedIds(): Promise<string[]> {
		const items = await this.index.listItems();
		return items.map((item) => item.id);
	}
}
