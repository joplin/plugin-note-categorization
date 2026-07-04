import { UMAP } from 'umap-js';
import { log } from '../utils/logger';
import { mulberry32 } from '../utils/prng';
import { cosineDistance, euclideanDistance } from './clustering/metrics';
import { UmapProjectorOptions } from '../types/projector';

export class UmapProjector {
	private readonly nComponents: number;
	private readonly nNeighbors: number;
	private readonly minDist: number;
	private readonly metric: 'cosine' | 'euclidean';
	private readonly seed: number;

	constructor(options: UmapProjectorOptions = {}) {
		this.nComponents = options.nComponents ?? 2;
		this.nNeighbors = options.nNeighbors ?? 15;
		this.minDist = options.minDist ?? 0.1;
		this.metric = options.metric ?? 'cosine';
		this.seed = options.seed ?? 42;
	}

	/**
	 * Projects vectors to a lower-dimensional space using UMAP.
	 *
	 * In distance-matrix mode, `vectors` must be index singletons `[[0], [1], ...]`
	 * because umap-js requires a vectors array to call distanceFn(a, b).
	 * We encode each point's index as its sole coordinate so the custom distanceFn
	 * can look up precomputed distances via `distanceMatrix[a[0]][b[0]]`.
	 */
	public project(vectors: number[][], distanceMatrix?: number[][]): number[][] {
		if (vectors.length === 0) return [];

		if (distanceMatrix) {
			const n = vectors.length;
			if (distanceMatrix.length !== n) {
				throw new Error(`Distance matrix size (${distanceMatrix.length}) does not match vectors count (${n})`);
			}
			for (let i = 0; i < n; i++) {
				if (vectors[i].length !== 1) {
					throw new Error(
						`Vector at index ${i} has dimension ${vectors[i].length}, expected 1 (index singleton)`,
					);
				}
				const idx = vectors[i][0];
				if (idx < 0 || idx >= n || !Number.isInteger(idx)) {
					throw new Error(
						`Vector index at position ${i} is invalid: ${idx}. Must be an integer between 0 and ${n - 1}.`,
					);
				}
			}
		} else {
			const dim = vectors[0].length;
			for (let i = 0; i < vectors.length; i++) {
				if (vectors[i].length !== dim) {
					throw new Error(`Vector at index ${i} has dimension ${vectors[i].length}, expected ${dim}`);
				}
			}
		}

		// UMAP needs more points than output dimensions to be meaningful
		if (vectors.length <= this.nComponents) {
			log(`Too few vectors (${vectors.length}) for ${this.nComponents}D projection, padding with zeros.`);
			return vectors.map((vec) => {
				const out = vec.slice(0, this.nComponents);
				while (out.length < this.nComponents) out.push(0);
				return out;
			});
		}

		// nNeighbors must be less than the number of data points
		const nNeighbors = Math.max(2, Math.min(this.nNeighbors, vectors.length - 1));

		// When using a precomputed distance matrix, vectors are index singletons [i].
		// The distanceFn extracts indices to look up the precomputed distance.
		const distanceFn = distanceMatrix
			? (a: number[], b: number[]) => distanceMatrix[a[0]][b[0]]
			: this.metric === 'euclidean'
				? euclideanDistance
				: cosineDistance;

		const umap = new UMAP({
			nComponents: this.nComponents,
			nNeighbors,
			minDist: this.minDist,
			distanceFn,
			random: mulberry32(this.seed),
		});

		log(
			`UMAP: projecting ${vectors.length} vectors ` +
				`${distanceMatrix ? '(using precomputed distance matrix)' : `(${vectors[0].length}D)`} → ${this.nComponents}D, ` +
				`neighbors=${nNeighbors}, seed=${this.seed}`,
		);

		return umap.fit(vectors);
	}
}
