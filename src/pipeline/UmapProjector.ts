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
	 * Projects high-dimensional vectors to a lower-dimensional space using UMAP.
	 * @param vectors N vectors of dimension D (N x D)
	 * @returns N vectors of dimension nComponents
	 */
	public project(vectors: number[][]): number[][] {
		if (vectors.length === 0) return [];

		const dim = vectors[0].length;
		for (let i = 0; i < vectors.length; i++) {
			if (vectors[i].length !== dim) {
				throw new Error(`Vector at index ${i} has dimension ${vectors[i].length}, expected ${dim}`);
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
		const distanceFn = this.metric === 'euclidean' ? euclideanDistance : cosineDistance;

		const umap = new UMAP({
			nComponents: this.nComponents,
			nNeighbors,
			minDist: this.minDist,
			distanceFn,
			random: mulberry32(this.seed),
		});

		log(
			`UMAP: projecting ${vectors.length} vectors (${dim}D → ${this.nComponents}D), ` +
				`neighbors=${nNeighbors}, seed=${this.seed}`,
		);

		return umap.fit(vectors);
	}
}
